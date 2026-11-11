/**
 * The roll-call lifecycle, stage by stage.
 *
 * Also a purity guard, like the flow suites: this runs in a plain node environment with no Firebase
 * config, so if `rollCall.ts` ever gains a value-import of `sessionService` every case here fails at
 * import time.
 */
import { describe, it, expect } from "vitest";
import { readRollCall, tallyRollCall, type RollCallInput, type RollCallState } from "./rollCall";
import type { AttendanceEntry, AttendanceStatus } from "./sessionService";

const NOW = 1_700_000_000_000;

/** A 4-delegation committee. Pass statuses in order; the rest stay absent. */
function attendance(...statuses: AttendanceStatus[]): Record<string, AttendanceEntry> {
  const out: Record<string, AttendanceEntry> = {};
  ["in", "fr", "br", "ke"].forEach((c, i) => {
    out[`u_${c}`] = {
      status: statuses[i] ?? "absent", country: c, delegateId: `u_${c}`, applicationId: `app${i}`,
    };
  });
  return out;
}

function base(over: Partial<RollCallInput> = {}): RollCallInput {
  return {
    phase: "lobby",
    quorumThreshold: 2,
    attendance: attendance(),
    rollCall: null,
    ...over,
  };
}

const record = (over: Partial<RollCallState> = {}): RollCallState => ({
  startedAt: NOW - 30_000, endsAt: NOW + 60_000, windowSecs: 90, ...over,
});

describe("tallyRollCall", () => {
  it("counts every bucket and derives answered / seated", () => {
    const t = tallyRollCall(attendance("present", "present_and_voting", "late"), 2);
    expect(t).toMatchObject({
      present: 1, presentAndVoting: 1, late: 1, absent: 1,
      answered: 3, seated: 2, total: 4, quorumThreshold: 2, quorumMet: true,
    });
  });

  it("an empty roster is never quorate, even against a threshold of 0", () => {
    expect(tallyRollCall({}, 0)).toMatchObject({ total: 0, seated: 0, quorumMet: false });
  });

  it("late does not count toward quorum but does count as answered", () => {
    const t = tallyRollCall(attendance("late", "late"), 2);
    expect(t.answered).toBe(2);
    expect(t.seated).toBe(0);
    expect(t.quorumMet).toBe(false);
  });
});

describe("readRollCall — the four stages", () => {
  it("no record, lobby ⇒ not_started", () => {
    const r = readRollCall(base(), NOW);
    expect(r.stage).toBe("not_started");
    expect(r.legacy).toBe(true);
    expect(r.done).toBe(false);
  });

  it("a live window ⇒ running, and reports the deadline still ahead", () => {
    const r = readRollCall(base({ rollCall: record(), phase: "roll_call" }), NOW);
    expect(r.stage).toBe("running");
    expect(r.windowEndsAt).toBe(NOW + 60_000);
    expect(r.remainingMs).toBe(60_000);
    expect(r.legacy).toBe(false);
  });

  it("a lapsed window ⇒ ended, with no deadline left to tick", () => {
    const r = readRollCall(base({ rollCall: record({ endsAt: NOW - 1 }) }), NOW);
    expect(r.stage).toBe("ended");
    expect(r.windowEndsAt).toBeNull();
    expect(r.remainingMs).toBeNull();
  });

  it("stopped early ⇒ ended, even with the window still ahead", () => {
    const r = readRollCall(base({ rollCall: record({ closedAt: NOW - 5_000 }) }), NOW);
    expect(r.stage).toBe("ended");
  });

  it("a window with no deadline stays running until the chair stops it", () => {
    expect(readRollCall(base({ rollCall: record({ endsAt: null }) }), NOW).stage).toBe("running");
  });

  it("completedAt ⇒ done, and it outranks a still-open window", () => {
    const r = readRollCall(base({ rollCall: record({ completedAt: NOW - 1_000 }) }), NOW);
    expect(r.stage).toBe("done");
    expect(r.done).toBe(true);
  });

  it("done BELOW quorum — the whole point of the ruling", () => {
    const r = readRollCall(base({
      attendance: attendance("present"),
      rollCall: record({ closedAt: NOW - 2_000, completedAt: NOW - 1_000 }),
    }), NOW);
    expect(r.done).toBe(true);
    expect(r.tally.quorumMet).toBe(false);
  });
});

describe("readRollCall — the snapshot", () => {
  it("is null before completion", () => {
    expect(readRollCall(base({ rollCall: record() }), NOW).snapshot).toBeNull();
  });

  it("is the frozen tally, not the live one", () => {
    // The record says 3 were seated; the attendance map has since dropped to 1.
    const r = readRollCall(base({
      attendance: attendance("present"),
      rollCall: record({
        completedAt: NOW - 1_000,
        present: 2, presentAndVoting: 1, late: 0, absent: 1,
        answered: 3, seated: 3, total: 4, quorumThreshold: 2, quorumMet: true,
      }),
    }), NOW);
    expect(r.snapshot).toMatchObject({ seated: 3, quorumMet: true });
    expect(r.tally.seated).toBe(1);
  });
});

describe("readRollCall — legacy fallback", () => {
  it("quorum met away from the lobby ⇒ done", () => {
    const r = readRollCall(base({ phase: "gsl", attendance: attendance("present", "present") }), NOW);
    expect(r.done).toBe(true);
    expect(r.legacy).toBe(true);
  });

  it("quorum met at phase roll_call ⇒ done — nothing moves the phase when the roll finishes", () => {
    const s = base({ phase: "roll_call", attendance: attendance("present", "present") });
    expect(readRollCall(s, NOW).done).toBe(true);
  });

  it("quorum met but still in the lobby ⇒ not_started", () => {
    const s = base({ phase: "lobby", attendance: attendance("present", "present") });
    expect(readRollCall(s, NOW).done).toBe(false);
  });

  it("a half-written record with no startedAt falls back to legacy", () => {
    const s = base({
      phase: "gsl",
      attendance: attendance("present", "present"),
      rollCall: { closedAt: NOW } as unknown as RollCallState,
    });
    const r = readRollCall(s, NOW);
    expect(r.legacy).toBe(true);
    expect(r.record).toBeNull();
    expect(r.done).toBe(true);
  });
});
