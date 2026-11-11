/**
 * Fixture table for `deriveFlow`. Each case is a hand-built session at one point in the MUN flow;
 * the assertions pin the derived step and the first suggestion's action/panel token.
 *
 * These tests also guard the module's PURITY: they run in a plain node environment with no
 * Firebase config, so if `flowModel.ts` ever gains a value-import of `sessionService` (which
 * initializes Firebase at import scope), every case here fails at import time.
 */
import { describe, it, expect } from "vitest";
import { deriveFlow, getAgenda, FLOW_STEPS, DELEGATED_TO_FLOOR } from "./flowModel";
import type {
  LiveSession, Motion, FloorRequest, TimerState, SpeakerSlot, AgendaItem,
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

/** Mark the first `n` delegates present. */
function present(s: LiveSession, n: number): LiveSession {
  const attendance = { ...s.attendance };
  Object.keys(attendance).slice(0, n).forEach((k) => {
    attendance[k] = { ...attendance[k], status: "present" };
  });
  return { ...s, attendance };
}

/**
 * A session whose roll call is at a given stage. `readRollCall` derives it from the record alone,
 * so these fixtures never touch the gate.
 */
function rollCalled(s: LiveSession, stage: "running" | "ended" | "done"): LiveSession {
  const startedAt = NOW - 30_000;
  if (stage === "running") return { ...s, rollCall: { startedAt, endsAt: NOW + 60_000 } };
  if (stage === "ended") return { ...s, rollCall: { startedAt, endsAt: NOW - 1 } };
  return {
    ...s,
    rollCall: { startedAt, endsAt: NOW - 1, closedAt: NOW - 1, completedAt: NOW - 500 },
  };
}

const AGENDA: AgendaItem[] = [
  { id: "a0", title: "Topic One", status: "pending" },
  { id: "a1", title: "Topic Two", status: "pending" },
];

const motion = (over: Partial<Motion> = {}): Motion => ({
  id: "m1", type: "mod_caucus", params: {}, byDelegateId: "u_in", byCountry: "in",
  applicationId: "app0", status: "pending", ...over,
});

function run(session: LiveSession, opts: {
  motions?: Motion[]; requests?: FloorRequest[]; committeeAgendas?: string[]; canControl?: boolean;
} = {}) {
  return deriveFlow({
    session,
    motions: opts.motions ?? [],
    requests: opts.requests ?? [],
    committeeAgendas: opts.committeeAgendas ?? [],
    canControl: opts.canControl ?? true,
    now: NOW,
  });
}

const firstToken = (f: ReturnType<typeof run>) =>
  f.suggestions[0] ? (f.suggestions[0].action ?? `panel:${f.suggestions[0].panel}`) : null;

describe("deriveFlow — step derivation", () => {
  it("lobby → roll_call, offers to start the roll", () => {
    const f = run(baseSession());
    expect(f.currentStepId).toBe("roll_call");
    expect(firstToken(f)).toBe("start_roll_call");
  });

  it("an untaken roll stays on roll_call and keeps mark-all-present as an override", () => {
    const f = run(present(baseSession({ phase: "roll_call" }), 1));
    expect(f.currentStepId).toBe("roll_call");
    const mark = f.suggestions.find((s) => s.action === "mark_all_present");
    // Offered, but muted — it is a chair override, not the next step in procedure, and it is no
    // longer the thing standing between the committee and its agenda.
    expect(mark?.tone).toBe("muted");
    expect(f.suggestions.find((s) => s.kind === "service")?.action).not.toBe("mark_all_present");
  });

  it("quorum met with an unset agenda → agenda step, leading with the agenda motion", () => {
    const s = present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: -1 } }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("agenda");
    expect(firstToken(f)).toBe("open_motion_floor");
    expect(f.suggestions[0].label).toBe("Motion for agenda setting");
  });

  it("adopted agenda + empty GSL → gsl step, points at the speakers panel", () => {
    const s = present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: 0 } }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("gsl");
    expect(firstToken(f)).toBe("panel:gsl");
    expect(f.agendaLabel).toBe("Topic One");
  });

  it("a live speaker offers the delegated next_speaker token", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      gsl: { defaultSpeakerSecs: 90, queue: [slot("fr")], activeSpeaker: slot("in"), timer: timer() },
    }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("gsl");
    expect(firstToken(f)).toBe("next_speaker");
    expect(f.suggestions[0].label).toContain("France");
  });

  it("a queued speaker with no active speaker offers start_speaker", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      gsl: { defaultSpeakerSecs: 90, queue: [slot("br")], activeSpeaker: null, timer: timer() },
    }), 2);
    expect(firstToken(run(s))).toBe("start_speaker");
  });

  it("a pending motion outranks the GSL once quorum is met", () => {
    const s = present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: 0 } }), 2);
    const f = run(s, { motions: [motion()] });
    expect(f.currentStepId).toBe("motion");
    expect(firstToken(f)).toBe("recognize_motion");
  });

  it("a motion before the roll is taken does NOT take the step (out of order)", () => {
    const f = run(baseSession({ phase: "roll_call" }), { motions: [motion()] });
    expect(f.currentStepId).toBe("roll_call");
  });

  it("a running roll offers Stop, not mark-all-present", () => {
    const f = run(rollCalled(present(baseSession({ phase: "roll_call" }), 1), "running"));
    expect(f.currentStepId).toBe("roll_call");
    expect(firstToken(f)).toBe("stop_roll_call");
    expect(f.suggestions[0].label).toBe("Stop roll call");
  });

  it("a lapsed window offers Complete", () => {
    const f = run(rollCalled(present(baseSession({ phase: "roll_call" }), 1), "ended"));
    expect(f.currentStepId).toBe("roll_call");
    expect(firstToken(f)).toBe("complete_roll_call");
    expect(f.suggestions[0].label).toBe("Complete roll call");
  });

  // THE HEADLINE CASE. A chair who rules an un-quorate roll complete is not held there — that is
  // the whole reason "Mark all present" stopped being compulsory.
  it("a COMPLETED roll below quorum still leaves the roll-call step", () => {
    const s = rollCalled(
      present(baseSession({ phase: "roll_call", agenda: { items: AGENDA, activeIndex: -1 } }), 1),
      "done",
    );
    const f = run(s);
    expect(f.currentStepId).toBe("agenda");
    expect(f.stepStatus.roll_call).toBe("done");
    expect(f.suggestions[0].label).toBe("Motion for agenda setting");
  });

  it("a delegate's motion after a completed un-quorate roll reaches the bar", () => {
    const s = rollCalled(
      present(baseSession({ phase: "roll_call", agenda: { items: AGENDA, activeIndex: -1 } }), 1),
      "done",
    );
    const f = run(s, { motions: [motion({ type: "set_agenda", params: { topic: "Topic One" } })] });
    expect(f.currentStepId).toBe("motion");
  });

  it("a passed motion offers execute", () => {
    const s = present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: 0 } }), 2);
    const f = run(s, { motions: [motion({ status: "passed" })] });
    expect(firstToken(f)).toBe("execute_motion");
    expect(f.suggestions[0].payload?.motionId).toBe("m1");
  });

  it("motion precedence picks the more disruptive motion", () => {
    const s = present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: 0 } }), 2);
    const f = run(s, {
      motions: [
        motion({ id: "gsl", type: "open_gsl" }),          // rank 8
        motion({ id: "adj", type: "adjourn" }),           // rank 0 — wins
      ],
    });
    expect(f.suggestions[0].payload?.motionId).toBe("adj");
  });

  it("competing set_agenda motions offer NO one-tap — panel only", () => {
    const s = present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: -1 } }), 2);
    const f = run(s, {
      motions: [
        motion({ id: "s1", type: "set_agenda", params: { topic: "Topic One" } }),
        motion({ id: "s2", type: "set_agenda", params: { topic: "Topic Two" } }),
      ],
    });
    expect(f.currentStepId).toBe("motion");
    expect(f.suggestions.every((x) => x.kind === "panel")).toBe(true);
    expect(f.headline).toContain("competing");
  });

  it("a SINGLE set_agenda motion still gets its one-tap", () => {
    const s = present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: -1 } }), 2);
    const f = run(s, { motions: [motion({ id: "s1", type: "set_agenda", params: { topic: "Topic One" } })] });
    expect(firstToken(f)).toBe("recognize_motion");
  });

  it("a moderated caucus with a queue offers the delegated next_speaker", () => {
    const s = present(baseSession({
      phase: "mod_caucus",
      agenda: { items: AGENDA, activeIndex: 0 },
      caucus: {
        caucusId: "c1", kind: "moderated", topic: "Sanctions",
        totalDurationSecs: 600, perSpeakerSecs: 45,
        totalTimer: timer({ durationMs: 600_000, pausedRemainingMs: 600_000 }),
        speakerTimer: timer(),
        queue: [slot("ke")],
      },
    }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("caucus");
    expect(firstToken(f)).toBe("next_speaker");
  });

  it("a caucus still collecting signups does NOT lead with End caucus", () => {
    // The bug this replaces: a caucus that has just opened has an empty queue and no granted
    // signups, so the branch fell through to `end_caucus` as the ONE suggestion — the bar telling
    // the chair to abandon the caucus the committee had just voted for.
    const s = present(baseSession({
      phase: "mod_caucus",
      caucus: {
        caucusId: "c3", kind: "moderated", topic: "Sanctions",
        totalDurationSecs: 600, perSpeakerSecs: 45,
        totalTimer: timer({ durationMs: 600_000, pausedRemainingMs: 600_000 }),
        speakerTimer: timer(),
        queue: [], listState: "collecting", signupEndsAt: NOW + 90_000,
      },
    }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("caucus");
    expect(firstToken(f)).toBe("complete_caucus_signup");
    expect(f.suggestions[0].label).toContain("Complete signups");
    expect(f.headline).toContain("who wishes to speak");
  });

  it("once the signup window lapses the chair is told to set the order", () => {
    const s = present(baseSession({
      phase: "mod_caucus",
      caucus: {
        caucusId: "c3", kind: "moderated", topic: "Sanctions",
        totalDurationSecs: 600, perSpeakerSecs: 45,
        totalTimer: timer({ durationMs: 600_000, pausedRemainingMs: 600_000 }),
        speakerTimer: timer(),
        queue: [], listState: "collecting", signupEndsAt: NOW - 1,
      },
    }), 2);
    const f = run(s, {
      requests: [{
        id: "r1", delegateId: "u_ke", country: "ke", applicationId: "app3",
        kind: "caucus_signup", caucusId: "c3", answer: "yes", status: "pending",
      }],
    });
    expect(firstToken(f)).toBe("complete_caucus_signup");
    expect(f.suggestions[0].label).toBe("Set speaking order");
    // Still not counted as something demanding the chair's attention — see the attention test below.
    expect(f.attention).toBe(0);
  });

  it("an unmoderated caucus in its last minute promotes the extension", () => {
    const s = present(baseSession({
      phase: "unmod_caucus",
      caucus: {
        caucusId: "c2", kind: "unmoderated", topic: "",
        totalDurationSecs: 600, perSpeakerSecs: 0,
        totalTimer: timer({ running: true, endsAt: NOW + 30_000, pausedRemainingMs: null, durationMs: 600_000 }),
        speakerTimer: timer(),
      },
    }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("caucus");
    expect(firstToken(f)).toBe("extend_caucus");
  });

  it("an open vote offers the delegated close_vote with a cast count", () => {
    const s = present(baseSession({
      phase: "voting",
      activeVote: {
        voteId: "v1", motion: "Draft Resolution 1.1", voteType: "substantive",
        threshold: "two_thirds", scMode: false, p5: [], allowAbstain: true, round: 1,
        divisionOfQuestion: false, mode: "roll_call", ballots: { u_in: "yes" },
        eligibleCount: 2, startedBy: "chair",
      },
    }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("voting");
    expect(firstToken(f)).toBe("close_vote");
    expect(f.suggestions[0].hint).toBe("1 of 2 cast");
  });

  it("a closed-but-unpublished result offers publish", () => {
    const s = present(baseSession({
      phase: "gsl",
      pendingPublish: {
        voteId: "v1", motion: "DR 1.1", result: "passed",
        affirmative: 2, negative: 0, abstentions: 0, eligibleCount: 2,
        voteType: "substantive", threshold: "two_thirds", scMode: false, mode: "roll_call",
      },
    }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("voting");
    expect(firstToken(f)).toBe("publish_result");
  });

  it("suspended → closing, offers resume", () => {
    const f = run(present(baseSession({ phase: "suspended" }), 2));
    expect(f.currentStepId).toBe("closing");
    expect(firstToken(f)).toBe("resume");
  });

  it("finalized → closing, offers reopen then the report", () => {
    const f = run(baseSession({ finalized: true }));
    expect(f.currentStepId).toBe("closing");
    expect(f.suggestions).toHaveLength(2);
    expect(firstToken(f)).toBe("reopen");
    expect(f.suggestions.some((s) => s.panel === "report")).toBe(true);
  });

  it("closed → closing, offers reopen and NOT adjourn again", () => {
    const f = run(baseSession({ phase: "closed" }));
    expect(f.currentStepId).toBe("closing");
    expect(firstToken(f)).toBe("reopen");
    expect(f.suggestions.some((s) => s.action === "adjourn")).toBe(false);
  });

  it("PHASE DRIFT: phase 'voting' with no activeVote must NOT derive voting", () => {
    const s = present(baseSession({ phase: "voting", agenda: { items: AGENDA, activeIndex: 0 } }), 2);
    expect(run(s).currentStepId).toBe("gsl");
  });

  it("PHASE DRIFT: phase 'mod_caucus' with caucus null must NOT derive caucus", () => {
    const s = present(baseSession({ phase: "mod_caucus", agenda: { items: AGENDA, activeIndex: 0 } }), 2);
    expect(run(s).currentStepId).toBe("gsl");
  });
});

describe("deriveFlow — the motion floor invitation", () => {
  const adopted = (over: Partial<LiveSession> = {}) => present(baseSession({
    phase: "gsl", agenda: { items: AGENDA, activeIndex: 0 }, ...over,
  }), 2);

  it("offers open_motion_floor as PRIMARY when the speakers list is empty", () => {
    const f = run(adopted());
    const s = f.suggestions.find((x) => x.action === "open_motion_floor");
    expect(s).toBeDefined();
    expect(s!.tone).toBe("primary");
  });

  it("demotes it to muted when speakers are queued, so start_speaker keeps the lead", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      gsl: { defaultSpeakerSecs: 90, queue: [slot("fr")], activeSpeaker: null, timer: timer() },
    }), 2);
    const f = run(s);
    expect(firstToken(f)).toBe("start_speaker");
    expect(f.suggestions.find((x) => x.action === "open_motion_floor")?.tone).toBe("muted");
  });

  it("does NOT offer it while a delegate holds the floor — motions are out of order then", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: ["u_fr"] },
    }), 2);
    const f = run(s);
    expect(f.suggestions.some((x) => x.action === "open_motion_floor")).toBe(false);
    expect(f.suggestions.some((x) => x.action === "close_motion_floor")).toBe(false);
  });

  it("swaps to close_motion_floor while an invite is live", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      // NOW-relative, not Date.now() — `run` injects a fixed clock.
      motionInvite: { inviteId: "i1", endsAt: NOW + 60_000, windowSecs: 120, openedBy: "chair" },
    }), 2);
    const f = run(s);
    expect(f.suggestions.some((x) => x.action === "close_motion_floor")).toBe(true);
    expect(f.suggestions.some((x) => x.action === "open_motion_floor")).toBe(false);
  });

  it("treats an EXPIRED invite as no invite — offers open again", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      motionInvite: { inviteId: "i1", endsAt: NOW - 1, windowSecs: 120, openedBy: "chair" },
    }), 2);
    const f = run(s);
    expect(f.suggestions.some((x) => x.action === "open_motion_floor")).toBe(true);
  });

  // The agenda step is the OTHER moment motions matter — "motion to set the agenda" is a delegate
  // motion, and under motion-first it LEADS: the chair mounting a topic by hand is the override.
  it("leads the AGENDA step, with Adopt demoted to an override", () => {
    const s = present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: -1 } }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("agenda");
    expect(firstToken(f)).toBe("open_motion_floor");
    expect(f.suggestions.find((x) => x.action === "open_motion_floor")?.tone).toBe("primary");
    expect(f.suggestions.find((x) => x.action === "adopt_agenda_first")?.tone).toBe("muted");
  });

  it("swaps to close at the agenda step while an invite is live", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: -1 },
      motionInvite: { inviteId: "i1", endsAt: NOW + 60_000, windowSecs: 120, openedBy: "chair" },
    }), 2);
    const f = run(s);
    expect(f.currentStepId).toBe("agenda");
    expect(f.suggestions.some((x) => x.action === "close_motion_floor")).toBe(true);
    expect(f.suggestions.some((x) => x.action === "open_motion_floor")).toBe(false);
  });

  /**
   * A gated session asks a DIFFERENT WAY. `openMotionFloor` writes `motionInvite`, which only
   * pre-gate delegates ever see; on a gated session the ask is a `floorGate` of kind "motions", and
   * `motionsInOrder` (this module's only admissibility read) deliberately does not look at gates.
   * Without these cases the bar keeps offering "open the floor" over a floor it already opened.
   */
  const gate = (over: Partial<NonNullable<LiveSession["floorGate"]>> = {}): LiveSession["floorGate"] =>
    ({ kind: "motions", allowsPoints: true, endsAt: null, openedBy: "chair", ...over });

  it("a live MOTIONS gate counts as the ask — offers close, not open", () => {
    const f = run(adopted({ floorGate: gate() }));
    expect(f.suggestions.some((x) => x.action === "close_motion_floor")).toBe(true);
    expect(f.suggestions.some((x) => x.action === "open_motion_floor")).toBe(false);
  });

  it("an unexpired windowed motions gate counts too", () => {
    const f = run(adopted({ floorGate: gate({ endsAt: NOW + 60_000, windowSecs: 90 }) }));
    expect(f.suggestions.some((x) => x.action === "close_motion_floor")).toBe(true);
  });

  it("a LAPSED motions gate does not — offers open again", () => {
    const f = run(adopted({ floorGate: gate({ endsAt: NOW - 1, windowSecs: 90 }) }));
    expect(f.suggestions.some((x) => x.action === "open_motion_floor")).toBe(true);
  });

  it("a gate of any OTHER kind is not the ask", () => {
    for (const kind of ["locked", "signup", "roll_call", "debate"] as const) {
      const f = run(adopted({ floorGate: gate({ kind }) }));
      expect(f.suggestions.some((x) => x.action === "open_motion_floor"), kind).toBe(true);
    }
  });

  it("neither token is delegated to useFloorController's latch", () => {
    expect(DELEGATED_TO_FLOOR).not.toContain("open_motion_floor");
    expect(DELEGATED_TO_FLOOR).not.toContain("close_motion_floor");
  });
});

