/**
 * Fixture table for `capabilitiesFor`.
 *
 * Two things here are load-bearing and must not be "simplified":
 *   1. ROLL CALL WORKS WHILE NOT SEATED. Every other capability requires attendance, but roll call
 *      is how attendance is acquired — gating it on attendance deadlocks the whole sitting.
 *   2. THE LEGACY PATH. Sessions created before `floorGate` shipped have no gate, and must keep
 *      behaving exactly as they did. If these cases start failing, existing committees are locked
 *      out the moment the module deploys.
 *
 * These also guard the module's purity: node environment, no Firebase config, so a value import of
 * `sessionService` would fail every case at import time.
 */
import { describe, it, expect } from "vitest";
import {
  capabilitiesFor, gateHeadline, isSeated, holdsTheFloor, floorHolder, floorSpeechClock,
  ALL_DELEGATE_MOTION_TYPES, type FloorGate, type FloorGateInput,
} from "./floorGate";
import type { TimerState, CaucusState, ActiveVote, SpeakerSlot } from "./sessionService";

const NOW = 1_700_000_000_000;
const ME = "u_fr";

const timer = (over: Partial<TimerState> = {}): TimerState => ({
  running: false, endsAt: null, pausedRemainingMs: 90_000, durationMs: 90_000, ...over,
});
const slot = (country: string): SpeakerSlot =>
  ({ delegateId: `u_${country}`, country, applicationId: `app_${country}` });

const gate = (over: Partial<FloorGate> = {}): FloorGate => ({
  kind: "locked", allowsPoints: false, endsAt: null, openedBy: "chair", ...over,
});

/** Seated delegate, quiet floor, gate explicitly present (i.e. NOT the legacy path). */
function base(over: Partial<FloorGateInput> = {}): FloorGateInput {
  return {
    phase: "gsl",
    finalized: false,
    gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer() },
    caucus: null,
    activeVote: null,
    live: { stage: [] },
    floorGate: gate(),
    attendance: {
      u_fr: { status: "present", country: "fr", delegateId: "u_fr", applicationId: "a1" },
      u_br: { status: "present_and_voting", country: "br", delegateId: "u_br", applicationId: "a2" },
      u_ke: { status: "absent", country: "ke", delegateId: "u_ke", applicationId: "a3" },
    },
    ...over,
  };
}

const rollCallVote = (over: Partial<ActiveVote> = {}): ActiveVote => ({
  voteId: "v1", motion: "Motion to open the GSL", voteType: "procedural",
  threshold: "simple_majority", scMode: false, p5: [], allowAbstain: true, round: 1,
  divisionOfQuestion: false, mode: "roll_call", ballots: {}, eligibleCount: 3,
  startedBy: "chair", ...over,
});

const modCaucus = (over: Partial<CaucusState> = {}): CaucusState => ({
  caucusId: "c1", kind: "moderated", topic: "Sanctions",
  totalDurationSecs: 600, perSpeakerSecs: 45,
  totalTimer: timer(), speakerTimer: timer(), currentSpeaker: null, queue: [], ...over,
});

// ── The gate decides what is permitted ──────────────────────────────────────────

