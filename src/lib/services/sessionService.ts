/**
 * Live committee-session console — service layer.
 *
 * Models a wxMUN-style chairing session: roll call/attendance, General Speakers
 * List (GSL) + speaker timer, moderated/unmoderated caucuses + timers, voting
 * procedure, and a points/motions log. One hot doc per (committee, day) holds all
 * live mutable state so a single onSnapshot syncs chair + co-chair + projector;
 * append-only history (finished votes, motion log) and per-delegate participation
 * live in subcollections.
 *
 * Location: events/{eventId}/sessions/{sessionId}, sessionId = makeSessionId(committeeId, dateStr).
 *
 * IMPORTANT identity rules:
 *  - `committeeId` is the committee NAME everywhere (matches markings.committeeId
 *    and firestore.rules isCommitteeChair name compare).
 *  - attendance / ballots / participation are keyed by `delegateId` (a Firebase uid),
 *    never by country — country names contain "." and "," which break Firestore
 *    field-path updates. Country is stored as a value on each entry.
 */
import { withRollAttendance } from "./reportAttendance";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot,
  query, where, orderBy, serverTimestamp, increment, runTransaction, writeBatch,
  deleteField,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { MarkingMode, MarkingTemplate } from "@/lib/services/eventService";
import { updateCommitteeDoc } from "@/lib/services/committeeDocService";
import { MOTION_META } from "./motionMeta";
// Pure, type-only in the other direction — no runtime cycle. `executeMotion` uses it to fell the
// motions its own execution just answered, in the same batch as its status flip.
import { supersededByExecution } from "./motionMootness";
// floorGate.ts imports these types BACK, but type-only, so TypeScript erases that side and there is
// no runtime cycle. Same arrangement as motionMeta above.
import {
  INITIAL_GATE, holdsTheFloor, floorHolder, floorSpeechClock, type FloorGate,
} from "./floorGate";
// Same shape as the floorGate import above: this module type-imports sessionService, so the cycle
// is erased at compile time and nothing pulls firebase/client into the pure model.
import { caucusListState, signupIdFor, type CaucusListState } from "./caucusList";
// Same arrangement again — the roll-call lifecycle normalizer and its tally.
import {
  ROLL_CALL_DEFAULT_SECS, tallyRollCall,
  type RollCallState, type RollCallTally,
} from "./rollCall";
// And again — the "one live motion of a type per delegation" rule, shared with the propose form so
// the block and the sentence explaining it cannot drift.
import { myLiveMotion, duplicateMotionNote } from "./motionFloor";
// Pure — the yield clock math, shared with the chair's yield card so the number it promises and
// the number written to the doc cannot drift.
import { yieldGrantMs } from "./yieldClock";
// Static data table, no service imports — safe here. Only for motion-log LABELS, which are written
// once and read forever, so they must carry the display name rather than the ISO code.
import { getCountryName } from "@/lib/data/countries";
// Attendance is marking data, not just floor data: the scoring math needs to tell an
// absent day apart from a day the chair never scored. markingService never imports back.
import { mirrorAttendanceToMarkings } from "./markingService";

// ── Types ─────────────────────────────────────────────────────────────────────
export type SessionPhase =
  | "lobby" | "roll_call" | "gsl" | "mod_caucus" | "unmod_caucus" | "voting" | "suspended" | "closed";
export type AttendanceStatus = "present" | "present_and_voting" | "absent" | "late";

export interface TimerState {
  running: boolean;
  endsAt: number | null;            // epoch ms deadline while running
  pausedRemainingMs: number | null; // ms left while paused / before first start
  durationMs: number;               // configured length (reset target / progress bar)
  updatedAt?: any;                 // serverTimestamp — skew anchor
}

export interface AttendanceEntry {
  status: AttendanceStatus;
  country: string;
  delegateId: string;
  applicationId: string;
}

export type YieldKind = "none" | "delegate" | "questions" | "comments";

export interface SpeakerSlot {
  delegateId: string;
  country: string;
  applicationId: string;
  yieldTo?: YieldKind;
  yieldTargetCountry?: string;
  viaYield?: boolean;              // received the floor by a yield — may not yield again
  /**
   * Carried over from the `speak`/`caucus_signup` request a vice-chair raised ON BEHALF of this
   * delegation, so the attribution survives being seated. Without it the ProxyChip the chair sees
   * in the Requests queue vanishes the moment they grant it and the slot joins `queue`.
   */
  proxyBy?: string;
  proxyByName?: string;
  /** Set when the yield standing on this slot was declared by a proxy rather than the speaker. */
  yieldProxyBy?: string;
  yieldProxyByName?: string;
}

export interface GslState {
  defaultSpeakerSecs: number;
  queue: SpeakerSlot[];
  activeSpeaker: SpeakerSlot | null;
  timer: TimerState;
  /**
   * How many speakers have actually been CALLED from this list since the current topic began.
   * Absent ⇒ 0.
   *
   * WHY IT HAS TO BE STORED. An empty `queue` with a null `activeSpeaker` has two completely
   * different meanings — "nobody has signed up yet" and "the list was spoken through" — and the
   * next move is the opposite in each case (take signups vs. entertain caucus motions). Nothing
   * else on the doc can tell them apart: `nextSpeaker` resets the timer either way and leaves
   * `phase: "gsl"` standing, and the motion queue records motions, not speeches. Read it through
   * `gslSpokenThrough` (motionMootness.ts), never bare.
   *
   * Reset to 0 by every writer that opens a NEW agenda topic — a fresh topic means a fresh list,
   * so the signup suggestion has to come back.
   */
  spoken?: number;
}

export interface CaucusState {
  /**
   * Identifies THIS caucus run. Minted fresh by startModCaucus, so a delegate's signup
   * ("I want to speak") can be bound to the caucus it answered — otherwise a second caucus
   * would inherit the first one's answers. Survives extendCaucus on purpose: extending is
   * the same debate, so nobody is re-asked.
   */
  caucusId: string;
  kind: "moderated" | "unmoderated";
  topic: string;
  totalDurationSecs: number;
  perSpeakerSecs: number;
  /**
   * The signup response window: delegates must answer the speakers prompt before
   * `signupEndsAt` (epoch ms, chair's Date.now() — same convention as TimerState.endsAt).
   * After it, the prompt disappears and non-responders count as "did not respond"; only the
   * chair can add someone late. `signupWindowSecs` is kept so "Ask again" reopens the same
   * length. Absent on caucuses started before this shipped — treat missing as "no window".
   */
  signupWindowSecs?: number;
  signupEndsAt?: number;
  totalTimer: TimerState;
  speakerTimer: TimerState;
  /**
   * The recognized delegation. Kept as a country string for the projector/hero, which
   * predate `currentSpeaker`; nextCaucusSpeaker and setCaucusCountry write BOTH so the two
   * never drift (participation credit reads currentSpeaker).
   */
  currentCountry?: string;
  currentSpeaker?: SpeakerSlot | null;
  /**
   * The moderated-caucus speakers list — the chair's curated order, the ONLY authority on
   * who speaks next. Delegate signups never land here directly: they arrive as pending
   * `caucus_signup` floor requests and the chair adds them.
   */
  queue?: SpeakerSlot[];
  /**
   * Whether the speakers list is still being COLLECTED or has been SEATED by the chair.
   *
   * ABSENT on every caucus that predates this, and on every legacy (pre-`floorGate`) session —
   * read it through `caucusListState()` in `caucusList.ts`, never directly. That normalizer reads
   * absent as "seated", which is exactly today's behaviour, which is why there is no backfill.
   *
   * While "collecting", nothing writes `caucus.queue`: the chair is about to review the whole
   * batch in one dialog, and `useCaucusAutoAdd` appending to a list they are reordering is a race
   * with a UI on the other end of it.
   */
  listState?: CaucusListState;
}

export type VoteType = "procedural" | "substantive";
export type VoteThreshold = "simple_majority" | "two_thirds" | "consensus";
export type Ballot = "yes" | "no" | "abstain";

export interface ActiveVote {
  voteId: string;
  motion: string;
  motionId?: string;              // back-ref to a queued Motion (motion-first vote → execute)
  voteType: VoteType;
  threshold: VoteThreshold;
  minAffirmative?: number;        // explicit affirmative count override
  scMode: boolean;                // Security Council (enables P5 veto)
  p5: string[];                   // delegateIds holding veto power
  /**
   * @deprecated Always true — abstain is offered on every roll-call vote. Kept on the type
   * so FinishedVote docs written before the gate was removed still read back cleanly.
   */
  allowAbstain: boolean;
  round: 1 | 2;
  divisionOfQuestion: boolean;
  mode: "tally" | "roll_call";
  tally?: { yes: number; no: number; abstain: number };
  ballots?: Record<string /* delegateId */, Ballot>;
  /**
   * delegateId → the vice-chair who cast that ballot on their behalf. A SIBLING map, so
   * `ballots` values stay plain strings (countBallots, the P5 veto check and the firestore
   * `in ["yes","no","abstain"]` rule all depend on that).
   */
  ballotProxies?: Record<string /* delegateId */, { by: string; byName: string }>;
  /** Audit trail of ballots the chair reopened. Rides into FinishedVote via the `...vote` spread. */
  ballotChanges?: BallotChange[];
  /** Vote countdown. Absent = no time limit (legacy votes + the chair's "No limit" choice). */
  timer?: TimerState;
  eligibleCount: number;
  startedBy: string;
  startedAt?: any;
}

/** One discarded ballot, recorded when a chair grants a delegate's "change my vote" request. */
export interface BallotChange {
  delegateId: string;
  from: Ballot;                   // the ballot that was discarded
  at: number;                     // epoch ms — a serverTimestamp() sentinel cannot live inside an array
  by: string;                     // chair uid who approved the reopen
  wasProxy?: boolean;             // the discarded ballot had been cast by a vice-chair
  requestId?: string;             // requests/{id} that asked for it
}

/**
 * A vote's frozen outcome, denormalized onto the session doc so the projector and every
 * delegate console can reveal it from the ONE snapshot they already hold — no votes/
 * subscription, no extra read. `pendingPublish` is written by closeVoteAtomic and waits for
 * the chair's tap; `publishedResult` is what is currently on screen.
 */
export interface PublishedVoteResult {
  voteId: string;
  motion: string;
  result: VoteResult;
  affirmative: number;
  negative: number;
  abstentions: number;
  vetoedBy?: string[];            // delegateIds
  vetoedByCountries?: string[];   // resolved at close from attendance — the projector has no roster
  eligibleCount: number;
  voteType: VoteType;
  threshold: VoteThreshold;
  scMode: boolean;
  mode: "tally" | "roll_call";
  closedAt?: any;
  publishedAt?: any;              // only on publishedResult
  publishedBy?: string;           // only on publishedResult
}

/**
 * A committee document the chair has put on the projector — ref + display metadata ONLY.
 * The markdown body stays in committeeDocs (session-doc 1MB guard); the projector hero and
 * the reader fetch it by id (one read per publish change). Same denormalization idea as
 * PublishedVoteResult above.
 */
export interface PublishedDocRef {
  docId: string;
  title: string;
  docType: string;                // CommitteeDocType — typed loose to avoid a committeeDocService import
  submittedCountry?: string;
  sponsors: string[];             // country strings (as stored in attendance)
  signatories: string[];
  publishedAt?: any;
  publishedBy?: string;           // chair uid
}

export interface PointsMotionsTally {
  byDelegate: Record<string /* delegateId */, { points: number; motions: number }>;
}

/**
 * Video "stage" — the delegate uids currently granted the floor mic (v1: length 0 or 1).
 * Auto-mirrors gsl.activeSpeaker / the moderated-caucus speaker so the Agora video layer
 * knows who may broadcast on camera; chairs & Executive Board broadcast by role and are
 * NOT listed here. The token server (src/app/api/agora/token) reads this AUTHORITATIVELY —
 * a delegate not on the stage only ever gets a subscriber token, so a client cannot
 * self-promote to broadcaster.
 */
export interface LiveStageState {
  stage: string[];               // delegateIds (uids) allowed to broadcast
  updatedAt?: any;
  keepAliveAt?: number;          // epoch ms of the last chair "keep alive" (idle-guard reset)
  callEnded?: boolean;           // host ended the video call for everyone (session stays open; restartable)
}

/**
 * A staff member projected onto the session doc so DELEGATES can label their video tiles.
 * Delegates cannot read events/{id}/staff/* (firestore.rules), but every participant reads
 * the session doc — so the chair denormalizes the minimum needed here: uid, name, role.
 * Never widen this to email/permissions; the session doc is readable by any signed-in user.
 */
export interface SessionStaffEntry {
  uid: string;
  name: string;
  role: string;                   // StaffMember["role"] — typed loose to avoid a staffService import
}

/**
 * The chair's open invitation for motions — "the floor is open to motions."
 *
 * **THIS IS NOT THE GATE.** Motions are in order BY DEFAULT; admissibility is derived from the
 * live floor by `motionsInOrder` in `lib/services/motionFloor.ts`. This field is only the chair
 * ASKING the room to move — the digital equivalent of "are there any points or motions on the
 * floor?". A timed window modelled exactly on `CaucusState.signupEndsAt`: `endsAt` is epoch ms
 * from the CHAIR's `Date.now()`, the window closes ITSELF with no write, and `windowSecs` is kept
 * so "Ask again" reopens at the same length.
 *
 * ABSENT (or null) on every session created before this shipped — read that as "no invitation",
 * NEVER as "motions closed".
 */
export interface MotionInvite {
  /** Fresh per invite. Re-asking mints a new one, so a re-ask is a distinguishable snapshot event. */
  inviteId: string;
  endsAt: number;                 // epoch ms, chair's clock — same convention as TimerState.endsAt
  windowSecs: number;
  openedBy: string;               // chair uid
  openedAt?: any;                 // serverTimestamp — skew anchor, diagnostic only
  note?: string;                  // optional chair prompt, e.g. "motions on the funding topic only"
}

// ── Agenda (the ordered topics for the day) ─────────────────────────────────────
export type AgendaItemStatus = "pending" | "active" | "done" | "tabled";

export interface AgendaItem {
  /** Stable id — reordering `items` must never re-point `activeIndex` at the wrong topic. */
  id: string;
  title: string;
  status: AgendaItemStatus;
  /** epoch ms, chair's Date.now() — same convention as TimerState.endsAt / caucus.signupEndsAt. */
  startedAt?: number;
  completedAt?: number;
}

export interface SessionAgenda {
  items: AgendaItem[];
  /** Index into `items` of the topic under debate. -1 = nothing adopted yet. */
  activeIndex: number;
  /** Provenance, display-only: seeded from Committee.agendas[], set by a motion, or hand-edited. */
  source?: "committee" | "motion" | "chair";
  updatedAt?: any;
}

/**
 * The overall sitting clock behind the top bar's `⏱ 1:24:07`.
 *
 * Three numbers that only move on a suspend/resume gavel — the elapsed total is DERIVED at read
 * time by `sessionClock.ts`, never stored, so nothing writes per tick. Absent on every session
 * created before this shipped; `readSessionClock` falls back to `createdAt`, which is why there
 * is no backfill migration.
 */
export interface SessionClock {
  /** epoch ms — first gavel-in (or the doc's createdAt, for pre-clock sessions). */
  startedAt: number;
  /** Total ms already spent suspended, i.e. what the clock must NOT count. */
  accumulatedMs: number;
  /** epoch ms the current suspension began, else null. */
  suspendedAt: number | null;
}

export interface LiveSession {
  id?: string;
  eventId: string;
  committeeId: string;            // committee NAME
  dateStr: string;               // YYYY-MM-DD
  phase: SessionPhase;
  quorumThreshold: number;
  attendance: Record<string /* delegateId */, AttendanceEntry>;
  gsl: GslState;
  caucus: CaucusState | null;
  activeVote: ActiveVote | null;
  /** The chair's timed "floor is open to motions" invitation. Absent/null = no invitation. */
  motionInvite?: MotionInvite | null;
  /**
   * What the chair has opened the floor for, and therefore what delegates may do. ABSENT on every
   * session created before motion-first shipped — read it through `capabilitiesFor()` in
   * `floorGate.ts`, never directly. That resolver falls back to the pre-gate behaviour when this is
   * missing, which is why no backfill migration exists.
   */
  floorGate?: FloorGate | null;
  pointsMotions: PointsMotionsTally;
  /**
   * Ordered topics for the day. ABSENT on every session created before this shipped — read it
   * through `getAgenda()` in `components/session/flow/flowModel.ts`, never directly. That
   * normalizer synthesizes an in-memory agenda from the committee config when this is missing,
   * which is why no backfill migration exists.
   */
  agenda?: SessionAgenda | null;
  /**
   * Today's roll call, as a lifecycle rather than a mood. ABSENT on every session created before
   * this shipped — read it through `readRollCall()` in `rollCall.ts`, never directly. That
   * normalizer falls back to `quorumMet && phase !== "lobby"`, which is what the gate advice
   * already treated as "past roll call", so there is no backfill migration.
   */
  rollCall?: RollCallState | null;
  /** Sitting clock. ABSENT on pre-clock sessions — read it via `readSessionClock`, never directly. */
  clock?: SessionClock | null;
  live?: LiveStageState;       // Agora broadcaster floor (who may speak on camera)
  staff?: Record<string /* uid */, SessionStaffEntry>;  // denormalized by the chair — see SessionStaffEntry
  pendingPublish?: PublishedVoteResult | null;    // closed, awaiting the chair's Publish
  publishedResult?: PublishedVoteResult | null;   // live on the projector + every delegate screen
  publishedDoc?: PublishedDocRef | null;          // committee doc currently on the projector
  finalized: boolean;
  finalizedAt?: any;
  createdBy: string;
  createdAt?: any;
  updatedAt?: any;
}

export type VoteResult = "passed" | "failed" | "tied" | "vetoed";
export interface FinishedVote extends ActiveVote {
  result: VoteResult;
  affirmative: number;
  negative: number;
  abstentions: number;
  vetoedBy?: string[];           // delegateIds
  closedAt?: any;
  published?: boolean;           // the chair revealed this result to the room
  publishedAt?: any;
  publishedBy?: string;
}

export interface MotionLogEntry {
  id?: string;
  kind: "point" | "motion" | "yield";
  label: string;
  byDelegateId: string;
  byCountry: string;
  pointType?: PointType;          // when kind === "point"
  targetCountry?: string;        // when kind === "yield" (or a directed point)
  targetDelegateId?: string;
  outcome?: "raised" | "ruled" | "passed" | "failed";
  at?: any;
}

// ── Live points (delegate-raised, chair-resolved) ───────────────────────────────
export type PointType = "order" | "information" | "personal_privilege" | "parliamentary_inquiry";
export type PointStatus = "pending" | "recognized" | "dismissed";

export interface RaisedPoint {
  id?: string;
  delegateId: string;
  country: string;
  applicationId: string;
  type: PointType;
  note?: string;
  targetCountry?: string;        // a Point of Information may be directed at the current speaker
  status: PointStatus;
  /** The CHAIR's note on resolving — e.g. why it was dismissed. `note` above is the delegate's. */
  chairNote?: string;
  proxyBy?: string;              // set when a vice-chair raised this ON BEHALF of the delegation (their uid)
  proxyByName?: string;          // display name of the proxying vice-chair (for the chair's queue label)
  createdAt?: any;
  resolvedAt?: any;
  resolvedBy?: string;
}

/** Display metadata for each point type. `priority` orders the chair queue (lower first). */
export const POINT_META: Record<PointType, { label: string; short: string; canInterrupt: boolean; priority: number }> = {
  order:                 { label: "Point of Order",               short: "Order",       canInterrupt: true,  priority: 0 },
  personal_privilege:    { label: "Point of Personal Privilege",  short: "Privilege",   canInterrupt: true,  priority: 1 },
  information:           { label: "Point of Information",         short: "Information", canInterrupt: false, priority: 2 },
  parliamentary_inquiry: { label: "Point of Parliamentary Inquiry", short: "Inquiry",   canInterrupt: false, priority: 3 },
};

// ── Floor requests (delegate raises a hand for recognition) ─────────────────────
/**
 * "floor" = wants the camera/mic; "speak" = wants a slot on the Speakers List;
 * "vote_change" = already cast, asking the chair to reopen their ballot;
 * "caucus_signup" = answered the moderated-caucus prompt (the digital placard raise —
 * a "no" is recorded too, so the delegate stops being asked).
 */
export type FloorRequestKind = "floor" | "speak" | "vote_change" | "caucus_signup" | "yield";
export type FloorRequestStatus = "pending" | "granted" | "dismissed";

