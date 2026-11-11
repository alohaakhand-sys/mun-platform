/**
 * The floor gate — what the chair has opened, and therefore what each delegate may do RIGHT NOW.
 *
 * THE MODEL. Motion-first Live MUN means the committee's state changes because a motion passed,
 * not because the chair pressed a button. For that to be true, delegates must be able to propose
 * exactly the motion the procedure is waiting for and nothing else. So the chair opens a GATE, and
 * the gate is the single answer to "what is permitted": one explicit field on the session document
 * that the delegate console, the chair console, the projector and firestore.rules all read.
 *
 * WHY EXPLICIT STATE AND NOT DERIVATION. `flowModel.ts`, `motionFloor.ts`, `useFloorController` and
 * `SessionProjector` each re-derive "what is happening" from the session doc, independently. Today
 * a disagreement between them is cosmetic. Under motion-first it would be a correctness bug: two
 * derivations differing means a motion is admitted that should have been blocked. Making PERMISSION
 * explicit state sidesteps that entirely — those four keep driving DISPLAY, and nothing has to be
 * consolidated for the gate to be sound.
 *
 * TIMER EXPIRY NEEDS NO SERVER. Every timed gate carries `endsAt`. `capabilitiesFor` locks the gate
 * once `now` passes it, on every screen simultaneously; firestore.rules rejects writes past
 * `endsAt + 2000ms` (the grace the caucus-signup rule already uses). A chair whose laptop is asleep
 * therefore cannot leave a window illegitimately open — the window is already dead by rule. This is
 * the answer to the "no chair-tier browser open, nothing fires" gap that `useVoteAutoClose` and
 * `useCaucusAutoAdd` both document, at least for gates. Vote auto-close remains a separate problem.
 *
 * BACKWARD COMPATIBILITY. Every session created before this shipped has no `floorGate`. Those fall
 * back to `legacyCapabilities`, which reproduces today's behaviour exactly by delegating to the
 * already-tested `motionsInOrder`. No existing committee is locked out by this module landing.
 *
 * PURE. Type-only import from sessionService plus two pure value imports, so it never pulls in
 * `@/lib/firebase/client`. `now` is injectable. Same discipline as `motionFloor.ts` — see the long
 * note there on why that matters for the tests.
 */
import type {
  LiveSession, MotionType, AttendanceStatus, SessionPhase, ActiveVote, CaucusState,
  SpeakerSlot, TimerState, TimerPath,
} from "./sessionService";
import { MOTION_META } from "./motionMeta";
import { motionsInOrder, type MotionFloorInput } from "./motionFloor";

// ── The gate ────────────────────────────────────────────────────────────────────

export type FloorGateKind =
  /** Chair is thinking. Delegates can do nothing but watch. */
  | "locked"
  /** Delegates declare their own attendance. The one gate that works while NOT yet present. */
  | "roll_call"
  /** Delegates may propose motions — only the types in `motionTypes`. */
  | "motions"
  /** Delegates may add themselves to a speakers list (GSL or caucus). */
  | "signup"
  /** Someone holds the floor. Points only; motions are out of order. */
  | "debate"
  /** A vote is running. Ballots only. */
  | "voting";

export interface FloorGate {
  kind: FloorGateKind;
  /** `motions` only. The ONLY types that are proposable; everything else renders locked. */
  motionTypes?: MotionType[];
  /** `signup` only. */
  signupFor?: "gsl" | "caucus";
  /** `signup` only — fresh per round, so a late write for a previous round can be rejected. */
  signupId?: string;
  /** Independent of kind: the chair may mute points during a vote. */
  allowsPoints: boolean;
  /** Epoch ms. `null` = no window, stays open until the chair changes it. */
  endsAt: number | null;
  windowSecs?: number;
  /** The chair's own wording, shown to delegates in place of the default copy. */
  label?: string;
  openedBy: string;
  /**
   * Firestore `serverTimestamp()` on write, `Timestamp` on read. `unknown` rather than `any`
   * because nothing in this pure module ever reads it — it exists for the audit trail, and typing
   * it loosely here would let a caller dereference a sentinel that has no fields until it lands.
   */
  openedAt?: unknown;
}

/** The read-set capabilities depend on. Narrowing keeps test fixtures small. */
export type FloorGateInput = Pick<
  LiveSession,
  "phase" | "finalized" | "attendance" | "activeVote" | "floorGate"
