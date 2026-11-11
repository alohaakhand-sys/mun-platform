/**
 * Fixture table for `adviseGate`. Each case is a hand-built session at one point in the sitting;
 * the assertions pin the advised gate, its motion list and the preset the dialog will mark.
 *
 * Same purity guard as `flowModel.test.ts`: these run in a plain node environment with no Firebase
 * config, so a value-import of `sessionService` (which initializes Firebase at import scope) fails
 * every case here at import time rather than silently in the browser.
 *
 * The ladder is ORDERED, so the cases are written in ladder order — a test that passes only because
 * an earlier row did not match is a test that will lie later.
 */
import { describe, it, expect } from "vitest";
import { adviseGate, offFlowNote, gateMatchesAdvice, gatePresets, TYPE_PRESETS } from "./gateAdvice";
import { getAgenda } from "./flowModel";
import { readFloorFacts } from "@/lib/services/motionMootness";
import type { FloorGateKind } from "@/lib/services/floorGate";
import type {
  LiveSession, Motion, MotionType, TimerState, SpeakerSlot, AgendaItem,
} from "@/lib/services/sessionService";

const NOW = 1_700_000_000_000;

const timer = (over: Partial<TimerState> = {}): TimerState => ({
  running: false, endsAt: null, pausedRemainingMs: 90_000, durationMs: 90_000, ...over,
});

const slot = (country: string, id = country): SpeakerSlot =>
  ({ delegateId: `u_${id}`, country, applicationId: `app_${id}` });

/** A 4-delegate committee, quorum 2, nobody present. */
function baseSession(over: Partial<LiveSession> = {}): LiveSession {
  const attendance: LiveSession["attendance"] = {};
  for (const [i, c] of ["in", "fr", "br", "ke"].entries()) {
    attendance[`u_${c}`] = { status: "absent", country: c, delegateId: `u_${c}`, applicationId: `app${i}` };
  }
  return {
    eventId: "e1", committeeId: "UNSC", dateStr: "2026-07-26",
    phase: "lobby",
    quorumThreshold: 2,
    attendance,
    gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer() },
    caucus: null,
    activeVote: null,
    pointsMotions: { byDelegate: {} },
    finalized: false,
    createdBy: "chair",
    ...over,
  };
}

function present(s: LiveSession, n: number): LiveSession {
  const attendance = { ...s.attendance };
  Object.keys(attendance).slice(0, n).forEach((k) => {
    attendance[k] = { ...attendance[k], status: "present" };
  });
  return { ...s, attendance };
}

const AGENDA: AgendaItem[] = [
  { id: "a0", title: "Topic One", status: "pending" },
  { id: "a1", title: "Topic Two", status: "pending" },
];

const motion = (over: Partial<Motion> = {}): Motion => ({
  id: "m1", type: "mod_caucus", params: {}, byDelegateId: "u_in", byCountry: "in",
  applicationId: "app0", status: "pending", ...over,
});

const gate = (over: Partial<NonNullable<LiveSession["floorGate"]>> = {}): LiveSession["floorGate"] => ({
  kind: "motions", allowsPoints: true, endsAt: null, openedBy: "chair", ...over,
});

/** A moderated caucus, nobody recognized, clock not yet started. Shared with the preset cases. */
const caucus = (over: Partial<NonNullable<LiveSession["caucus"]>> = {}): LiveSession["caucus"] => ({
  caucusId: "c1", kind: "moderated", topic: "Sanctions",
  totalDurationSecs: 600, perSpeakerSecs: 45,
  totalTimer: timer({ durationMs: 600_000, pausedRemainingMs: 600_000 }),
  speakerTimer: timer(), currentSpeaker: null, queue: [],
  ...over,
});

const run = (session: LiveSession, motions: Motion[] = []) =>
  adviseGate({ session, motions, now: NOW });

/** The committee mid-sitting: quorum, a topic adopted, the GSL opened by a passed motion. */
const debating = (over: Partial<LiveSession> = {}) =>
  present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: 0 }, ...over }), 2);
const GSL_OPENED = [motion({ id: "mg", type: "open_gsl", status: "executed" })];