export interface FloorRequest {
  id?: string;
  delegateId: string;
  country: string;
  applicationId: string;
  kind: FloorRequestKind;
  /** vote_change only — binds the request to the vote it was raised against, so a stale one can't be granted. */
  voteId?: string;
  /** caucus_signup only — binds the answer to CaucusState.caucusId, so a new caucus re-asks. */
  caucusId?: string;
  /**
   * Written by `joinSignup` on both shapes it produces — binds the answer to FloorGate.signupId, so
   * a write arriving after the chair has moved on is recognisable as belonging to a previous round.
   * The gated successor to `caucusId`; on a caucus signup BOTH are present, and `signupIdFor`
   * derives one from the other so they cannot disagree.
   *
   * NOT enforced by firestore.rules: the `speak` create branch permits any `kind == "speak"` from a
   * rostered delegate with no gate check at all (three surfaces write bare `speak` docs off-gate and
   * must keep working). Chair-side consumers do the matching — see `RequestsPanel`.
   */
  signupId?: string;
  /**
   * `yield` only — the delegation the speaker wants to hand their remaining time to, plus a
   * snapshot of that time for the chair's card. The transfer re-reads the live clock on acceptance;
   * this number is display only, because the speech runs on while the chair decides.
   */
  yieldTargetCountry?: string;
  yieldTargetDelegateId?: string;
  yieldTargetApplicationId?: string;
  yieldRemainingMs?: number;
  /** caucus_signup only. A "no" is stored, never granted — it exists to silence the prompt. */
  answer?: "yes" | "no";
  note?: string;
  status: FloorRequestStatus;
  proxyBy?: string;              // set when a vice-chair raised this ON BEHALF of the delegation (their uid)
  proxyByName?: string;          // display name of the proxying vice-chair (for the chair's queue label)
  createdAt?: any;
  resolvedAt?: any;
  resolvedBy?: string;
}

export const FLOOR_REQUEST_META: Record<FloorRequestKind, { label: string; short: string; hint: string }> = {
  floor: { label: "Raise hand for the floor", short: "Floor", hint: "Ask the chair for the camera & mic" },
  speak: { label: "Request to speak", short: "Speak", hint: "Ask to be added to the Speakers List" },
  vote_change: { label: "Request to change my vote", short: "Re-vote", hint: "Ask the chair to reopen your ballot" },
  caucus_signup: { label: "Speak in this caucus", short: "Caucus", hint: "Answer the moderated-caucus speakers prompt" },
  yield: { label: "Yield my remaining time", short: "Yield", hint: "Hand the rest of your speech to another delegation" },
};

// ── Motions (delegate-proposed, chair-driven; the "motion-first" pipeline) ───────
/**
 * A delegate-proposed motion. Unlike `MotionLogEntry` (an append-only HISTORY record),
 * a `Motion` is a live proposal in the `motionQueue` subcollection with a lifecycle the
 * chair drives: recognize → put to a procedural vote (or adopt directly) → execute, at
 * which point it calls the SAME transition fns (startModCaucus, openVote, …) the direct
 * chair panels use. Mirrors the `RaisedPoint` shape 1:1 so rules/subscriptions match.
 */
export type MotionType =
  | "open_gsl" | "set_agenda" | "mod_caucus" | "unmod_caucus" | "extend_caucus"
  | "introduce_document" | "move_to_voting" | "adjourn" | "suspend" | "custom";

// pending → recognized → voting → passed/failed → executed | dropped
export type MotionStatus =
  | "pending" | "recognized" | "voting" | "passed" | "failed" | "executed" | "dropped";

export interface MotionParams {
  topic?: string;
  totalDurationSecs?: number;    // caucus total duration / extension length
  perSpeakerSecs?: number;       // moderated caucus speaking time
  documentId?: string;           // introduce_document → committeeDocs ref
  targetPhase?: SessionPhase;    // custom
}

export interface Motion {
  id?: string;
  type: MotionType;
  params: MotionParams;
  byDelegateId: string;          // uid (mirrors RaisedPoint.delegateId)
  byCountry: string;
  applicationId: string;
  status: MotionStatus;
  secondedBy?: string;           // optional seconding
  voteId?: string;               // set when put to a procedural vote (links ActiveVote)
  note?: string;
  /** The CHAIR's note on resolving — e.g. why it was dismissed. `note` above is the delegate's. */
  chairNote?: string;
  /**
   * Ruled OUT OF ORDER by the state of the committee, with no chair tap — the motion was overtaken
   * (the agenda was already set, a caucus already replaced the one this would have extended) or
   * contradicted by the floor. Derived in `motionMootness.ts`; `chairNote` carries the sentence.
   *
   * The stored `status` stays "dropped" for the reason the `dismissMotion` docstring gives below: a
   * new MotionStatus value would strand every motion already written as "dropped" and break the
   * ["executed","failed","dropped"] resolved filters. This flag is what the UI branches on to read
   * "out of order" instead of "dismissed", and to DROP the "Chair:" attribution on `chairNote` —
   * no chair said it, and misattributing it has delegates arguing a ruling nobody made.
   *
   * Absent on every motion a human resolved. Read it as false.
   */
  autoResolved?: boolean;
  proxyBy?: string;              // set when a vice-chair proposed this ON BEHALF of the delegation (their uid)
  proxyByName?: string;          // display name of the proxying vice-chair (for the chair's queue label)
  createdAt?: any;
  recognizedAt?: any;
  resolvedAt?: any;
  resolvedBy?: string;           // chair uid
}

/**
 * Display + procedure metadata for each motion type. DEFINED IN `./motionMeta` so pure modules
 * (the Flow Bar's `flowModel.ts`) can read it without importing this file, which pulls in
 * `@/lib/firebase/client` at module scope. Re-exported here so every existing
 * `import { MOTION_META } from "@/lib/services/sessionService"` keeps working.
 */
export { MOTION_META };

/** Roll-call record + tally. Defined in `./rollCall` for the same purity reason; re-exported here. */
export type { RollCallState, RollCallTally };

export interface ParticipationSummary {
  id?: string;
  delegateId: string;
  country: string;
  applicationId: string;
  eventId: string;
  committeeId: string;
  dateStr: string;
  attendanceStatus?: AttendanceStatus;
  speeches: number;
  speakingSeconds: number;
  caucusSpeeches: number;
  /** Points the CHAIR RECOGNIZED (the ones that feed marks by default). */
  points: number;
  /** Every point put to the chair, ruled or not. Absent on pre-existing docs ⇒ 0. */
  pointsRaised?: number;
  /** Motions PROPOSED — the delegate's own act, whatever the floor later did with it. */
  motionsProposed?: number;
  /** Motions that reached execution. Kept for back-compat with `autoFillFrom: "motions"`. */
  motions: number;
  votesCast: number;
  updatedAt?: any;
}

/** Counter fields on ParticipationSummary that can be bumped via increment(). */
export type ParticipationCounter =
  | "speeches" | "speakingSeconds" | "caucusSpeeches" | "points" | "pointsRaised"
  | "motionsProposed" | "motions" | "votesCast";

export interface DelegateRosterEntry {
  delegateId: string;
  country: string;
  applicationId: string;
}

export interface ParticipationIdentity {
  delegateId: string;
  country: string;
  applicationId: string;
  eventId: string;
  committeeId: string;
  dateStr: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
/** Deterministic session id. Sanitizes "/" (illegal in Firestore ids). */
export function makeSessionId(committeeId: string, dateStr: string): string {
  return `${(committeeId || "").replace(/\//g, "_")}__${dateStr}`;
}

function sessionRef(eventId: string, sessionId: string) {
  return doc(db, "events", eventId, "sessions", sessionId);
}
function votesCol(eventId: string, sessionId: string) {
  return collection(db, "events", eventId, "sessions", sessionId, "votes");
}
function motionsCol(eventId: string, sessionId: string) {
  return collection(db, "events", eventId, "sessions", sessionId, "motions");
}
function participationCol(eventId: string, sessionId: string) {
  return collection(db, "events", eventId, "sessions", sessionId, "participation");
}
function pointsCol(eventId: string, sessionId: string) {
  return collection(db, "events", eventId, "sessions", sessionId, "points");
}
function requestsCol(eventId: string, sessionId: string) {
  return collection(db, "events", eventId, "sessions", sessionId, "requests");
}
function motionQueueCol(eventId: string, sessionId: string) {
  return collection(db, "events", eventId, "sessions", sessionId, "motionQueue");
}

export function newTimer(durationMs: number): TimerState {
  return { running: false, endsAt: null, pausedRemainingMs: durationMs, durationMs };
}

/** Remaining ms for a timer, given the local clock. Clamped to [0, durationMs]. */
export function timerRemainingMs(t: TimerState | undefined, now: number = Date.now()): number {
  if (!t) return 0;
  const raw = t.running && t.endsAt != null ? t.endsAt - now : (t.pausedRemainingMs ?? 0);
  return Math.max(0, Math.min(t.durationMs, raw));
}

// ── Subscriptions ────────────────────────────────────────────────────────────
export function subscribeSession(
  eventId: string, sessionId: string, cb: (s: LiveSession | null) => void
): Unsubscribe {
  return onSnapshot(sessionRef(eventId, sessionId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as LiveSession) : null);
  }, (err) => { console.error("subscribeSession", err); cb(null); });
}

/**
 * One-shot read of the session doc. For callers that need to know whether a sitting exists
 * WITHOUT holding a listener open — the entry gate asks this once per button press, which is
 * one read instead of a subscription that would outlive the question.
 */
export async function getSession(eventId: string, sessionId: string): Promise<LiveSession | null> {
  const snap = await getDoc(sessionRef(eventId, sessionId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as LiveSession) : null;
}

export function subscribeFinishedVotes(
  eventId: string, sessionId: string, cb: (v: FinishedVote[]) => void
): Unsubscribe {
  const q = query(votesCol(eventId, sessionId), orderBy("closedAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as FinishedVote)));
  }, (err) => { console.error("subscribeFinishedVotes", err); cb([]); });
}

export function subscribeMotions(
  eventId: string, sessionId: string, cb: (m: MotionLogEntry[]) => void
): Unsubscribe {
  const q = query(motionsCol(eventId, sessionId), orderBy("at", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MotionLogEntry)));
  }, (err) => { console.error("subscribeMotions", err); cb([]); });
}

export function subscribeParticipation(
  eventId: string, sessionId: string, cb: (p: ParticipationSummary[]) => void
): Unsubscribe {
  return onSnapshot(participationCol(eventId, sessionId), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ParticipationSummary)));
  }, (err) => { console.error("subscribeParticipation", err); cb([]); });
}

/** Live queue of raised points (pending + resolved), newest first. */
export function subscribePoints(
  eventId: string, sessionId: string, cb: (p: RaisedPoint[]) => void
): Unsubscribe {
  const q = query(pointsCol(eventId, sessionId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RaisedPoint)));
  }, (err) => { console.error("subscribePoints", err); cb([]); });
}

/**
 * One delegate's own raised points (their dashboard view). Filtered server-side by
 * delegateId so the read passes rules without listing the whole committee.
 */
export function subscribeMyPoints(
  eventId: string, sessionId: string, delegateId: string, cb: (p: RaisedPoint[]) => void
): Unsubscribe {
  const q = query(pointsCol(eventId, sessionId), where("delegateId", "==", delegateId));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RaisedPoint));
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    cb(rows);
  }, (err) => { console.error("subscribeMyPoints", err); cb([]); });
}

/**
 * The points the chair has RECOGNIZED — what the delegate holding the floor is being asked to
 * answer. The delegate console subscribes only while they actually hold it (see
 * `RecognizedPointCard`), because on a 50k-reads/day tier a listener per delegate for the whole
 * sitting is a real cost and nobody else needs the feed.
 *
 * Single-field equality, sorted client-side: no composite index, nothing to add to
 * `firestore.indexes.json`. Same discipline as `subscribeMyPoints` above.
 */
export function subscribeRecognizedPoints(
  eventId: string, sessionId: string, cb: (p: RaisedPoint[]) => void
): Unsubscribe {
  const q = query(pointsCol(eventId, sessionId), where("status", "==", "recognized"));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RaisedPoint));
    // Newest first — the card shows the most recent ruling at the top.
    rows.sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0));
    cb(rows);
  }, (err) => { console.error("subscribeRecognizedPoints", err); cb([]); });
}

/** All floor requests (chair view), newest first. */
export function subscribeRequests(
  eventId: string, sessionId: string, cb: (r: FloorRequest[]) => void
): Unsubscribe {
  const q = query(requestsCol(eventId, sessionId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FloorRequest)));
  }, (err) => { console.error("subscribeRequests", err); cb([]); });
}

/** One delegate's own floor requests (their console view). Filtered server-side by delegateId. */
export function subscribeMyHands(
  eventId: string, sessionId: string, delegateId: string, cb: (r: FloorRequest[]) => void
): Unsubscribe {
  const q = query(requestsCol(eventId, sessionId), where("delegateId", "==", delegateId));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FloorRequest));
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    cb(rows);
  }, (err) => { console.error("subscribeMyHands", err); cb([]); });
}

/** A single delegate's participation doc for the day (delegate-readable). */
export async function getMyParticipation(
  eventId: string, committeeId: string, dateStr: string, delegateId: string,
): Promise<ParticipationSummary | null> {
  if (!eventId || !committeeId || !dateStr || !delegateId) return null;
  try {
    const sessionId = makeSessionId(committeeId, dateStr);
    const snap = await getDoc(doc(participationCol(eventId, sessionId), delegateId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as ParticipationSummary) : null;
  } catch (e) {
    console.error("getMyParticipation", e);
    return null;
  }
}

/** One-shot read of a day's participation, for the Marking matrix decision-assist. */
export async function getDailyParticipation(
  eventId: string, committeeId: string, dateStr: string
): Promise<ParticipationSummary[]> {
  if (!eventId || !committeeId || !dateStr) return [];
  try {
    const sessionId = makeSessionId(committeeId, dateStr);
    const snap = await getDocs(participationCol(eventId, sessionId));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ParticipationSummary));
  } catch (e) {
    console.error("getDailyParticipation", e);
    return [];
  }
}

/**
 * The whole procedural record of ONE committee-day, in one call.
 *
 * WHY IT EXISTS: the console's `MotionsLog` is a live scratchpad for the sitting in progress.
 * This is the archive — a chair who needs to answer "what did we actually pass on day 2, who
 * moved it and what was the tally" has, until now, had nowhere to look once the session was
 * gavelled out. Four one-shot reads, no listeners, no composite index (every collection is
 * read whole and ordered client-side, the same discipline as `buildCommitteeReport`).
 *
 * Every one of these subcollections is `read: if isSignedIn()` in firestore.rules, so this
 * needs no rules change. A day that never had a session returns four empty arrays.
 */
export interface DailyMotionLog {
  dateStr: string;
  /** Proposals with their full parameters, chair notes and resolution. */
  motions: Motion[];
  /** The append-only history — motions, points and yields as they were logged. */
  entries: MotionLogEntry[];
  /** Closed votes with tallies (and per-delegate ballots for roll-call votes). */
  votes: FinishedVote[];
  /** Points raised, with the delegate's note and the chair's ruling. */
  points: RaisedPoint[];
}

export async function getDailyMotionLog(
  eventId: string, committeeId: string, dateStr: string,
): Promise<DailyMotionLog> {
  const empty: DailyMotionLog = { dateStr, motions: [], entries: [], votes: [], points: [] };
  if (!eventId || !committeeId || !dateStr) return empty;
  const sessionId = makeSessionId(committeeId, dateStr);
  try {
    const [queueSnap, entriesSnap, votesSnap, pointsSnap] = await Promise.all([
      getDocs(motionQueueCol(eventId, sessionId)).catch(() => null),
      getDocs(motionsCol(eventId, sessionId)).catch(() => null),
      getDocs(votesCol(eventId, sessionId)).catch(() => null),
      getDocs(pointsCol(eventId, sessionId)).catch(() => null),
    ]);
    return {
      dateStr,
      motions: (queueSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() } as Motion)),
      entries: (entriesSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() } as MotionLogEntry)),
      votes: (votesSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() } as unknown as FinishedVote)),
      points: (pointsSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() } as RaisedPoint)),
    };
  } catch (e) {
    console.error("getDailyMotionLog", e);
    return empty;
  }
}

// ── Live-session registry ─────────────────────────────────────────────────────
/**
 * A flat index of the sessions that are running RIGHT NOW: liveSessions/{eventId}__{sessionId}.
 *
 * Exists purely so the app-admin monitor can list running sessions without a
 * `collectionGroup("sessions")` scan, which costs one read per session doc that has ever
 * existed and so grows without bound. The project is on the Firestore Spark plan (50k
 * reads/day) — see the read-budget note in README "Deploying".
 *
 * The registry is a HINT, never the source of truth. A chair who closes their laptop
 * without closing the session leaves an orphan behind; the admin route reads each
 * referenced session doc anyway and prunes entries whose session is closed/finalized/gone.
 * That also means a missed write here degrades the monitor, never the session itself,
 * which is why every call below is fire-and-forget.
 */
const LIVE_INDEX = "liveSessions";
const liveIndexId = (eventId: string, sessionId: string) => `${eventId}__${sessionId}`;

export async function registerLiveSession(
  eventId: string, sessionId: string, committeeId: string, dateStr: string, startedBy: string,
): Promise<void> {
  try {
    await setDoc(doc(db, LIVE_INDEX, liveIndexId(eventId, sessionId)), {
      eventId, sessionId, committeeId, dateStr, startedBy, startedAt: Date.now(),
    }, { merge: true });
  } catch (e) {
    console.error("registerLiveSession", e);
  }
}

/**
 * CALLED MORE THAN ONCE PER SESSION, BY DESIGN. `setPhase("closed")` fires it and so does
 * `finalizeSession`, so a chair who closes (or passes an `adjourn` motion) and then finalizes
 * deletes an entry that is already gone. That is a no-op, not a failure — but it only stays quiet
 * because the `liveSessions` delete rule permits `resource == null`; without that clause the second
 * delete evaluates `resource.data` on null, which errors, and an error denies. If this ever starts
 * logging "Missing or insufficient permissions" again, check that clause before anything else.
 */
export async function unregisterLiveSession(eventId: string, sessionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, LIVE_INDEX, liveIndexId(eventId, sessionId)));
  } catch (e) {
    console.error("unregisterLiveSession", e);
  }
}

// ── Create / lifecycle ────────────────────────────────────────────────────────
/**
 * Idempotently create the day's session, seeding attendance (default "absent")
 * from the committee roster. Returns the existing session untouched if present.
 */
export async function ensureSession(
  eventId: string, committeeId: string, dateStr: string, createdBy: string,
  roster: DelegateRosterEntry[], defaultSpeakerSecs = 90,
  /** Committee.agendas[] — seeds session.agenda.items. Trailing + optional so old callers compile. */
  agendas: string[] = [],
): Promise<LiveSession> {
  const sessionId = makeSessionId(committeeId, dateStr);
  const ref = sessionRef(eventId, sessionId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const s = { id: existing.id, ...existing.data() } as LiveSession;
    // Re-open of a still-running session (chair reloaded, second chair joined): re-assert the
    // registry entry, which also heals sessions that predate it.
    if (s.phase !== "closed" && !s.finalized) {
      void registerLiveSession(eventId, sessionId, committeeId, dateStr, createdBy);
    }
    return s;
  }

  const attendance: Record<string, AttendanceEntry> = {};
  for (const r of roster) {
    if (!r.delegateId) continue;
    attendance[r.delegateId] = {
      status: "absent", country: r.country || "", delegateId: r.delegateId, applicationId: r.applicationId || "",
    };
  }
  const session: LiveSession = {
    eventId, committeeId, dateStr,
    phase: "lobby",
    quorumThreshold: Math.max(1, Math.ceil(roster.length / 2)),
    attendance,
    gsl: {
      defaultSpeakerSecs, queue: [], activeSpeaker: null,
      timer: newTimer(defaultSpeakerSecs * 1000), spoken: 0,
    },
    caucus: null,
    activeVote: null,
    pointsMotions: { byDelegate: {} },
    agenda: {
      items: agendas.map((t) => t.trim()).filter(Boolean).map((title, i) => ({
        id: `a${i}`, title, status: "pending" as AgendaItemStatus,
      })),
      activeIndex: -1,
      source: "committee",
    },
    // The roll has not been taken. `startRollCall` mints the record.
    rollCall: null,
    // Starts shut. The chair opens roll call as their first act, which is also the first thing
    // the gate bar suggests — see `capabilitiesFor`.
    floorGate: { ...INITIAL_GATE, openedBy: createdBy, openedAt: serverTimestamp() },
    live: { stage: [], updatedAt: serverTimestamp() },
    staff: {},
    pendingPublish: null,
    publishedResult: null,
    publishedDoc: null,
    finalized: false,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, session);
  void registerLiveSession(eventId, sessionId, committeeId, dateStr, createdBy);
  return session;
}