> &
  MotionFloorInput;

// ── What a delegate may do ──────────────────────────────────────────────────────

export interface DelegateCapabilities {
  /** Declare own attendance during roll call. */
  canDeclareAttendance: boolean;
  canProposeMotion: boolean;
  /** Empty unless `canProposeMotion`. Order is the caller's to decide. */
  proposableMotionTypes: MotionType[];
  /**
   * Whether seconding is PERMITTED, not whether anything is available to second — the motion queue
   * is a subcollection this module deliberately does not read. Callers already hold the queue and
   * pair this with "is there a pending motion I did not author".
   */
  canSecondMotion: boolean;
  canRaisePoint: boolean;
  /** The list being joined, or false. */
  canJoinSignup: false | "gsl" | "caucus";
  /** Driven by `activeVote`, NOT by the gate — this mirrors the ballot carve-out in firestore.rules. */
  canCastBallot: boolean;
  /** Raise a hand for the camera and mic. */
  canRequestFloor: boolean;
  /** Epoch ms the current window closes, or null. */
  expiresAt: number | null;
  /** The gate in force after expiry AND floor occupancy are applied. */
  effectiveKind: FloorGateKind;
  /**
   * True when what is actually happening on the floor overrode the chair's authored gate — a vote
   * is running, or somebody holds the mic. Callers must not show `gate.label` in that case: it
   * describes a window that is no longer the operative fact.
   */
  gateOverridden: boolean;
  /** True when the session predates `floorGate` and legacy behaviour is in force. */
  legacy: boolean;
  /** Why a capability is off — rendered directly on the disabled control. */
  lockReason: Partial<Record<CapabilityKey, string>>;
}

export type CapabilityKey =
  | "canDeclareAttendance" | "canProposeMotion" | "canSecondMotion"
  | "canRaisePoint" | "canJoinSignup" | "canCastBallot" | "canRequestFloor";

/** Default gate for a session being created now. Chair opens something real immediately after. */
export const INITIAL_GATE: Omit<FloorGate, "openedBy"> = {
  kind: "locked",
  allowsPoints: false,
  endsAt: null,
};

/** Every type a delegate may ever propose — the default set when a chair opens motions broadly. */
export const ALL_DELEGATE_MOTION_TYPES: MotionType[] = (
  Object.keys(MOTION_META) as MotionType[]
).filter((t) => MOTION_META[t].delegateProposable);

const VOTING_STATUSES: AttendanceStatus[] = ["present", "present_and_voting"];

/**
 * Why the speaker's own point tiles are shut. One sentence, both capability vintages, so a delegate
 * mid-speech never reads two accounts of it — and it names the control that DOES do what they want.
 */
export const HOLDS_FLOOR_NO_POINT =
  "You have the floor — yield your time instead of raising a point.";

/** Present enough to act on the floor. */
export function isSeated(status: AttendanceStatus | undefined): boolean {
  return !!status && VOTING_STATUSES.includes(status);
}

/**
 * What the floor is ACTUALLY doing, or null when it is free.
 *
 * WHY THIS OUTRANKS THE AUTHORED GATE. `floorGate` is a chair-written field, but the chair does not
 * write it when they start a speaker or open a vote — `nextSpeaker` and `openVote` do that, and
 * they touch `gsl`/`activeVote`, not the gate. Without this the gate goes stale the moment a speech
 * begins: the bar reads "the floor is closed" while a delegate is mid-speech with the clock
 * running, and motions would stay proposable through somebody else's speech.
 *
 * Deliberately mirrors `motionsInOrder`'s precedence (vote → caucus speaker → mic holder) rather
 * than inventing a second one, including the `live.stage` corroboration that makes a stale
 * `gsl.activeSpeaker` (which `endCaucus` leaves standing) not count as occupancy.
 *
 * Exported so surfaces that must describe the floor can ask the canonical predicate instead of
 * re-stating its three checks. `capabilitiesFor` returns `gateOverridden` for the case where
 * occupancy BEATS the gate; the inverse — a `debate` gate still standing with nobody on the mic —
 * is invisible in the result, and a caller that words a sentence about a speaker needs it. See
 * `FloorCard`'s `GateBody`.
 */
