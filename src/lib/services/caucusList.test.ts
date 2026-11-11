/**
 * Fixture table for the caucus speakers-list model.
 *
 * The load-bearing case in here is ABSENT-READS-AS-SEATED. Every caucus that existed before
 * `listState` shipped, and every caucus on a legacy (pre-`floorGate`) session, has no such field —
 * and "seated" is the value that keeps `useCaucusAutoAdd` draining signups exactly as it does
 * today. Flip that default and every live committee's caucus stops admitting speakers.
 *
 * Also guards the module's purity: node environment, no Firebase config, so a value import of
 * `sessionService` would fail every case at import time.
 */
import { describe, it, expect } from "vitest";
import {
  caucusListState, isCollecting, orderSignups, allAnswers, caucusSlots,
  signupIdFor, mergeSignupOrder, slotOfSignup,
} from "./caucusList";
import type { CaucusState, FloorRequest, TimerState, SpeakerSlot } from "./sessionService";

const timer = (over: Partial<TimerState> = {}): TimerState => ({
  running: false, endsAt: null, pausedRemainingMs: 90_000, durationMs: 90_000, ...over,
});

const modCaucus = (over: Partial<CaucusState> = {}): CaucusState => ({
  caucusId: "c1", kind: "moderated", topic: "Sanctions",
  totalDurationSecs: 600, perSpeakerSecs: 45,
  totalTimer: timer(), speakerTimer: timer(), currentSpeaker: null, queue: [], ...over,
});

const slot = (country: string): SpeakerSlot =>
  ({ delegateId: `u_${country}`, country, applicationId: `app_${country}` });

/** A signup answer. `seconds`/`nanos` stand in for the serverTimestamp; null = not yet acked. */
const signup = (
  country: string,
  over: Partial<FloorRequest> & { seconds?: number | null; nanos?: number } = {},
): FloorRequest => {
  const { seconds = 100, nanos = 0, ...rest } = over;
  return {
    id: `r_${country}`,
    delegateId: `u_${country}`, country, applicationId: `app_${country}`,
    kind: "caucus_signup", caucusId: "c1", answer: "yes", status: "pending",
    createdAt: seconds === null ? null : { seconds, nanoseconds: nanos },
    ...rest,
  };
};

// ── listState ───────────────────────────────────────────────────────────────────

describe("caucusListState", () => {
  it("ABSENT reads as seated — this is what keeps every pre-existing caucus working", () => {
    expect(caucusListState(modCaucus())).toBe("seated");
  });

  it("null / undefined caucus reads as seated", () => {
    expect(caucusListState(null)).toBe("seated");
    expect(caucusListState(undefined)).toBe("seated");
  });

  it("an unmoderated caucus is never collecting — it has no speakers list", () => {
    expect(caucusListState(modCaucus({
      kind: "unmoderated", listState: "collecting",
    }))).toBe("seated");
  });

  it("reads the field when it is present", () => {
    expect(caucusListState(modCaucus({ listState: "collecting" }))).toBe("collecting");
    expect(caucusListState(modCaucus({ listState: "seated" }))).toBe("seated");
    expect(isCollecting(modCaucus({ listState: "collecting" }))).toBe(true);
    expect(isCollecting(modCaucus())).toBe(false);
  });
});

// ── orderSignups ────────────────────────────────────────────────────────────────

describe("orderSignups", () => {
  it("orders by the SERVER timestamp, not by array position", () => {
    const reqs = [signup("ke", { seconds: 300 }), signup("in", { seconds: 100 }), signup("br", { seconds: 200 })];
    expect(orderSignups(reqs, "c1").map((r) => r.country)).toEqual(["in", "br", "ke"]);
  });

  it("breaks a same-second tie on nanoseconds", () => {
    const reqs = [
      signup("ke", { seconds: 100, nanos: 900 }),
      signup("in", { seconds: 100, nanos: 100 }),
    ];
    expect(orderSignups(reqs, "c1").map((r) => r.country)).toEqual(["in", "ke"]);
  });

  it("EXCLUDES an answer the server has not stamped yet", () => {
    // The writer's own optimistic snapshot reads createdAt back as null. Sorting those to one end
    // instead of dropping them lets the chair seat an order the server never agreed to.
    const reqs = [signup("in", { seconds: 100 }), signup("ke", { seconds: null })];
    expect(orderSignups(reqs, "c1").map((r) => r.country)).toEqual(["in"]);
  });

  it("keeps only pending yes-answers for THIS caucus", () => {
    const reqs = [
      signup("in"),
      signup("fr", { answer: "no" }),                    // declined
      signup("br", { status: "granted" }),               // already placed
      signup("ke", { caucusId: "c2" }),                  // a previous caucus
      { ...signup("us"), kind: "speak" as const },       // a GSL ask
    ];
    expect(orderSignups(reqs, "c1").map((r) => r.country)).toEqual(["in"]);
  });

  it("returns nothing without a caucus id", () => {
    expect(orderSignups([signup("in")], undefined)).toEqual([]);
  });
});

describe("allAnswers", () => {
  it("counts declines and granted answers too — it is the 'who has responded' denominator", () => {
    const reqs = [signup("in"), signup("fr", { answer: "no" }), signup("br", { status: "granted" })];
    expect(allAnswers(reqs, "c1")).toHaveLength(3);
  });
});

// ── slots / ids / merge ─────────────────────────────────────────────────────────

describe("caucusSlots", () => {
  it("floors total ÷ per-speaker", () => {
    expect(caucusSlots(modCaucus({ totalDurationSecs: 600, perSpeakerSecs: 45 }))).toBe(13);
  });

  it("is 0 when there is no speaking time to divide by", () => {
    expect(caucusSlots(modCaucus({ perSpeakerSecs: 0 }))).toBe(0);
    expect(caucusSlots(null)).toBe(0);
  });
});

describe("signupIdFor", () => {
  it("is derived from the caucus id, so a re-ask rotates it for free", () => {
    // reaskCaucusSignups mints a new caucusId; two independently-minted ids would have to be kept
    // in step by hand at every call site, forever.
    expect(signupIdFor("c1")).toBe("sg_c1");
    expect(signupIdFor("c2")).not.toBe(signupIdFor("c1"));
  });
});

describe("mergeSignupOrder", () => {
  it("keeps the existing queue in front and appends new answers behind it", () => {
    const merged = mergeSignupOrder([slot("in")], [signup("br"), signup("ke")]);
    expect(merged.map((s) => s.country)).toEqual(["in", "br", "ke"]);
  });

  it("never duplicates a delegation already in the queue", () => {
    const merged = mergeSignupOrder([slot("in")], [signup("in"), signup("br")]);
    expect(merged.map((s) => s.country)).toEqual(["in", "br"]);
  });

  it("carries the application id through — marking credit reads it off the slot", () => {
    expect(slotOfSignup(signup("in"))).toEqual({
      delegateId: "u_in", country: "in", applicationId: "app_in",
    });
  });
});
