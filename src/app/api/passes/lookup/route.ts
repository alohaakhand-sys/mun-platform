import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUid } from "@/lib/server/migrationServer";
import { passesConfigured, parsePass, passVersionOf, scannerAccess, holderCard, allTargets, eligibleFor, eventFacts } from "@/lib/server/passes";
import { resolvePlan, type EventPlan } from "@/lib/data/eventPlan";

/**
 * POST { eventId, code } (or { uid } for the organizer) → who this is and what they still have,
 * without redeeming anything. Scanners use it to answer "did I already eat?".
 */
export async function POST(req: Request) {
  const caller = await requireUid(req);
  if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!passesConfigured()) return NextResponse.json({ error: "Passes aren't set up on this server yet." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { eventId?: string; code?: string; uid?: string };
  const eventId = String(body.eventId || "");
  if (!eventId) return NextResponse.json({ error: "eventId required." }, { status: 400 });
  const access = await scannerAccess(eventId, caller);
  if (!access.ok) return NextResponse.json({ error: "You don't have permission to scan passes for this event." }, { status: 403 });

  let uid: string;
  if (body.uid && !body.code) {
    if (!access.organizer) return NextResponse.json({ error: "Only the organizer can look people up by name." }, { status: 403 });
    uid = String(body.uid);
  } else {
    const pass = parsePass(String(body.code || ""));
    if (!pass) return NextResponse.json({ result: "invalid" });
    if (pass.eventId !== eventId) return NextResponse.json({ result: "wrong_event" });
    if ((await passVersionOf(eventId, pass.uid)) !== pass.version) return NextResponse.json({ result: "replaced" });
    uid = pass.uid;
  }
  const holder = await holderCard(eventId, uid);
  if (!holder) return NextResponse.json({ result: "not_eligible", reason: "Not part of this event any more." });

  const [targets, used] = await Promise.all([
    allTargets(eventId),
    adminDb.collection("events").doc(eventId).collection("redemptions").where("holderUid", "==", uid).get(),
  ]);
  const byTarget = new Map(used.docs.map((d) => [(d.data() as any).target, d.data() as any]));
  const pro = resolvePlan({ plan: (await eventFacts(eventId))?.plan as EventPlan | undefined }).features.passes;
  const mine = await Promise.all(targets.map(async (t) => ((!t.pro || pro) && t.active && (await eligibleFor(eventId, t, uid, holder.member)) ? t : null)));
  const items = mine.filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => {
      const r = byTarget.get(t.id);
      return { target: t.id, title: t.title, uses: t.uses, used: Number(r?.count) || 0, lastAt: r?.lastAt?.toMillis?.() ?? null };
    });
  return NextResponse.json({ result: "ok", holder: holder.card, items });
}