describe("capabilitiesFor — gate kinds", () => {
  it("locked permits nothing", () => {
    const c = capabilitiesFor(base(), ME, NOW);
    expect(c.canProposeMotion).toBe(false);
    expect(c.canRaisePoint).toBe(false);
    expect(c.canJoinSignup).toBe(false);
    expect(c.canDeclareAttendance).toBe(false);
    expect(c.effectiveKind).toBe("locked");
  });

  it("motions gate exposes ONLY the types the chair ticked", () => {
    const s = base({ floorGate: gate({ kind: "motions", motionTypes: ["set_agenda"] }) });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.canProposeMotion).toBe(true);
    expect(c.proposableMotionTypes).toEqual(["set_agenda"]);
    expect(c.canSecondMotion).toBe(true);
  });

  it("motions gate with an empty type list proposes nothing", () => {
    const s = base({ floorGate: gate({ kind: "motions", motionTypes: [] }) });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.canProposeMotion).toBe(false);
    expect(c.proposableMotionTypes).toEqual([]);
  });

  it("debate blocks motions but keeps points when allowsPoints is set", () => {
    const s = base({ floorGate: gate({ kind: "debate", allowsPoints: true }) });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.canProposeMotion).toBe(false);
    expect(c.lockReason.canProposeMotion).toMatch(/holds the floor/i);
    expect(c.canRaisePoint).toBe(true);
  });

  it("the chair can mute points independently of the gate kind", () => {
    const s = base({ floorGate: gate({ kind: "debate", allowsPoints: false }) });
    expect(capabilitiesFor(s, ME, NOW).canRaisePoint).toBe(false);
  });

  it("signup reports which list is being joined", () => {
    const s = base({ floorGate: gate({ kind: "signup", signupFor: "caucus" }) });
    expect(capabilitiesFor(s, ME, NOW).canJoinSignup).toBe("caucus");
  });

  it("signup defaults to the GSL when signupFor is unset", () => {
    const s = base({ floorGate: gate({ kind: "signup" }) });
    expect(capabilitiesFor(s, ME, NOW).canJoinSignup).toBe("gsl");
  });

  it("REGRESSION: a caucus signup window survives a stale gsl.activeSpeaker", () => {
    // `startModCaucus` leaves the previous GSL speaker standing on the document and clears
    // `live.stage`. If `floorOccupancy` ever stops requiring the stage to corroborate, this gate
    // reads as "debate" from the instant it opens, the join button never renders, and the caucus
    // speakers list comes up empty with nobody able to say why.
    const s = base({
      phase: "mod_caucus",
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("br"), timer: timer() },
      live: { stage: [] },
      caucus: modCaucus({ listState: "collecting", currentSpeaker: null }),
      floorGate: gate({
        kind: "signup", signupFor: "caucus", signupId: "sg_c1",
        endsAt: NOW + 60_000, allowsPoints: true,
      }),
    });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.canJoinSignup).toBe("caucus");
    expect(c.gateOverridden).toBe(false);
    // Points stay open through the window — nobody holds the floor, so muting them would contradict
    // what every out-of-order message promises.
    expect(c.canRaisePoint).toBe(true);
  });

  it("voting closes motions and floor requests", () => {
    const s = base({ floorGate: gate({ kind: "voting" }) });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.canProposeMotion).toBe(false);
    expect(c.canRequestFloor).toBe(false);
  });
});

// ── Occupancy outranks the authored gate ────────────────────────────────────────
// The chair does not write `floorGate` when they start a speaker or open a vote — nextSpeaker and
// openVote touch gsl/activeVote instead. Without these the bar reads "the floor is closed" over a
// running speech, which is exactly the bug that produced this block.

describe("capabilitiesFor — floor occupancy beats a stale gate", () => {
  const speaking = (over: Partial<FloorGateInput> = {}) =>
    base({
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("br"), timer: timer() },
      live: { stage: ["u_br"] },
      ...over,
    });

  it("a running speech reads as debate even while the gate still says locked", () => {
    const c = capabilitiesFor(speaking({ floorGate: gate({ kind: "locked" }) }), ME, NOW);
    expect(c.effectiveKind).toBe("debate");
    expect(c.gateOverridden).toBe(true);
  });

  it("a running speech closes motions the chair had left open", () => {
    const c = capabilitiesFor(
      speaking({ floorGate: gate({ kind: "motions", motionTypes: ["mod_caucus"] }) }), ME, NOW,
    );
    expect(c.canProposeMotion).toBe(false);
    expect(c.lockReason.canProposeMotion).toMatch(/holds the floor/i);
  });

  it("points survive a speech even when the stale gate had muted them", () => {
    // POINTS_STILL_OPEN is promised on every out-of-order message; a leftover allowsPoints:false
    // from a vote window must not quietly break it.
    const c = capabilitiesFor(
      speaking({ floorGate: gate({ kind: "locked", allowsPoints: false }) }), ME, NOW,
    );
    expect(c.canRaisePoint).toBe(true);
  });

  it("an open vote outranks everything else on the floor", () => {
    const c = capabilitiesFor(
      speaking({ activeVote: rollCallVote(), floorGate: gate({ kind: "motions", motionTypes: ["adjourn"] }) }),
      ME, NOW,
    );
    expect(c.effectiveKind).toBe("voting");
    expect(c.canProposeMotion).toBe(false);
  });

  it("a moderated-caucus speaker counts as occupancy", () => {
    const c = capabilitiesFor(
      base({ caucus: modCaucus({ currentSpeaker: slot("ke") }), floorGate: gate({ kind: "motions", motionTypes: ["adjourn"] }) }),
      ME, NOW,
    );
    expect(c.effectiveKind).toBe("debate");
  });

  it("TRAP: an activeSpeaker with an EMPTY stage is stale, not occupancy", () => {
    // endCaucus clears the caucus and the stage but leaves gsl.activeSpeaker standing. Treating
    // that as a live speech would leave the floor dead after every caucus.
    const c = capabilitiesFor(
      base({
        gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("br"), timer: timer() },
        live: { stage: [] },
        floorGate: gate({ kind: "motions", motionTypes: ["mod_caucus"] }),
      }),
      ME, NOW,
    );
    expect(c.effectiveKind).toBe("motions");
    expect(c.canProposeMotion).toBe(true);
  });

  it("the chair's window resumes untouched once the floor clears", () => {
    const g = gate({ kind: "motions", motionTypes: ["mod_caucus"], endsAt: NOW + 60_000 });
    expect(capabilitiesFor(speaking({ floorGate: g }), ME, NOW).expiresAt).toBeNull();

    const cleared = capabilitiesFor(base({ floorGate: g }), ME, NOW);
    expect(cleared.effectiveKind).toBe("motions");
    expect(cleared.gateOverridden).toBe(false);
    expect(cleared.expiresAt).toBe(NOW + 60_000);
  });
});