export function floorOccupancy(s: FloorGateInput): FloorGateKind | null {
  if (s.activeVote) return "voting";
  if (s.caucus?.currentSpeaker) return "debate";
  if (s.gsl?.activeSpeaker && s.live?.stage?.[0]) return "debate";
  return null;
}

/** The read-set every "who holds the floor" question needs. Narrow, so fixtures stay small. */
export type FloorInput = Pick<LiveSession, "gsl" | "caucus" | "activeVote">;

/**
 * WHO holds the floor right now — the slot, not just the gate kind. Null when nobody does.
 *
 * THE SAME PRECEDENCE AS `floorOccupancy`, and for the same reason: a caucus SUSPENDS the GSL but
 * `startModCaucus` leaves `gsl.activeSpeaker` standing, so anything reading `gsl.activeSpeaker`
 * directly names whoever last held the GSL floor for the entire caucus. An unmoderated caucus has
 * no recognized speaker at all, and a vote takes the floor away from everyone.
 *
 * THIS EXISTS BECAUSE THE CHAIR CONSOLE HAD TWO ANSWERS. `useFloorController` spotlit the caucus
 * speaker while `activeSpeakerUid` — which gates the in-tile marking strip and every yield
 * affordance — read `gsl.activeSpeaker` alone. A chair mid-caucus therefore saw the right face on
 * the stage and no way to score or yield it. One derivation, read by both.
 *
 * Deliberately does NOT corroborate with `live.stage` the way `floorOccupancy` does: a chair who
 * clears the stage has not ended the speech, and requiring it here would silently strip a live
 * speaker of their yield. See `holdsTheFloor`.
 */
export function floorHolder(s: FloorInput): SpeakerSlot | null {
  if (s.activeVote) return null;
  if (s.caucus) return s.caucus.kind === "moderated" ? s.caucus.currentSpeaker || null : null;
  return s.gsl?.activeSpeaker || null;
}

/**
 * The clock the CURRENT speech runs on, whichever list it came from, plus the base allotment a
 * yield recipient would be entitled to on top of the carry (see `yieldGrantMs`).
 *
 * A moderated caucus runs its speeches on `caucus.speakerTimer` / `perSpeakerSecs`, not on
 * `gsl.timer` / `defaultSpeakerSecs`. Every yield surface promises "they'd get M:SS" BEFORE the
 * write happens, so reading the wrong clock does not merely look wrong — it makes the card lie
 * about what accepting does.
 *
 * `path` is the dotted field prefix the timer service functions take, so callers that drive the
 * clock and callers that only display it agree on which one they mean.
 */
export function floorSpeechClock(s: FloorInput): {
  timer: TimerState | undefined;
  baseSecs: number | undefined;
  path: TimerPath;
} {
  return s.caucus?.kind === "moderated"
    ? { timer: s.caucus.speakerTimer, baseSecs: s.caucus.perSpeakerSecs, path: "caucus.speakerTimer" }
    : { timer: s.gsl?.timer, baseSecs: s.gsl?.defaultSpeakerSecs, path: "gsl.timer" };
}

function noneAllowed(
  reason: string,
  effectiveKind: FloorGateKind,
  legacy: boolean,
): DelegateCapabilities {
  const keys: CapabilityKey[] = [
    "canDeclareAttendance", "canProposeMotion", "canSecondMotion",
    "canRaisePoint", "canJoinSignup", "canCastBallot", "canRequestFloor",
  ];
  return {
    canDeclareAttendance: false,
    canProposeMotion: false,
    proposableMotionTypes: [],
    canSecondMotion: false,
    canRaisePoint: false,
    canJoinSignup: false,
    canCastBallot: false,
    canRequestFloor: false,
    expiresAt: null,
    effectiveKind,
    gateOverridden: false,
    legacy,
    lockReason: Object.fromEntries(keys.map((k) => [k, reason])) as Partial<
      Record<CapabilityKey, string>
    >,
  };
}

/**
 * May this delegate still cast a ballot? Deliberately gate-independent: it mirrors the delegate
 * self-ballot carve-out in firestore.rules line for line, so the button and the rule agree.
 */
