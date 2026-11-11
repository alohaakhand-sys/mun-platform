import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUid } from "@/lib/server/migrationServer";
import { scannerAccess, allTargets, eventFacts, eventPeople, type ScanTarget } from "@/lib/server/passes";
import { resolvePlan, type EventPlan } from "@/lib/data/eventPlan";
import { inAudience, type MemberFacts } from "@/lib/data/passAudience";

/**
 * GET ?eventId=                → per item: how many claimed it and how many could. Owner,
 *                                co-organizers and scanners.
 * GET ?eventId=&target=meal:x  → that item: who claimed it (time, scanner, manual, accepted outside
 *                                its time, undone) and who hasn't yet. Pro, organizer.
 * GET ?eventId=&format=csv     → every item × every person it is for, as a CSV. Pro, organizer.
 *
 * One read per member marker and per redemption (firebase-admin 10 has no count()); names come
 * from the cached roster. Called on demand, never polled. Free events have meals only.
 */
export async function GET(req: Request) {
  const caller = await requireUid(req);
  if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId") || "";
  const one = url.searchParams.get("target");
  const csv = url.searchParams.get("format") === "csv";
  if (!eventId) return NextResponse.json({ error: "eventId required." }, { status: 400 });
  const access = await scannerAccess(eventId, caller);
  if (!access.ok) return NextResponse.json({ error: "You don't have permission to see this event's passes." }, { status: 403 });

  const event = await eventFacts(eventId);
  const pro = resolvePlan({ plan: event?.plan as EventPlan | undefined }).features.passes;
  if ((one || csv) && (!access.organizer || !pro)) {
    return NextResponse.json({ error: access.organizer ? "The full report comes with a Pro event." : "Only the organizer can see the full report." }, { status: 403 });
  }

  const ev = adminDb.collection("events").doc(eventId);
  const redemptions = ev.collection("redemptions");
  const [targets, members, used] = await Promise.all([
    allTargets(eventId),
    ev.collection("members").select("kind", "role").get(),
    one ? redemptions.where("target", "==", one).get() : csv ? redemptions.get() : redemptions.select("target", "count").get(),
  ]);
  // Free events have meals only; coupons, check-in and rides belong to a `passes` plan.
  const shown = targets.filter((t) => (!t.pro || pro) && (!one || t.id === one));
  const people = members.docs.map((d) => ({ uid: d.id, facts: d.data() as MemberFacts }));

  if (!one && !csv) {
    const claimed = new Map<string, number>();
    used.docs.forEach((d) => {
      const r = d.data() as any;
      if (Number(r.count) > 0) claimed.set(r.target, (claimed.get(r.target) || 0) + 1);
    });
    const rows = shown.map((t) => ({
      target: t.id, title: t.title, window: t.windowText, uses: t.uses,
      claimed: claimed.get(t.id) || 0,
      // A ride's riders are its registrations; everything else, the members its audience covers.
      eligible: t.ride ? t.ride.registered.length : people.filter((p) => inAudience(p.uid, p.facts, t.audience, t.fallback)).length,
    }));
    return NextResponse.json({ rows });
  }

  const roster = await eventPeople(eventId);
  const appToUid = new Map(roster.filter((p) => p.appId).map((p) => [p.appId!, p.uid]));
  const nameOf = new Map(roster.map((p) => [p.uid, p]));
  const byKey = new Map(used.docs.map((d) => [d.id, d.data() as any]));
  const eligibleUids = (t: ScanTarget) => t.ride
    ? t.ride.registered.map((a) => appToUid.get(a)).filter((u): u is string => !!u)
    : people.filter((p) => inAudience(p.uid, p.facts, t.audience, t.fallback)).map((p) => p.uid);
  const line = (t: ScanTarget, uid: string) => {
    const r = byKey.get(`${t.id}__${uid}`);
    const p = nameOf.get(uid);
    const history: any[] = Array.isArray(r?.history) ? r.history : [];
    return {
      uid, name: p?.name || r?.holderName || "Member", role: p?.role || "", committee: p?.committee || "",
      count: Number(r?.count) || 0,
      lastAt: r?.lastAt?.toMillis?.() ?? null,
      lastBy: r?.lastByName || "",
      manual: history.some((h) => h.manual && !h.undone),
      override: history.some((h) => h.override && !h.undone),
      undone: history.filter((h) => h.undone).length,
    };
  };

  if (one) {
    const t = shown[0];
    if (!t) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });
    const rows = eligibleUids(t).map((u) => line(t, u));
    // Someone may have claimed before the organizer changed who gets it: keep them in the list.
    used.docs.forEach((d) => { const u = (d.data() as any).holderUid; if (u && !rows.some((x) => x.uid === u)) rows.push(line(t, u)); });
    return NextResponse.json({
      target: { id: t.id, title: t.title, uses: t.uses },
      claimed: rows.filter((x) => x.count > 0).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)),
      notYet: rows.filter((x) => x.count === 0).sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : "");
  const out = [["item", "name", "role", "committee", "uses", "used", "status", "lastAt", "lastScannedBy", "manual", "acceptedOutsideTime", "undone"]];
  for (const t of shown) {
    for (const x of eligibleUids(t).map((u) => line(t, u)).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push([t.title, x.name, x.role, x.committee, String(t.uses), String(x.count), x.count >= t.uses ? "used" : x.count > 0 ? "partly used" : "not yet",
        iso(x.lastAt), x.lastBy, x.manual ? "yes" : "", x.override ? "yes" : "", x.undone ? String(x.undone) : ""]);
    }
  }
  const file = (event?.title || "event").replace(/[^\w\- ]+/g, "").trim() || "event";
  return new Response(out.map((r) => r.map(cell).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file} passes ${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