/** Generic field-scoped writer — always stamps updatedAt. */
async function patch(eventId: string, sessionId: string, data: Record<string, any>) {
  await updateDoc(sessionRef(eventId, sessionId), { ...data, updatedAt: serverTimestamp() });
}

/**
 * Every close path in the app funnels through here — the chair's Close button, the IdleGuard
 * auto-close, and a passed "adjourn" motion — so this is the one place that has to drop the
 * session out of the live registry.
 */
export const setPhase = async (eventId: string, sessionId: string, phase: SessionPhase) => {
  await patch(eventId, sessionId, { phase });
  if (phase === "closed") void unregisterLiveSession(eventId, sessionId);
};

/**
 * Close a sitting left open from an EARLIER day (the chair never pressed Close). Same end state
 * as the daily server sweep (lib/server/staleSittings): closed, nobody left on the video stage,
 * out of the live registry. Clearing `live.stage` matters, the token route would otherwise keep
 * minting a publisher token for whoever was last on the floor. Used by organizer Live Control
 * and by the chair console for its own committee's leftovers.
 */
export const closeStaleSitting = async (eventId: string, sessionId: string) => {
  await patch(eventId, sessionId, { phase: "closed", "live.stage": [], "live.updatedAt": serverTimestamp() });
  void unregisterLiveSession(eventId, sessionId);
};

/**
 * Close this committee's sittings from days before `beforeDateStr` that were never closed.
 * Fire-and-forget from the chair's Start: one read per sitting the committee has ever had
 * (a handful per conference), and it keeps Live Control and the admin monitor honest.
 */
export async function closeEarlierSittings(eventId: string, committeeId: string, beforeDateStr: string): Promise<void> {
  try {
    const snap = await getDocs(query(collection(db, "events", eventId, "sessions"), where("committeeId", "==", committeeId)));
    for (const d of snap.docs) {
      const s = d.data() as LiveSession;
      if (d.id.startsWith("__ceremony__") || s.phase === "closed") continue;
      if (s.dateStr && s.dateStr < beforeDateStr) await closeStaleSitting(eventId, d.id);
    }
  } catch (e) {
    console.warn("[session] closeEarlierSittings", e);
  }
}

export const setQuorum = (eventId: string, sessionId: string, quorumThreshold: number) =>
  patch(eventId, sessionId, { quorumThreshold });

// ── Floor gate ──────────────────────────────────────────────────────────────────
// The chair's primary control under motion-first: one write that decides, for every delegate at
// once, what is clickable. Read it back through `capabilitiesFor` in floorGate.ts — never directly.

/** What a gate spec looks like before the chair's identity is stamped on it. */
export type GateSpec = Omit<FloorGate, "openedBy" | "openedAt">;

/**
 * Deadline for a window of `secs`, or null for a gate that stays open until the chair moves.
 *
 * Uses the CHAIR's clock, matching `startModCaucus`'s `signupEndsAt`. A skewed chair laptop shifts
 * the window for everyone equally, which is why firestore.rules allows a 2s grace on the far side
 * rather than trying to be exact.
 */
export function gateEndsAt(secs: number | null | undefined, now: number = Date.now()): number | null {
  return secs && secs > 0 ? now + secs * 1000 : null;
}

export const openGate = (eventId: string, sessionId: string, openedBy: string, spec: GateSpec) =>
  patch(eventId, sessionId, {
    floorGate: { ...spec, openedBy, openedAt: serverTimestamp() },
  });

/** Shut the floor. Delegates can do nothing but watch until the chair opens something else. */
export const closeGate = (eventId: string, sessionId: string, openedBy: string) =>
  openGate(eventId, sessionId, openedBy, { kind: "locked", allowsPoints: false, endsAt: null });

// ── Roll call (record + gate + phase, together) ─────────────────────────────────
// The three writes that move `session.rollCall`. Read the state back through `readRollCall()` in
// `rollCall.ts` — never off the field, and never off the gate.
//
// WHY THESE EXIST AT ALL. The old "Open roll call" was `setPhase(…, "roll_call")` and nothing else.
// Every session created since motion-first carries a `floorGate`, so `capabilitiesFor` takes the
// gated branch and the phase grants delegates NOTHING: the chair pressed the button, the bar still
// read "The floor is closed", and no delegate could answer. Opening the roll is three facts at once
// — the phase (for the projector), the gate (for permission) and the record (for the flow) — so it
// is one function and one write.

/**
 * Open the roll. One patch: phase, gate and record together.
 *
 * The record is written WHOLE, not by dotted path, which is what makes a retake work — `closedAt`
 * and `completedAt` clear for free. Same reasoning as `suspendSession` rewriting the whole `clock`.
 */
export async function startRollCall(
  eventId: string,
  sessionId: string,
  openedBy: string,
  secs: number | null = ROLL_CALL_DEFAULT_SECS,
): Promise<void> {
  // Chair clock, matching every other window in the model. `firestore.rules` allows 2s of grace on
  // the far side rather than trying to be exact about skew.
  const now = Date.now();
  const endsAt = gateEndsAt(secs, now);
  await patch(eventId, sessionId, {
    phase: "roll_call" satisfies SessionPhase,
    floorGate: {
      kind: "roll_call",
      // Points are not in order during the roll — nobody has the floor to interrupt.
      allowsPoints: false,
      endsAt,
      ...(secs != null ? { windowSecs: secs } : {}),
      openedBy,
      openedAt: serverTimestamp(),
    } satisfies FloorGate,
    rollCall: {
      startedAt: now, endsAt, windowSecs: secs ?? null,
      closedAt: null, completedAt: null, openedBy,
    } satisfies RollCallState,
  });
}

/**
 * Stop the roll before its window lapses. Shuts the gate in the same patch, so declarations are
 * refused server-side immediately — `firestore.rules` requires `floorGate.kind == "roll_call"`.
 *
 * Not a completion: the chair still has to rule, which is what `completeRollCall` records.
 */
export async function stopRollCall(
  eventId: string, sessionId: string, closedBy: string,
): Promise<void> {
  await patch(eventId, sessionId, {
    "rollCall.closedAt": Date.now(),
    floorGate: {
      kind: "locked", allowsPoints: false, endsAt: null,
      openedBy: closedBy, openedAt: serverTimestamp(),
    } satisfies FloorGate,
  });
}

/**
 * The chair's ruling: the roll is taken. Stamps `completedAt` and freezes the tally.
 *
 * TRANSACTIONAL AND IDEMPOTENT, for the reason `suspendSession` is: two chairs pressing at once
 * would otherwise mint two `completedAt` values, and the summary modal — which is derived from that
 * timestamp — would re-raise on the second one. A session already ruled returns its existing
 * snapshot untouched.
 *
 * NOTE IT DOES NOT WRITE `phase`. Leaving it at "roll_call" keeps the projector on `RollCallBoard`
 * (focalState.ts) so the room sees the final tally during the summary beat, and the phase already
 * stays there until `executeMotion` moves it two steps later.
 */
export async function completeRollCall(
  eventId: string, sessionId: string, completedBy: string,
): Promise<RollCallTally> {
  const ref = sessionRef(eventId, sessionId);
  let out: RollCallTally | null = null;
  let mirror: { committeeId: string; dateStr: string; rows: Array<{ delegateId: string; applicationId: string; status: AttendanceStatus }> } | null = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    const tally = tallyRollCall(s.attendance, s.quorumThreshold || 0);

    if (s.rollCall?.completedAt) { out = tally; return; }   // already ruled — no second stamp
    out = tally;
    // Backstop for the per-tap mirror in setAttendance: the roll being TAKEN is the
    // authoritative statement of who was in the room, and this also catches sessions
    // whose attendance was recorded before the marking mirror existed.
    mirror = {
      committeeId: s.committeeId, dateStr: s.dateStr,
      rows: Object.values(s.attendance || {})
        .filter((a) => a?.delegateId)
        .map((a) => ({ delegateId: a.delegateId, applicationId: a.applicationId, status: a.status })),
    };

    const gateIsRoll = s.floorGate?.kind === "roll_call";
    tx.update(ref, {
      rollCall: {
        // A roll completed with no record at all (legacy session, or the chair ruled without ever
        // pressing Start) still gets one — otherwise `readRollCall` would keep reading legacy.
        ...(s.rollCall ?? { startedAt: Date.now(), endsAt: null }),
        closedAt: s.rollCall?.closedAt ?? Date.now(),
        completedAt: Date.now(),
        completedBy,
        ...tally,
      } satisfies RollCallState,
      ...(gateIsRoll
        ? {
            floorGate: {
              kind: "locked", allowsPoints: false, endsAt: null,
              openedBy: completedBy, openedAt: serverTimestamp(),
            } satisfies FloorGate,
          }
        : {}),
      updatedAt: serverTimestamp(),
    });
  });
  const m = mirror as { committeeId: string; dateStr: string; rows: Array<{ delegateId: string; applicationId: string; status: AttendanceStatus }> } | null;
  if (m) void mirrorAttendanceToMarkings(eventId, m.committeeId, m.dateStr, m.rows, completedBy);
  return out ?? tallyRollCall({}, 0);
}

// ── Suspend / resume (phase + clock, atomically) ────────────────────────────────
// Transactional, unlike the other phase writers, for one reason: the phase and the clock must
// move TOGETHER. Written apart, a failed second write leaves a session that reads as suspended
// while the clock keeps counting the break — exactly the bug the clock exists to prevent. Use
// these instead of `setPhase(..., "suspended" | "gsl")` at every suspend/resume site.

