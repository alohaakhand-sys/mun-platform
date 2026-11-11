import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireUid } from "@/lib/server/migrationServer";
import {
  passesConfigured, parsePass, passVersionOf, scannerAccess, eventFacts, holderCard, scanTarget, redemptionRef, eligibleFor,
} from "@/lib/server/passes";
import { minutesNow, formatMinutes } from "@/lib/data/passAudience";
import { resolvePlan, type EventPlan } from "@/lib/data/eventPlan";

/**
 * POST { eventId, target, code } → redeem `target` (e.g. "meal:<slotId>") for the pass holder.
 * The organizer may send { uid } instead of a code (Find by name, phone dead); that redeem is
 * marked manual. Outside the meal's time window the answer is `outside_window` and nothing is
 * redeemed unless { override: true } comes back. The count moves in a transaction, so two
 * scanners can never both hand out the same meal.
 *
 * Answers 200 with { result } for every scan outcome, so the scanner shows a card, not an error:
 * ok | already_used | not_eligible | outside_window | invalid | wrong_event | replaced, and for a
 * coupon pro_required (the event lost its Pro plan) or paused.
 */
export async function POST(req: Request) {
  const caller = await requireUid(req);
  if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!passesConfigured()) return NextResponse.json({ error: "Passes aren't set up on this server yet." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { eventId?: string; target?: string; code?: string; uid?: string; override?: boolean };
  const eventId = String(body.eventId || "");
  const targetId = String(body.target || "");
  if (!eventId || !targetId) return NextResponse.json({ error: "eventId and target required." }, { status: 400 });

  const access = await scannerAccess(eventId, caller);
  if (!access.ok) return NextResponse.json({ error: "You don't have permission to scan passes for this event." }, { status: 403 });
  const [event, target] = await Promise.all([eventFacts(eventId), scanTarget(eventId, targetId)]);
  if (!event || !target) return NextResponse.json({ error: "That meal, coupon, check-in or ride no longer exists." }, { status: 404 });
  if (target.pro && !resolvePlan({ plan: event.plan as EventPlan | undefined }).features.passes) {
    return NextResponse.json({ result: "pro_required", target: { title: target.title } });
  }
  if (!target.active) return NextResponse.json({ result: "paused", target: { title: target.title } });

  // Who is this?
  let uid: string;
  let manual = false;
  if (body.uid && !body.code) {
    if (!access.organizer) return NextResponse.json({ error: "Only the organizer can redeem by name." }, { status: 403 });
    uid = String(body.uid);
    manual = true;
  } else {
    const pass = parsePass(String(body.code || ""));
    if (!pass) return NextResponse.json({ result: "invalid" });
    if (pass.eventId !== eventId) {
      const other = await eventFacts(pass.eventId);
      return NextResponse.json({ result: "wrong_event", otherEvent: other?.title || "" });
    }
    if ((await passVersionOf(eventId, pass.uid)) !== pass.version) return NextResponse.json({ result: "replaced" });
    uid = pass.uid;
  }

  const holder = await holderCard(eventId, uid);
  if (!holder) return NextResponse.json({ result: "not_eligible", reason: "Not part of this event any more." });
  const card = holder.card;
  if (!(await eligibleFor(eventId, target, uid, holder.member))) {
    const reason = target.ride ? "Not registered on this route." : "This isn't for their role.";
    return NextResponse.json({ result: "not_eligible", holder: card, target: { title: target.title }, reason });
  }

  const w = target.window;
  const now = minutesNow(event.timeZone);
  const outside = !!w && (now < w.start || now > w.end);
  if (w && outside && !body.override) {
    return NextResponse.json({
      result: "outside_window", holder: card, target: { title: target.title },
      window: `${formatMinutes(w.start)} – ${formatMinutes(w.end)}`,
    });
  }

  const ref = redemptionRef(eventId, target.id, uid);
  const at = Timestamp.now();
  const outcome = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = (snap.data() as any) || {};
    const count = Number(d.count) || 0;
    if (count >= target.uses) {
      return { result: "already_used" as const, usedAt: d.lastAt?.toMillis?.() ?? null, usedBy: d.lastByName || "", remaining: 0 };
    }
    const entry: Record<string, unknown> = { at, by: caller, byName: access.name };
    if (outside) entry.override = "outside_window";
    if (manual) entry.manual = true;
    tx.set(ref, {
      holderUid: uid, holderName: card.name, target: target.id, targetTitle: target.title,
      count: count + 1, lastAt: at, lastBy: caller, lastByName: access.name,
      history: [...(Array.isArray(d.history) ? d.history : []), entry],
    }, { merge: true });
    return { result: "ok" as const, remaining: target.uses - count - 1 };
  });

  return NextResponse.json({
    ...outcome, holder: card, target: { title: target.title, uses: target.uses },
    ...(outcome.result === "ok" ? { redemptionId: ref.id, at: at.toMillis() } : {}),
  });
}