describe("adviseGate — rows that hold their opinion back", () => {
  it("a finalized session advises nothing", () => {
    expect(run(baseSession({ finalized: true })).kind).toBeNull();
  });

  it("a suspended session advises nothing and points at resume", () => {
    const a = run(present(baseSession({ phase: "suspended" }), 2));
    expect(a.kind).toBeNull();
    expect(a.next).toMatch(/[Rr]esume/);
  });

  it("a live vote owns the floor — no gate is advised", () => {
    const s = present(baseSession({
      phase: "voting",
      agenda: { items: AGENDA, activeIndex: 0 },
      activeVote: {
        voteId: "v1", motion: "Draft Resolution 1.1", voteType: "substantive",
        threshold: "two_thirds", scMode: false, p5: [], allowAbstain: true, round: 1,
        divisionOfQuestion: false, mode: "roll_call", ballots: {}, eligibleCount: 2,
        startedBy: "chair",
      },
    }), 2);
    const a = run(s);
    expect(a.kind).toBeNull();
    expect(a.because).toContain("Draft Resolution 1.1");
  });

  it("an unpublished result outranks everything downstream", () => {
    const s = debating({
      pendingPublish: {
        voteId: "v1", motion: "DR 1.1", result: "passed",
        affirmative: 2, negative: 0, abstentions: 0, eligibleCount: 2,
        voteType: "substantive", threshold: "two_thirds", scMode: false, mode: "roll_call",
      },
    });
    expect(run(s, GSL_OPENED).kind).toBeNull();
  });
});

describe("adviseGate — someone holds the floor", () => {
  it("a GSL speaker who is actually on the mic advises points-only", () => {
    const s = debating({
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: ["u_fr"] },
    });
    const a = run(s, GSL_OPENED);
    expect(a.kind).toBe("debate");
    expect(a.secs).toBeNull();
    expect(a.because).toContain("France");
  });

  it("a recognized speaker who never joined the call is NOT occupancy", () => {
    // Mirrors `floorOccupancy`: without `live.stage[0]` nobody is really speaking, so the ladder
    // falls through to the empty-list row instead of advising a debate gate over silence.
    const s = debating({
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
    });
    expect(run(s, GSL_OPENED).kind).toBe("signup");
  });

  it("a caucus speaker advises points-only too", () => {
    const s = debating({
      phase: "mod_caucus",
      caucus: {
        caucusId: "c1", kind: "moderated", topic: "Sanctions",
        totalDurationSecs: 600, perSpeakerSecs: 45,
        totalTimer: timer({ durationMs: 600_000, pausedRemainingMs: 600_000 }),
        speakerTimer: timer(), currentSpeaker: slot("br"), queue: [],
      },
    });
    expect(run(s).kind).toBe("debate");
  });
});

describe("adviseGate — the caucus loop", () => {
  it("a moderated caucus with nobody signed up advises a caucus signup", () => {
    const a = run(debating({ phase: "mod_caucus", caucus: caucus() }));
    expect(a.kind).toBe("signup");
    expect(a.signupFor).toBe("caucus");
    expect(a.secs).toBe(60);
  });

  it("while the signup window is open it advises the gate that is already live", () => {
    // Deliberately advising the live gate: `gateMatchesAdvice` then returns true, so the stage
    // bar's advice dot stays quiet instead of nagging the chair to change a window the passed
    // motion opened for them a moment ago.
    const a = run(debating({
      phase: "mod_caucus",
      caucus: caucus({ listState: "collecting", signupEndsAt: NOW + 45_000 }),
    }));
    expect(a.kind).toBe("signup");
    expect(a.signupFor).toBe("caucus");
    expect(a.secs).toBe(45);
    expect(a.because).toContain("who wishes to speak");
  });

  it("once the window lapses with no order set, the next move is not a gate at all", () => {
    const a = run(debating({
      phase: "mod_caucus",
      caucus: caucus({ listState: "collecting", signupEndsAt: NOW - 1 }),
    }));
    expect(a.kind).toBeNull();
    expect(a.next).toContain("speaking order");
  });

  it("a moderated caucus with a queue advises points-only and names who is next", () => {
    const a = run(debating({ phase: "mod_caucus", caucus: caucus({ queue: [slot("ke")] }) }));
    expect(a.kind).toBe("debate");
    expect(a.because).toContain("Kenya");
  });

  it("an unmoderated caucus advises locking the floor", () => {
    const a = run(debating({
      phase: "unmod_caucus",
      caucus: caucus({ kind: "unmoderated", perSpeakerSecs: 0, queue: undefined }),
    }));
    expect(a.kind).toBe("locked");
  });

  it("a caucus in its last minute outranks both — reopen for the motions that follow", () => {
    const a = run(debating({
      phase: "mod_caucus",
      caucus: caucus({
        totalTimer: timer({ running: true, endsAt: NOW + 30_000, pausedRemainingMs: null, durationMs: 600_000 }),
      }),
    }));
    expect(a.kind).toBe("motions");
    expect(a.presetId).toBe("debate");
    expect(a.because).toContain("30s");
  });
});

