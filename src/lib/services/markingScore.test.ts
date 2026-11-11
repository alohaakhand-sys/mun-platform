/**
 * The scoring model, day by day.
 *
 * Also a purity guard, like the flow suites: this runs in a plain node environment with no
 * Firebase config, so if `markingScore.ts` ever gains a value-import of `markingService` or
 * `eventService` every case here fails at import time.
 *
 * The case that matters most is `attended but never scored`. Before attendance reached the
 * marking record, that day was indistinguishable from an absence and silently scored 0 —
 * a delegate who sat through every session could be dragged down by their chair's backlog.
 */
import { describe, it, expect } from "vitest";
import {
  computeDailyScore, computeFinalScore, criterionPct, deriveDays, splitMarkings, isScored,
  isAttended, DEFAULT_OVERALL_WEIGHT,
} from "./markingScore";
import type { MarkingTemplate } from "./eventService";
import type { Marking, MarkingAttendance } from "./markingService";

const TEMPLATES: MarkingTemplate[] = [
  { id: "speech", name: "Speeches", maxScore: 100 },
  { id: "diplo", name: "Diplomacy", maxScore: 100 },
];

function mark(
  dateStr: string, scores: Record<string, number>, attendanceStatus?: MarkingAttendance,
): Marking {
  return {
    id: `C_u1_${dateStr}`, eventId: "e1", committeeId: "C", delegateId: "u1", applicationId: "a1",
    dateStr, scores, feedback: "", gradedBy: "chair", ...(attendanceStatus ? { attendanceStatus } : {}),
  };
}

describe("criterionPct", () => {
  it("passes a decimal value through, clamped to ±100", () => {
    expect(criterionPct(60, "decimal")).toBe(60);
    expect(criterionPct(-40, "decimal")).toBe(-40);
    expect(criterionPct(500, "decimal")).toBe(100);
    expect(criterionPct(-500, "decimal")).toBe(-100);
  });

  it("min-max maps binary −1/0/+1 onto 0..100", () => {
    expect(criterionPct(-1, "binary")).toBe(0);
    expect(criterionPct(0, "binary")).toBe(50);
    expect(criterionPct(1, "binary")).toBe(100);
    // A multi-mark tally leaves a fractional mean.
    expect(criterionPct(0.4, "binary")).toBe(70);
  });
});

describe("isScored", () => {
  it("treats a scored 0 as scored and a blank as not", () => {
    expect(isScored(0)).toBe(true);
    expect(isScored(-100)).toBe(true);
    expect(isScored(undefined)).toBe(false);
    expect(isScored(NaN)).toBe(false);
    expect(isScored("50")).toBe(false);
  });
});

describe("computeDailyScore", () => {
  it("averages only the criteria that were scored", () => {
    const d = computeDailyScore(mark("2026-03-01", { speech: 80 }), TEMPLATES);
    expect(d.scoredCount).toBe(1);
    expect(d.pct).toBe(80);
    expect(d.present).toBe(true);
  });

  it("floors a negative average at 0 without discarding the penalty", () => {
    const d = computeDailyScore(mark("2026-03-01", { speech: -100, diplo: -60 }), TEMPLATES);
    expect(d.pct).toBe(0);
    expect(d.sum).toBe(-160);
  });

  it("returns null when nothing was scored", () => {
    expect(computeDailyScore(mark("2026-03-01", {}), TEMPLATES).pct).toBeNull();
    expect(computeDailyScore(undefined, TEMPLATES).present).toBe(false);
  });

  it("lets the doc's own markMode outrank the event fallback", () => {
    const binaryDoc: Marking = { ...mark("2026-03-01", { speech: 1 }), markMode: "binary" };
    // Read as binary (its own stamp) → 100%, not as a decimal 1 → 1%.
    expect(computeDailyScore(binaryDoc, TEMPLATES, "decimal").pct).toBe(100);
  });

  it("carries attendance through so the final can act on it", () => {
    expect(computeDailyScore(mark("2026-03-01", {}, "absent"), TEMPLATES).attendanceStatus).toBe("absent");
  });
});

describe("isAttended", () => {
  it("counts present, present_and_voting and late as in the room", () => {
    expect(isAttended("present")).toBe(true);
    expect(isAttended("present_and_voting")).toBe(true);
    expect(isAttended("late")).toBe(true);
    expect(isAttended("absent")).toBe(false);
    expect(isAttended(undefined)).toBe(false);
  });
});

