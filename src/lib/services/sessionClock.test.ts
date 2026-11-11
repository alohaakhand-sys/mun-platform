import { describe, it, expect } from "vitest";
import { readSessionClock, sessionClockState, formatClock, type SessionClockInput } from "./sessionClock";
import type { SessionClock } from "./sessionService";

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 3_600_000;

/** Firestore Timestamp stand-in — only `toMillis`/`seconds` are ever read. */
const ts = (ms: number) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) });

function input(over: Partial<SessionClockInput> = {}): SessionClockInput {
  return { phase: "gsl", finalized: false, createdAt: ts(NOW - HOUR), ...over } as SessionClockInput;
}

describe("readSessionClock — the no-migration fallback", () => {
  it("falls back to createdAt when clock is absent", () => {
    expect(readSessionClock(input(), NOW)).toEqual({
      startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: null,
    });
  });

  it("treats clock:null identically to absent", () => {
    expect(readSessionClock(input({ clock: null }), NOW).startedAt).toBe(NOW - HOUR);
  });

  it("reads a raw Timestamp with only `seconds` (no toMillis)", () => {
    const s = input({ createdAt: { seconds: (NOW - HOUR) / 1000 } });
    expect(readSessionClock(s, NOW).startedAt).toBe(NOW - HOUR);
  });

  it("uses `now`, not 1970, while createdAt is still an unresolved serverTimestamp", () => {
    // The one frame between the local write and the server echo: createdAt reads back null.
    expect(readSessionClock(input({ createdAt: null }), NOW).startedAt).toBe(NOW);
  });

  it("ignores a garbage clock (startedAt 0) and falls back", () => {
    const s = input({ clock: { startedAt: 0, accumulatedMs: 999, suspendedAt: null } });
    expect(readSessionClock(s, NOW)).toEqual({ startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: null });
  });

  it("coerces a missing accumulatedMs / suspendedAt to 0 / null", () => {
    const s = input({ clock: { startedAt: NOW - HOUR } as SessionClock });
    expect(readSessionClock(s, NOW)).toEqual({ startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: null });
  });
});

describe("sessionClockState — elapsed", () => {
  it("counts from startedAt while running", () => {
    const st = sessionClockState(input({ clock: { startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: null } }), NOW);
    expect(st).toMatchObject({ elapsedMs: HOUR, running: true, paused: false, frozen: false });
  });

  it("EXCLUDES banked break time", () => {
    // Sat down 1h ago, 20 of those minutes were a suspension → 40 minutes of sitting.
    const s = input({ clock: { startedAt: NOW - HOUR, accumulatedMs: 20 * MIN, suspendedAt: null } });
    expect(sessionClockState(s, NOW).elapsedMs).toBe(40 * MIN);
  });

  it("HOLDS at suspendedAt while suspended — a longer break does not grow the total", () => {
    const clock = { startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: NOW - 10 * MIN };
    const s = input({ phase: "suspended", clock });
    expect(sessionClockState(s, NOW)).toMatchObject({ elapsedMs: 50 * MIN, running: false, paused: true });
    // …and still 50m when read an hour later.
    expect(sessionClockState(s, NOW + HOUR).elapsedMs).toBe(50 * MIN);
  });

  it("FREEZES at finalizedAt once finalized, whatever the phase says", () => {
    const s = input({
      phase: "gsl", finalized: true, finalizedAt: ts(NOW - 30 * MIN),
      clock: { startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: null },
    });
    expect(sessionClockState(s, NOW)).toMatchObject({ elapsedMs: 30 * MIN, frozen: true, running: false, paused: false });
    expect(sessionClockState(s, NOW + HOUR).elapsedMs).toBe(30 * MIN);
  });

  it("finalized outranks suspended (frozen, not paused)", () => {
    const s = input({
      phase: "suspended", finalized: true, finalizedAt: ts(NOW - 5 * MIN),
      clock: { startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: NOW - 20 * MIN },
    });
    expect(sessionClockState(s, NOW)).toMatchObject({ frozen: true, paused: false, elapsedMs: 55 * MIN });
  });

  it("finalized with no finalizedAt falls back to suspendedAt, then now", () => {
    const clock = { startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: NOW - 15 * MIN };
    expect(sessionClockState(input({ finalized: true, clock }), NOW).elapsedMs).toBe(45 * MIN);
    expect(sessionClockState(input({ finalized: true }), NOW).elapsedMs).toBe(HOUR);
  });

  it("DRIFT: a stale suspendedAt on a non-suspended phase just resumes counting", () => {
    // endCaucus/nextSpeaker force-set phase:"gsl" without touching the clock. Documented as
    // self-correcting: the break's length is lost, the clock does not stall or go negative.
    const s = input({ phase: "gsl", clock: { startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: NOW - 30 * MIN } });
    expect(sessionClockState(s, NOW)).toMatchObject({ elapsedMs: HOUR, running: true });
  });

  it("never goes negative when startedAt is in the future (clock skew between chairs)", () => {
    const s = input({ clock: { startedAt: NOW + 5 * MIN, accumulatedMs: 0, suspendedAt: null } });
    expect(sessionClockState(s, NOW).elapsedMs).toBe(0);
  });

  it("a closed-but-not-finalized session keeps running (it can be reopened)", () => {
    const s = input({ phase: "closed", clock: { startedAt: NOW - HOUR, accumulatedMs: 0, suspendedAt: null } });
    expect(sessionClockState(s, NOW).running).toBe(true);
  });
});

describe("formatClock", () => {
  it("drops the hour field under an hour", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9_000)).toBe("0:09");
    expect(formatClock(90_000)).toBe("1:30");
    expect(formatClock(59 * MIN + 59_000)).toBe("59:59");
  });

  it("pads minutes once the hour appears", () => {
    expect(formatClock(HOUR)).toBe("1:00:00");
    expect(formatClock(HOUR + 4 * MIN + 7_000)).toBe("1:04:07");
    expect(formatClock(25 * HOUR)).toBe("25:00:00");
  });

  it("clamps negatives to 0:00", () => {
    expect(formatClock(-5_000)).toBe("0:00");
  });
});
