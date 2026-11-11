/**
 * Is a motion in order right now? — the delegate-side admissibility model.
 *
 * Real procedure: the chair opens the floor to motions BETWEEN speakers ("are there any points or
 * motions on the floor?"). While a delegate holds the floor a motion is out of order — but POINTS
 * stay available, and nothing in this module touches them.
 *
 * WHY THIS LIVES IN lib/services AND NOT IN components/session/flow:
 * `flow/` is the CHAIR's Flow Bar, which is advisory by construction and never blocks anybody.
 * This is a different concern — a real gate, on delegates — with five consumers spanning the
 * delegate console, ProposeMotionMenu, SessionProjector, RepresentPanel and (read-only, for
 * ranking one suggestion) the chair's flowModel. Filing it under `flow/` would misplace it.
 *
 * PURE. Type-only import from sessionService plus one pure value import, so this module never
 * pulls in `@/lib/firebase/client` (whose `getDatabase()` throws without env vars). `now` is
 * injectable. `motionFloor.test.ts` runs it in a bare node environment — an accidental value
 * import of sessionService would fail every case at import time, which is the intended alarm.
 *
 * ENFORCEMENT IS UI-ONLY, BY DECISION. firestore.rules still accepts a motion written straight
 * from a devtools console; see the note on `motionsInOrder`. The recourse is procedural: the
 * motion lands `pending` with an unforgeable serverTimestamp and the chair dismisses it with a
 * reason the delegate reads back.
 */
import { getCountryName } from "@/lib/data/countries";
// Pure static table — same arrangement `gateAdvice` and `flowModel` use to name a motion without
// importing the service.
import { MOTION_META } from "./motionMeta";
// The shared "not yet terminal" set. Also pure — and shared rather than re-stated, so the duplicate
// block, the chair's tab badge and the auto-fall sweep cannot disagree about what "live" means.
import { LIVE_MOTION_STATUSES } from "./motionMootness";
import type { LiveSession, Motion, MotionType } from "./sessionService";

export type MotionFloorCode =
  | "open" | "invited"
  | "gsl_speaker" | "floor_granted" | "caucus_speaker"
  | "vote_open" | "session_suspended" | "session_closed";

/**
 * The exact read-set admissibility depends on. Narrowing it to a Pick keeps test fixtures small
 * and documents that nothing else on the session doc can change the answer.
 */
export type MotionFloorInput = Pick<LiveSession,
  "phase" | "finalized" | "gsl" | "caucus" | "activeVote" | "live" | "attendance" | "motionInvite">;

export type MotionFloorStatus =
  | { inOrder: true; code: "open" }
  | { inOrder: true; code: "invited"; inviteId: string; endsInMs: number; note: string }
  | {
      inOrder: false;
      code: Exclude<MotionFloorCode, "open" | "invited">;
      /** Short enough for a 48px icon button's title/aria-label. */
      title: string;
      /** One sentence for the propose form's early return. */
      detail: string;
    };

/** Said once, in one place, so every out-of-order surface uses the same words. */
export const POINTS_STILL_OPEN =
  "Points of order and personal privilege can still be raised at any time.";

/** Invite-window derivation on its own — the chair panel's countdown chip needs it without the rest. */
export function motionInviteState(
  s: Pick<LiveSession, "motionInvite">,
  now: number = Date.now(),
): { active: boolean; inviteId: string | null; endsInMs: number; windowSecs: number | null } {
  const inv = s.motionInvite;
  if (!inv || typeof inv.endsAt !== "number") {
    return { active: false, inviteId: null, endsInMs: 0, windowSecs: null };
  }
  const endsInMs = inv.endsAt - now;
  return {
    active: endsInMs > 0,
    inviteId: inv.inviteId || null,
    endsInMs: Math.max(0, endsInMs),
    windowSecs: inv.windowSecs ?? null,
  };
}

const blocked = (
  code: Exclude<MotionFloorCode, "open" | "invited">, title: string, detail: string,
): MotionFloorStatus => ({ inOrder: false, code, title, detail });

/**
 * Precedence chain — FIRST MATCH WINS. Ordering is load-bearing; see the comments per branch.
 *
 * Mirrors `useFloorController`'s own precedence (vote → caucus → GSL speaker) rather than reading
 * `session.phase`, because phase drifts: `endCaucus` force-sets "gsl" regardless of what was
 * happening. Phase is consulted only for suspended/closed, which nothing else expresses.
 */