function ballotOpen(
  vote: ActiveVote | null | undefined,
  delegateId: string,
  status: AttendanceStatus | undefined,
  now: number,
): { ok: boolean; reason?: string } {
  if (!vote) return { ok: false, reason: "No vote is open." };
  if (vote.mode !== "roll_call") {
    return { ok: false, reason: "The chair is taking this vote by a show of hands." };
  }
  if (!isSeated(status)) return { ok: false, reason: "Only delegates marked present may vote." };
  if (vote.ballots?.[delegateId]) {
    return { ok: false, reason: "You have already cast your ballot." };
  }
  const t = vote.timer;
  if (t?.running && typeof t.endsAt === "number" && now >= t.endsAt) {
    return { ok: false, reason: "Voting has closed." };
  }
  return { ok: true };
}

/**
 * What may `delegateId` do right now?
 *
 * The single source of truth for delegate permission. The delegate console renders from it; the
 * chair console renders it as a preview of what the room can currently do; firestore.rules mirror
 * the critical subset server-side.
 */
export function capabilitiesFor(
  session: FloorGateInput,
  delegateId: string,
  now: number = Date.now(),
): DelegateCapabilities {
  // 1. A closed or suspended committee outranks any gate left standing on the document.
  if (session.finalized || session.phase === "closed") {
    return noneAllowed("This committee has adjourned.", "locked", !session.floorGate);
  }
  if (session.phase === "suspended") {
    return noneAllowed(
      "The session is suspended. Everything reopens when the chair resumes.",
      "locked",
      !session.floorGate,
    );
  }

  const status = session.attendance?.[delegateId]?.status;

  // 2. Sessions predating floorGate keep today's behaviour exactly.
  if (!session.floorGate) return legacyCapabilities(session, delegateId, status, now);

  const gate = session.floorGate;
  const expired = gate.endsAt != null && now >= gate.endsAt;
  // Occupancy first — see floorOccupancy. A window the chair opened resumes the moment the floor
  // clears, so nothing is lost by letting reality win while somebody holds it.
  const occupancy = floorOccupancy(session);
  const kind: FloorGateKind = occupancy ?? (expired ? "locked" : gate.kind);
  const seated = isSeated(status);

  const lockReason: Partial<Record<CapabilityKey, string>> = {};
  const notSeated = "You are not marked present. Ask the chair to seat you.";
  const closedCopy = expired
    ? "That window has closed."
    : "The chair has not opened the floor for this.";

  // 3. Roll call is the one gate that works BEFORE you are seated — it is how you become seated.
  //
  //    ONE DELEGATE, ONE ANSWER. The finality `ballotOpen` gives a ballot, given to attendance for
  //    the same reason: an answer the room can watch you change is not an answer. Once declared,
  //    only the chair moves you — setAttendance takes the canWriteMarking branch of the rules, so
  //    the escape hatch (mark them absent/late, they may declare again) costs nothing to keep.
  //
  //    NO lockReason ON THE DECLARED BRANCH, deliberately. LockedSummary counts exactly the keys
  //    carrying a reason, so writing one here would grow "5 actions are locked" to 6 with a struck
  //    through "Roll call" the instant a delegate succeeds — punishing the answer. The card prints
  //    the affirmative instead. It would also leak a per-delegate fact into the chair's room-level
  //    capability preview, which renders this same list.
  const declared = status === "present" || status === "present_and_voting";
  const canDeclareAttendance = kind === "roll_call" && !declared;
  if (!canDeclareAttendance && !declared) {
    lockReason.canDeclareAttendance = expired
      ? "Roll call has closed."
      : "Roll call is not open.";
  }

  // 4. Motions — restricted to the exact set the chair ticked.
  const gateTypes = kind === "motions" ? gate.motionTypes ?? [] : [];
  const canProposeMotion = kind === "motions" && seated && gateTypes.length > 0;
  if (!canProposeMotion) {
    lockReason.canProposeMotion =
      kind !== "motions"
        ? kind === "debate"
          ? "Motions are out of order while a delegate holds the floor."
          : kind === "voting"
            ? "Motions reopen once the chair records the result."
            : closedCopy
        : !seated
          ? notSeated
          : "The chair has opened the floor for no motion types.";
  }

  // 5. Seconding rides the motions gate — a second is a response to what is on the floor.
  const canSecondMotion = kind === "motions" && seated;
  if (!canSecondMotion) {
    lockReason.canSecondMotion =
      kind !== "motions" ? closedCopy : notSeated;
  }

  // 6. Points are their own flag, so the chair can mute them during a vote. A SPEECH always keeps
  //    them open though — "points of order and personal privilege can still be raised at any time"
  //    is the one thing `motionFloor` promises on every out-of-order message, and a stale
  //    `allowsPoints: false` from an earlier window must not silently break that.
  //
  //    EXCEPT FOR THE SPEAKER THEMSELVES. A point is how the room interrupts whoever has the
  //    floor; the person holding it has no one to interrupt. What they have instead is the yield
  //    menu, which is the control that actually does what they want. See `holdsTheFloor`.
  const pointsAllowed = occupancy === "debate" ? true : gate.allowsPoints;
  const iHoldTheFloor = holdsTheFloor(session, delegateId);
  const canRaisePoint = pointsAllowed && seated && kind !== "locked" && !iHoldTheFloor;
  if (!canRaisePoint) {
    lockReason.canRaisePoint = iHoldTheFloor
      ? HOLDS_FLOOR_NO_POINT
      : !pointsAllowed || kind === "locked"
        ? "The chair has closed the floor to points."
        : notSeated;
  }

  // 7. Signup.
  const canJoinSignup: false | "gsl" | "caucus" =
    kind === "signup" && seated ? gate.signupFor ?? "gsl" : false;
  if (!canJoinSignup) {
    lockReason.canJoinSignup =
      kind !== "signup" ? closedCopy : notSeated;
  }

  // 8. Ballots — gate-independent, see ballotOpen.
  const ballot = ballotOpen(session.activeVote, delegateId, status, now);
  if (!ballot.ok) lockReason.canCastBallot = ballot.reason;

  // 9. Asking for the camera. Pointless while locked or mid-vote.
  const canRequestFloor = seated && kind !== "locked" && kind !== "voting";
  if (!canRequestFloor) {
    lockReason.canRequestFloor = !seated
      ? notSeated
      : kind === "voting"
        ? "A vote is running."
        : closedCopy;
  }

  return {
    canDeclareAttendance,
    canProposeMotion,
    proposableMotionTypes: canProposeMotion ? gateTypes : [],
    canSecondMotion,
    canRaisePoint,
    canJoinSignup,
    canCastBallot: ballot.ok,
    canRequestFloor,
    // An overridden gate's countdown is not the operative clock — the speech or vote timer is, and
    // it belongs to whichever surface owns that. Showing the stale window here would race it.
    expiresAt: occupancy || expired ? null : gate.endsAt,
    effectiveKind: kind,
    gateOverridden: occupancy != null,
    legacy: false,
    lockReason,
  };
}