describe("computeFinalScore — which days count", () => {
  const days = ["2026-03-01", "2026-03-02", "2026-03-03"];

  it("averages scored days across the whole day set", () => {
    const f = computeFinalScore(
      [mark(days[0], { speech: 90 }), mark(days[1], { speech: 60 }), mark(days[2], { speech: 30 })],
      TEMPLATES, days, null,
    );
    expect(f.dayCount).toBe(3);
    expect(f.presentDays).toBe(3);
    expect(f.computedPct).toBe(60);
    expect(f.finalScore).toBe(60);
  });

  it("scores an ABSENT day as 0 and keeps it in the denominator", () => {
    const f = computeFinalScore(
      [mark(days[0], { speech: 90 }), mark(days[1], {}, "absent"), mark(days[2], { speech: 90 })],
      TEMPLATES, days, null,
    );
    expect(f.dayCount).toBe(3);
    expect(f.excludedDays).toBe(0);
    expect(f.computedPct).toBe(60);      // (90 + 0 + 90) / 3
  });

  it("EXCLUDES an attended-but-unscored day instead of zeroing it", () => {
    const f = computeFinalScore(
      [mark(days[0], { speech: 90 }), mark(days[1], {}, "present"), mark(days[2], { speech: 90 })],
      TEMPLATES, days, null,
    );
    expect(f.dayCount).toBe(2);          // the unscored day left the denominator
    expect(f.totalDays).toBe(3);
    expect(f.excludedDays).toBe(1);
    expect(f.computedPct).toBe(90);      // (90 + 90) / 2 — not 60
    expect(f.daily.find(d => d.dateStr === days[1])!.counted).toBe(false);
  });

  it("keeps the legacy zero when a day has no marking doc and no attendance record", () => {
    const f = computeFinalScore([mark(days[0], { speech: 90 })], TEMPLATES, days, null);
    expect(f.dayCount).toBe(3);
    expect(f.excludedDays).toBe(0);
    expect(f.computedPct).toBe(30);      // (90 + 0 + 0) / 3
  });

  it("treats a doc with no marks and no attendance as an absence, unchanged", () => {
    const f = computeFinalScore(
      [mark(days[0], { speech: 90 }), mark(days[1], {})],
      TEMPLATES, ["2026-03-01", "2026-03-02"], null,
    );
    expect(f.dayCount).toBe(2);
    expect(f.computedPct).toBe(45);
  });

  it("scores 0 rather than dividing by zero when every day is excluded", () => {
    const f = computeFinalScore([mark(days[0], {}, "present")], TEMPLATES, [days[0]], null);
    expect(f.dayCount).toBe(0);
    expect(f.computedPct).toBe(0);
    expect(f.finalScore).toBe(0);
  });
});

describe("computeFinalScore — the blend", () => {
  const days = ["2026-03-01", "2026-03-02"];
  const daily = [mark(days[0], { speech: 80 }), mark(days[1], { speech: 60 })];

  it("ignores the weight entirely when no overall was entered", () => {
    const f = computeFinalScore(daily, TEMPLATES, days, null, 0.3);
    expect(f.overallWeight).toBe(0);
    expect(f.chairOverall).toBeNull();
    expect(f.finalScore).toBe(70);
  });

  it("blends 70/30 by default when an overall IS entered", () => {
    const f = computeFinalScore(daily, TEMPLATES, days, 100, DEFAULT_OVERALL_WEIGHT);
    expect(f.overallWeight).toBe(0.3);
    expect(f.finalScore).toBe(79);       // 0.7·70 + 0.3·100
  });

  it("normalises a binary overall onto 0..100 before blending", () => {
    const binaryDaily = [
      { ...mark(days[0], { speech: 1 }), markMode: "binary" as const },
      { ...mark(days[1], { speech: 1 }), markMode: "binary" as const },
    ];
    // computed 100%; overall −1 in binary is 0%, so 0.7·100 + 0.3·0 = 70.
    const f = computeFinalScore(binaryDaily, TEMPLATES, days, -1, 0.3, "binary");
    expect(f.finalScore).toBe(70);
  });

  it("treats a scored 0 overall as a real value, not a blank", () => {
    const f = computeFinalScore(daily, TEMPLATES, days, 0, 0.3);
    expect(f.overallWeight).toBe(0.3);
    expect(f.finalScore).toBe(49);       // 0.7·70 + 0.3·0
  });
});

describe("deriveDays / splitMarkings", () => {
  it("prefers the explicit override and de-duplicates", () => {
    expect(deriveDays([mark("2026-03-05", {})], ["2026-03-02", "2026-03-01", "2026-03-01"]))
      .toEqual(["2026-03-01", "2026-03-02"]);
  });

  it("derives sorted distinct days from the marks when there is no override", () => {
    expect(deriveDays([mark("2026-03-03", {}), mark("2026-03-01", {}), mark("2026-03-03", {})]))
      .toEqual(["2026-03-01", "2026-03-03"]);
  });

  it("separates the final rollup by kind AND by the id suffix", () => {
    const byKind: Marking = { ...mark("2026-03-01", {}), id: "C_u1_x", kind: "final" };
    const bySuffix: Marking = { ...mark("2026-03-02", {}), id: "C_u1__final" };
    expect(splitMarkings([mark("2026-03-01", {}), byKind]).final).toBe(byKind);
    expect(splitMarkings([mark("2026-03-01", {}), bySuffix]).daily).toHaveLength(1);
  });
});
