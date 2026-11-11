/**
 * Roll call as a LIFECYCLE, not a mood.
 *
 * THE PROCEDURE THIS MODELS. The chair opens the roll, delegations declare themselves, the window
 * closes, and the chair rules the roll complete with a tally. Four states, in one direction:
 *
 *   not_started  the roll has not been taken today
 *   running      the window is open and delegates are answering
 *   ended        the window is closed (lapsed or stopped early) and the chair has not ruled yet
 *   done         the chair ruled. `completedAt` is sticky and IS the answer to "is roll call over".
 *
 * WHY A RECORD AND NOT A DERIVATION. Everything else about roll call was inferred, and the two
 * inferences were both wrong:
 *
 *  • `phase === "roll_call"` grants nothing. Every session created since motion-first carries a
 *    `floorGate`, so `capabilitiesFor` takes the gated branch and the phase is display-only. The old
 *    `open_roll_call` action wrote only the phase, which is why pressing it appeared to do nothing.
 *  • `quorumMet` is not "roll call finished". A committee that answers 1 of 4 has finished its roll;
 *    it simply is not quorate. Treating the two as one held the whole sitting hostage to
 *    "Mark all present", which falsifies the register to unlock the agenda.
 *
 * So completion is EXPLICIT STATE, the same argument `floorGate.ts` makes for permission.
 *
 * THE STAGE NEVER READS THE GATE. It would be the obvious shortcut — a live `roll_call` gate looks
 * exactly like "running" — and it breaks twice. The chair can open a different gate mid-roll from
 * the chooser, which would snap the bar back to "Start roll call" over a half-finished roll and let
 * a restart wipe `startedAt`; and `capabilitiesFor` overrides the authored kind on floor occupancy,
 * so a stale `gsl.activeSpeaker` would read as `debate`. The record is the sole authority; the gate
 * is opened and closed as a SIDE EFFECT of start/stop, because that is what actually grants
 * delegates permission, and nothing reads it back.
 *
 * LEGACY, AND THE ONE BEHAVIOUR CHANGE IT CARRIES. Sessions predating this have no `rollCall`, so
 * `done` falls back to `quorumMet && phase !== "lobby"`. That is deliberately `gateAdvice`'s old
 * test, not `flowModel`'s: flowModel ALSO treated `phase === "roll_call"` as still-in-roll-call, and
 * nothing ever moves the phase off "roll_call" when the roll finishes (the next `setPhase` comes
 * from `executeMotion`, two steps later), so transcribing it would loop a record-less session back
 * into roll call forever with a full committee in the room. The visible consequence: a record-less
 * session at phase "roll_call" with quorum met now advances to the agenda step instead of offering
 * "Adopt: <topic>" from inside the roll-call branch — which is what `adviseGate` was already telling
 * that chair to do. There is no backfill migration; this normalizer is the compatibility layer, the
 * same arrangement as `getAgenda()`, `readClock()` and `caucusListState()`.
 *
 * A consequence worth keeping: a chair who uses the Roll call panel's "All present" BEFORE pressing
 * Start skips the lifecycle (legacy ⇒ done) and never sees the summary. That is the escape hatch
 * working, not a gap to close — they declared the room present, which is a ruling.
 *
 * PURE. Type-only import from sessionService, so TypeScript erases it and this module never pulls in
 * `@/lib/firebase/client`. Load-bearing: `flowModel.ts` and `gateAdvice.ts` import this, and both are
 * unloadable outside a browser if anything in their import graph touches Firebase. That is also why
 * `seated` re-implements `eligibleVoterCount` rather than importing it — a value import of
 * sessionService would take the whole graph down. `flowModel.presentCount` and
 * `gateAdvice.presentCount` already duplicate it for exactly this reason.
 */
import type { AttendanceEntry, LiveSession } from "./sessionService";

/** Default window for a roll call, seconds. Matches `DEFAULT_WINDOW.roll_call` in GateBar. */
export const ROLL_CALL_DEFAULT_SECS = 90;

/**
 * The chair's record of today's roll. ABSENT on every session created before this shipped — read it
 * through `readRollCall()`, never directly.
 *
 * Every timestamp is epoch ms from the CHAIR's clock, never a `serverTimestamp()` sentinel. Two
 * reasons: the whole window model already works that way (`gateEndsAt`, `caucus.signupEndsAt`,
 * `SessionClock.startedAt`), and a sentinel reads back null in the writing chair's own optimistic
 * snapshot — which would flash the bar back to "Start roll call" for a frame right after they
 * pressed it.
 */
export interface RollCallState {
  /** When the chair opened the roll. The field that makes a record "usable" at all. */
  startedAt: number;
  /** The window deadline, mirroring the `floorGate.endsAt` written in the same patch. */
  endsAt: number | null;
  windowSecs?: number | null;
  /** Set when the chair stopped the roll before its window lapsed. */
  closedAt?: number | null;
  /** THE sticky fact. Set once, by the chair's ruling. Cleared only by a retake. */
  completedAt?: number | null;
  openedBy?: string;
  completedBy?: string;
  // ── The tally, frozen at completion ───────────────────────────────────────────
  present?: number;
  presentAndVoting?: number;
  late?: number;
  absent?: number;
  answered?: number;
  seated?: number;
  total?: number;
  quorumThreshold?: number;
  quorumMet?: boolean;
}

