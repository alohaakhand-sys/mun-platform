// Granting a delegate's floor request: the ONE dispatch the chair's Requests panel (web) and the
// mobile chair console both call, so the two can never drift on which side effect a grant runs.
//
//   floor       → give them the camera/mic (`setStage`)
//   speak       → a slot on the right list (GSL, or the caucus list for a caucus-window signup)
//   vote_change → reopen THEIR ballot so they re-cast it themselves; the chair never writes one
//   yield       → `acceptYieldRequest`, which owns its own staleness check, credit and resolve
//
// `caucus_signup` is not granted one by one: those are seated as a list (seatCaucusList) or
// auto-added once seated (useCaucusAutoAdd). Granting one here is refused rather than marking it
// "granted" with no side effect, which would lie to the chair about what happened.
import {
  acceptYieldRequest, enqueueSpeaker, extendVoteTimer, reopenBallot, resolveHand, setStage,
  timerRemainingMs, type FloorRequest, type LiveSession,
} from "./sessionService";
import { slotOfSignup } from "./caucusList";

/** Under this much time left, granting a re-vote is useless unless the clock is extended too. */
export const REVOTE_GRACE_MS = 20_000;
export const REVOTE_EXTEND_MS = 30_000;

export type GrantOutcome = "granted" | "dismissed" | "unsupported";

export async function grantFloorRequest(
  eventId: string, sessionId: string, session: LiveSession, r: FloorRequest, chairUid: string,
): Promise<GrantOutcome> {
  if (r.kind === "floor") {
    await setStage(eventId, sessionId, [r.delegateId]);
  } else if (r.kind === "vote_change") {
    const vote = session.activeVote;
    // Stale (its vote closed) or nothing to reopen → resolve as dismissed, not granted.
    if (!vote || vote.voteId !== r.voteId) {
      await resolveHand(eventId, sessionId, r, "dismissed", chairUid);
      return "dismissed";
    }
    const ok = await reopenBallot(eventId, sessionId, r.delegateId, vote.voteId, chairUid, r.id);
    if (!ok) {
      await resolveHand(eventId, sessionId, r, "dismissed", chairUid);
      return "dismissed";
    }
    // A reopened ballot the delegate has no time to cast is worthless — the rules reject a
    // ballot after the deadline. Granting the re-vote extends the window for the whole room.
    if (vote.timer?.running && timerRemainingMs(vote.timer) < REVOTE_GRACE_MS) {
      await extendVoteTimer(eventId, sessionId, REVOTE_EXTEND_MS);
    }
  } else if (r.kind === "speak") {
    // WHICH LIST. Almost every `speak` is a General Speakers List ask, written at any time,
    // off-gate. The exception is one written under a caucus signup window. The discriminator is
    // the REQUEST's own signupId matched against the live gate, never the gate alone: routing on
    // `signupFor` would sweep every off-gate ask into the caucus queue while a caucus window is open.
    const gate = session.floorGate;
    const forCaucus = !!r.signupId && r.signupId === gate?.signupId && gate?.signupFor === "caucus";
    await enqueueSpeaker(eventId, sessionId, slotOfSignup(r), forCaucus ? "caucus" : "gsl");
  } else if (r.kind === "yield") {
    // acceptYieldRequest resolves the request itself, so return rather than falling through.
    const res = await acceptYieldRequest(eventId, sessionId, session, r, chairUid);
    return res.ok ? "granted" : "dismissed";
  } else {
    return "unsupported";
  }
  await resolveHand(eventId, sessionId, r, "granted", chairUid);
  return "granted";
}
