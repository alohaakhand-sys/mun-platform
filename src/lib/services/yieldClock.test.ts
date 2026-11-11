import { describe, it, expect } from "vitest";
import { yieldGrantMs, DEFAULT_SPEAKER_SECS } from "./yieldClock";

describe("yieldGrantMs — base allotment plus the carried remainder", () => {
  it("adds the remainder to the recipient's own allotment", () => {
    // The reported bug: 50s speech + 10s handed over must read 1:00, not 0:10 and not 0:50.
    expect(yieldGrantMs(50, 10_000)).toBe(60_000);
  });

  it("gives a full speech when nothing is left to carry", () => {
    expect(yieldGrantMs(50, 0)).toBe(50_000);
  });

  it("rounds a fractional carry — endsAt is an integer epoch", () => {
    expect(yieldGrantMs(50, 10_499)).toBe(60_499);
    expect(yieldGrantMs(50, 10_500.7)).toBe(60_501);
  });

  it("falls back to the 90s default when defaultSpeakerSecs is missing", () => {
    expect(yieldGrantMs(undefined, 10_000)).toBe(DEFAULT_SPEAKER_SECS * 1000 + 10_000);
  });

  it("treats a zero or negative allotment as unset rather than as a zero-length speech", () => {
    expect(yieldGrantMs(0, 10_000)).toBe(DEFAULT_SPEAKER_SECS * 1000 + 10_000);
    expect(yieldGrantMs(-30, 10_000)).toBe(DEFAULT_SPEAKER_SECS * 1000 + 10_000);
  });

  it("degrades garbage carry to no carry, never to a short speech", () => {
    // A stale snapshot or a clock read mid-write must not cost the recipient their own time.
    expect(yieldGrantMs(50, -5_000)).toBe(50_000);
    expect(yieldGrantMs(50, NaN)).toBe(50_000);
    expect(yieldGrantMs(50, Infinity)).toBe(50_000);
    expect(yieldGrantMs(50, undefined as unknown as number)).toBe(50_000);
  });

  it("never returns less than the base allotment", () => {
    for (const carried of [-1, 0, NaN, Infinity, -Infinity, 1, 999_999]) {
      expect(yieldGrantMs(50, carried)).toBeGreaterThanOrEqual(50_000);
    }
  });
});