// ── Roll call is the one gate that works before you are seated ──────────────────

describe("capabilitiesFor — roll call", () => {
  it("an unseated delegate may still declare attendance", () => {
    const s = base({ floorGate: gate({ kind: "roll_call" }) });
    // u_ke is absent — this is exactly the delegate who must be able to answer.
    const c = capabilitiesFor(s, "u_ke", NOW);
    expect(c.canDeclareAttendance).toBe(true);
  });

  it("a delegate with no attendance entry at all may still declare", () => {
    const s = base({ floorGate: gate({ kind: "roll_call" }) });
    expect(capabilitiesFor(s, "u_unknown", NOW).canDeclareAttendance).toBe(true);
  });

  it("attendance is locked when roll call is not the open gate", () => {
    // u_ke, who has NOT declared. `ME` is already present, and the declared branch deliberately
    // carries no lockReason — see the note in floorGate.ts: a reason there would grow
    // LockedSummary's count the instant a delegate answers, punishing the answer.
    const c = capabilitiesFor(base(), "u_ke", NOW);
    expect(c.canDeclareAttendance).toBe(false);
    expect(c.lockReason.canDeclareAttendance).toMatch(/not open/i);
  });

  it("a delegate who already answered carries no lock reason", () => {
    const c = capabilitiesFor(base(), ME, NOW);
    expect(c.canDeclareAttendance).toBe(false);
    expect(c.lockReason.canDeclareAttendance).toBeUndefined();
  });
});

// ── Expiry needs no server ──────────────────────────────────────────────────────

describe("capabilitiesFor — window expiry", () => {
  it("an unexpired window reports its deadline", () => {
    const s = base({
      floorGate: gate({ kind: "motions", motionTypes: ["mod_caucus"], endsAt: NOW + 60_000 }),
    });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.canProposeMotion).toBe(true);
    expect(c.expiresAt).toBe(NOW + 60_000);
  });

  it("the gate locks itself once the deadline passes — no chair action required", () => {
    const s = base({
      floorGate: gate({ kind: "motions", motionTypes: ["mod_caucus"], endsAt: NOW - 1 }),
    });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.effectiveKind).toBe("locked");
    expect(c.canProposeMotion).toBe(false);
    expect(c.expiresAt).toBeNull();
    expect(c.lockReason.canProposeMotion).toMatch(/closed/i);
  });

  it("expiry is inclusive at the boundary", () => {
    const s = base({ floorGate: gate({ kind: "signup", endsAt: NOW }) });
    expect(capabilitiesFor(s, ME, NOW).canJoinSignup).toBe(false);
  });
});

// ── Attendance is the prerequisite for everything else ──────────────────────────