describe("deriveFlow — a Speakers List that ran dry", () => {
  const listState = (over: Partial<LiveSession["gsl"]> = {}) => present(baseSession({
    phase: "gsl",
    agenda: { items: AGENDA, activeIndex: 0 },
    gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer(), ...over },
  }), 2);

  it("says EXHAUSTED, with the count, once the room has spoken through it", () => {
    const f = run(listState({ spoken: 3 }));
    expect(f.headline).toContain("exhausted");
    expect(f.headline).toContain("3 spoke");
  });

  it("demotes the speakers panel — motions lead at that moment, not more signups", () => {
    const f = run(listState({ spoken: 3 }));
    const gslPanel = f.suggestions.find((x) => x.id === "p:gsl");
    expect(gslPanel?.tone).toBe("muted");
    expect(gslPanel?.label).toBe("Reopen the list");
    expect(f.suggestions.find((x) => x.action === "open_motion_floor")?.tone).toBe("primary");
  });

  it("an untouched empty list keeps the old headline and leads with Add speakers", () => {
    const f = run(listState({ spoken: 0 }));
    expect(f.headline).toContain("Speakers List is empty");
    const gslPanel = f.suggestions.find((x) => x.id === "p:gsl");
    expect(gslPanel?.tone).toBe("primary");
    expect(gslPanel?.label).toBe("Add speakers");
  });

  it("absent `spoken` behaves like zero, so pre-existing sessions are unchanged", () => {
    expect(run(listState()).headline).toContain("Speakers List is empty");
  });
});

