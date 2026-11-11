// Which motions a delegate may propose, and which fields each one needs. Shared by the web
// console (ProposeMotionMenu) and the mobile app, so the list lives in exactly one place.
//
// THE DOUBLE GATE still holds: a motion reaches delegates only if it is in PROPOSABLE_MOTIONS
// AND `MOTION_META[t].delegateProposable` is true. Adding a type means editing both, then
// matching the field predicates below to what executeMotion consumes.
import { MOTION_META, type MotionType } from "./sessionService";

/** Display order (mirrors MOTION_META ranks). This array is the SOURCE. */
export const PROPOSABLE_MOTIONS: MotionType[] = ([
  "mod_caucus", "unmod_caucus", "extend_caucus", "move_to_voting",
  "introduce_document", "set_agenda", "open_gsl", "suspend", "adjourn", "custom",
] as MotionType[]).filter((t) => MOTION_META[t].delegateProposable);

export const motionNeedsTotal = (t: MotionType) => ["mod_caucus", "unmod_caucus", "extend_caucus"].includes(t);
// open_gsl included: executeMotion feeds params.perSpeakerSecs → setGslDefaultSecs.
export const motionNeedsPerSpeaker = (t: MotionType) => t === "mod_caucus" || t === "open_gsl";
export const motionNeedsTopic = (t: MotionType) =>
  ["mod_caucus", "set_agenda", "introduce_document", "move_to_voting", "custom"].includes(t);

/** A delegation may have at most this many motions pending at once (soft anti-spam). */
export const MOTION_PENDING_LIMIT = 3;