describe("capabilitiesFor — seating", () => {
  it("an absent delegate cannot propose, second, point, sign up or request the floor", () => {
    const s = base({ floorGate: gate({ kind: "motions", motionTypes: ["mod_caucus"], allowsPoints: true }) });
    const c = capabilitiesFor(s, "u_ke", NOW);
    expect(c.canProposeMotion).toBe(false);
    expect(c.canSecondMotion).toBe(false);
    expect(c.canRaisePoint).toBe(false);
    expect(c.canRequestFloor).toBe(false);
    expect(c.lockReason.canProposeMotion).toMatch(/not marked present/i);
  });

  it("present_and_voting is seated", () => {
    expect(isSeated("present_and_voting")).toBe(true);
    expect(isSeated("present")).toBe(true);
    expect(isSeated("absent")).toBe(false);
    expect(isSeated("late")).toBe(false);
    expect(isSeated(undefined)).toBe(false);
  });
});

// ── Ballots mirror firestore.rules, not the gate ────────────────────────────────

describe("capabilitiesFor — ballots", () => {
  it("a seated delegate may cast during a roll-call vote even while the gate says locked", () => {
    const s = base({ activeVote: rollCallVote(), floorGate: gate({ kind: "locked" }) });
    expect(capabilitiesFor(s, ME, NOW).canCastBallot).toBe(true);
  });

  it("one ballot each", () => {
    const s = base({ activeVote: rollCallVote({ ballots: { [ME]: "yes" } }) });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.canCastBallot).toBe(false);
    expect(c.lockReason.canCastBallot).toMatch(/already cast/i);
  });

  it("a show-of-hands vote is not delegate-castable", () => {
    const s = base({ activeVote: rollCallVote({ mode: "tally" }) });
    expect(capabilitiesFor(s, ME, NOW).canCastBallot).toBe(false);
  });

  it("an absent delegate cannot cast", () => {
    const s = base({ activeVote: rollCallVote() });
    expect(capabilitiesFor(s, "u_ke", NOW).canCastBallot).toBe(false);
  });

  it("a running vote timer that has elapsed closes the ballot", () => {
    const s = base({
      activeVote: rollCallVote({ timer: timer({ running: true, endsAt: NOW - 1 }) }),
    });
    expect(capabilitiesFor(s, ME, NOW).canCastBallot).toBe(false);
  });
});

// ── Session-level states outrank any gate left standing ─────────────────────────

describe("capabilitiesFor — session over", () => {
  it("a closed session permits nothing, whatever the gate says", () => {
    const s = base({ phase: "closed", floorGate: gate({ kind: "motions", motionTypes: ["adjourn"] }) });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.canProposeMotion).toBe(false);
    expect(c.canRaisePoint).toBe(false);
    expect(c.lockReason.canProposeMotion).toMatch(/adjourned/i);
  });

  it("finalized outranks an open gate even while the phase still reads gsl", () => {
    const s = base({ finalized: true, floorGate: gate({ kind: "motions", motionTypes: ["adjourn"] }) });
    expect(capabilitiesFor(s, ME, NOW).canProposeMotion).toBe(false);
  });

  it("suspended permits nothing but says so distinctly", () => {
    const s = base({ phase: "suspended", floorGate: gate({ kind: "motions", motionTypes: ["adjourn"] }) });
    expect(capabilitiesFor(s, ME, NOW).lockReason.canProposeMotion).toMatch(/suspended/i);
  });
});

// ── Legacy: sessions created before floorGate shipped ───────────────────────────