/**
 * Pre-`floorGate` sessions. Reproduces today's delegate surface: motions gated by `motionsInOrder`,
 * points always available to a seated delegate, attendance chair-only, caucus signup driven by the
 * caucus object. Deleting this is safe only once no live session predates the gate.
 */
function legacyCapabilities(
  session: FloorGateInput,
  delegateId: string,
  status: AttendanceStatus | undefined,
  now: number,
): DelegateCapabilities {
  const seated = isSeated(status);
  const floor = motionsInOrder(session, now);
  const lockReason: Partial<Record<CapabilityKey, string>> = {};
  const notSeated = "You are not marked present. Ask the chair to seat you.";

  // Attendance was always chair-only before the gate existed.
  lockReason.canDeclareAttendance = "The chair takes the roll for this session.";

  const canProposeMotion = floor.inOrder && seated;
  if (!canProposeMotion) {
    lockReason.canProposeMotion = floor.inOrder ? notSeated : floor.detail;
  }

  // Matches the gated branch: the delegate holding the floor yields, they do not point at
  // themselves. The one deliberate departure from "reproduces today's behaviour exactly" —
  // an affordance that never made sense is not behaviour worth preserving per-vintage.
  const iHoldTheFloor = holdsTheFloor(session, delegateId);
  const canRaisePoint = seated && !iHoldTheFloor;
  if (!canRaisePoint) lockReason.canRaisePoint = iHoldTheFloor ? HOLDS_FLOOR_NO_POINT : notSeated;

  const signupOpen = legacyCaucusSignupOpen(session.caucus, now);
  const canJoinSignup: false | "caucus" = signupOpen && seated ? "caucus" : false;
  if (!canJoinSignup) {
    lockReason.canJoinSignup = signupOpen ? notSeated : "No speakers list is open for signup.";
  }

  const ballot = ballotOpen(session.activeVote, delegateId, status, now);
  if (!ballot.ok) lockReason.canCastBallot = ballot.reason;

  const canRequestFloor = seated;
  if (!canRequestFloor) lockReason.canRequestFloor = notSeated;

  const canSecondMotion = canProposeMotion;
  if (!canSecondMotion) lockReason.canSecondMotion = lockReason.canProposeMotion;

  return {
    canDeclareAttendance: false,
    canProposeMotion,
    proposableMotionTypes: canProposeMotion ? ALL_DELEGATE_MOTION_TYPES : [],
    canSecondMotion,
    canRaisePoint,
    canJoinSignup,
    canCastBallot: ballot.ok,
    canRequestFloor,
    expiresAt: signupOpen ? session.caucus?.signupEndsAt ?? null : null,
    effectiveKind: legacyKind(session, floor.inOrder),
    // Pre-gate sessions have no authored gate to override in the first place.
    gateOverridden: false,
    legacy: true,
    lockReason,
  };
}