export async function suspendSession(eventId: string, sessionId: string): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    if (s.phase === "suspended") return;               // idempotent: never restart the stopwatch
    const clock = readClock(s);
    tx.update(ref, {
      phase: "suspended" satisfies SessionPhase,
      // Persist the whole normalized object, not a dotted field: on a pre-clock session there is
      // no `clock` map to dot into, and `startedAt` has to be written for the first time anyway.
      clock: { ...clock, suspendedAt: Date.now() } satisfies SessionClock,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function resumeSession(
  eventId: string, sessionId: string, phase: SessionPhase = "gsl",
): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    const clock = readClock(s);
    // Bank the break we just took. `suspendedAt` null (a resume with no matching suspend — see
    // the drift note in sessionClock.ts) banks nothing rather than banking `now - startedAt`.
    const breakMs = clock.suspendedAt ? Math.max(0, Date.now() - clock.suspendedAt) : 0;
    tx.update(ref, {
      phase,
      clock: {
        startedAt: clock.startedAt,
        accumulatedMs: clock.accumulatedMs + breakMs,
        suspendedAt: null,
      } satisfies SessionClock,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Local mirror of `sessionClock.ts`'s normalizer for use INSIDE a transaction. Duplicated
 * deliberately: importing the pure module here would be harmless, but these two writers need the
 * fallback to be a plain object literal they can spread, and the fallback rule (`createdAt`, else
 * now) is the one line that must agree. If you change one, change both.
 */
function readClock(s: LiveSession): SessionClock {
  const c = s.clock;
  if (c && typeof c.startedAt === "number" && c.startedAt > 0) {
    return {
      startedAt: c.startedAt,
      accumulatedMs: Math.max(0, c.accumulatedMs || 0),
      suspendedAt: typeof c.suspendedAt === "number" ? c.suspendedAt : null,
    };
  }
  const created = (s.createdAt as any)?.toMillis?.() ?? ((s.createdAt as any)?.seconds || 0) * 1000;
  return { startedAt: created || Date.now(), accumulatedMs: 0, suspendedAt: null };
}

// ── Agenda ─────────────────────────────────────────────────────────────────────
// All the index-moving writers are transactional for the same reason extendCaucus is: they
// read-modify-write an array on a doc two chairs share. `agenda.items` is safe as a dotted
// field path — agenda keys are array indices, never country names (see the header note on ".").

/** Replace the whole topic list (chair edit / first persist of a synthesized agenda). */
export const setAgendaItems = (
  eventId: string, sessionId: string, items: AgendaItem[],
  source: SessionAgenda["source"] = "chair",
) => patch(eventId, sessionId, { "agenda.items": items, "agenda.source": source });

/** Read the agenda off a raw session snapshot, tolerating the pre-agenda shape. */
function readAgenda(data: any): SessionAgenda {
  const a = data?.agenda;
  return {
    items: Array.isArray(a?.items) ? (a.items as AgendaItem[]) : [],
    activeIndex: typeof a?.activeIndex === "number" ? a.activeIndex : -1,
    source: a?.source,
  };
}

/** Adopt topic #index: it becomes "active", any other "active" is demoted to "tabled". TXN. */
export async function setActiveAgenda(eventId: string, sessionId: string, index: number): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const { items, activeIndex } = readAgenda(snap.data());
    if (index < 0 || index >= items.length) return;
    const now = Date.now();
    const next = items.map((it, i) =>
      i === index ? { ...it, status: "active" as AgendaItemStatus, startedAt: it.startedAt ?? now }
      : it.status === "active" ? { ...it, status: "tabled" as AgendaItemStatus }
      : it);
    tx.update(ref, {
      "agenda.items": next, "agenda.activeIndex": index,
      // New topic ⇒ new Speakers List. Guarded on the index actually MOVING: re-adopting the topic
      // already under debate is a no-op elsewhere in this transaction and must not erase the
      // speeches the room has heard on it. See GslState.spoken.
      ...(index !== activeIndex ? { "gsl.spoken": 0 } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Mark topic #index done. Leaves activeIndex alone — the chair may still be wrapping up. TXN. */
export async function completeAgendaItem(eventId: string, sessionId: string, index: number): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const { items } = readAgenda(snap.data());
    if (index < 0 || index >= items.length) return;
    const next = items.map((it, i) =>
      i === index ? { ...it, status: "done" as AgendaItemStatus, completedAt: Date.now() } : it);
    tx.update(ref, { "agenda.items": next, updatedAt: serverTimestamp() });
  });
}

/**
 * Adopt a topic BY TITLE — what a passed `set_agenda` motion executes. Matches an existing item
 * case/whitespace-insensitively; appends the topic when the motion names something the committee
 * config never listed. Last-write-wins by design: the Flow Bar refuses to one-tap execute when
 * competing set_agenda motions exist, so the chair resolves that contest in the Motions panel.
 */
export async function adoptAgendaTopic(eventId: string, sessionId: string, title: string): Promise<void> {
  const wanted = title.trim();
  if (!wanted) return;
  const key = wanted.toLowerCase();
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const { items, activeIndex } = readAgenda(snap.data());
    let idx = items.findIndex((it) => it.title.trim().toLowerCase() === key);
    let next = items;
    if (idx < 0) {
      idx = items.length;
      next = [...items, { id: `a${Date.now()}`, title: wanted, status: "pending" as AgendaItemStatus }];
    }
    const now = Date.now();
    next = next.map((it, i) =>
      i === idx ? { ...it, status: "active" as AgendaItemStatus, startedAt: it.startedAt ?? now }
      : it.status === "active" ? { ...it, status: "tabled" as AgendaItemStatus }
      : it);
    tx.update(ref, {
      "agenda.items": next, "agenda.activeIndex": idx, "agenda.source": "motion",
      // Same guard as setActiveAgenda: a second set_agenda naming the topic already under debate
      // must not wipe the speech count. See GslState.spoken.
      ...(idx !== activeIndex ? { "gsl.spoken": 0 } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Close the current topic and open the next one, in ONE transaction. No-op past the last item. */
export async function advanceAgenda(eventId: string, sessionId: string): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const { items, activeIndex } = readAgenda(snap.data());
    const nextIdx = activeIndex + 1;
    if (nextIdx >= items.length) return;
    const now = Date.now();
    const next = items.map((it, i) =>
      i === activeIndex ? { ...it, status: "done" as AgendaItemStatus, completedAt: now }
      : i === nextIdx ? { ...it, status: "active" as AgendaItemStatus, startedAt: now }
      : it);
    tx.update(ref, {
      "agenda.items": next, "agenda.activeIndex": nextIdx,
      // Unconditional here — advancing always moves to a different item. See GslState.spoken.
      "gsl.spoken": 0,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Mirror the committee's staff onto the session doc so delegates can label staff video
 * tiles (they cannot read the staff collection itself). Chair-only write; replaces the
 * whole map, so callers pass the full current list.
 */
export const syncSessionStaff = (eventId: string, sessionId: string, staff: SessionStaffEntry[]) =>
  patch(eventId, sessionId, {
    staff: Object.fromEntries(staff.filter((s) => s.uid).map((s) => [s.uid, s])),
  });

/**
 * Roll call: set one delegate's attendance; mirrors status onto their participation doc
 * AND onto the day's marking doc.
 *
 * The marking mirror is what lets `computeFinalScore` distinguish "absent" (0% for the
 * day) from "present but the chair never scored them" (day dropped from the denominator).
 * Fire-and-forget: a lost mirror degrades the scoring nuance, it must never block the roll.
 */
/**
 * The identity fields of one attendance entry, as field paths next to `status`.
 *
 * WHY NOT STATUS ALONE. `ensureSession` seeds full entries for the roster it saw at creation. A
 * delegate allocated AFTER that has no entry, so a status-only write created
 * `{ status }` with no `delegateId`/`country`/`applicationId` — and every reader keyed on those
 * broke for them: the yield target list showed a blank delegation and `requestYield` sent
 * `yieldTargetDelegateId: undefined`, which the requests rule rejects. Re-asserting the identity on
 * every chair write heals both new and already-broken entries. Omitted when empty, so a write never
 * carries `undefined`.
 */
function attendanceIdentityFields(identity: ParticipationIdentity): Record<string, string> {
  const base = `attendance.${identity.delegateId}`;
  const out: Record<string, string> = { [`${base}.delegateId`]: identity.delegateId };
  if (identity.country) out[`${base}.country`] = identity.country;
  if (identity.applicationId) out[`${base}.applicationId`] = identity.applicationId;
  return out;
}

export async function setAttendance(
  eventId: string, sessionId: string, identity: ParticipationIdentity, status: AttendanceStatus,
) {
  await patch(eventId, sessionId, {
    [`attendance.${identity.delegateId}.status`]: status,
    ...attendanceIdentityFields(identity),
  });
  await bumpParticipation(eventId, sessionId, identity, {}, status);
  void mirrorAttendanceToMarkings(identity.eventId, identity.committeeId, identity.dateStr, [
    { delegateId: identity.delegateId, applicationId: identity.applicationId, status },
  ]);
}

/** Bulk roll call (e.g. "all present") — one batched commit for the session + participation. */
export async function setAttendanceBulk(
  eventId: string, sessionId: string, identities: ParticipationIdentity[], status: AttendanceStatus,
) {
  if (!identities.length) return;
  const batch = writeBatch(db);
  const sref = sessionRef(eventId, sessionId);
  const upd: Record<string, any> = { updatedAt: serverTimestamp() };
  for (const id of identities) {
    upd[`attendance.${id.delegateId}.status`] = status;
    Object.assign(upd, attendanceIdentityFields(id));
  }
  batch.update(sref, upd);
  for (const id of identities) {
    batch.set(doc(participationCol(eventId, sessionId), id.delegateId), {
      delegateId: id.delegateId, country: id.country, applicationId: id.applicationId,
      eventId: id.eventId, committeeId: id.committeeId, dateStr: id.dateStr,
      attendanceStatus: status, updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  // Same marking mirror as setAttendance, one batch for the whole roster.
  const first = identities[0];
  void mirrorAttendanceToMarkings(first.eventId, first.committeeId, first.dateStr,
    identities.map((id) => ({ delegateId: id.delegateId, applicationId: id.applicationId, status })));
}

// ── Participation ──────────────────────────────────────────────────────────────
/**
 * Increment participation counters (and optionally set attendance status) for one
 * delegate. Identity fields are re-asserted via merge so the doc is always joinable
 * by the Marking matrix and passes rules.
 */
export async function bumpParticipation(
  eventId: string, sessionId: string, identity: ParticipationIdentity,
  deltas: Partial<Record<ParticipationCounter, number>>, attendanceStatus?: AttendanceStatus,
) {
  const ref = doc(participationCol(eventId, sessionId), identity.delegateId);
  const payload: Record<string, any> = {
    delegateId: identity.delegateId,
    country: identity.country,
    applicationId: identity.applicationId,
    eventId: identity.eventId,
    committeeId: identity.committeeId,
    dateStr: identity.dateStr,
    updatedAt: serverTimestamp(),
  };
  if (attendanceStatus) payload.attendanceStatus = attendanceStatus;
  for (const [k, v] of Object.entries(deltas)) {
    if (v) payload[k] = increment(v);
  }
  await setDoc(ref, payload, { merge: true });
}

// ── Timers (deadline model — writes only on start/pause/reset) ──────────────────
export type TimerPath = "gsl.timer" | "caucus.totalTimer" | "caucus.speakerTimer" | "activeVote.timer";

export const timerStart = (eventId: string, sessionId: string, path: TimerPath, remainingMs: number) =>
  patch(eventId, sessionId, {
    [`${path}.running`]: true,
    [`${path}.endsAt`]: Date.now() + Math.max(0, remainingMs),
    [`${path}.pausedRemainingMs`]: null,
    [`${path}.updatedAt`]: serverTimestamp(),
  });

export const timerPause = (eventId: string, sessionId: string, path: TimerPath, remainingMs: number) =>
  patch(eventId, sessionId, {
    [`${path}.running`]: false,
    [`${path}.endsAt`]: null,
    [`${path}.pausedRemainingMs`]: Math.max(0, remainingMs),
    [`${path}.updatedAt`]: serverTimestamp(),
  });

export const timerReset = (eventId: string, sessionId: string, path: TimerPath, durationMs: number) =>
  patch(eventId, sessionId, {
    [`${path}.running`]: false,
    [`${path}.endsAt`]: null,
    [`${path}.pausedRemainingMs`]: durationMs,
    [`${path}.durationMs`]: durationMs,
    [`${path}.updatedAt`]: serverTimestamp(),
  });

// ── General Speakers List ───────────────────────────────────────────────────────
export const setGslQueue = (eventId: string, sessionId: string, queue: SpeakerSlot[]) =>
  patch(eventId, sessionId, { "gsl.queue": queue });

export const setGslDefaultSecs = (eventId: string, sessionId: string, secs: number) =>
  patch(eventId, sessionId, { "gsl.defaultSpeakerSecs": secs });

/**
 * Which speaker slot the yield fields live under RIGHT NOW.
 *
 * A moderated caucus runs its speeches on `caucus.currentSpeaker`, the GSL on `gsl.activeSpeaker`,
 * and both carry the same `yieldTo` / `yieldTargetCountry` / `viaYield` shape. Every writer that
 * sets a yield field goes through this so none of them can drift back to hard-coding `gsl.*` —
 * which is exactly how yields came to be invisible for the whole of a caucus.
 *
 * Takes the SESSION, not a flag, so the answer is derived from the same `floorHolder` precedence
 * the consoles and the rules read.
 */
function speakerSlotPath(s: Pick<LiveSession, "gsl" | "caucus" | "activeVote">): string {
  return s.caucus?.kind === "moderated" ? "caucus.currentSpeaker" : "gsl.activeSpeaker";
}

/**
 * Chair sets how the current speaker's remaining time runs. Needs the session doc to know which
 * list is speaking — see `speakerSlotPath`.
 */
export const setYield = (
  eventId: string, sessionId: string, session: LiveSession,
  yieldTo: YieldKind, yieldTargetCountry = "",
) => {
  const p = speakerSlotPath(session);
  return patch(eventId, sessionId, {
    [`${p}.yieldTo`]: yieldTo,
    [`${p}.yieldTargetCountry`]: yieldTargetCountry,
  });
};

// ── Speech credit ───────────────────────────────────────────────────────────────
/** One finished speech, captured inside the advancing transaction. */
type FinishedSpeech = { slot: SpeakerSlot; elapsedMs: number; kind: "gsl" | "caucus" } | null;

/**
 * Read the speech that is ENDING out of the pre-advance session state.
 * Elapsed comes from the timer the slot was running on, so it survives a chair who
 * paused, extended or never started the clock (remaining is clamped to the duration).
 */
function finishingSpeech(s: LiveSession, kind: "gsl" | "caucus"): FinishedSpeech {
  if (kind === "caucus") {
    const slot = s.caucus?.kind === "moderated" ? s.caucus.currentSpeaker : null;
    if (!slot?.delegateId) return null;
    const t = s.caucus?.speakerTimer;
    return { slot, elapsedMs: (t?.durationMs || 0) - timerRemainingMs(t), kind };
  }
  const slot = s.gsl?.activeSpeaker;
  if (!slot?.delegateId) return null;
  const t = s.gsl?.timer;
  return { slot, elapsedMs: (t?.durationMs || 0) - timerRemainingMs(t), kind };
}

/**
 * Credit ONE finished speech to whoever was holding the floor.
 *
 * WHY IT LIVES HERE AND NOT IN THE CONSOLE: credit used to be a wrapper in
 * ChairSessionConsole/GslPanel, so it existed only on the path where a chair tapped
 * "Next". Draining the speakers list, ending a caucus mid-speech, or any other caller of
 * `nextSpeaker` credited nobody, and the speech was simply lost to the metrics — while
 * still being the delegate's actual performance the marks are meant to reflect. Every
 * advance now routes through the transaction that captured it.
 *
 * Best-effort by the same reasoning as every other bump: an under-count by one only
 * softens an auto-fill suggestion; a throw here would strand the floor.
 */
async function creditFinishedSpeech(
  eventId: string, sessionId: string, s: LiveSession, fin: FinishedSpeech,
): Promise<void> {
  if (!fin) return;
  const seconds = Math.max(0, Math.round(fin.elapsedMs / 1000));
  const identity: ParticipationIdentity = {
    delegateId: fin.slot.delegateId, country: fin.slot.country, applicationId: fin.slot.applicationId,
    eventId: s.eventId, committeeId: s.committeeId, dateStr: s.dateStr,
  };
  try {
    await bumpParticipation(eventId, sessionId, identity, fin.kind === "caucus"
      ? { caucusSpeeches: 1, speakingSeconds: seconds }
      : { speeches: 1, speakingSeconds: seconds });
  } catch (e) {
    console.error("creditFinishedSpeech", e);
  }
}

/**
 * Advance the GSL: pop queue head → activeSpeaker, reset the speaker timer.
 * Transactional so two chairs / a double-click can't skip a speaker.
 * Credits the outgoing speaker — including the last one, when the list drains.
 */
export async function nextSpeaker(eventId: string, sessionId: string): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  let credit: { s: LiveSession; fin: FinishedSpeech } | null = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    credit = { s, fin: finishingSpeech(s, "gsl") };
    const queue = [...(s.gsl?.queue || [])];
    const next = queue.shift() || null;
    const durationMs = (s.gsl?.defaultSpeakerSecs ?? 90) * 1000;
    tx.update(ref, {
      "gsl.queue": queue,
      "gsl.activeSpeaker": next,
      "gsl.timer": newTimer(durationMs),
      // Only when a slot was actually consumed. The call that DRAINS the list (next === null) is
      // the chair retiring the last speaker, not a new speech — bumping there would report one
      // more speech than the room heard. See GslState.spoken.
      ...(next ? { "gsl.spoken": (s.gsl?.spoken ?? 0) + 1 } : {}),
      // Mirror the new speaker onto the video stage (empty when the list runs dry).
      "live.stage": next ? [next.delegateId] : [],
      "live.updatedAt": serverTimestamp(),
      phase: "gsl",
      updatedAt: serverTimestamp(),
    });
  });
  // After the commit, never inside it: the transaction body can re-run, and a bump
  // issued from a run that never commits would over-credit.
  const c = credit as { s: LiveSession; fin: FinishedSpeech } | null;
  if (c) await creditFinishedSpeech(eventId, sessionId, c.s, c.fin);
}

/** Retire the current GSL speaker without advancing. Credits their speech. */
export async function clearActiveSpeaker(eventId: string, sessionId: string): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  let credit: { s: LiveSession; fin: FinishedSpeech } | null = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    // The clear ALWAYS runs — it is also how a stale video stage gets cleared. Only the
    // credit is conditional on someone actually holding the floor.
    credit = { s, fin: finishingSpeech(s, "gsl") };
    tx.update(ref, {
      "gsl.activeSpeaker": null,
      "live.stage": [], "live.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  const c = credit as { s: LiveSession; fin: FinishedSpeech } | null;
  if (c) await creditFinishedSpeech(eventId, sessionId, c.s, c.fin);
}

// ── Video stage (Agora broadcaster floor) ───────────────────────────────────────
/**
 * Explicit chair override of the video stage (the uids allowed to broadcast on camera).
 * The GSL / caucus writers keep this in sync automatically; this is for manual control —
 * a point-of-order interrupt, a tech glitch, or forcing a mic off. Single-speaker model,
 * so callers pass the whole stage, never an append.
 */
export const setStage = (eventId: string, sessionId: string, uids: string[]) =>
  patch(eventId, sessionId, { "live.stage": uids, "live.updatedAt": serverTimestamp() });

/**
 * Bump the session's activity marker — resets the chair-console idle auto-shutdown timer.
 * `patch` also stamps `updatedAt`, which the idle guard reads as the last-activity time.
 */
export const keepAlive = (eventId: string, sessionId: string) =>
  patch(eventId, sessionId, { "live.keepAliveAt": Date.now() });

/**
 * Host "end call for everyone": every client honours `live.callEnded` exactly like a session close
 * (see useAgoraLive) and leaves the Agora channel without rejoining — but the SESSION stays open, so
 * the chair keeps marking/report and can `startLiveCall` to bring everyone back. Also clears the
 * stage so no one is left as a broadcaster (and stale uids can't mint a publisher token).
 */
export const endLiveCall = (eventId: string, sessionId: string) =>
  patch(eventId, sessionId, { "live.callEnded": true, "live.stage": [], "live.updatedAt": serverTimestamp() });

/** Restart the live video after `endLiveCall` — clients auto-rejoin (session is still open). */
export const startLiveCall = (eventId: string, sessionId: string) =>
  patch(eventId, sessionId, { "live.callEnded": false, "live.updatedAt": serverTimestamp() });

/**
 * Yield the floor to a specific delegate, ADDING the speaker's remaining time to theirs.
 *
 * The target becomes the active speaker (flagged `viaYield` so they can't yield again) and is
 * pulled out of the queue if they were on it. Their clock is their OWN allotment plus
 * `yieldedMs` — see `yieldGrantMs`. Callers pass only what was left on the outgoing speaker's
 * clock; the base is read from the session doc inside the transaction, so no caller can pass a
 * stale `defaultSpeakerSecs`. Transactional so a double-tap can't double-apply.
 *
 * `durationMs` MUST move with `endsAt`: `timerRemainingMs` clamps to `durationMs`, so leaving it
 * at the base would cap the display at the plain allotment and peg every progress bar at 100%
 * until the extra elapsed. Same pairing as `extendVoteTimer` / `extendCaucus`.
 */
export async function yieldFloorToDelegate(
  eventId: string, sessionId: string, target: SpeakerSlot, yieldedMs: number,
): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    const queue = (s.gsl?.queue || []).filter((q) => q.delegateId !== target.delegateId);
    const totalMs = yieldGrantMs(s.gsl?.defaultSpeakerSecs, yieldedMs);
    tx.update(ref, {
      "gsl.queue": queue,
      "gsl.activeSpeaker": { ...target, yieldTo: "none", yieldTargetCountry: "", viaYield: true },
      // Dotted paths, not a `gsl.timer` object literal — the literal dropped `updatedAt`, the skew
      // anchor every other deadline transition stamps. Firestore rejects an update where one field
      // path prefixes another, so these must stay siblings of `gsl.queue` / `gsl.activeSpeaker`.
      "gsl.timer.running": true,
      "gsl.timer.endsAt": Date.now() + totalMs,
      "gsl.timer.pausedRemainingMs": null,
      "gsl.timer.durationMs": totalMs,
      "gsl.timer.updatedAt": serverTimestamp(),
      // The yield recipient takes the floor → they get the mic.
      "live.stage": [target.delegateId],
      "live.updatedAt": serverTimestamp(),
      phase: "gsl",
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * The caucus twin of `yieldFloorToDelegate` — a moderated-caucus speaker hands their remaining
 * time to another delegation.
 *
 * WHY A SIBLING AND NOT A FLAG. It writes a different queue, a different speaker field, a different
 * timer, and it must keep `currentCountry` in step for the projector — the same three reasons
 * `nextCaucusSpeaker` is a sibling of `nextSpeaker` rather than a parameter on it.
 *
 * AND IT MUST NOT WRITE `phase`. `yieldFloorToDelegate` stamps `phase: "gsl"` because a GSL yield
 * IS the GSL resuming. Doing that here would end the caucus out from under the room mid-speech —
 * precisely the failure the old blanket "no yields during a caucus" guard was protecting against.
 *
 * Base allotment is `perSpeakerSecs`, not `defaultSpeakerSecs`: the recipient is speaking in the
 * caucus, under the caucus's own speech length.
 */
export async function yieldCaucusFloorToDelegate(
  eventId: string, sessionId: string, target: SpeakerSlot, yieldedMs: number,
): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    if (!s.caucus || s.caucus.kind !== "moderated") return;
    const queue = (s.caucus.queue || []).filter((q) => q.delegateId !== target.delegateId);
    const totalMs = yieldGrantMs(s.caucus.perSpeakerSecs, yieldedMs);
    tx.update(ref, {
      "caucus.queue": queue,
      "caucus.currentSpeaker": { ...target, yieldTo: "none", yieldTargetCountry: "", viaYield: true },
      "caucus.currentCountry": target.country || "",
      // Dotted paths for the same reason yieldFloorToDelegate uses them — a `speakerTimer` object
      // literal drops `updatedAt`, the skew anchor. Firestore rejects an update where one field
      // path prefixes another, so these stay siblings of `caucus.queue` / `caucus.currentSpeaker`.
      "caucus.speakerTimer.running": true,
      "caucus.speakerTimer.endsAt": Date.now() + totalMs,
      "caucus.speakerTimer.pausedRemainingMs": null,
      "caucus.speakerTimer.durationMs": totalMs,
      "caucus.speakerTimer.updatedAt": serverTimestamp(),
      // The Agora token server reads live.stage authoritatively — without this the recipient only
      // ever gets a subscriber token and physically cannot be heard.
      "live.stage": [target.delegateId],
      "live.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Hand the floor to `target` on whichever list is actually speaking, crediting the outgoing speaker
 * and logging the yield. THE one chair-initiated yield path.
 *
 * It exists because there were three copies of it — `ChairSessionConsole.handleYieldToDelegate`,
 * `ConsoleSpeakersPanel.passFloorToYieldTarget` and `GslPanel`'s — each re-typing "credit, log,
 * transfer" and each hard-coding `gsl.*`. Adding the caucus branch to three copies is how the next
 * drift starts, so there is now one.
 *
 * Credits `caucusSpeeches` in a caucus and `speeches` in the GSL, matching what `handleNextCaucus`
 * and `nextSpeaker` already do for an ordinary advance.
 */
export async function chairYieldFloorToDelegate(
  eventId: string, sessionId: string, session: LiveSession,
  target: SpeakerSlot, identity: ParticipationIdentity,
): Promise<{ ok: boolean; finishing?: SpeakerSlot }> {
  const finishing = floorHolder(session);
  if (!finishing) return { ok: false };
  const inCaucus = session.caucus?.kind === "moderated";
  const { timer } = floorSpeechClock(session);

  // Read the clock BEFORE the transfer resets it — the same elapsed formula every other speech
  // credit uses, and it stays correct when the outgoing speaker's own durationMs was itself
  // boosted by a yield.
  const remaining = timerRemainingMs(timer);
  const elapsedMs = (timer?.durationMs || 0) - remaining;
  await bumpParticipation(eventId, sessionId, identity, {
    ...(inCaucus ? { caucusSpeeches: 1 } : { speeches: 1 }),
    speakingSeconds: Math.max(0, Math.round(elapsedMs / 1000)),
  });
  await logMotion(eventId, sessionId, {
    kind: "yield",
    label: `${getCountryName(finishing.country) || finishing.country || "Delegate"} yielded to ${getCountryName(target.country) || target.country || "a delegation"}`,
    byDelegateId: finishing.delegateId,
    byCountry: finishing.country || "",
    targetCountry: target.country || "",
    targetDelegateId: target.delegateId,
  });
  await (inCaucus
    ? yieldCaucusFloorToDelegate(eventId, sessionId, target, remaining)
    : yieldFloorToDelegate(eventId, sessionId, target, remaining));
  return { ok: true, finishing };
}

/**
 * The chair accepts a delegate's `yield` request — the ONE path for it.
 *
 * TWO SURFACES CALL THIS and they must not drift: the Requests panel's queue row and the yield
 * card pinned above the chair's video. The first version of this logic lived inline in
 * `RequestsPanel` and had already drifted from the three chair-INITIATED yield paths, which all
 * credit the outgoing speaker and write the motion log — so an accepted delegate-initiated yield
 * silently vanished from the log and cost the speaker their speech credit. Both are done here.
 *
 * Departs from `resolveHand`'s "the caller performs the side-effect" note deliberately: the
 * side-effect is four ordered writes with three ways to be stale, which is exactly the kind of
 * thing that must not be re-typed per surface.
 *
 * Returns `ok: false` with a reason instead of throwing — every refusal is an ordinary race the
 * chair should see resolved, not an error. The request is resolved `dismissed` in each case.
 */
export async function acceptYieldRequest(
  eventId: string, sessionId: string, session: LiveSession, req: FloorRequest, chairUid: string,
): Promise<{ ok: boolean; reason?: "stale" | "via-yield" | "no-target"; finishing?: SpeakerSlot }> {
  // Whichever list is speaking — a moderated caucus runs its speeches on `caucus.currentSpeaker`.
  const active = floorHolder(session);

  // Only the delegate who still HOLDS the floor can hand it on. The speech may have ended — or a
  // caucus or vote may have started, or the caucus may have moved to the next speaker — while this
  // sat in the queue, so re-check rather than transferring a floor nobody owns.
  if (!active || !holdsTheFloor(session, req.delegateId)) {
    await resolveHand(eventId, sessionId, req, "dismissed", chairUid);
    return { ok: false, reason: "stale" };
  }
  // Belt to the rule's braces: a yield recipient may not yield again, because their clock is
  // base + carried and a chain would compound without bound. Covers requests created before the
  // `viaYield` rule was deployed.
  if (active.viaYield) {
    await resolveHand(eventId, sessionId, req, "dismissed", chairUid);
    return { ok: false, reason: "via-yield" };
  }
  if (!req.yieldTargetDelegateId) {
    await resolveHand(eventId, sessionId, req, "dismissed", chairUid);
    return { ok: false, reason: "no-target" };
  }

  const identity: ParticipationIdentity = {
    delegateId: req.delegateId,
    country: req.country,
    applicationId: req.applicationId,
    eventId,
    committeeId: session.committeeId,
    dateStr: session.dateStr,
  };
  const inCaucus = session.caucus?.kind === "moderated";
  const { timer } = floorSpeechClock(session);
  // Read the clock BEFORE the transfer resets it. Same elapsed formula the panels use, and it
  // stays correct when the outgoing speaker's own durationMs was itself boosted by a yield.
  const remaining = timerRemainingMs(timer);
  const elapsedMs = (timer?.durationMs || 0) - remaining;
  await bumpParticipation(eventId, sessionId, identity, {
    // A caucus speech is a caucus speech even when it ends in a yield — same counter
    // `handleNextCaucus` bumps on an ordinary advance.
    ...(inCaucus ? { caucusSpeeches: 1 } : { speeches: 1 }),
    speakingSeconds: Math.max(0, Math.round(elapsedMs / 1000)),
  });
  await logMotion(eventId, sessionId, {
    kind: "yield",
    label: `${req.country || "Delegate"} yielded to ${req.yieldTargetCountry || "a delegation"}`,
    byDelegateId: req.delegateId,
    byCountry: req.country || "",
    targetCountry: req.yieldTargetCountry || "",
    targetDelegateId: req.yieldTargetDelegateId,
  });
  const target: SpeakerSlot = {
    delegateId: req.yieldTargetDelegateId,
    country: req.yieldTargetCountry || "",
    applicationId: req.yieldTargetApplicationId || "",
  };
  // The LIVE clock, not `req.yieldRemainingMs` — the speech kept running while the chair decided,
  // and handing over the stale snapshot would gift the recipient seconds that already elapsed.
  //
  // The caucus branch is NOT cosmetic: `yieldFloorToDelegate` stamps `phase: "gsl"`, which would
  // end the caucus mid-speech. See `yieldCaucusFloorToDelegate`.
  await (inCaucus
    ? yieldCaucusFloorToDelegate(eventId, sessionId, target, remaining)
    : yieldFloorToDelegate(eventId, sessionId, target, remaining));
  await resolveHand(eventId, sessionId, req, "granted", chairUid);
  return { ok: true, finishing: active };
}

/** The chair declines a yield. Nothing transfers; the speaker keeps the floor and their clock. */
export const declineYieldRequest = (
  eventId: string, sessionId: string, req: FloorRequest, chairUid: string,
): Promise<void> => resolveHand(eventId, sessionId, req, "dismissed", chairUid);

// ── Caucuses ────────────────────────────────────────────────────────────────────
/** Fresh id per caucus run — see CaucusState.caucusId. Collision-proof enough for one room. */
const newCaucusId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Default signup response window — roughly the "placard moment" a room actually takes. */
export const SIGNUP_WINDOW_DEFAULT_SECS = 120;

/**
 * The two halves of opening a caucus signup window: the deadline the delegates and the rules both
 * read, and the gate that makes the join button appear without the chair opening anything by hand.
 *
 * ONE `Date.now()`, reused for both. Called twice it would put firestore.rules' `signupEndsAt + 2000`
 * grace and the delegate's own countdown on deadlines a few milliseconds apart — small, but it makes
 * "has the window expired" answer differently depending on which surface is asking, for no reason.
 */
function caucusSignupWrite(caucusId: string, windowSecs: number, chairUid: string): {
  signupEndsAt: number;
  gate: FloorGate;
} {
  const signupEndsAt = Date.now() + windowSecs * 1000;
  return {
    signupEndsAt,
    gate: {
      kind: "signup",
      signupFor: "caucus",
      signupId: signupIdFor(caucusId),
      endsAt: signupEndsAt,
      windowSecs,
      // Deliberately true, unlike the GateBar's default for a signup window. This gate runs for
      // ~2 minutes with NOBODY on the floor, and `capabilitiesFor` only force-opens points when
      // occupancy is "debate" — so leaving it false would mute points for the whole window, which
      // contradicts what `motionFloor` promises on every out-of-order message.
      allowsPoints: true,
      openedBy: chairUid,
      openedAt: serverTimestamp(),
    },
  };
}

/**
 * Open a moderated caucus AND the signup window for its speakers list, in one write.
 *
 * The gate is written here rather than by the caller so every path into a mod caucus gets it: the
 * passed motion (`executeMotion`) and the chair's own start form (`CaucusPanel`) alike. Before this,
 * a caucus started with the floor still gated on whatever preceded it, and the chair had to notice
 * and open "signup → caucus" by hand — which is why caucus speakers lists came up empty.
 *
 * TRANSACTIONAL, AND THE GATE IS CONDITIONAL. A session created before `floorGate` existed has no
 * gate, and `capabilitiesFor` branches on exactly that to keep those delegates on the old
 * `CaucusSignupBar`. Writing a gate onto one would flip its whole committee to a different delegate
 * UI mid-conference. `listState` rides in the same branch for the mirror-image reason: a legacy
 * caucus marked "collecting" would stop `useCaucusAutoAdd` and strand every signup, since the seat
 * modal that owns the collecting phase never renders on that path.
 */
export async function startModCaucus(
  eventId: string, sessionId: string, topic: string, totalSecs: number, perSpeakerSecs: number,
  signupWindowSecs: number = SIGNUP_WINDOW_DEFAULT_SECS,
  chairUid: string = "",
) {
  const caucusId = newCaucusId();
  const { signupEndsAt, gate } = caucusSignupWrite(caucusId, signupWindowSecs, chairUid);
  const caucus: CaucusState = {
    caucusId,
    kind: "moderated", topic, totalDurationSecs: totalSecs, perSpeakerSecs,
    signupWindowSecs,
    signupEndsAt,
    totalTimer: newTimer(totalSecs * 1000), speakerTimer: newTimer(perSpeakerSecs * 1000),
    currentSpeaker: null,
    queue: [],
  };
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const gateEra = !!(snap.data() as LiveSession).floorGate;
    tx.update(ref, {
      caucus: gateEra ? { ...caucus, listState: "collecting" satisfies CaucusListState } : caucus,
      phase: "mod_caucus" satisfies SessionPhase,
      ...(gateEra ? { floorGate: gate } : {}),
      // No caucus speaker recognized yet → clear the stage until the chair calls a country.
      //
      // Load-bearing for the gate, not just cosmetic: `floorOccupancy` treats a stale
      // `gsl.activeSpeaker` as "debate" occupancy ONLY when `live.stage[0]` corroborates it, and an
      // occupied floor overrides the authored gate. Leave the stage standing and the signup window
      // is overridden from the instant it opens — the join button would never render.
      "live.stage": [],
      "live.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Unmoderated caucus. NOTHING is credited to participation for its duration, and that is
 * correct rather than a gap: no speaker is ever seated, so there is no per-delegate record
 * of who spoke. If an unmod block should count toward marks, the chair scores it by hand
 * in the matrix — the platform has no signal to derive it from.
 */
export async function startUnmodCaucus(eventId: string, sessionId: string, totalSecs: number) {
  const caucus: CaucusState = {
    caucusId: newCaucusId(),
    kind: "unmoderated", topic: "", totalDurationSecs: totalSecs, perSpeakerSecs: 0,
    totalTimer: newTimer(totalSecs * 1000), speakerTimer: newTimer(0),
  };
  // Unmoderated = informal negotiation, no structured broadcaster → audience-only.
  await patch(eventId, sessionId, { caucus, phase: "unmod_caucus", "live.stage": [], "live.updatedAt": serverTimestamp() });
}

/**
 * Re-ask the room. Mints a new caucusId, so every delegate is prompted again and the previous
 * answers stop counting, and reopens the signup window at its original length.
 *
 * Deliberately NOT wired into extendCaucus — extending is the same debate, and auto-re-prompting on
 * every extension is noise.
 *
 * Does NOT clear `caucus.queue`. Re-asking a caucus that already has a speaking order is a real
 * case (the chair wants more names, not a blank list), and the seat dialog seeds itself from the
 * queue first, so those speakers keep their places and the new answers land behind them.
 */
export async function reaskCaucusSignups(
  eventId: string, sessionId: string, signupWindowSecs?: number, chairUid: string = "",
): Promise<void> {
  const windowSecs = signupWindowSecs ?? SIGNUP_WINDOW_DEFAULT_SECS;
  const caucusId = newCaucusId();
  const { signupEndsAt, gate } = caucusSignupWrite(caucusId, windowSecs, chairUid);
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    if (!s.caucus || s.caucus.kind !== "moderated") return;
    tx.update(ref, {
      "caucus.caucusId": caucusId,
      "caucus.signupEndsAt": signupEndsAt,
      "caucus.signupWindowSecs": windowSecs,
      // Legacy sessions stay on the old bar and the old auto-add — see startModCaucus.
      ...(s.floorGate
        ? { "caucus.listState": "collecting" satisfies CaucusListState, floorGate: gate }
        : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * The chair commits the collected speakers list — the digital equivalent of reading the placards
 * out in order. This is the ONE write that ends the collecting phase.
 *
 * `slots` is the chair's reviewed order, taken wholesale: unlike `enqueueSpeaker` this does not
 * append or dedup against what is already there, because the chair's order IS the answer and a
 * merge would fight the reordering they just did. It is filtered against the current floor-holder
 * defensively — `startModCaucus` sets `currentSpeaker: null`, so that only matters on a re-ask
 * mid-caucus.
 *
 * Seating does NOT start the first speech. The chair calls the first speaker from the live bar,
 * the same control they use for every subsequent one.
 *
 * `signups` is every pending answer for this caucus. Two-phase like `executeMotion`: the queue write
 * commits first, then the requests are resolved best-effort — granted for the delegations that made
 * the list, DISMISSED for the ones the chair removed. That second half is not bookkeeping: a removed
 * signup left `pending` is re-appended by `useCaucusAutoAdd` the instant `listState` flips to
 * "seated", undoing the chair's edit in front of them.
 */
export async function seatCaucusList(
  eventId: string, sessionId: string, caucusId: string,
  slots: SpeakerSlot[], chairUid: string, signups: FloorRequest[] = [],
): Promise<{ seated: boolean }> {
  const ref = sessionRef(eventId, sessionId);
  const ok = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const s = snap.data() as LiveSession;
    const c = s.caucus;
    if (!c || c.kind !== "moderated") return false;
    // A dialog left open across an endCaucus + a fresh startModCaucus would otherwise seat the old
    // committee's order into the new caucus. Same staleness discipline as nextCaucusSpeaker.
    if (c.caucusId !== caucusId) return false;
    // Idempotency across two chair tabs, mirroring suspendSession's early return. This write is a
    // whole-array overwrite, so without it the second tab's draft silently clobbers the first's.
    if (caucusListState(c) !== "collecting") return false;

    const holder = c.currentSpeaker?.delegateId;
    const queue = slots.filter((slot) => slot.delegateId !== holder);
    tx.update(ref, {
      "caucus.queue": queue,
      "caucus.listState": "seated" satisfies CaucusListState,
      // The successor gate. A queued moderated caucus is exactly what `adviseGate` recommends
      // "debate" for, so the GateBar's advice dot stays quiet instead of nagging the chair to
      // change something they just decided. Points ride with it either way.
      ...(s.floorGate
        ? {
            floorGate: {
              kind: queue.length ? "debate" : "locked",
              allowsPoints: true,
              endsAt: null,
              openedBy: chairUid,
              openedAt: serverTimestamp(),
            } satisfies FloorGate,
          }
        : {}),
      updatedAt: serverTimestamp(),
    });
    return true;
  });

  if (ok && signups.length) {
    const seated = new Set(slots.map((s) => s.delegateId));
    // Best-effort, like executeMotion's logging phase: the queue is already committed, and a
    // failed resolve must not read as a failed seat.
    try {
      await Promise.all(signups
        .filter((r) => r.status === "pending" && r.caucusId === caucusId)
        .map((r) => resolveHand(
          eventId, sessionId, r, seated.has(r.delegateId) ? "granted" : "dismissed", chairUid,
        )));
    } catch (e) {
      console.error("seatCaucusList:resolve", e);
    }
  }
  return { seated: ok };
}

/**
 * The chair commits the collected GSL speakers list — sorting signups and seeding gsl.queue.
 * Writes `slots` to `gsl.queue`, resolves pending `speak` requests, closes the signup gate,
 * and optionally starts the first speaker if autoStart is true and no one is currently speaking.
 */
export async function seatGslList(
  eventId: string, sessionId: string,
  slots: SpeakerSlot[], chairUid: string, signups: FloorRequest[] = [],
  autoStart: boolean = true,
): Promise<{ seated: boolean }> {
  const ref = sessionRef(eventId, sessionId);
  let startSlot: SpeakerSlot | null = null;

  const ok = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const s = snap.data() as LiveSession;

    const queue = [...slots];
    const active = s.gsl?.activeSpeaker || null;

    const cleanQueue = active ? queue.filter((q) => q.delegateId !== active.delegateId) : queue;

    let nextActive = active;
    let nextStage = s.live?.stage || [];
    let nextTimer = s.gsl?.timer || newTimer(90_000);
    let nextSpoken = s.gsl?.spoken ?? 0;

    if (autoStart && !active && cleanQueue.length > 0) {
      startSlot = cleanQueue.shift() || null;
      if (startSlot) {
        nextActive = startSlot;
        const durationMs = (s.gsl?.defaultSpeakerSecs ?? 90) * 1000;
        nextTimer = newTimer(durationMs);
        nextSpoken = nextSpoken + 1;
        nextStage = [startSlot.delegateId];
      }
    }

    const currentGate = s.floorGate;
    const nextGate = currentGate && currentGate.kind === "signup"
      ? {
          kind: (nextActive || cleanQueue.length > 0) ? ("debate" as const) : ("locked" as const),
          allowsPoints: true,
          endsAt: null,
          openedBy: chairUid,
          openedAt: serverTimestamp(),
        }
      : currentGate;

    tx.update(ref, {
      "gsl.queue": cleanQueue,
      "gsl.activeSpeaker": nextActive,
      "gsl.timer": nextTimer,
      "gsl.spoken": nextSpoken,
      "live.stage": nextStage,
      "live.updatedAt": serverTimestamp(),
      phase: "gsl",
      ...(nextGate ? { floorGate: nextGate } : {}),
      updatedAt: serverTimestamp(),
    });

    return true;
  });

  if (ok && signups.length) {
    const seatedIds = new Set([
      ...slots.map((s) => s.delegateId),
      ...(startSlot ? [(startSlot as SpeakerSlot).delegateId] : []),
    ]);
    try {
      await Promise.all(
        signups
          .filter((r) => r.status === "pending" && r.kind === "speak")
          .map((r) => resolveHand(eventId, sessionId, r, seatedIds.has(r.delegateId) ? "granted" : "dismissed", chairUid))
      );
    } catch (e) {
      console.error("seatGslList:resolve", e);
    }
  }

  return { seated: ok };
}

/** Chair reorder / remove on the caucus speakers list. Whole-array write, like setGslQueue. */
export const setCaucusQueue = (eventId: string, sessionId: string, queue: SpeakerSlot[]) =>
  patch(eventId, sessionId, { "caucus.queue": queue });

/**
 * Advance the moderated caucus: pop queue head → currentSpeaker, reset the SPEAKER timer.
 * Sibling of nextSpeaker rather than a flag on it — it leaves `phase` alone, resets a
 * different timer, and must keep `currentCountry` in step for the projector.
 * Transactional so two chairs / a double-click can't skip a speaker.
 */
export async function nextCaucusSpeaker(eventId: string, sessionId: string): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  let credit: { s: LiveSession; fin: FinishedSpeech } | null = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    if (!s.caucus || s.caucus.kind !== "moderated") return;
    credit = { s, fin: finishingSpeech(s, "caucus") };
    const queue = [...(s.caucus.queue || [])];
    const next = queue.shift() || null;
    tx.update(ref, {
      "caucus.queue": queue,
      "caucus.currentSpeaker": next,
      // Mirror onto currentCountry — the projector hero and setCaucusCountry both read it.
      "caucus.currentCountry": next?.country || "",
      "caucus.speakerTimer": newTimer((s.caucus.perSpeakerSecs || 0) * 1000),
      // The Agora token server reads live.stage AUTHORITATIVELY: without this the new
      // speaker only ever gets a subscriber token and physically cannot be heard.
      "live.stage": next ? [next.delegateId] : [],
      "live.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  const c = credit as { s: LiveSession; fin: FinishedSpeech } | null;
  if (c) await creditFinishedSpeech(eventId, sessionId, c.s, c.fin);
}

/**
 * Recognize a country to speak in a moderated caucus. Transactional so the video stage
 * is resolved atomically: caucus stores a country NAME, but the stage is uid-keyed, so we
 * look the delegate up in attendance and put THEM on the mic.
 */
export async function setCaucusCountry(eventId: string, sessionId: string, country: string): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    const match = Object.values(s.attendance || {}).find((a) => a.country === country);
    tx.update(ref, {
      "caucus.currentCountry": country,
      // Keep currentSpeaker in step, or a hand-pick would leave the two fields disagreeing
      // and the NEXT advance would credit caucusSpeeches to the wrong delegate.
      "caucus.currentSpeaker": match
        ? { delegateId: match.delegateId, country: match.country, applicationId: match.applicationId }
        : null,
      "live.stage": match ? [match.delegateId] : [],
      "live.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * End the caucus. Transactional (it used to be a bare patch) for one reason: whoever holds
 * the caucus floor when the chair ends it has just given a speech, and a patch had no way
 * to see them. That speech was previously lost to the metrics entirely.
 *
 * An unmoderated caucus credits nobody — no speaker is ever seated, so there is no
 * per-delegate record to credit. That is a property of unmod, not an omission.
 */
export async function endCaucus(eventId: string, sessionId: string): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  let credit: { s: LiveSession; fin: FinishedSpeech } | null = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    // Like clearActiveSpeaker: the end always writes (a re-tap must still return the phase
    // and the stage to a clean state), only the credit depends on a seated speaker.
    credit = { s, fin: finishingSpeech(s, "caucus") };
    tx.update(ref, {
      caucus: null, phase: "gsl",
      "live.stage": [], "live.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  const c = credit as { s: LiveSession; fin: FinishedSpeech } | null;
  if (c) await creditFinishedSpeech(eventId, sessionId, c.s, c.fin);
}

// ── Motion floor (the chair's invitation) ───────────────────────────────────────
// Reminder: this only ASKS. Whether a motion is admissible is derived on the fly by
// `motionsInOrder` in lib/services/motionFloor.ts — a session with no invite still accepts motions.

/** Mirrors SIGNUP_WINDOW_DEFAULT_SECS — roughly the moment a room actually takes to move. */
export const MOTION_INVITE_DEFAULT_SECS = 120;

const newInviteId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Open — or re-ask — the floor to motions. There is deliberately no separate `reaskMotions`:
 * unlike `reaskCaucusSignups` (which must preserve the surrounding caucus object and bump two
 * dotted fields), `motionInvite` is self-contained, so re-asking IS opening. The fresh `inviteId`
 * is what makes a re-ask a distinguishable snapshot event rather than an ambiguous endsAt bump.
 */
export const openMotionFloor = (
  eventId: string, sessionId: string, chairUid: string,
  windowSecs: number = MOTION_INVITE_DEFAULT_SECS, note = "",
) => patch(eventId, sessionId, {
  motionInvite: {
    inviteId: newInviteId(),
    endsAt: Date.now() + windowSecs * 1000,
    windowSecs, openedBy: chairUid, openedAt: serverTimestamp(), note,
  } satisfies MotionInvite,
});

/** Withdraw the invitation. Writes null, NOT deleteField() — absent and null must read alike. */
export const closeMotionFloor = (eventId: string, sessionId: string) =>
  patch(eventId, sessionId, { motionInvite: null });

// ── Voting ──────────────────────────────────────────────────────────────────────
export interface OpenVoteConfig {
  motion: string;
  motionId?: string;             // back-ref to a queued Motion (motion-first vote → execute)
  voteType: VoteType;
  threshold: VoteThreshold;
  scMode: boolean;
  p5: string[];                  // delegateIds
  mode: "tally" | "roll_call";
  round?: 1 | 2;
  divisionOfQuestion?: boolean;
  minAffirmative?: number;
  /** Countdown length. Defaults to VOTE_DEFAULT_SECS; 0 = no time limit. */
  durationSecs?: number;
}

/** Default vote countdown. The chair can override per vote (incl. 0 = no limit). */
export const VOTE_DEFAULT_SECS = 120;

/** Count delegates eligible to vote (present or present-and-voting). */
export function eligibleVoterCount(attendance: Record<string, AttendanceEntry>): number {
  return Object.values(attendance || {}).filter(
    (a) => a.status === "present" || a.status === "present_and_voting"
  ).length;
}

/**
 * Open a vote. Transactional so eligibleCount is snapshotted atomically from the
 * current attendance and two opens can't race.
 */
export async function openVote(
  eventId: string, sessionId: string, cfg: OpenVoteConfig, startedBy: string,
): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    if (s.activeVote) throw new Error("A vote is already open.");
    // Seeded RUNNING: a vote's clock starts the moment the floor is called, so the chair
    // never has to hit Start. durMs === 0 means the chair chose "No limit" → no timer field.
    const durMs = Math.max(0, (cfg.durationSecs ?? VOTE_DEFAULT_SECS) * 1000);
    const vote: ActiveVote = {
      voteId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v_${Date.now()}`,
      motion: cfg.motion,
      ...(cfg.motionId ? { motionId: cfg.motionId } : {}),
      voteType: cfg.voteType,
      threshold: cfg.threshold,
      minAffirmative: cfg.minAffirmative,
      scMode: cfg.scMode,
      p5: cfg.p5 || [],
      allowAbstain: true,
      ...(durMs > 0 ? {
        timer: {
          running: true, endsAt: Date.now() + durMs,
          pausedRemainingMs: null, durationMs: durMs, updatedAt: serverTimestamp(),
        } as TimerState,
      } : {}),
      round: cfg.round ?? 1,
      divisionOfQuestion: cfg.divisionOfQuestion ?? false,
      mode: cfg.mode,
      tally: cfg.mode === "tally" ? { yes: 0, no: 0, abstain: 0 } : undefined,
      ballots: cfg.mode === "roll_call" ? {} : undefined,
      eligibleCount: eligibleVoterCount(s.attendance),
      startedBy,
      startedAt: serverTimestamp(),
    };
    // Clear the floor mic while the committee votes (chairs stay live by role). Opening a new
    // vote also takes the previous result off the projector — that's the "next vote" clear path.
    tx.update(ref, {
      activeVote: vote, phase: "voting",
      publishedResult: null, pendingPublish: null,
      "live.stage": [], "live.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export const castBallot = (eventId: string, sessionId: string, delegateId: string, ballot: Ballot) =>
  patch(eventId, sessionId, { [`activeVote.ballots.${delegateId}`]: ballot });

/**
 * Vice-chair casts on behalf of a delegation. Writes the ballot plus a sibling
 * `ballotProxies` entry so the record shows WHO proxied it — the ballot value itself stays
 * a plain string. Chair-tier write (passes rules via canWriteMarking), so unlike a delegate's
 * own ballot it is not blocked by the one-ballot-per-delegate guard.
 */
export const castBallotAsProxy = (
  eventId: string, sessionId: string, delegateId: string, ballot: Ballot,
  proxy: { by: string; byName?: string },
) =>
  patch(eventId, sessionId, {
    [`activeVote.ballots.${delegateId}`]: ballot,
    [`activeVote.ballotProxies.${delegateId}`]: { by: proxy.by, byName: proxy.byName || "" },
  });

export const bumpTally = (eventId: string, sessionId: string, key: Ballot, delta: number) =>
  patch(eventId, sessionId, { [`activeVote.tally.${key}`]: increment(delta) });

/** Pure tally/ballot reducer. */
function countBallots(v: ActiveVote): { yes: number; no: number; abstain: number } {
  if (v.mode === "tally") return { yes: v.tally?.yes || 0, no: v.tally?.no || 0, abstain: v.tally?.abstain || 0 };
  const out = { yes: 0, no: 0, abstain: 0 };
  for (const b of Object.values(v.ballots || {})) out[b] += 1;
  return out;
}

/**
 * How many ballots are in, WITHOUT revealing which way they went. The only number a delegate
 * or the projector sees while a vote runs — live For/Against counts bias whoever votes last.
 */
export function castCount(v: ActiveVote): number {
  const c = countBallots(v);
  return c.yes + c.no + c.abstain;
}

/** Compute a vote outcome. Abstentions excluded from the pass ratio. */
export function computeVoteResult(v: ActiveVote): {
  result: VoteResult; affirmative: number; negative: number; abstentions: number; vetoedBy: string[];
} {
  const { yes: aff, no: neg, abstain: abst } = countBallots(v);
  const base = aff + neg;
  // SC veto only meaningful on substantive roll-call votes (need per-delegate ballots).
  const vetoedBy = (v.scMode && v.voteType === "substantive" && v.mode === "roll_call")
    ? (v.p5 || []).filter((uid) => v.ballots?.[uid] === "no")
    : [];
  if (vetoedBy.length) return { result: "vetoed", affirmative: aff, negative: neg, abstentions: abst, vetoedBy };
  let pass: boolean;
  // Consensus = nobody OBJECTS. Abstaining is not objecting, so abstentions don't break it
  // (they're already excluded from `base`). Only a negative vote does.
  if (v.threshold === "consensus") pass = neg === 0 && aff > 0;
  else if (v.threshold === "two_thirds") pass = aff >= (v.minAffirmative ?? Math.ceil((2 / 3) * base));
  else pass = aff > neg && aff >= (v.minAffirmative ?? Math.floor(base / 2) + 1);
  const result: VoteResult = pass ? "passed" : aff === neg && base > 0 ? "tied" : "failed";
  return { result, affirmative: aff, negative: neg, abstentions: abst, vetoedBy: [] };
}

/**
 * Close the active vote: freeze the result into the votes subcollection, append a
 * motion-log entry, and clear activeVote.
 *
 * TRANSACTIONAL and guarded on `expectedVoteId` because a vote can now close from three
 * places at once — the chair's button, a co-chair's button, and every chair-tier client's
 * expiry timer. Of N concurrent calls exactly one commits; the rest re-read a null
 * activeVote and return null, so participation is never double-counted and a motion is
 * never resolved twice. The votes/ and motions/ doc ids are DETERMINISTIC for the same
 * reason — a retry overwrites its own row instead of appending a duplicate.
 *
 * The result is computed from the SERVER-read vote, not the caller's snapshot, so a ballot
 * that lands between render and tap still counts.
 *
 * Returns null when the vote was already closed by someone else.
 */
export async function closeVoteAtomic(
  eventId: string, sessionId: string, expectedVoteId: string,
): Promise<FinishedVote | null> {
  const ref = sessionRef(eventId, sessionId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const s = snap.data() as LiveSession;
    const vote = s.activeVote;
    if (!vote || vote.voteId !== expectedVoteId) return null;   // already closed — stand down

    const res = computeVoteResult(vote);
    const finished: FinishedVote = {
      ...vote,
      result: res.result,
      affirmative: res.affirmative,
      negative: res.negative,
      abstentions: res.abstentions,
      vetoedBy: res.vetoedBy,
      closedAt: serverTimestamp(),
    };
    tx.set(doc(votesCol(eventId, sessionId), vote.voteId), finished);
    tx.set(doc(motionsCol(eventId, sessionId), `vote_${vote.voteId}`), {
      kind: "motion",
      label: `Vote — ${vote.motion}: ${res.result.toUpperCase()} (${res.affirmative}-${res.negative}-${res.abstentions})`,
      byDelegateId: vote.startedBy,
      byCountry: "",
      outcome: res.result === "passed" ? "passed" : "failed",
      at: serverTimestamp(),
    } as MotionLogEntry);

    // Stage the result for the chair to reveal. Written HERE, in the same transaction that
    // nulls activeVote, so the "publish me" signal survives an auto-close fired by a
    // backgrounded co-chair tab — no client holds it in React state.
    const countryOf = (uid: string) => s.attendance?.[uid]?.country || "";
    const pending: PublishedVoteResult = {
      voteId: vote.voteId,
      motion: vote.motion,
      result: res.result,
      affirmative: res.affirmative,
      negative: res.negative,
      abstentions: res.abstentions,
      vetoedBy: res.vetoedBy,
      vetoedByCountries: res.vetoedBy.map(countryOf).filter(Boolean),
      eligibleCount: vote.eligibleCount,
      voteType: vote.voteType,
      threshold: vote.threshold,
      scMode: vote.scMode,
      mode: vote.mode,
      closedAt: serverTimestamp(),
    };
    tx.update(ref, {
      activeVote: null, phase: "gsl", pendingPublish: pending, updatedAt: serverTimestamp(),
    });
    return finished;
  });
}

/**
 * Reveal the closed vote's result on the projector and in every delegate console. Until this
 * runs, only the chair knows the numbers — that's the whole point of withholding them.
 */
export async function publishVoteResult(
  eventId: string, sessionId: string, chairUid: string,
): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  const snap = await getDoc(ref);
  const p = (snap.data() as LiveSession | undefined)?.pendingPublish;
  if (!p) return;
  await updateDoc(ref, {
    publishedResult: { ...p, publishedAt: serverTimestamp(), publishedBy: chairUid },
    pendingPublish: null,
    updatedAt: serverTimestamp(),
  });
  // Stamp the permanent record too. Best-effort: a failure here must not un-reveal the result.
  try {
    await updateDoc(doc(votesCol(eventId, sessionId), p.voteId), {
      published: true, publishedAt: serverTimestamp(), publishedBy: chairUid,
    });
  } catch (e) { console.error("publishVoteResult: votes doc", e); }
}

/** Take the published result off the screens. The votes/ record stays `published` — it WAS shown. */
export const clearPublishedResult = (eventId: string, sessionId: string) =>
  patch(eventId, sessionId, { publishedResult: null });

/** Chair closes a vote and chooses never to show the room. */
export const discardPendingPublish = (eventId: string, sessionId: string) =>
  patch(eventId, sessionId, { pendingPublish: null });

/**
 * Put a committee document (draft resolution / working paper) on the projector. Ref +
 * display metadata only — see PublishedDocRef. Chair-tier write (session update rule).
 */
export async function publishDocToProjector(
  eventId: string, sessionId: string,
  ref: Omit<PublishedDocRef, "publishedAt" | "publishedBy">, chairUid: string,
): Promise<void> {
  await patch(eventId, sessionId, {
    publishedDoc: { ...ref, publishedAt: serverTimestamp(), publishedBy: chairUid },
  });
}

/** Take the document off the projector. */
export const unpublishDoc = (eventId: string, sessionId: string) =>
  patch(eventId, sessionId, { publishedDoc: null });

/**
 * Chair grants a delegate's "change my vote" request: DELETE their ballot key so the
 * one-ballot-per-delegate guard in firestore.rules (`!(uid in activeVote.ballots)`) passes
 * again and the delegate can cast once more FROM THEIR OWN CONSOLE. Deleting is deliberate —
 * a "reopened" flag would have needed a whole new rules clause, whereas removing the key
 * satisfies the existing rule unchanged.
 *
 * Transactional because it must read to do two things: guard on voteId (a request against a
 * vote that has since closed is a no-op) and capture the discarded ballot. That ballot is
 * appended to `activeVote.ballotChanges`, which rides into the FinishedVote doc via the
 * `...vote` spread in closeVoteAtomic — so the record shows both the final ballot and the one
 * it replaced. `ballotProxies` is cleared alongside, or a fresh SELF-cast would still be
 * labelled a vice-chair proxy.
 *
 * Returns false when there was nothing to reopen (stale vote, or the delegate never cast).
 */
export async function reopenBallot(
  eventId: string, sessionId: string, delegateId: string, expectedVoteId: string,
  chairUid: string, requestId?: string,
): Promise<boolean> {
  const ref = sessionRef(eventId, sessionId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const v = (snap.data() as LiveSession).activeVote;
    if (!v || v.voteId !== expectedVoteId || v.mode !== "roll_call") return false;
    const prev = v.ballots?.[delegateId];
    if (!prev) return false;                       // nothing cast — nothing to reopen
    const entry: BallotChange = {
      delegateId, from: prev, at: Date.now(), by: chairUid,
      ...(v.ballotProxies?.[delegateId] ? { wasProxy: true } : {}),
      ...(requestId ? { requestId } : {}),
    };
    tx.update(ref, {
      [`activeVote.ballots.${delegateId}`]: deleteField(),
      [`activeVote.ballotProxies.${delegateId}`]: deleteField(),
      "activeVote.ballotChanges": [...(v.ballotChanges || []), entry],
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}

/**
 * THE single close path — closeVoteAtomic + participation credit + motion reconciliation.
 * Every caller (chair console, VotingPanel, the expiry auto-close) goes through here; three
 * hand-rolled copies of this sequence is exactly how VotingPanel ended up silently skipping
 * resolveMotionAfterVote and stranding motions at status "voting".
 *
 * Returns null if another client closed the vote first (all follow-ups are then skipped).
 */
export async function finalizeVote(
  eventId: string, sessionId: string, voteId: string,
  identityFor: (delegateId: string) => ParticipationIdentity,
): Promise<FinishedVote | null> {
  const finished = await closeVoteAtomic(eventId, sessionId, voteId);
  if (!finished) return null;
  // Who to credit depends on the mode. A roll-call vote names every voter in `ballots`. A
  // show-of-hands tally records only aggregate numbers — it used to credit NOBODY, which
  // silently zeroed `votesCast` for every committee that votes by hand, and with it any
  // rubric column auto-filling from it. The room that was present IS the room that voted,
  // so a tally credits the delegates the roll call put in the chamber.
  //
  // GUARDED, and this is not defensive padding. `identityFor` is supplied by the caller and one bad
  // lookup — or an offline blip on any single delegate — used to throw straight out of this loop and
  // skip the reconciliation below, leaving the motion stranded at "voting" with no buttons in the
  // chair's panel. That is the same unrecoverable state `cancelVote` produced, reached by a second
  // door. Participation credit is worth retrying; it is not worth the motion.
  let voters: string[] = [];
  if (finished.mode === "roll_call") {
    voters = Object.keys(finished.ballots || {});
  } else {
    try {
      const snap = await getDoc(sessionRef(eventId, sessionId));
      const att = snap.exists() ? (snap.data() as LiveSession).attendance || {} : {};
      voters = Object.values(att)
        .filter((a) => a?.delegateId && (a.status === "present" || a.status === "present_and_voting"))
        .map((a) => a.delegateId);
    } catch (e) {
      console.error("finalizeVote:tallyVoters", e);
    }
  }
  for (const id of voters) {
    try {
      await bumpParticipation(eventId, sessionId, identityFor(id), { votesCast: 1 });
    } catch (e) {
      console.error("finalizeVote:participation", id, e);
    }
  }
  if (finished.motionId) {
    await resolveMotionAfterVote(eventId, sessionId, finished, finished.result, finished.startedBy);
  }
  return finished;
}

/**
 * Extend (or trim, with a negative value) the running vote clock. Mirrors `extendCaucus`:
 * transactional so it reads live timer state, and bumps `durationMs` alongside the deadline
 * so the progress bar stays within 100%.
 */
export async function extendVoteTimer(eventId: string, sessionId: string, extraMs: number): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    const t = s.activeVote?.timer;
    if (!t) return;
    const update: Record<string, any> = {
      "activeVote.timer.durationMs": Math.max(0, (t.durationMs || 0) + extraMs),
      "activeVote.timer.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (t.running && t.endsAt != null) {
      update["activeVote.timer.endsAt"] = Math.max(Date.now(), t.endsAt + extraMs);
    } else {
      update["activeVote.timer.pausedRemainingMs"] = Math.max(0, (t.pausedRemainingMs || 0) + extraMs);
    }
    tx.update(ref, update);
  });
}

/**
 * Abandon an open vote without recording a result — and give its motion back to the chair.
 *
 * Two bugs lived in the one-line version this replaces:
 *
 *  1. IT STRANDED THE MOTION. A blind `patch` nulled `activeVote` and never touched the motion the
 *     vote was deciding, so it sat at status "voting" forever. `MotionQueuePanel` renders that
 *     status with NO buttons at all — only "In vote — waiting on the result" — so the motion was
 *     unrecoverable from the UI. It now returns to "recognized", NOT "pending": the chair already
 *     recognized it before putting it to a vote, and "pending" would re-offer [Recognize] and make
 *     them redo a step they finished. "recognized" restores the exact action set they had.
 *
 *  2. IT COULD DESTROY A DIFFERENT VOTE. With no guard, a Cancel tap that landed after another
 *     chair opened a NEW vote would blow that one away. The transaction below matches
 *     `closeVoteAtomic`/`reopenBallot` and no-ops unless the vote on the doc is still the one the
 *     caller was looking at.
 *
 * Takes the vote from the CALLER rather than reading it back: `Motion.voteId` is declared but never
 * written by anything, so there is no motion→vote link to follow, and `ActiveVoteCard` already holds
 * the vote in scope. Zero extra reads, which matters on the Spark tier.
 */
export async function cancelVote(
  eventId: string, sessionId: string, vote?: ActiveVote | null, chairUid = "",
): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  const committed = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const live = (snap.data() as LiveSession).activeVote;
    // No vote given (legacy call) → keep the old unconditional behaviour.
    if (vote && live?.voteId !== vote.voteId) return false;
    tx.update(ref, {
      activeVote: null, phase: "gsl", pendingPublish: null, updatedAt: serverTimestamp(),
    });
    return true;
  });
  if (!committed || !vote?.motionId) return;

  // Guarded on "voting": if finalizeVote resolved it first, its passed/failed ruling is the real
  // outcome and must not be overwritten by a cancellation that lost the race.
  const mRef = doc(motionQueueCol(eventId, sessionId), vote.motionId);
  const mSnap = await getDoc(mRef);
  if (!mSnap.exists() || (mSnap.data() as Motion).status !== "voting") return;
  await updateDoc(mRef, {
    status: "recognized" as MotionStatus,
    chairNote: "The vote was cancelled — the motion is back on the floor.",
    ...(chairUid ? { resolvedBy: chairUid } : {}),
  });
}

// ── Points & motions ─────────────────────────────────────────────────────────────
export async function logMotion(
  eventId: string, sessionId: string, entry: Omit<MotionLogEntry, "id" | "at">,
  identity?: ParticipationIdentity,
) {
  await setDoc(doc(motionsCol(eventId, sessionId)), { ...entry, at: serverTimestamp() });
  if (identity?.delegateId) {
    // Mirror onto the in-doc tally for live decision-assist + onto participation.
    await patch(eventId, sessionId, {
      [`pointsMotions.byDelegate.${identity.delegateId}.${entry.kind === "point" ? "points" : "motions"}`]: increment(1),
    });
    await bumpParticipation(eventId, sessionId, identity, { [entry.kind === "point" ? "points" : "motions"]: 1 });
  }
}

/**
 * Optional proxy attribution — passed by a vice-chair with "delegate power" who raises an
 * artifact ON BEHALF of a delegation. `by` is the vice-chair's uid, `byName` their display
 * name. When present it is stamped onto the doc so the chair's queue can label it a proxy.
 */
export type ProxyAttribution = { by: string; byName: string };

/** Spread proxy fields into a doc payload only when a proxy is given (never writes undefined). */
function proxyFields(proxy?: ProxyAttribution): { proxyBy: string; proxyByName: string } | Record<string, never> {
  return proxy?.by ? { proxyBy: proxy.by, proxyByName: proxy.byName || "" } : {};
}

// ── Live points (delegate-raised, chair-resolved) ───────────────────────────────
/**
 * Delegate raises a point. Creates a `pending` doc — chair resolves it later.
 *
 * Credits `pointsRaised` immediately, which is NOT the same counter as `points`:
 *   pointsRaised — every point the delegate put to the chair (this call)
 *   points       — the ones the chair actually recognized (see resolvePoint)
 * They were one counter before, which meant a point the chair never got round to ruling
 * on vanished from participation while still appearing in the session report — the two
 * surfaces disagreed with no way to tell which was right. Two counters, two questions.
 */
export async function raisePoint(
  eventId: string, sessionId: string, identity: ParticipationIdentity,
  type: PointType, note = "", targetCountry = "", proxy?: ProxyAttribution,
): Promise<void> {
  await addDoc(pointsCol(eventId, sessionId), {
    delegateId: identity.delegateId,
    country: identity.country,
    applicationId: identity.applicationId,
    type,
    note: note || "",
    targetCountry: targetCountry || "",
    status: "pending" as PointStatus,
    ...proxyFields(proxy),
    createdAt: serverTimestamp(),
  });
  try {
    await bumpParticipation(eventId, sessionId, identity, { pointsRaised: 1 });
  } catch (e) {
    console.error("raisePoint:participation", e);
  }
}

/** Delegate withdraws their own still-pending point. */
export async function cancelPoint(eventId: string, sessionId: string, pointId: string): Promise<void> {
  await deleteDoc(doc(pointsCol(eventId, sessionId), pointId));
}

/**
 * Chair resolves a point. On "recognized", credit the raiser's participation `points`
 * (decision: recognized points feed marks) and mirror onto the in-doc tally.
 */
export async function resolvePoint(
  eventId: string, sessionId: string, point: RaisedPoint,
  status: Exclude<PointStatus, "pending">, chairUid: string,
  identity?: ParticipationIdentity, chairNote = "",
): Promise<void> {
  if (!point.id) return;
  await updateDoc(doc(pointsCol(eventId, sessionId), point.id), {
    status, chairNote: chairNote || "", resolvedAt: serverTimestamp(), resolvedBy: chairUid,
  });
  if (status === "recognized") {
    await patch(eventId, sessionId, {
      [`pointsMotions.byDelegate.${point.delegateId}.points`]: increment(1),
    });
    if (identity?.delegateId) await bumpParticipation(eventId, sessionId, identity, { points: 1 });
    await setDoc(doc(motionsCol(eventId, sessionId)), {
      kind: "point",
      pointType: point.type,
      label: `${POINT_META[point.type].label}${point.country ? ` — ${point.country}` : ""}`,
      byDelegateId: point.delegateId,
      byCountry: point.country || "",
      targetCountry: point.targetCountry || "",
      outcome: "ruled",
      at: serverTimestamp(),
    } as MotionLogEntry);
  }
}

// ── Floor requests (delegate raises a hand; chair grants) ───────────────────────
/** Delegate raises a hand for recognition. Creates a `pending` doc — chair resolves it. */
export async function raiseHand(
  eventId: string, sessionId: string, identity: ParticipationIdentity,
  kind: FloorRequestKind, note = "", proxy?: ProxyAttribution,
): Promise<void> {
  await addDoc(requestsCol(eventId, sessionId), {
    delegateId: identity.delegateId,
    country: identity.country,
    applicationId: identity.applicationId,
    kind,
    note: note || "",
    status: "pending" as FloorRequestStatus,
    ...proxyFields(proxy),
    createdAt: serverTimestamp(),
  });
}

/**
 * Delegate asks the chair to reopen their ballot so they can vote again. Rides on the same
 * `requests` collection as raise-hand — identical doc shape, and the delegate console already
 * subscribes to it, so approval arrives with no extra listener mid-vote.
 *
 * A dedicated wrapper rather than a 5th positional arg on `raiseHand`, whose signature has
 * three existing call sites. `voteId` binds the request to THIS vote — firestore.rules rejects
 * a create naming any other, and the chair panel refuses to grant a stale one.
 */
export async function requestVoteChange(
  eventId: string, sessionId: string, identity: ParticipationIdentity,
  voteId: string, note = "", proxy?: ProxyAttribution,
): Promise<void> {
  await addDoc(requestsCol(eventId, sessionId), {
    delegateId: identity.delegateId,
    country: identity.country,
    applicationId: identity.applicationId,
    kind: "vote_change" as FloorRequestKind,
    voteId,
    note: note || "",
    status: "pending" as FloorRequestStatus,
    ...proxyFields(proxy),
    createdAt: serverTimestamp(),
  });
}

/**
 * Delegate answers the moderated-caucus speakers prompt — the digital placard raise.
 * Rides the same `requests` collection as raise-hand for the same reason `requestVoteChange`
 * does: both consoles already subscribe to it, so this needs no new listener on either side,
 * and `createdAt` is a real serverTimestamp — the speaking order can't be forged by a client
 * with a skewed or doctored clock.
 *
 * A "no" is recorded too. It is never granted; it exists so the delegate stops being asked.
 * `caucusId` binds the answer to THIS caucus, so the next one asks again.
 */
export async function answerCaucusSignup(
  eventId: string, sessionId: string, identity: ParticipationIdentity,
  caucusId: string, answer: "yes" | "no", proxy?: ProxyAttribution,
  /** Present on gate-era sessions — `signupIdFor(caucusId)`, so the delegate's own console can tell
   *  "I answered THIS round" from an answer to the round before it. */
  signupId?: string,
): Promise<void> {
  await addDoc(requestsCol(eventId, sessionId), {
    delegateId: identity.delegateId,
    country: identity.country,
    applicationId: identity.applicationId,
    kind: "caucus_signup" as FloorRequestKind,
    caucusId,
    ...(signupId ? { signupId } : {}),
    answer,
    note: "",
    status: "pending" as FloorRequestStatus,
    ...proxyFields(proxy),
    createdAt: serverTimestamp(),
  });
}

/**
 * Delegate adds themselves to whichever speakers list the chair has opened signup for.
 *
 * ONE GESTURE, TWO DOCUMENT SHAPES. The delegate taps the same button either way, but which list
 * they joined has to be legible to the chair's side, and the two lists have entirely separate
 * consumers:
 *
 *   gsl    → `{kind:"speak", signupId}`, granted from the Requests panel into `gsl.queue`.
 *   caucus → `{kind:"caucus_signup", caucusId, signupId, answer:"yes"}` — the shape the caucus
 *            speakers list, `useCaucusAutoAdd` and the seat dialog already read.
 *
 * Writing a `speak` doc for a caucus signup is what broke this before: the only consumer of a
 * pending `speak` appends to the GSL, so caucus signups silently joined the General Speakers List
 * and `caucus.queue` stayed empty. The branch lives here rather than in the card because the
 * vice-chair's proxy path needs the identical decision.
 *
 * Deliberately not a `speak` doc carrying a `caucusId` either: `RequestsPanel` and `flowModel`'s
 * `attention` count both filter `caucus_signup` out on purpose, so a whole committee's answers
 * would otherwise pile into the chair's pending badge.
 */
export async function joinSignup(
  eventId: string, sessionId: string, identity: ParticipationIdentity,
  gate: Pick<FloorGate, "signupId" | "signupFor"> | null | undefined,
  /** The live moderated caucus, when there is one. Required for the caucus shape. */
  caucusId?: string,
  proxy?: ProxyAttribution,
): Promise<void> {
  const signupId = gate?.signupId || "";
  if (gate?.signupFor === "caucus" && caucusId) {
    return answerCaucusSignup(eventId, sessionId, identity, caucusId, "yes", proxy, signupId);
  }
  await addDoc(requestsCol(eventId, sessionId), {
    delegateId: identity.delegateId,
    country: identity.country,
    applicationId: identity.applicationId,
    kind: "speak" as FloorRequestKind,
    signupId,
    note: "",
    status: "pending" as FloorRequestStatus,
    ...proxyFields(proxy),
    createdAt: serverTimestamp(),
  });
}

/**
 * The delegate holding the floor yields their remaining time to another delegation.
 *
 * A TRANSFER OF TIME NEEDS CONSENT, so unlike the other three yields this one does not take effect
 * on its own — it lands as a pending `yield` request the chair accepts or declines, and only the
 * chair's acceptance calls `yieldFloorToDelegate`. Rides the `requests` collection like every other
 * ask, so the chair's Requests panel and the delegate's own status echo need no new listener.
 *
 * `remainingMs` is a SNAPSHOT for the chair's display only. The actual transfer re-reads the live
 * clock at acceptance, because the speech keeps running while the chair decides.
 */
export async function requestYield(
  eventId: string, sessionId: string, identity: ParticipationIdentity,
  target: { country: string; delegateId: string; applicationId: string },
  remainingMs: number,
  proxy?: ProxyAttribution,
): Promise<void> {
  await addDoc(requestsCol(eventId, sessionId), {
    delegateId: identity.delegateId,
    country: identity.country,
    applicationId: identity.applicationId,
    kind: "yield" as FloorRequestKind,
    yieldTargetCountry: target.country,
    yieldTargetDelegateId: target.delegateId,
    yieldTargetApplicationId: target.applicationId || "",
    yieldRemainingMs: Math.max(0, Math.round(remainingMs)),
    note: "",
    status: "pending" as FloorRequestStatus,
    ...proxyFields(proxy),
    createdAt: serverTimestamp(),
  });
}

/**
 * The delegate holding the floor yields to questions, to comments, or back to the chair.
 *
 * These three change how the REST OF THEIR OWN SPEECH is run; they hand nobody else the floor, so
 * there is nothing for the chair to consent to and they apply immediately. Yielding to another
 * delegation is the one that transfers time — see `requestYield`.
 *
 * Writes exactly two field paths under their OWN speaker slot — `gsl.activeSpeaker` in the GSL,
 * `caucus.currentSpeaker` in a moderated caucus — which is what lets the rule verify the caller IS
 * the speaker and permit nothing else. Both branches exist in firestore.rules; passing the wrong
 * one fails with "Missing or insufficient permissions" in the BROWSER console only.
 */
export async function declareOwnYield(
  eventId: string, sessionId: string, session: LiveSession,
  yieldTo: Exclude<YieldKind, "delegate">,
  /**
   * Set when a vice-chair declares the yield ON BEHALF of the delegation holding the floor. The
   * delegate branch of the rule matches on `hasOnly` of the two field paths below, so a proxy write
   * carrying the stamp fails it — and passes instead on `canWriteSessionDoc`, which is unclamped.
   */
  proxy?: ProxyAttribution,
): Promise<void> {
  const p = speakerSlotPath(session);
  await patch(eventId, sessionId, {
    [`${p}.yieldTo`]: yieldTo,
    [`${p}.yieldTargetCountry`]: "",
    ...(proxy?.by ? {
      [`${p}.yieldProxyBy`]: proxy.by,
      [`${p}.yieldProxyByName`]: proxy.byName || "",
    } : {}),
  });
}

/**
 * Delegate declares their OWN attendance during roll call — the one thing a delegate may write to
 * the session document besides their ballot.
 *
 * Deliberately narrow: a single field path, so the matching rule can use the same
 * `affectedKeys().hasOnly` discipline as the ballot carve-out and nothing else on the doc can ride
 * along. The chair keeps `setAttendance` for overrides.
 *
 * REQUIRES the roll-call branch in firestore.rules to be deployed (`npm run deploy:rules`).
 * Without it this fails with "Missing or insufficient permissions" in the BROWSER console only.
 */
export async function declareOwnAttendance(
  eventId: string, sessionId: string, identity: ParticipationIdentity,
  status: Extract<AttendanceStatus, "present" | "present_and_voting">,
): Promise<void> {
  await patch(eventId, sessionId, {
    [`attendance.${identity.delegateId}`]: {
      status,
      country: identity.country,
      delegateId: identity.delegateId,
      applicationId: identity.applicationId,
    },
  });
}

/** Delegate withdraws their own still-pending floor request (or vote-change request). */
export async function cancelHand(eventId: string, sessionId: string, reqId: string): Promise<void> {
  await deleteDoc(doc(requestsCol(eventId, sessionId), reqId));
}

/**
 * Chair marks a floor request granted/dismissed. The grant side-effect (give the floor
 * via `setStage`, or add to the queue via `enqueueSpeaker`) is performed by the caller
 * so it can stay atomic / read the live queue.
 */
export async function resolveHand(
  eventId: string, sessionId: string, req: FloorRequest,
  status: Exclude<FloorRequestStatus, "pending">, chairUid: string,
): Promise<void> {
  if (!req.id) return;
  try {
    await updateDoc(doc(requestsCol(eventId, sessionId), req.id), {
      status, resolvedAt: serverTimestamp(), resolvedBy: chairUid,
    });
  } catch (e) {
    // The delegate withdrew the request between the chair seeing it and acting on it, so the
    // doc is already gone — nothing left to resolve (the grant side-effect already ran). Any
    // other error is real and rethrows.
    if ((e as { code?: string })?.code !== "not-found") throw e;
  }
}

/**
 * Append speaker(s) to the end of a speakers list (transactional; dedups by delegateId
 * against both the queue and whoever currently holds the floor).
 *
 * `list` picks the target: the GSL, or the moderated caucus's own list. Accepts an array so
 * the chair's "Add all" is ONE transaction — N separate ones would each retry against the
 * others and the later ones could lose.
 */
export async function enqueueSpeaker(
  eventId: string, sessionId: string, slots: SpeakerSlot | SpeakerSlot[],
  // Required on purpose: defaulting to "gsl" would let a future caller silently append caucus
  // speakers to the General Speakers List — the exact wrong-list bug this feature already hit
  // once, in RequestsPanel's catch-all grant branch.
  list: "gsl" | "caucus",
): Promise<void> {
  const incoming = Array.isArray(slots) ? slots : [slots];
  if (!incoming.length) return;
  const ref = sessionRef(eventId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    if (list === "caucus" && (!s.caucus || s.caucus.kind !== "moderated")) return;

    const queue = [...(list === "caucus" ? s.caucus?.queue || [] : s.gsl?.queue || [])];
    const holder = list === "caucus"
      ? s.caucus?.currentSpeaker?.delegateId
      : s.gsl?.activeSpeaker?.delegateId;

    for (const slot of incoming) {
      const dup = queue.some((q) => q.delegateId === slot.delegateId) || holder === slot.delegateId;
      if (!dup) queue.push(slot);
    }
    tx.update(ref, {
      [list === "caucus" ? "caucus.queue" : "gsl.queue"]: queue,
      updatedAt: serverTimestamp(),
    });
  });
}

// ── Motions (delegate-proposed, chair-driven pipeline) ─────────────────────────────
/** Live queue of proposed motions (chair view), newest first. */
export function subscribeMotionQueue(
  eventId: string, sessionId: string, cb: (m: Motion[]) => void
): Unsubscribe {
  const q = query(motionQueueCol(eventId, sessionId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Motion)));
  }, (err) => { console.error("subscribeMotionQueue", err); cb([]); });
}

/** One delegate's own motions (their console view). Filtered server-side by delegateId. */
export function subscribeMyMotions(
  eventId: string, sessionId: string, delegateId: string, cb: (m: Motion[]) => void
): Unsubscribe {
  const q = query(motionQueueCol(eventId, sessionId), where("byDelegateId", "==", delegateId));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Motion));
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    cb(rows);
  }, (err) => { console.error("subscribeMyMotions", err); cb([]); });
}

/** Speakers a moderated caucus affords = floor(total / perSpeaker). */
function modSpeakers(p: MotionParams): number {
  return p.perSpeakerSecs ? Math.floor((p.totalDurationSecs || 0) / p.perSpeakerSecs) : 0;
}

/**
 * Pure comparator for the pending motion queue — most-disruptive first, matching MUN
 * precedence: by `rank`, then longest-duration-wins within the caucus families (unmod &
 * extend by duration; mod by duration then # speakers), else first-proposed-first.
 */
export function compareMotionPrecedence(a: Motion, b: Motion): number {
  const ra = MOTION_META[a.type].rank, rb = MOTION_META[b.type].rank;
  if (ra !== rb) return ra - rb;
  if (a.type === "unmod_caucus" || a.type === "extend_caucus")
    return (b.params.totalDurationSecs || 0) - (a.params.totalDurationSecs || 0)
        || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  if (a.type === "mod_caucus")
    return (b.params.totalDurationSecs || 0) - (a.params.totalDurationSecs || 0)
        || modSpeakers(b.params) - modSpeakers(a.params)
        || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
}

/**
 * Human summary of a motion's params, e.g. "10 min · 45s/speaker · Topic X".
 *
 * Takes only `params` so the propose confirmation can summarize a motion it has just built and not
 * yet read back — there is no doc id or status to hand it at that point.
 */
export function motionSummary(m: Pick<Motion, "params">): string {
  const p = m.params || {};
  const parts: string[] = [];
  if (p.totalDurationSecs) parts.push(`${Math.round(p.totalDurationSecs / 60)} min`);
  if (p.perSpeakerSecs) parts.push(`${p.perSpeakerSecs}s/speaker`);
  if (p.topic) parts.push(p.topic);
  return parts.join(" · ");
}

const motionLabel = (m: Motion): string => {
  const sum = motionSummary(m);
  return `${MOTION_META[m.type].label}${sum ? ` — ${sum}` : ""}`;
};

/**
 * Thrown by `proposeMotion` when the delegation already has this motion alive on the floor.
 *
 * A named class, not a string match: `ProposeMotionForm` prints `message` verbatim (it is the
 * shared sentence from `duplicateMotionNote`) and must not print it for an ordinary network
 * failure, which deserves the generic retry copy instead.
 */
export class DuplicateMotionError extends Error {
  readonly existing: Motion;
  constructor(existing: Motion) {
    super(duplicateMotionNote(existing));
    this.name = "DuplicateMotionError";
    this.existing = existing;
  }
}

/**
 * Delegate proposes a motion. Creates a `pending` doc — the chair drives it from there.
 *
 * ONE LIVE MOTION OF A TYPE PER DELEGATION. The read below is the backstop for the UI block in
 * `ProposeMotionForm`: not a transaction, because Firestore client transactions cannot run a query,
 * and not a rule, because rules cannot either. It closes the real case (a delegate tapping the same
 * button again seconds later, having been given no confirmation) rather than a sub-millisecond
 * race, and the surviving race — two writes genuinely in flight at once — still leaves the chair
 * exactly the dismiss button they have today. See `myLiveMotion` in motionFloor.ts for the rule.
 */
export async function proposeMotion(
  eventId: string, sessionId: string, identity: ParticipationIdentity,
  type: MotionType, params: MotionParams, note = "", proxy?: ProxyAttribution,
): Promise<void> {
  const mineSnap = await getDocs(query(
    motionQueueCol(eventId, sessionId),
    where("byDelegateId", "==", identity.delegateId),
  ));
  const mine = mineSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Motion));
  const dup = myLiveMotion(mine, type);
  if (dup) throw new DuplicateMotionError(dup);

  await addDoc(motionQueueCol(eventId, sessionId), {
    type,
    params: params || {},
    byDelegateId: identity.delegateId,
    byCountry: identity.country,
    applicationId: identity.applicationId,
    status: "pending" as MotionStatus,
    note: note || "",
    ...proxyFields(proxy),
    createdAt: serverTimestamp(),
  });
  // Credit the ACT of moving, here, at the one point every motion passes through.
  // `motions` only ever counted motions that reached execution, so a motion that was
  // dismissed, or passed and never executed, or lost its vote, credited its mover with
  // nothing — even though moving is the participation being measured.
  try {
    await bumpParticipation(eventId, sessionId, identity, { motionsProposed: 1 });
  } catch (e) {
    console.error("proposeMotion:participation", e);
  }
}

/** Delegate withdraws their own still-pending motion. */
export async function cancelMotion(eventId: string, sessionId: string, motionId: string): Promise<void> {
  await deleteDoc(doc(motionQueueCol(eventId, sessionId), motionId));
}

/** Chair acknowledges a motion (optional step before putting it to a vote / adopting). */
export async function recognizeMotion(
  eventId: string, sessionId: string, motion: Motion, chairUid: string,
): Promise<void> {
  if (!motion.id) return;
  await updateDoc(doc(motionQueueCol(eventId, sessionId), motion.id), {
    status: "recognized" as MotionStatus, recognizedAt: serverTimestamp(), resolvedBy: chairUid,
  });
}

/**
 * Chair dismisses a motion without executing it, optionally saying why — the delegate reads
 * `chairNote` back on their own motions list, so a dismissal is no longer a silent vanishing.
 *
 * AUDITABLE, unlike the old drop: it appends a MotionLogEntry, matching what
 * `resolveMotionAfterVote` already does for a motion that loses its vote. Deliberately takes no
 * identity — a dismissed motion must not credit participation (same call as the failure branch).
 *
 * The stored status stays "dropped". A new "dismissed" MotionStatus would strand every motion
 * already stored as dropped and break the ["executed","failed","dropped"] resolved filters;
 * only the LABEL changed.
 */
export async function dismissMotion(
  eventId: string, sessionId: string, motion: Motion, chairUid: string, chairNote = "",
): Promise<void> {
  if (!motion.id) return;
  await updateDoc(doc(motionQueueCol(eventId, sessionId), motion.id), {
    status: "dropped" as MotionStatus, chairNote: chairNote || "",
    // Explicitly false, not absent: this dismissal WAS a chair's ruling, and the consoles print
    // "Chair:" in front of the note on that basis. An auto-fall sets it true — see Motion.autoResolved.
    autoResolved: false,
    resolvedAt: serverTimestamp(), resolvedBy: chairUid,
  });
  // Best-effort, like executeMotion's: the status write above already landed, so letting a failed
  // history append reject out of here would only paint a dead button on an action that succeeded.
  try {
    await logMotion(eventId, sessionId, {
      kind: "motion",
      label: `${MOTION_META[motion.type].label} — DISMISSED${chairNote ? ` (${chairNote})` : ""}`,
      byDelegateId: motion.byDelegateId,
      byCountry: motion.byCountry || "",
      outcome: "failed",
    });
  } catch (e) {
    console.error("dismissMotion:log", e);
  }
}

/**
 * Chair puts a motion to a procedural vote — bridges into the existing `openVote`.
 * Procedural = simple majority (move-to-voting takes 2/3). Opens the vote
 * FIRST (it throws if one is already open), so the motion only flips to "voting" once
 * the vote actually exists. The vote carries `motionId` so `resolveMotionAfterVote`
 * can reconcile it on close.
 */
export async function putMotionToVote(
  eventId: string, sessionId: string, motion: Motion, chairUid: string,
): Promise<void> {
  if (!motion.id) return;
  await openVote(eventId, sessionId, {
    motion: motionLabel(motion),
    motionId: motion.id,
    voteType: "procedural",
    threshold: motion.type === "move_to_voting" ? "two_thirds" : "simple_majority",
    scMode: false,
    p5: [],
    // Delegates self-vote from their panel; procedural motions use roll_call too.
    mode: "roll_call",
  }, chairUid);
  await updateDoc(doc(motionQueueCol(eventId, sessionId), motion.id), {
    status: "voting" as MotionStatus, resolvedBy: chairUid,
  });
}

/**
 * Extend the running caucus by `extraSecs` — bumps total duration + total timer (running
 * or paused). Transactional (mirrors `setCaucusCountry`) so it reads live timer state.
 */
export async function extendCaucus(eventId: string, sessionId: string, extraSecs: number): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  const add = Math.max(0, extraSecs) * 1000;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    if (!s.caucus) return;
    const t = s.caucus.totalTimer;
    const update: Record<string, any> = {
      "caucus.totalDurationSecs": (s.caucus.totalDurationSecs || 0) + Math.max(0, extraSecs),
      "caucus.totalTimer.durationMs": (t?.durationMs || 0) + add,
      "caucus.totalTimer.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (t?.running && t.endsAt != null) update["caucus.totalTimer.endsAt"] = t.endsAt + add;
    else update["caucus.totalTimer.pausedRemainingMs"] = (t?.pausedRemainingMs || 0) + add;
    tx.update(ref, update);
  });
}

/**
 * Execute an adopted motion — THE CORE of the motion-first pipeline. Switches on the
 * motion type and calls the SAME transition fn the direct chair panels use, then appends
 * a MotionLogEntry (which also credits the proposer's participation `motions` counter,
 * feeding marking autofill) and flips the motion to "executed".
 *
 * THREE PHASES, IN THIS ORDER, AND THE ORDER IS THE WHOLE POINT:
 *
 *  1. THE EFFECT (the switch). Its throws still propagate, deliberately. `openVote` throws
 *     "A vote is already open." and that is reachable from the `move_to_voting` branch — the vote
 *     did not open, the committee is not in voting procedure, and marking the motion executed there
 *     would write a lie into the record AND take it off the floor with nothing done. Worse than
 *     failing loudly. The caller surfaces the message on the row.
 *
 *  2. ONE BATCH: this motion → "executed", plus every motion the execution just made pointless.
 *     Committed IMMEDIATELY after the effect and BEFORE any bookkeeping, because the status flip
 *     used to sit behind `logMotion`'s three writes — one of which reaches a separate participation
 *     subcollection — and ANY of them throwing left the caucus started, the agenda mounted, and the
 *     motion still sitting on the chair's floor. Silently: the UI swallowed it into console.error.
 *     Batching the supersession here (rather than reacting to it later) also makes the fall a
 *     property OF the execution, so it is atomic with it and no other client can interleave.
 *
 *  3. BOOKKEEPING, best-effort. History + participation credit are worth having and not worth the
 *     motion's status. A lost bump only makes `autoFillSuggestion` under-count by one in a panel the
 *     chair overrides by hand anyway.
 *
 * `queue` is the caller's already-subscribed motion list — passed in rather than re-queried, since
 * both call sites hold it in memory and a query per execute would buy nothing. Optional so existing
 * callers keep compiling; with no queue nothing is superseded and behaviour is exactly as before.
 */
export async function executeMotion(
  eventId: string, sessionId: string, motion: Motion, chairUid: string,
  identity?: ParticipationIdentity, queue: Motion[] = [],
): Promise<void> {
  if (!motion.id) return;
  const p = motion.params || {};
  switch (motion.type) {
    case "mod_caucus":
      // chairUid is what opens the signup window along with the caucus: `startModCaucus` stamps it
      // on the floor gate, so the room is asked who wants to speak the moment the motion carries,
      // with no separate gate action from the chair.
      await startModCaucus(
        eventId, sessionId, p.topic || "", p.totalDurationSecs || 600, p.perSpeakerSecs || 45,
        SIGNUP_WINDOW_DEFAULT_SECS, chairUid,
      );
      break;
    case "unmod_caucus":
      await startUnmodCaucus(eventId, sessionId, p.totalDurationSecs || 600);
      break;
    case "extend_caucus":
      await extendCaucus(eventId, sessionId, p.totalDurationSecs || 300);
      break;
    case "open_gsl": {
      await setPhase(eventId, sessionId, "gsl");
      if (p.perSpeakerSecs) await setGslDefaultSecs(eventId, sessionId, p.perSpeakerSecs);
      const ref = sessionRef(eventId, sessionId);
      const snap = await getDoc(ref);
      if (snap.exists() && (snap.data() as LiveSession).floorGate) {
        const windowSecs = 60;
        await openGate(eventId, sessionId, chairUid, {
          kind: "signup",
          signupFor: "gsl",
          signupId: `sg_${Date.now().toString(36)}`,
          allowsPoints: true,
          endsAt: gateEndsAt(windowSecs),
          windowSecs,
        });
      }
      break;
    }
    case "set_agenda":
      // Agenda BEFORE phase: the reverse order leaves a frame where the phase is already "gsl"
      // but activeIndex is still -1, which reads to the Flow Bar as "nobody set the agenda".
      if (p.topic) await adoptAgendaTopic(eventId, sessionId, p.topic);
      await setPhase(eventId, sessionId, "gsl");
      break;
    case "move_to_voting":
      await openVote(eventId, sessionId, {
        motion: p.topic || "Draft resolution",
        voteType: "substantive",
        threshold: "two_thirds",
        scMode: false, p5: [], mode: "roll_call",
      }, chairUid);
      break;
    case "adjourn":
      await setPhase(eventId, sessionId, "closed");
      break;
    case "suspend":
      // suspendSession, not setPhase — a passed "suspend the meeting" motion must stop the clock.
      await suspendSession(eventId, sessionId);
      break;
    case "introduce_document":
      // No phase change. Formally introduced — flip the referenced committeeDoc to
      // "approved" (idempotent; chair-tier rules allow). Publishing to the projector
      // stays a separate explicit chair action in the Documents panel.
      if (p.documentId) {
        await updateCommitteeDoc(eventId, p.documentId, { status: "approved", reviewedBy: chairUid });
      }
      break;
    case "custom":
      if (p.targetPhase) await setPhase(eventId, sessionId, p.targetPhase);
      break;
  }
  // ── Phase 2: the status, and everything this execution just answered for the room ──
  const batch = writeBatch(db);
  batch.update(doc(motionQueueCol(eventId, sessionId), motion.id), {
    status: "executed" as MotionStatus, resolvedAt: serverTimestamp(), resolvedBy: chairUid,
  });
  for (const { motion: dead, ruling } of supersededByExecution(motion, queue)) {
    batch.update(doc(motionQueueCol(eventId, sessionId), dead.id!), {
      status: "dropped" as MotionStatus,
      autoResolved: true,
      chairNote: ruling.reason,
      resolvedAt: serverTimestamp(),
      resolvedBy: chairUid,
    });
  }
  await batch.commit();

  // ── Phase 3: bookkeeping ──
  try {
    await logMotion(eventId, sessionId, {
      kind: "motion",
      label: motionLabel(motion),
      byDelegateId: motion.byDelegateId,
      byCountry: motion.byCountry || "",
      outcome: "passed",
    }, identity);
  } catch (e) {
    console.error("executeMotion:log", e);
  }
}

/**
 * After a vote closes, reconcile the motion it decided (if any). Does NOT auto-execute —
 * the chair taps [Execute] on the passed motion (manual gate). `passed` → status "passed";
 * anything else → "failed" + a failure history entry. No-op if the vote carries no motionId.
 */
export async function resolveMotionAfterVote(
  eventId: string, sessionId: string, vote: ActiveVote, result: VoteResult, chairUid: string,
): Promise<void> {
  if (!vote.motionId) return;
  const ref = doc(motionQueueCol(eventId, sessionId), vote.motionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const motion = { id: snap.id, ...snap.data() } as Motion;
  if (result === "passed") {
    await updateDoc(ref, { status: "passed" as MotionStatus, resolvedAt: serverTimestamp(), resolvedBy: chairUid });
  } else {
    await updateDoc(ref, { status: "failed" as MotionStatus, resolvedAt: serverTimestamp(), resolvedBy: chairUid });
    // Best-effort — the status write above is the one that matters. See executeMotion phase 3.
    try {
      await logMotion(eventId, sessionId, {
        kind: "motion",
        label: `${MOTION_META[motion.type].label} — ${result.toUpperCase()}`,
        byDelegateId: motion.byDelegateId,
        byCountry: motion.byCountry || "",
        outcome: "failed",
      });
    } catch (e) {
      console.error("resolveMotionAfterVote:log", e);
    }
  }
}

// ── Finalize → marks ──────────────────────────────────────────────────────────────
export interface FinalizeRow {
  delegateId: string;
  applicationId: string;
  scores: Record<string, number>;  // template id -> score (already merged by caller)
  feedback?: string;
  attendanceStatus?: AttendanceStatus; // from the session's attendance map
}

/**
 * Finalize the day: ensure a marking doc exists for each delegate (so attendance is
 * captured even with no scores) and persist any chair-accepted auto-fill scores —
 * all through the existing markings shape (`committeeId_delegateId_dateStr`). Never
 * touches scores the caller didn't include. Marks the session finalized.
 *
 * `attendanceStatus` and `markMode` really are written here — the docstring used to
 * promise attendance and not deliver it, which is exactly what let an unscored day look
 * identical to an absence in the final score.
 */
export async function finalizeSession(
  eventId: string, committeeId: string, dateStr: string, gradedBy: string, rows: FinalizeRow[],
  markMode?: MarkingMode,
): Promise<{ success: boolean; error?: any }> {
  try {
    const sessionId = makeSessionId(committeeId, dateStr);
    const batch = writeBatch(db);
    for (const r of rows) {
      const markingId = `${committeeId}_${r.delegateId}_${dateStr}`;
      batch.set(doc(db, "markings", markingId), {
        eventId, committeeId, delegateId: r.delegateId, applicationId: r.applicationId,
        dateStr, scores: r.scores || {}, feedback: r.feedback || "", gradedBy,
        // Only stamped when the caller actually knows the event's scale — a wrong
        // markMode would make every stored value on this doc read on the wrong scale.
        ...(markMode ? { markMode } : {}),
        ...(r.attendanceStatus ? { attendanceStatus: r.attendanceStatus, attendanceSource: "rollcall" } : {}),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    batch.update(sessionRef(eventId, sessionId), { finalized: true, finalizedAt: serverTimestamp() });
    await batch.commit();
    void unregisterLiveSession(eventId, sessionId);
    return { success: true };
  } catch (error) {
    console.error("finalizeSession", error);
    return { success: false, error };
  }
}

/**
 * Un-finalize a session so the same day can keep running — the inverse of `finalizeSession`.
 *
 * WHY THIS EXISTS: `finalized` outranks the phase in EVERY read path (floorGate, motionFloor,
 * flowModel, useAgoraLive, sessionClock), so a chair who gavels early is otherwise stuck — the
 * "Reopen" next to Close only lifts `phase === "closed"`, which a finalized session ignores. There
 * is also no "start" left to press: `ensureSession` returns the existing doc, so the day's session
 * can never be recreated.
 *
 * The marking docs finalize wrote are LEFT ALONE — they are the day's real record, the chair goes
 * on editing them in place, and finalizing again merges over the same `committeeId_delegateId_dateStr`
 * ids. Only the session's own "this day is over" state is lifted.
 *
 * Transactional because three things must move together:
 *   1. `finalized`/`finalizedAt` clear (the flag every reader outranks the phase with).
 *   2. The sitting clock banks the finalized stretch into `accumulatedMs`, exactly as
 *      `resumeSession` banks a suspension — otherwise the gavel-to-gavel total silently
 *      swallows the gap between finalize and reopen.
 *   3. `live.callEnded` clears, so clients auto-rejoin the video instead of sitting on
 *      "Session ended" (useAgoraLive derives `ended` from finalized OR callEnded).
 */
export async function reopenSession(
  eventId: string, sessionId: string, phase: SessionPhase = "gsl",
): Promise<void> {
  const ref = sessionRef(eventId, sessionId);
  let meta: { committeeId: string; dateStr: string; createdBy: string } | null = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const s = snap.data() as LiveSession;
    const clock = readClock(s);
    const now = Date.now();
    // Where the clock actually stopped. Same precedence sessionClock.ts reads it back with:
    // finalizedAt, else the suspension it was frozen on top of, else nothing to bank.
    const fin = s.finalizedAt as { toMillis?: () => number; seconds?: number } | null | undefined;
    const finalizedAtMs = fin?.toMillis?.() ?? (fin?.seconds || 0) * 1000;
    const stoppedAt = s.finalized ? (finalizedAtMs || clock.suspendedAt) : clock.suspendedAt;
    const gapMs = stoppedAt ? Math.max(0, now - stoppedAt) : 0;
    tx.update(ref, {
      finalized: false,
      finalizedAt: null,
      phase,
      clock: {
        startedAt: clock.startedAt,
        accumulatedMs: clock.accumulatedMs + gapMs,
        suspendedAt: null,
      } satisfies SessionClock,
      "live.callEnded": false,
      "live.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    meta = { committeeId: s.committeeId, dateStr: s.dateStr, createdBy: s.createdBy };
  });
  // Back into the admin monitor's registry — finalize dropped it. Fire-and-forget, like every
  // other call site: a missed write degrades the monitor, never the session.
  const m = meta as { committeeId: string; dateStr: string; createdBy: string } | null;
  if (m) void registerLiveSession(eventId, sessionId, m.committeeId, m.dateStr, m.createdBy);
}

/**
 * Resolve a marking template's auto-fill suggestion from a participation summary.
 * Returns min(metric, cap ?? maxScore), or null when the template has no auto-fill.
 */
export function autoFillSuggestion(
  template: MarkingTemplate, p: ParticipationSummary | undefined,
): number | null {
  if (!template.autoFillFrom || !p) return null;
  const metric =
    // "speeches" stays GSL-only — it is what every existing rubric column configured
    // before caucus speeches had a writer, and silently widening it would move live scores.
    template.autoFillFrom === "speeches" ? p.speeches
    : template.autoFillFrom === "caucusSpeeches" ? (p.caucusSpeeches || 0)
    : template.autoFillFrom === "allSpeeches" ? (p.speeches || 0) + (p.caucusSpeeches || 0)
    : template.autoFillFrom === "speakingMinutes" ? Math.round((p.speakingSeconds || 0) / 60)
    : template.autoFillFrom === "points" ? p.points
    : template.autoFillFrom === "pointsRaised" ? (p.pointsRaised ?? p.points)
    : template.autoFillFrom === "motions" ? p.motions
    : template.autoFillFrom === "motionsProposed" ? (p.motionsProposed ?? p.motions)
    : template.autoFillFrom === "votesCast" ? p.votesCast
    : 0;
  const cap = template.autoFillCap ?? template.maxScore;
  return Math.max(0, Math.min(cap, metric));
}

// ── Session report ──────────────────────────────────────────────────────────────
export interface YieldGiven { targetCountry: string; targetDelegateId?: string }

export interface DelegateReportRow {
  delegateId: string;
  country: string;
  attendanceStatus?: AttendanceStatus;
  speeches: number;
  speakingSeconds: number;
  caucusSpeeches: number;
  motions: number;
  motionsProposed: number;
  votesCast: number;
  pointsByType: Record<PointType, number>;
  pointsTotal: number;
  yieldsGiven: YieldGiven[];
}

export interface CommitteeReport {
  eventId: string;
  committeeId: string;
  dateStr: string;
  present: number;
  quorum: number;
  totalSpeeches: number;
  totalSpeakingSeconds: number;
  rows: DelegateReportRow[];
  votes: FinishedVote[];
  motions: MotionLogEntry[];
}

const emptyPointCounts = (): Record<PointType, number> =>
  ({ order: 0, personal_privilege: 0, information: 0, parliamentary_inquiry: 0 });

/** Count a delegate's points-by-type from a list of raised points (recognized + pending). */
export function summarizePoints(points: RaisedPoint[], delegateId?: string): Record<PointType, number> {
  const out = emptyPointCounts();
  for (const p of points) {
    if (delegateId && p.delegateId !== delegateId) continue;
    if (p.status === "dismissed") continue;       // dismissed points don't count
    out[p.type] = (out[p.type] || 0) + 1;
  }
  return out;
}

/** Yields a delegate gave, parsed from the motion log's `kind:"yield"` entries. */
export function yieldsFor(motions: MotionLogEntry[], delegateId: string): YieldGiven[] {
  return motions
    .filter((m) => m.kind === "yield" && m.byDelegateId === delegateId)
    .map((m) => ({ targetCountry: m.targetCountry || "", targetDelegateId: m.targetDelegateId }));
}

/** Turn one participation summary + the session's points/motions into a report row. */
export function toReportRow(
  p: ParticipationSummary, points: RaisedPoint[], motions: MotionLogEntry[],
): DelegateReportRow {
  const pointsByType = summarizePoints(points, p.delegateId);
  return {
    delegateId: p.delegateId,
    country: p.country,
    attendanceStatus: p.attendanceStatus,
    speeches: p.speeches || 0,
    speakingSeconds: p.speakingSeconds || 0,
    caucusSpeeches: p.caucusSpeeches || 0,
    motions: p.motions || 0,
    motionsProposed: p.motionsProposed ?? p.motions ?? 0,
    votesCast: p.votesCast || 0,
    pointsByType,
    pointsTotal: Object.values(pointsByType).reduce((a, b) => a + b, 0),
    yieldsGiven: yieldsFor(motions, p.delegateId),
  };
}

/**
 * Build the full committee report for a day (chair-only — reads every delegate's
 * participation, all points, votes and the motion log). One-shot, no live subscription.
 */
export async function buildCommitteeReport(
  eventId: string, committeeId: string, dateStr: string, quorum = 0,
): Promise<CommitteeReport> {
  const sessionId = makeSessionId(committeeId, dateStr);
  const [sessionSnap, partSnap, pointsSnap, votesSnap, motionsSnap] = await Promise.all([
    getDoc(sessionRef(eventId, sessionId)).catch(() => null),
    getDocs(participationCol(eventId, sessionId)),
    getDocs(pointsCol(eventId, sessionId)),
    getDocs(query(votesCol(eventId, sessionId), orderBy("closedAt", "asc"))).catch(() => null),
    getDocs(query(motionsCol(eventId, sessionId), orderBy("at", "asc"))).catch(() => null),
  ]);
  // The sitting's roll is the attendance authority, and everyone on it gets a row (see
  // reportAttendance.ts: self-declared roll calls never touch participation).
  const roll = (sessionSnap?.exists() ? (sessionSnap.data() as LiveSession).attendance : undefined) as
    Record<string, { status?: string; country?: string; applicationId?: string }> | undefined;
  const participation = withRollAttendance<ParticipationSummary>(
    partSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ParticipationSummary)),
    roll, { eventId, committeeId, dateStr },
  );
  const points = pointsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RaisedPoint));
  const votes = (votesSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() } as unknown as FinishedVote));
  const motions = (motionsSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() } as MotionLogEntry));

  const rows = participation
    .map((p) => toReportRow(p, points, motions))
    .sort((a, b) => (a.country || "").localeCompare(b.country || ""));

  const present = participation.filter(
    (p) => p.attendanceStatus === "present" || p.attendanceStatus === "present_and_voting"
  ).length;

  return {
    eventId, committeeId, dateStr,
    present, quorum,
    totalSpeeches: rows.reduce((a, r) => a + r.speeches, 0),
    totalSpeakingSeconds: rows.reduce((a, r) => a + r.speakingSeconds, 0),
    rows, votes, motions,
  };
}

/**
 * App Admin test tool: resets all logs, subcollections, markings, and live state for a session.
 * Its only caller is the admin live-sessions monitor (dashboard/admin/live-sessions); never put
 * it back in a chair or organizer surface, it deletes a sitting's marks.
 */
export async function resetSessionDev(
  eventId: string,
  sessionId: string,
  committeeId?: string,
  dateStr?: string
): Promise<void> {
  // 1. Reset live session fields
  await patch(eventId, sessionId, {
    phase: "lobby",
    rollCall: null,
    gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: { running: false, endsAt: null, pausedRemainingMs: 90000, durationMs: 90000 } },
    caucus: null,
    activeVote: null,
    floorGate: { kind: "none", signupId: null, signupFor: null, allowsPoints: false, endsAt: null, windowSecs: 0, openedBy: "", openedAt: null },
    pendingPublish: null,
    publishedResult: null,
    publishedDoc: null,
    finalized: false,
    attendance: {},
  });

  // 2. Clear session subcollections
  const subcols = [
    motionQueueCol(eventId, sessionId),
    pointsCol(eventId, sessionId),
    requestsCol(eventId, sessionId),
    participationCol(eventId, sessionId),
    votesCol(eventId, sessionId),
    motionsCol(eventId, sessionId),
  ];

  for (const colRef of subcols) {
    try {
      const snap = await getDocs(colRef);
      if (snap.docs.length > 0) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error("Failed to delete subcollection in resetSessionDev", err);
    }
  }

  // 3. Clear daily markings
  if (eventId && committeeId && dateStr) {
    try {
      const q = query(
        collection(db, "markings"),
        where("eventId", "==", eventId),
        where("committeeId", "==", committeeId),
        where("dateStr", "==", dateStr)
      );
      const snap = await getDocs(q);
      if (snap.docs.length > 0) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error("Failed to delete markings in resetSessionDev", err);
    }
  }
}