describe("adviseGate — the gateway steps", () => {
  it("lobby advises roll call at 90s", () => {
    const a = run(baseSession());
    expect(a.kind).toBe("roll_call");
    expect(a.secs).toBe(90);
    expect(a.because).toContain("0 of 2");
  });

  it("a running roll keeps advising roll call", () => {
    const s = present(baseSession({
      phase: "roll_call",
      rollCall: { startedAt: NOW - 10_000, endsAt: NOW + 60_000 },
    }), 1);
    expect(run(s).kind).toBe("roll_call");
  });

  // The bug this whole change exists to kill: the chair rules an un-quorate roll complete, and the
  // chooser must move on with them instead of sending them back to the roll.
  it("a roll COMPLETED below quorum advises the agenda, not roll call again", () => {
    const s = present(baseSession({
      phase: "roll_call",
      agenda: { items: AGENDA, activeIndex: -1 },
      rollCall: {
        startedAt: NOW - 90_000, endsAt: NOW - 1_000, closedAt: NOW - 1_000, completedAt: NOW - 500,
        seated: 1, total: 4, quorumThreshold: 2, quorumMet: false,
      },
    }), 1);
    const a = run(s);
    expect(a.kind).toBe("motions");
    expect(a.presetId).toBe("agenda");
  });

  // ...but a roll that WAS quorate and has since lost people is a genuine reopen.
  it("quorum lost after a quorate roll reopens it, and says so", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      rollCall: {
        startedAt: NOW - 90_000, endsAt: NOW - 1_000, closedAt: NOW - 1_000, completedAt: NOW - 500,
        seated: 3, total: 4, quorumThreshold: 2, quorumMet: true,
      },
    }), 1);
    const a = run(s, GSL_OPENED);
    expect(a.kind).toBe("roll_call");
    expect(a.because).toContain("Quorum lost");
  });

  it("quorum lost mid-sitting reopens roll call", () => {
    // One delegate present against a threshold of 2 — the ladder does not care that the phase
    // says "gsl", because a committee under quorum cannot transact.
    const a = run(present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: 0 } }), 1), GSL_OPENED);
    expect(a.kind).toBe("roll_call");
  });

  it("quorum met with no topic adopted advises motions, agenda only", () => {
    const a = run(present(baseSession({ phase: "roll_call", agenda: { items: AGENDA, activeIndex: -1 } }), 2));
    expect(a.kind).toBe("motions");
    expect(a.presetId).toBe("agenda");
    expect(a.motionTypes).toEqual(["set_agenda"]);
    expect(a.secs).toBe(90);
  });

  it("a set_agenda motion already on the floor withdraws the advice", () => {
    const s = present(baseSession({ phase: "roll_call", agenda: { items: AGENDA, activeIndex: -1 } }), 2);
    const a = run(s, [motion({ type: "set_agenda", status: "pending" })]);
    expect(a.kind).toBeNull();
    expect(a.next).toMatch(/vote/i);
  });

  it("an EXECUTED set_agenda motion does not withdraw it — that one already ran", () => {
    const s = present(baseSession({ phase: "roll_call", agenda: { items: AGENDA, activeIndex: -1 } }), 2);
    expect(run(s, [motion({ type: "set_agenda", status: "executed" })]).presetId).toBe("agenda");
  });
});