function legacyCaucusSignupOpen(caucus: CaucusState | null | undefined, now: number): boolean {
  if (!caucus || caucus.kind !== "moderated") return false;
  if (typeof caucus.signupEndsAt !== "number") return false;
  return now < caucus.signupEndsAt;
}

/** Best-effort display kind for a legacy session, so the same UI can render both. */
function legacyKind(session: FloorGateInput, motionsOpen: boolean): FloorGateKind {
  if (session.activeVote) return "voting";
  if (legacyCaucusSignupOpen(session.caucus, Date.now())) return "signup";
  if (session.caucus?.currentSpeaker || session.gsl?.activeSpeaker) return "debate";
  if (motionsOpen) return "motions";
  return "locked";
}

/** Default copy for a gate with no chair-authored `label`. */
export function gateHeadline(gate: FloorGate | null | undefined, kind: FloorGateKind): string {
  if (gate?.label) return gate.label;
  switch (kind) {
    case "roll_call": return "Roll call is open";
    case "motions": return "The floor is open for motions";
    case "signup": return gate?.signupFor === "caucus"
      ? "Caucus speakers list is open"
      : "Speakers list is open";
    case "debate": return "A delegate has the floor";
    case "voting": return "A vote is running";
    default: return "The floor is closed";
  }
}

/**
 * Does this delegate hold the floor RIGHT NOW? The gate on every yield surface.
 *
 * WHY A PREDICATE AND NOT `gsl.activeSpeaker.delegateId === id`. `startModCaucus` and friends leave
 * `gsl.activeSpeaker` standing when they change the phase — the same staleness `floorOccupancy`
 * defends against above. A bare id comparison therefore keeps telling the last GSL speaker "you
 * have the floor, yield your remaining time" for an entire moderated caucus, and a chair accepting
 * that yield writes `phase: "gsl"` mid-caucus.
 *
 * IT USED TO ANSWER `false` FOR ANY CAUCUS AT ALL, which was the blunt version of that defence and
 * cost the caucus its yields entirely — a delegate recognized in a moderated caucus had no way to
 * hand their time on, on either console. Routing through `floorHolder` keeps the real guarantee
 * (a stale GSL slot never counts while a caucus is live) and gives the caucus speaker the floor
 * they actually hold. The `phase: "gsl"` hazard is fixed where it belongs: `acceptYieldRequest`
 * dispatches to `yieldCaucusFloorToDelegate`, which never writes `phase`.
 *
 * Deliberately does NOT also require `live.stage[0] === delegateId` the way `floorOccupancy` does.
 * That corroboration is safe there because it only downgrades a gate, whereas a chair who clears
 * the stage has not ended the speech — requiring it here would silently remove a live speaker's
 * ability to hand their time on.
 */
export function holdsTheFloor(s: FloorInput, delegateId: string): boolean {
  return !!delegateId && floorHolder(s)?.delegateId === delegateId;
}

/** Phases that mean the committee is not sitting — shared with the consoles' empty states. */
export function isSittingPhase(phase: SessionPhase): boolean {
  return phase !== "closed" && phase !== "suspended" && phase !== "lobby";
}