export type RollCallStage = "not_started" | "running" | "ended" | "done";

/** The register, counted. `seated` is the number that decides quorum and eligibility. */
export interface RollCallTally {
  present: number;
  presentAndVoting: number;
  late: number;
  /** Never answered — the seeded status nobody moved off. */
  absent: number;
  /** Anything that is not `absent`. Matches the bar's "Answered n / m". */
  answered: number;
  /** present + present_and_voting — the `eligibleVoterCount` set. */
  seated: number;
  total: number;
  quorumThreshold: number;
  quorumMet: boolean;
}

/** Narrowed read-set, so test fixtures stay small. */
export type RollCallInput = Pick<
  LiveSession, "rollCall" | "attendance" | "quorumThreshold" | "phase"
>;

export interface RollCallReading {
  stage: RollCallStage;
  /** `stage === "done"`. The gateway every other module should test. */
  done: boolean;
  /** The window deadline still AHEAD of `now`, else null. Drives the flow bar's tick. */
  windowEndsAt: number | null;
  remainingMs: number | null;
  /** Counted from `attendance` on every read — always current. */
  tally: RollCallTally;
  /** The tally as it stood when the chair ruled, or null before that. */
  snapshot: RollCallTally | null;
  /** True when there is no usable record and the fallback decided the stage. */
  legacy: boolean;
  record: RollCallState | null;
}

/** Count the register. Exported for the summary modal, which reports the same numbers. */
export function tallyRollCall(
  attendance: Record<string, AttendanceEntry> | undefined | null,
  quorumThreshold: number,
): RollCallTally {
  const rows = Object.values(attendance || {});
  let present = 0, presentAndVoting = 0, late = 0, absent = 0;
  for (const r of rows) {
    if (r.status === "present") present++;
    else if (r.status === "present_and_voting") presentAndVoting++;
    else if (r.status === "late") late++;
    else absent++;
  }
  const seated = present + presentAndVoting;
  const quorum = quorumThreshold || 0;
  return {
    present, presentAndVoting, late, absent,
    answered: rows.length - absent,
    seated,
    total: rows.length,
    quorumThreshold: quorum,
    // `seated > 0` mirrors flowModel's own quorum test: an empty committee is not quorate by
    // virtue of 0 >= 0.
    quorumMet: seated >= quorum && seated > 0,
  };
}

/**
 * A record is usable only once it carries a real `startedAt`. Same shape as `readClock`'s guard, and
 * for the same reason: a dotted write landing on a doc with no map would otherwise leave a
 * half-record that reads as a roll nobody started.
 */
function usable(r: RollCallState | null | undefined): r is RollCallState {
  return !!r && typeof r.startedAt === "number" && r.startedAt > 0;
}

/** The frozen tally, if the record carries one. */
function readSnapshot(r: RollCallState): RollCallTally | null {
  if (typeof r.total !== "number") return null;
  const seated = r.seated ?? 0;
  return {
    present: r.present ?? 0,
    presentAndVoting: r.presentAndVoting ?? 0,
    late: r.late ?? 0,
    absent: r.absent ?? 0,
    answered: r.answered ?? r.total - (r.absent ?? 0),
    seated,
    total: r.total,
    quorumThreshold: r.quorumThreshold ?? 0,
    quorumMet: r.quorumMet ?? false,
  };
}

/**
 * Where today's roll call stands. THE only reader of `session.rollCall`.
 *
 * `now` is injectable so the derivation is deterministic under test — same discipline as
 * `deriveFlow` and `capabilitiesFor`.
 */
export function readRollCall(s: RollCallInput, now: number = Date.now()): RollCallReading {
  const tally = tallyRollCall(s.attendance, s.quorumThreshold || 0);
  const record = usable(s.rollCall) ? s.rollCall : null;

  if (!record) {
    // Legacy. See the header: gateAdvice's test, not flowModel's.
    const done = tally.quorumMet && s.phase !== "lobby";
    return {
      stage: done ? "done" : "not_started",
      done,
      windowEndsAt: null,
      remainingMs: null,
      tally,
      snapshot: null,
      legacy: true,
      record: null,
    };
  }

  const lapsed = record.endsAt != null && now >= record.endsAt;
  const stage: RollCallStage = record.completedAt
    ? "done"
    : record.closedAt || lapsed
      ? "ended"
      : "running";
  const windowEndsAt = stage === "running" && record.endsAt != null ? record.endsAt : null;

  return {
    stage,
    done: stage === "done",
    windowEndsAt,
    remainingMs: windowEndsAt != null ? Math.max(0, windowEndsAt - now) : null,
    tally,
    snapshot: readSnapshot(record),
    legacy: false,
    record,
  };
}