describe("capabilitiesFor — legacy sessions (no floorGate)", () => {
  const legacy = (over: Partial<FloorGateInput> = {}) =>
    base({ floorGate: undefined, ...over });

  it("is flagged as legacy", () => {
    expect(capabilitiesFor(legacy(), ME, NOW).legacy).toBe(true);
    expect(capabilitiesFor(base(), ME, NOW).legacy).toBe(false);
  });

  it("keeps motions open on a quiet floor — nobody is locked out by this module landing", () => {
    const c = capabilitiesFor(legacy(), ME, NOW);
    expect(c.canProposeMotion).toBe(true);
    expect(c.proposableMotionTypes).toEqual(ALL_DELEGATE_MOTION_TYPES);
    expect(c.canRaisePoint).toBe(true);
    expect(c.canRequestFloor).toBe(true);
  });

  it("defers to motionsInOrder while a delegate holds the floor", () => {
    const c = capabilitiesFor(
      legacy({ gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("br"), timer: timer() }, live: { stage: ["u_br"] } }),
      ME, NOW,
    );
    expect(c.canProposeMotion).toBe(false);
    expect(c.effectiveKind).toBe("debate");
    // Points survive a speech — the pre-gate promise.
    expect(c.canRaisePoint).toBe(true);
  });

  it("attendance stays chair-only", () => {
    const c = capabilitiesFor(legacy(), ME, NOW);
    expect(c.canDeclareAttendance).toBe(false);
    expect(c.lockReason.canDeclareAttendance).toMatch(/chair takes the roll/i);
  });

  it("caucus signup opens off the caucus object's own window", () => {
    const open = capabilitiesFor(
      legacy({ caucus: modCaucus({ signupEndsAt: NOW + 30_000 }) }), ME, NOW,
    );
    expect(open.canJoinSignup).toBe("caucus");

    const shut = capabilitiesFor(
      legacy({ caucus: modCaucus({ signupEndsAt: NOW - 1 }) }), ME, NOW,
    );
    expect(shut.canJoinSignup).toBe(false);
  });

  it("still honours closed sessions", () => {
    expect(capabilitiesFor(legacy({ phase: "closed" }), ME, NOW).canProposeMotion).toBe(false);
  });
});

// ── Who may yield ───────────────────────────────────────────────────────────────

describe("holdsTheFloor — the gate on every yield surface", () => {
  const speaking = (over: Partial<FloorGateInput> = {}) =>
    base({ gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() }, ...over });

  it("is true for the live GSL speaker", () => {
    expect(holdsTheFloor(speaking(), "u_fr")).toBe(true);
  });

  it("is false for everyone else", () => {
    expect(holdsTheFloor(speaking(), "u_br")).toBe(false);
  });

  it("is false when nobody holds the floor", () => {
    expect(holdsTheFloor(base(), "u_fr")).toBe(false);
  });

  it("is false for a STALE activeSpeaker left standing by a caucus", () => {
    // startModCaucus patches `caucus` and `phase` but leaves gsl.activeSpeaker alone. A bare id
    // comparison kept offering the last speaker a yield for the whole caucus.
    expect(holdsTheFloor(speaking({ caucus: modCaucus() }), "u_fr")).toBe(false);
  });

  it("is TRUE for the recognized speaker in a moderated caucus", () => {
    // The caucus speaker holds a real floor with a real clock on it. This used to answer false for
    // any caucus at all, which cost the caucus its yields on both consoles.
    const s = speaking({ caucus: modCaucus({ currentSpeaker: slot("br") }) });
    expect(holdsTheFloor(s, "u_br")).toBe(true);
    // …and the stale GSL slot still does not count, which was the point of the old blanket false.
    expect(holdsTheFloor(s, "u_fr")).toBe(false);
  });

  it("is false for everyone during an UNMODERATED caucus — nobody is recognized", () => {
    const s = speaking({ caucus: modCaucus({ kind: "unmoderated", currentSpeaker: slot("br") }) });
    expect(holdsTheFloor(s, "u_br")).toBe(false);
    expect(holdsTheFloor(s, "u_fr")).toBe(false);
  });

  it("is false while a vote is running", () => {
    expect(holdsTheFloor(speaking({ activeVote: rollCallVote() }), "u_fr")).toBe(false);
    expect(holdsTheFloor(
      speaking({ caucus: modCaucus({ currentSpeaker: slot("br") }), activeVote: rollCallVote() }),
      "u_br",
    )).toBe(false);
  });

  it("still holds when the chair has cleared the video stage — that does not end a speech", () => {
    expect(holdsTheFloor(speaking({ live: { stage: [] } }), "u_fr")).toBe(true);
  });

  it("is false for an empty delegateId, however the doc reads", () => {
    const s = base({ gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer() } });
    expect(holdsTheFloor(s, "")).toBe(false);
  });
});

// ── The ONE derivation the consoles share ───────────────────────────────────────
// The chair console used to answer this twice — caucus-aware for the video spotlight, GSL-only for
// the in-tile marking strip and every yield affordance. A chair mid-caucus therefore saw the right
// face on the stage with no way to score or yield it.