describe("adviseGate — the speakers loop", () => {
  it("a topic adopted with no passed open_gsl advises motions, open the list", () => {
    const a = run(debating());
    expect(a.kind).toBe("motions");
    expect(a.presetId).toBe("gsl");
    expect(a.motionTypes).toEqual(["open_gsl"]);
    expect(a.because).toContain("Topic One");
  });

  it("an executed open_gsl flips it to a Speakers List signup", () => {
    // The whole reason the queue is read as a log: `phase` says "gsl" in BOTH of these fixtures,
    // and `gsl.defaultSpeakerSecs` is untouched by an open_gsl that carried no speaking time.
    const a = run(debating(), GSL_OPENED);
    expect(a.kind).toBe("signup");
    expect(a.signupFor).toBe("gsl");
    expect(a.secs).toBe(60);
  });

  it("a non-empty queue is proof the list opened, even with no motion in the queue", () => {
    const a = run(debating({
      gsl: { defaultSpeakerSecs: 90, queue: [slot("in")], activeSpeaker: null, timer: timer() },
    }));
    expect(a.kind).toBe("debate");
    expect(a.because).toContain("India");
  });

  it("DISAMBIGUATION: after a signup window ran and the list is still empty, reopen wider", () => {
    const a = run(debating({ floorGate: gate({ kind: "signup", signupFor: "gsl" }) }), GSL_OPENED);
    expect(a.kind).toBe("motions");
    expect(a.presetId).toBe("debate");
    expect(a.motionTypes).toContain("mod_caucus");
    expect(a.motionTypes).toContain("move_to_voting");
  });

  it("a CAUCUS signup gate does not count as the list's signup window", () => {
    const a = run(debating({ floorGate: gate({ kind: "signup", signupFor: "caucus" }) }), GSL_OPENED);
    expect(a.kind).toBe("signup");
    expect(a.signupFor).toBe("gsl");
  });

  /**
   * The case the ladder used to get wrong, and the reason `gsl.spoken` exists.
   *
   * A committee works through its Speakers List: speeches happen, the queue drains, the mic clears.
   * The chair's live gate at that moment is whatever they opened for the speeches — `debate` — so
   * `signupJustRan` is false, and the advice used to send them back to collecting MORE signups for
   * a list the room had just finished. The state is byte-identical to "the list opened and nobody
   * joined" apart from the speech count, which is why the count had to be stored.
   */
  const spokenThrough = (spoken: number, over: Partial<LiveSession> = {}) => debating({
    floorGate: gate({ kind: "debate" }),
    gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer(), spoken },
    ...over,
  });

  it("a list SPOKEN THROUGH advises motions, not another signup window", () => {
    const a = run(spokenThrough(3), GSL_OPENED);
    expect(a.kind).toBe("motions");
    expect(a.presetId).toBe("debate");
    expect(a.motionTypes).toContain("mod_caucus");
    expect(a.motionTypes).toContain("unmod_caucus");
    expect(a.secs).toBe(90);
    expect(a.because).toContain("spoken through");
    expect(a.because).toContain("3 speeches");
    expect(a.because).toContain("Topic One");
  });

  it("and the advised set drops what the floor already answered", () => {
    const a = run(spokenThrough(2), GSL_OPENED);
    // Agenda adopted, list open, no caucus to extend — all three would be ruled out of order the
    // moment a delegate took the invitation.
    expect(a.motionTypes).not.toContain("set_agenda");
    expect(a.motionTypes).not.toContain("open_gsl");
    expect(a.motionTypes).not.toContain("extend_caucus");
  });

  it("one speech is enough, and the sentence stays singular", () => {
    expect(run(spokenThrough(1), GSL_OPENED).because).toContain("1 speech on");
  });

  it("an UNSPOKEN empty list still asks for signups — the two states are not the same", () => {
    const a = run(spokenThrough(0), GSL_OPENED);
    expect(a.kind).toBe("signup");
    expect(a.signupFor).toBe("gsl");
  });

  it("a fresh topic resets the count, so signups come back for the new list", () => {
    // What `setActiveAgenda` / `advanceAgenda` / `adoptAgendaTopic` write: spoken back to 0.
    const a = run(spokenThrough(0, { agenda: { items: AGENDA, activeIndex: 1 } }), GSL_OPENED);
    expect(a.kind).toBe("signup");
  });

  it("speeches on a list that has since been re-seeded do not short-circuit row 9", () => {
    const a = run(debating({
      gsl: { defaultSpeakerSecs: 90, queue: [slot("ke")], activeSpeaker: null, timer: timer(), spoken: 4 },
    }), GSL_OPENED);
    expect(a.kind).toBe("debate");
    expect(a.because).toContain("Kenya");
  });
});