export function motionsInOrder(s: MotionFloorInput, now: number = Date.now()): MotionFloorStatus {
  // 1. Closed outranks everything: a finalized session can still carry a stale caucus/activeVote
  //    object, and this preserves the one pre-existing gate in the delegate UI.
  if (s.finalized || s.phase === "closed") {
    return blocked("session_closed", "The session is closed", "This committee has adjourned.");
  }

  // 2. Suspended — nobody holds the floor, but the committee is not sitting.
  if (s.phase === "suspended") {
    return blocked("session_suspended", "The session is suspended",
      `Motions reopen when the chair resumes the session. ${POINTS_STILL_OPEN}`);
  }

  // 3. Above the floor checks on purpose: closeVoteAtomic/cancelVote leave live.stage at [] while
  //    gsl.activeSpeaker may still name someone, so a vote must be decided before either.
  if (s.activeVote) {
    return blocked("vote_open", "Motions are closed during a vote",
      `A vote is open — cast your ballot. Motions reopen once the chair records the result. ${POINTS_STILL_OPEN}`);
  }

  const caucus = s.caucus;
  const stageHolder = s.live?.stage?.[0];

  if (caucus) {
    // 4a. Unmoderated: informal negotiation, no recognized speaker. Deliberately ignores BOTH
    //     gsl.activeSpeaker (which startUnmodCaucus leaves standing) and live.stage — the whole
    //     point is that "extend the caucus" must stay proposable before time runs out.
    if (caucus.kind === "unmoderated") return inviteOrOpen(s, now);

    // 4b. A moderated-caucus speaker needs NO stage corroboration: startModCaucus mints
    //     `currentSpeaker: null` on a brand-new caucus object, so unlike gsl.activeSpeaker this
    //     field cannot be stale, and nextCaucusSpeaker writes it with live.stage in one txn.
    const cs = caucus.currentSpeaker;
    if (cs) {
      return blocked("caucus_speaker", "Motions are closed while a delegate is speaking",
        `${speakerName(cs.country)} has the floor in the caucus. Motions are out of order until the speech ends. ${POINTS_STILL_OPEN}`);
    }
    // 4c. Moderated but nobody recognized yet — the chair is between speakers.
    return inviteOrOpen(s, now);
  }

  // 5. Outside a caucus, THE MIC IS THE FLOOR.
  //    live.stage corroboration is what resolves the two staleness traps, and it is only sound
  //    because every GSL writer keeps the pair in step (nextSpeaker and clearActiveSpeaker both
  //    write activeSpeaker AND live.stage). Without it, `endCaucus` — which clears the caucus and
  //    the stage but LEAVES gsl.activeSpeaker — would leave motions dead after every single
  //    caucus until the chair advanced the list. An activeSpeaker with an empty stage is stale
  //    by construction.
  //    Deliberately NOT `stageHolder === activeSpeaker.delegateId`: during a point-of-order
  //    interrupt the chair spotlights the interrupter while the original speaker still holds the
  //    floor, and that must stay closed. "Somebody is on the mic" is the right predicate.
  if (stageHolder) {
    const active = s.gsl?.activeSpeaker;
    if (active) {
      return blocked("gsl_speaker", "Motions are closed while a delegate is speaking",
        `${speakerName(active.country)} has the floor. Motions are out of order until the speech ends. ${POINTS_STILL_OPEN}`);
    }
    // 5b. A granted floor request or a chair spotlight — someone is literally speaking on camera
    //     with no GSL slot behind them.
    const country = s.attendance?.[stageHolder]?.country;
    return blocked("floor_granted", "Motions are closed while a delegate is speaking",
      `${speakerName(country)} has the floor. Motions are out of order until they finish. ${POINTS_STILL_OPEN}`);
  }

  return inviteOrOpen(s, now);
}

/** Rank 6/7 — the floor is clear, so the only question left is whether the chair has asked. */
function inviteOrOpen(s: MotionFloorInput, now: number): MotionFloorStatus {
  const inv = motionInviteState(s, now);
  if (inv.active && inv.inviteId) {
    return {
      inOrder: true, code: "invited",
      inviteId: inv.inviteId, endsInMs: inv.endsInMs,
      note: s.motionInvite?.note || "",
    };
  }
  return { inOrder: true, code: "open" };
}

function speakerName(country: string | undefined): string {
  if (!country) return "A delegate";
  return getCountryName(country) || country;
}

// ── One motion at a time, per delegation ────────────────────────────────────────
/**
 * A delegation may not move the same motion twice while the first one is still alive.
 *
 * WHY THIS IS A HARD BLOCK AND NOT ANOTHER SOFT LIMIT. The ≥3-pending guard in `ProposeMotionForm`
 * counts motions; it does not look at what they SAY. A delegate who taps "Move to gsl", gets no
 * confirmation, and taps again lands three identical motions in the chair's queue — the chair then
 * has to dismiss two of them one at a time, on camera, and the queue's precedence sort has no way
 * to prefer one over its own twin. In the room this motion is simply out of order: the question is
 * already before the committee.
 *
 * PER DELEGATION, NOT PER COMMITTEE. Two delegations moving the same thing is ordinary procedure —
 * competing `set_agenda` motions are a case the chair console renders deliberately (see the
 * "competing agenda motions" branch in `flowModel`). Only the SAME delegation repeating itself is
 * the mistake.
 *
 * `passed` counts as alive: the motion carried and is waiting on the chair to execute it. Moving it
 * again in that window is the same duplicate, one step later — which is why this reads
 * `LIVE_MOTION_STATUSES` from the mootness model rather than re-stating the four statuses here.
 */
export const isLiveMotion = (m: Motion): boolean => LIVE_MOTION_STATUSES.has(m.status);

/** The delegation's own live motion of this type, or null. `mine` is `subscribeMyMotions`'s list. */
export function myLiveMotion(mine: Motion[], type: MotionType): Motion | null {
  return mine.find((m) => m.type === type && isLiveMotion(m)) ?? null;
}

/** Said once, so the form, the button and the service rejection all use the same words. */
export function duplicateMotionNote(m: Motion): string {
  const label = MOTION_META[m.type]?.label ?? m.type;
  const where = m.status === "voting"
    ? "The committee is voting on it."
    : m.status === "passed"
      ? "It carried — the chair is about to execute it."
      : m.status === "recognized"
        ? "The chair has recognized it."
        : "It is with the chair.";
  return `You have already moved to ${label.toLowerCase()}. ${where}`;
}
