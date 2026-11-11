/**
 * The moderated caucus's speakers list — collecting, ordering, seating.
 *
 * THE PROCEDURE THIS MODELS. A moderated caucus opens, the chair asks who wishes to speak,
 * placards go up, and THE ORDER THE CHAIR READS THEM IN BECOMES THE SPEAKERS LIST. Debate does
 * not begin until that list exists. So a mod caucus has two distinct phases and they need
 * different behaviour from every surface that touches the queue:
 *
 *   collecting — signups accumulate as pending `caucus_signup` requests. NOTHING writes
 *                `caucus.queue` during this phase: the chair is about to review the whole batch
 *                at once, and a hook appending to the list they are reordering is a race with a
 *                UI on the other end of it.
 *   seated     — the chair has committed the order. `caucus.queue` is authoritative, and a late
 *                placard (real MUN allows them between speeches) auto-appends to the end.
 *
 * WHY A NORMALIZER AND NOT A BARE FIELD READ. `listState` is absent on every caucus that predates
 * this, and four consumers need the answer (`useCaucusAutoAdd`, `flowModel`, `gateAdvice`, the seat
 * modal). `caucusListState` reads absent as "seated", which reproduces today's behaviour exactly —
 * that is why there is no backfill migration and no dual-read branch anywhere else. Same shape as
 * `getAgenda()` for `session.agenda` and `readClock()` for `session.clock`.
 *
 * PURE. Type-only import from sessionService, so TypeScript erases it and this module never pulls
 * in `@/lib/firebase/client`. That is load-bearing: `flowModel.ts` and `gateAdvice.ts` import this,
 * and both are unloadable outside a browser if anything in their import graph touches Firebase.
 */
import type { CaucusState, FloorRequest, SpeakerSlot } from "./sessionService";

export type CaucusListState = "collecting" | "seated";

/**
 * Is the speakers list still being collected, or has the chair committed it?
 *
 * Absent → "seated". A caucus started before this shipped has a queue the chair fills directly and
 * a hook that drains signups into it; "seated" is the state that keeps both working untouched.
 * Unmoderated → "seated" too: there is no speakers list to collect.
 */
export function caucusListState(
  caucus: CaucusState | null | undefined,
): CaucusListState {
  if (!caucus || caucus.kind !== "moderated") return "seated";
  return caucus.listState === "collecting" ? "collecting" : "seated";
}

/** Shorthand for the common test. */
export const isCollecting = (caucus: CaucusState | null | undefined): boolean =>
  caucusListState(caucus) === "collecting";

/**
 * The signups waiting to be placed, in the order the SERVER received them.
 *
 * `createdAt` is a `serverTimestamp()` sentinel that reads back null in the writer's own optimistic
 * snapshot, so a doc with no timestamp yet has no place in the order — it is EXCLUDED, not sorted
 * to one end. Both readers of this list used to do it differently (`useCaucusAutoAdd` dropped
 * nulls, `CaucusSpeakersList` sorted them last), which meant the chair could seat an order the
 * server had not agreed to. One function, one answer.
 *
 * A "no" answer is stored but never returned: it exists to stop the delegate being asked again.
 */
export function orderSignups(
  requests: FloorRequest[],
  caucusId: string | undefined,
): FloorRequest[] {
  if (!caucusId) return [];
  return requests
    .filter((r) =>
      r.kind === "caucus_signup"
      && r.caucusId === caucusId
      && r.status === "pending"
      && r.answer === "yes"
      && r.createdAt != null)
    .sort((a, b) =>
      (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)
      || (a.createdAt?.nanoseconds ?? 0) - (b.createdAt?.nanoseconds ?? 0));
}

/**
 * Pending GSL signups waiting to be placed, in the order the SERVER received them.
 */
export function orderGslSignups(
  requests: FloorRequest[],
  signupId?: string | null,
): FloorRequest[] {
  return requests
    .filter((r) =>
      r.kind === "speak"
      && r.status === "pending"
      && (signupId ? (!r.signupId || r.signupId === signupId) : true)
      && r.createdAt != null)
    .sort((a, b) =>
      (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)
      || (a.createdAt?.nanoseconds ?? 0) - (b.createdAt?.nanoseconds ?? 0));
}

/** Every answer for this caucus, "no" included — the denominator for "who hasn't responded". */
export function allAnswers(
  requests: FloorRequest[],
  caucusId: string | undefined,
): FloorRequest[] {
  if (!caucusId) return [];
  return requests.filter((r) => r.kind === "caucus_signup" && r.caucusId === caucusId);
}

/**
 * A signup request as a speaker slot.
 *
 * Carries the proxy stamp across, spread conditionally because Firestore rejects an `undefined`
 * field value inside an array element. Every seating path — both seat modals via
 * `mergeSignupOrder`, the auto-add hook and the chair's grant — funnels through here, so this is
 * the one place the attribution can be lost.
 */
export const slotOfSignup = (r: FloorRequest): SpeakerSlot => ({
  delegateId: r.delegateId,
  country: r.country,
  applicationId: r.applicationId,
  ...(r.proxyBy ? { proxyBy: r.proxyBy, proxyByName: r.proxyByName || "" } : {}),
});

/**
 * How many speeches the caucus has time for.
 *
 * Real procedure: the motion fixes total time AND speaking time, so the list has a natural length.
 * Over-subscription is NORMAL — surface it, never cap it. The chair trims, or the room moves to
 * extend.
 */
export function caucusSlots(caucus: CaucusState | null | undefined): number {
  if (!caucus || !caucus.perSpeakerSecs || caucus.perSpeakerSecs <= 0) return 0;
  return Math.floor(caucus.totalDurationSecs / caucus.perSpeakerSecs);
}

/**
 * The floor gate's `signupId` for a caucus — DERIVED from `caucusId`, never minted separately.
 *
 * This is what makes "Ask again" correct for free: `reaskCaucusSignups` mints a new `caucusId`, so
 * the gate's signupId rotates with it, every delegate's `signedUp` check goes false, and a late
 * write carrying the previous round's id joins nothing. Two independently-minted ids would have to
 * be kept in step by remembering to, at every call site, forever.
 */
export const signupIdFor = (caucusId: string): string => `sg_${caucusId}`;

/**
 * Merge the chair's existing queue with fresh signups, deduped by delegation, queue first.
 *
 * Queue-first matters twice: a chair may have pre-seeded the order by hand before the window
 * closed, and "Ask again" on an already-seated caucus reopens collecting over a queue that is
 * still standing. Either way those speakers keep their places and the new answers land behind them.
 */
export function mergeSignupOrder(
  queue: SpeakerSlot[],
  signups: FloorRequest[],
): SpeakerSlot[] {
  const out = [...queue];
  const seen = new Set(out.map((s) => s.delegateId));
  for (const r of signups) {
    if (seen.has(r.delegateId)) continue;
    seen.add(r.delegateId);
    out.push(slotOfSignup(r));
  }
  return out;
}