describe("deriveFlow — invariants", () => {
  it("is advisory: no suggestion is ever marked blocked/required", () => {
    const f = run(present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: 0 } }), 2));
    for (const s of f.suggestions) {
      expect(s).not.toHaveProperty("blocked");
      expect(s).not.toHaveProperty("required");
    }
  });

  it("an observer (canControl false) gets navigation only — zero writes offered", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      gsl: { defaultSpeakerSecs: 90, queue: [slot("fr")], activeSpeaker: slot("in"), timer: timer() },
    }), 2);
    const f = run(s, { canControl: false });
    expect(f.suggestions.length).toBeGreaterThan(0);
    expect(f.suggestions.every((x) => x.kind === "panel")).toBe(true);
  });

  it("never offers more than 4 suggestions", () => {
    const s = present(baseSession({ phase: "gsl", agenda: { items: AGENDA, activeIndex: 0 } }), 2);
    const f = run(s, {
      motions: [motion(), motion({ id: "m2", type: "unmod_caucus" })],
      requests: [
        { delegateId: "u_fr", country: "fr", applicationId: "a", kind: "speak", status: "pending" },
      ],
    });
    expect(f.suggestions.length).toBeLessThanOrEqual(4);
  });

  it("every step has a status and the loop steps never latch to done", () => {
    const s = present(baseSession({
      phase: "voting",
      agenda: { items: AGENDA, activeIndex: 0 },
      activeVote: {
        voteId: "v1", motion: "m", voteType: "procedural", threshold: "simple_majority",
        scMode: false, p5: [], allowAbstain: true, round: 1, divisionOfQuestion: false,
        mode: "tally", tally: { yes: 1, no: 0, abstain: 0 }, eligibleCount: 2, startedBy: "c",
      },
    }), 2);
    const f = run(s);
    for (const step of FLOW_STEPS) expect(f.stepStatus[step.id]).toBeDefined();
    expect(f.stepStatus.gsl).not.toBe("done");
    expect(f.stepStatus.roll_call).toBe("done");
    expect(f.stepStatus.agenda).toBe("done");
  });

  it("attention counts pending motions, speak requests and an unpublished result", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      pendingPublish: {
        voteId: "v1", motion: "m", result: "passed", affirmative: 2, negative: 0,
        abstentions: 0, eligibleCount: 2, voteType: "procedural",
        threshold: "simple_majority", scMode: false, mode: "tally",
      },
    }), 2);
    const f = run(s, {
      motions: [motion()],
      requests: [
        { delegateId: "u_fr", country: "fr", applicationId: "a", kind: "speak", status: "pending" },
        // caucus_signup must NOT inflate the count — it belongs to the Caucus tool.
        { delegateId: "u_br", country: "br", applicationId: "b", kind: "caucus_signup", status: "pending", answer: "yes" },
      ],
    });
    expect(f.attention).toBe(3);
  });

  it("the delegated token list is exactly the four floor transitions", () => {
    expect([...DELEGATED_TO_FLOOR].sort()).toEqual(
      ["close_vote", "end_caucus", "next_speaker", "start_speaker"],
    );
  });

  it("offers open_gsl_signup when GSL has been opened by motion and signup is not active", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer() },
    }), 2);
    const f = run(s, {
      motions: [motion({ id: "m_gsl", type: "open_gsl", status: "executed" })],
    });
    expect(f.currentStepId).toBe("gsl");
    expect(firstToken(f)).toBe("open_gsl_signup");
  });

  it("offers complete_gsl_signup when GSL signup window is active", () => {
    const s = present(baseSession({
      phase: "gsl",
      agenda: { items: AGENDA, activeIndex: 0 },
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer() },
      floorGate: { kind: "signup", signupFor: "gsl", endsAt: Date.now() + 60_000, windowSecs: 60, signupId: "sg_1", allowsPoints: true, openedBy: "u_chair" },
    }), 2);
    const f = run(s, {
      motions: [motion({ id: "m_gsl", type: "open_gsl", status: "executed" })],
    });
    expect(f.currentStepId).toBe("gsl");
    expect(firstToken(f)).toBe("complete_gsl_signup");
  });
});

describe("getAgenda — normalizer", () => {
  it("synthesizes from the committee config when the session has none", () => {
    const a = getAgenda(baseSession(), ["One", "  Two  ", ""]);
    expect(a.items.map((x) => x.title)).toEqual(["One", "Two"]);
    expect(a.activeIndex).toBe(-1);
    expect(a.source).toBe("committee");
  });

  it("prefers the persisted agenda over the committee config", () => {
    const a = getAgenda({ agenda: { items: AGENDA, activeIndex: 1 } }, ["Ignored"]);
    expect(a.items).toBe(AGENDA);
    expect(a.activeIndex).toBe(1);
  });

  it("clamps an out-of-range activeIndex", () => {
    expect(getAgenda({ agenda: { items: AGENDA, activeIndex: 9 } }).activeIndex).toBe(1);
    expect(getAgenda({ agenda: { items: AGENDA, activeIndex: -7 } }).activeIndex).toBe(-1);
  });

  it("returns an empty agenda when there is nothing anywhere", () => {
    const a = getAgenda(null, []);
    expect(a.items).toEqual([]);
    expect(a.activeIndex).toBe(-1);
  });
});