describe("offFlowNote", () => {
  const advice = { kind: "motions" as FloorGateKind, motionTypes: ["set_agenda"] as MotionType[], because: "b", next: "n" };
  const label = (k: FloorGateKind) => k;

  it("says nothing when the pick matches", () => {
    expect(offFlowNote(advice, { kind: "motions", motionTypes: ["set_agenda"] }, label)).toBeNull();
  });

  it("names the expected gate when the kind differs", () => {
    const n = offFlowNote(advice, { kind: "roll_call", motionTypes: [] }, label);
    expect(n).toContain("motions");
  });

  it("names the motions that go beyond the advice", () => {
    const n = offFlowNote(advice, { kind: "motions", motionTypes: ["set_agenda", "adjourn"] }, label);
    expect(n).toContain("Adjourn");
  });

  it("never speaks when the advice has no opinion", () => {
    expect(offFlowNote({ kind: null, because: "b", next: "n" }, { kind: "motions", motionTypes: [] }, label)).toBeNull();
  });
});

describe("gateMatchesAdvice — drives the stage-bar dot", () => {
  const advice = { kind: "motions" as FloorGateKind, motionTypes: ["set_agenda"] as MotionType[], because: "b", next: "n" };

  it("matches an identical motions gate regardless of type order", () => {
    const wide = { kind: "motions" as FloorGateKind, motionTypes: ["a", "b"] as unknown as MotionType[], because: "b", next: "n" };
    expect(gateMatchesAdvice(gate({ motionTypes: ["b", "a"] as unknown as MotionType[] }), wide)).toBe(true);
  });

  it("does not match when the type list differs", () => {
    expect(gateMatchesAdvice(gate({ motionTypes: ["set_agenda", "adjourn"] }), advice)).toBe(false);
  });

  it("compares signupFor for signup gates", () => {
    const sig = { kind: "signup" as FloorGateKind, signupFor: "gsl" as const, because: "b", next: "n" };
    expect(gateMatchesAdvice(gate({ kind: "signup", signupFor: "caucus" }), sig)).toBe(false);
    expect(gateMatchesAdvice(gate({ kind: "signup", signupFor: "gsl" }), sig)).toBe(true);
  });

  it("never nags when the advice has no opinion", () => {
    expect(gateMatchesAdvice(null, { kind: null, because: "b", next: "n" })).toBe(true);
  });
});

describe("presets", () => {
  /**
   * The mark the dialog paints has to land on the chip row the dialog RENDERS, and both sides now
   * prune — so this compares against `gatePresets(facts)`, not the authored `TYPE_PRESETS`. Checking
   * the authored array here is what the pruning change broke, and correctly: `extend_caucus` is in
   * the authored `debate` bundle and out of every advised one, because no advised row runs with a
   * caucus that could be extended.
   */
  const factsFor = (session: LiveSession, motions: Motion[] = []) =>
    readFloorFacts(session, getAgenda(session), motions);

  it("every advised presetId resolves to a preset the chooser will render, with the same types", () => {
    const ids = new Set(TYPE_PRESETS.map((p) => p.id));
    for (const [session, motions] of [
      [present(baseSession({ phase: "roll_call", agenda: { items: AGENDA, activeIndex: -1 } }), 2), []],
      [debating(), []],
      [debating({ floorGate: gate({ kind: "signup", signupFor: "gsl" }) }), GSL_OPENED],
      [debating({
        gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer(), spoken: 3 },
      }), GSL_OPENED],
    ] as [LiveSession, Motion[]][]) {
      const a = run(session, motions);
      const rendered = gatePresets(factsFor(session, motions));
      expect(ids.has(a.presetId!)).toBe(true);
      expect(rendered.find((p) => p.id === a.presetId)!.types).toEqual(a.motionTypes);
    }
  });

  it("prunes what the floor has already answered, and drops a bundle that empties", () => {
    // A topic adopted and the list open: "Agenda only" and "Open the list" have nothing left to
    // offer, so the chooser must not render them as one-tap bundles at all.
    const session = debating();
    const rendered = gatePresets(factsFor(session, GSL_OPENED));
    expect(rendered.map((p) => p.id)).toEqual(["debate", "all"]);
    expect(rendered.find((p) => p.id === "debate")!.types).not.toContain("extend_caucus");
    expect(rendered.find((p) => p.id === "all")!.types).not.toContain("set_agenda");
    expect(rendered.find((p) => p.id === "all")!.types).not.toContain("open_gsl");
  });

  it("keeps extend_caucus while a caucus is actually running", () => {
    const session = debating({ phase: "mod_caucus", caucus: caucus() });
    const rendered = gatePresets(factsFor(session, GSL_OPENED));
    expect(rendered.find((p) => p.id === "debate")!.types).toContain("extend_caucus");
  });
});