describe("floorHolder / floorSpeechClock", () => {
  const speaking = (over: Partial<FloorGateInput> = {}) =>
    base({ gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() }, ...over });

  it("prefers the caucus speaker over a stale GSL slot", () => {
    const s = speaking({ caucus: modCaucus({ currentSpeaker: slot("br") }) });
    expect(floorHolder(s)?.delegateId).toBe("u_br");
  });

  it("returns null in a caucus with nobody recognized yet", () => {
    expect(floorHolder(speaking({ caucus: modCaucus() }))).toBeNull();
    expect(floorHolder(speaking({ caucus: modCaucus({ kind: "unmoderated" }) }))).toBeNull();
  });

  it("falls back to the GSL speaker when no caucus is running", () => {
    expect(floorHolder(speaking())?.delegateId).toBe("u_fr");
    expect(floorHolder(base())).toBeNull();
  });

  it("a vote takes the floor from everyone", () => {
    expect(floorHolder(speaking({ activeVote: rollCallVote() }))).toBeNull();
  });

  it("reads the caucus speaker clock, not the GSL one — a yield card must not promise the wrong time", () => {
    const s = speaking({
      caucus: modCaucus({ perSpeakerSecs: 45, speakerTimer: timer({ durationMs: 45_000 }) }),
    });
    const c = floorSpeechClock(s);
    expect(c.path).toBe("caucus.speakerTimer");
    expect(c.baseSecs).toBe(45);
    expect(c.timer?.durationMs).toBe(45_000);

    const g = floorSpeechClock(speaking());
    expect(g.path).toBe("gsl.timer");
    expect(g.baseSecs).toBe(90);
  });

  it("an UNMODERATED caucus keeps the GSL clock — it has no per-speaker one", () => {
    expect(floorSpeechClock(speaking({ caucus: modCaucus({ kind: "unmoderated" }) })).path)
      .toBe("gsl.timer");
  });
});

// ── The speaker points at nobody ────────────────────────────────────────────────

describe("capabilitiesFor — the floor holder cannot raise a point", () => {
  it("shuts the speaker's own point tiles and names the yield menu instead", () => {
    const s = base({
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: ["u_fr"] },
      floorGate: gate({ kind: "debate", allowsPoints: true }),
    });
    const c = capabilitiesFor(s, ME, NOW);
    expect(c.canRaisePoint).toBe(false);
    expect(c.lockReason.canRaisePoint).toMatch(/yield/i);
    // Everyone else in the room keeps theirs — that is the whole point of a point.
    expect(capabilitiesFor(s, "u_br", NOW).canRaisePoint).toBe(true);
  });

  it("applies to the caucus speaker too", () => {
    const s = base({
      caucus: modCaucus({ currentSpeaker: slot("fr") }),
      floorGate: gate({ kind: "debate", allowsPoints: true }),
    });
    expect(capabilitiesFor(s, ME, NOW).canRaisePoint).toBe(false);
    expect(capabilitiesFor(s, "u_br", NOW).canRaisePoint).toBe(true);
  });

  it("applies on legacy sessions as well", () => {
    const s = base({
      floorGate: undefined,
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: ["u_fr"] },
    });
    expect(capabilitiesFor(s, ME, NOW).canRaisePoint).toBe(false);
    expect(capabilitiesFor(s, "u_br", NOW).canRaisePoint).toBe(true);
  });
});

// ── Copy ────────────────────────────────────────────────────────────────────────

describe("gateHeadline", () => {
  it("prefers the chair's own wording", () => {
    expect(gateHeadline(gate({ kind: "motions", label: "Agenda motions only" }), "motions"))
      .toBe("Agenda motions only");
  });

  it("distinguishes the two signup lists", () => {
    expect(gateHeadline(gate({ kind: "signup", signupFor: "caucus" }), "signup"))
      .toMatch(/caucus/i);
    expect(gateHeadline(gate({ kind: "signup", signupFor: "gsl" }), "signup"))
      .not.toMatch(/caucus/i);
  });

  it("describes an expired gate as closed, not as whatever it used to be", () => {
    expect(gateHeadline(gate({ kind: "motions" }), "locked")).toMatch(/closed/i);
  });
});
