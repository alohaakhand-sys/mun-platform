/**
 * "What is the room looking at right now?" — the one precedence ladder.
 *
 * This existed twice, verbatim, in `SessionProjector` and in `DelegateSessionConsole`'s `Focal`.
 * Two copies of a precedence rule is one copy too many: a projector showing a caucus while a
 * delegate's phone still shows the previous speaker is a real failure at a real conference.
 *
 * Pure and session-doc-driven, so it needs no roster and runs on both surfaces. The two surfaces
 * still RENDER differently — a 390px phone and a 4m screen are different problems — but they agree
 * on what is happening.
 *
 * THE ORDER IS THE PRODUCT RULE, not an implementation detail:
 *
 *   vote      an open ballot outranks everything; nothing may distract from casting it
 *   result    HOLDS the room until the chair clears it or opens the next vote
 *   doc       a paper on the floor sits just under a result
 *   caucus    ABOVE speaker on purpose — the GSL is suspended during a caucus but
 *             `gsl.activeSpeaker` stays set, so reading the speaker first shows a stale name
 *   speaker   the general speakers list
 *   rollcall  attendance is being taken; there is no speaker yet but the screen is not idle
 *   calm      lobby / suspended / closed / an empty floor
 */
import type {
  LiveSession, ActiveVote, PublishedVoteResult, PublishedDocRef,
  CaucusState, SpeakerSlot,
} from "@/lib/services/sessionService";

export type FocalState =
  | { kind: "vote"; vote: ActiveVote }
  | { kind: "result"; published: PublishedVoteResult }
  | { kind: "doc"; published: PublishedDocRef }
  | { kind: "caucus"; caucus: CaucusState }
  | { kind: "speaker"; speaker: SpeakerSlot }
  | { kind: "rollcall" }
  | { kind: "calm" };

export function resolveFocal(session: LiveSession): FocalState {
  if (session.activeVote) return { kind: "vote", vote: session.activeVote };
  if (session.publishedResult) return { kind: "result", published: session.publishedResult };
  if (session.publishedDoc) return { kind: "doc", published: session.publishedDoc };
  if (session.caucus) return { kind: "caucus", caucus: session.caucus };
  if (session.gsl?.activeSpeaker) return { kind: "speaker", speaker: session.gsl.activeSpeaker };
  if (session.phase === "roll_call") return { kind: "rollcall" };
  return { kind: "calm" };
}

/**
 * The queue the room should see under the focal block, and whose it is.
 *
 * Not just `gsl.queue`: during a caucus the GSL is suspended, so putting its queue on the big
 * screen advertises a list nobody is speaking from. A vote, a result and a document each own the
 * whole screen and get no queue at all.
 */
export function focalQueue(
  session: LiveSession,
  focal: FocalState,
): { source: "gsl" | "caucus" | "none"; queue: SpeakerSlot[] } {
  if (focal.kind === "caucus") {
    // An unmoderated caucus has no speaking order — the room is out of its seats.
    if (focal.caucus.kind !== "moderated") return { source: "none", queue: [] };
    return { source: "caucus", queue: focal.caucus.queue || [] };
  }
  if (focal.kind === "speaker" || focal.kind === "calm") {
    return { source: "gsl", queue: session.gsl?.queue || [] };
  }
  return { source: "none", queue: [] };
}
