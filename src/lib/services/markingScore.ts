// Pure, Firebase-free scoring math for the percentage-based marking system.
// Single source of truth reused by the chair matrix, the delegate Results view,
// and the faculty/team panels. Unit-testable in isolation.
//
// Model (owner-confirmed):
//   - Every criterion is scored on a fixed -100..+100 scale (minus = penalty).
//   - Daily %   = average of the criteria the chair actually scored that day,
//                 blanks excluded, floored at 0, capped at 100.
//   - Final %   = consistency-first: average of daily %s over the conference days that
//                 COUNT, so a consistent delegate beats a one-day star. Which days count
//                 is decided by roll call, not by whether the chair got round to scoring:
//
//                   attended + scored          → the day's %                (counted)
//                   absent (roll call / chair)  → 0%, still in the denominator (counted)
//                   attended but unscored       → dropped from the denominator (excluded)
//                   no doc, no attendance record→ 0%, still in the denominator (counted)
//
//                 The third row is the whole point: a delegate who was in the room all
//                 day must not be given a zero because the chair never opened the matrix.
//                 The fourth keeps every pre-attendance marking doc scoring exactly as
//                 it did before.
//   - Final score = blend of computed % and the chair's manual holistic overall
//                   (0..100), weight `overallWeight` (default 0.30), applied only when
//                   the chair actually enters an overall.

import type { MarkingMode, MarkingTemplate } from "./eventService";
import type { Marking, MarkingAttendance } from "./markingService";

/** Roll-call states that mean the delegate was in the room. */
export function isAttended(s: MarkingAttendance | undefined): boolean {
  return s === "present" || s === "present_and_voting" || s === "late";
}

export const MARK_MIN = -100;
export const MARK_MAX = 100;
// Binary-mode criteria are scored on a −1/0/+1 scale; a multi-mark tally may
// leave the stored (mean) value anywhere in [−1, +1].
export const BINARY_MIN = -1;
export const BINARY_MAX = 1;
export const DEFAULT_OVERALL_WEIGHT = 0.30;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Normalise ONE criterion's raw stored value to its 0..100 contribution.
 *   - decimal: the value already lives on the ±100 percentage scale (may be
 *              negative — a penalty pulls the daily average down, floored later).
 *   - binary:  min-max map [−1, +1] → [0, 100]  ⇒  pct = 50·(x + 1).
 *              (−1 → 0%, 0 → 50%, +1 → 100%.)
 */
export function criterionPct(raw: number, mode: MarkingMode): number {
  if (mode === "binary") {
    return 50 * (clamp(raw, BINARY_MIN, BINARY_MAX) + 1);
  }
  return clamp(raw, MARK_MIN, MARK_MAX);
}

/** A criterion counts as "scored" only when a finite number is present (0 is valid; blank/NaN is not). */
export function isScored(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export interface DailyRow {
  id: string;
  name: string;
  value: number | null; // null = not scored this day
}

export interface DailyScore {
  dateStr?: string;
  pct: number | null;    // null when nothing was scored that day (absent)
  scoredCount: number;
  sum: number;
  rows: DailyRow[];
  present: boolean;      // true when at least one criterion was scored
  attendanceStatus?: MarkingAttendance; // roll call's verdict, when it was recorded
  /**
   * Whether this day is in the final's denominator. False only for the
   * attended-but-unscored case; see the model note at the top of the file.
   * Set by computeFinalScore — a standalone daily score always reports true.
   */
  counted: boolean;
}

/**
 * Daily % = clamp( sum(scored criteria's 0..100 contributions) / scoredCount, 0, 100 );
 * null when nothing scored. Each criterion's contribution is normalised by `criterionPct`
 * according to the marking mode. The doc's own `markMode` wins over `fallbackMode`, so a
 * later event-level mode flip never misreads already-stored values.
 */
export function computeDailyScore(
  marking: Pick<Marking, "scores" | "dateStr" | "markMode" | "attendanceStatus"> | undefined,
  templates: MarkingTemplate[],
  fallbackMode: MarkingMode = "decimal",
): DailyScore {
  const scores = marking?.scores || {};
  const mode: MarkingMode = marking?.markMode ?? fallbackMode;
  const rows: DailyRow[] = [];
  let sum = 0;
  let scoredCount = 0;
  for (const t of templates) {
    const raw = scores[t.id];
    if (isScored(raw)) {
      const v = criterionPct(raw, mode);
      rows.push({ id: t.id, name: t.name, value: v });
      sum += v;
      scoredCount += 1;
    } else {
      rows.push({ id: t.id, name: t.name, value: null });
    }
  }
  const pct = scoredCount > 0 ? clamp(sum / scoredCount, 0, 100) : null;
  return {
    dateStr: marking?.dateStr, pct, scoredCount, sum, rows,
    present: scoredCount > 0,
    attendanceStatus: marking?.attendanceStatus,
    counted: true, // computeFinalScore decides this across the day set
  };
}

/** Sorted, distinct conference-day set. Explicit override wins; else derived from daily marks. */
export function deriveDays(dailyMarkings: Pick<Marking, "dateStr">[], override?: string[]): string[] {
  if (override && override.length) return Array.from(new Set(override)).sort();
  const set = new Set<string>();
  for (const m of dailyMarkings) if (m.dateStr) set.add(m.dateStr);
  return Array.from(set).sort();
}

/** Split a delegate's mixed markings into their daily docs and the single final-rollup doc. */
export function splitMarkings(all: Marking[]): { daily: Marking[]; final: Marking | null } {
  const final = all.find(m => m.kind === "final" || m.id?.endsWith("__final")) || null;
  const daily = all.filter(m => m !== final && m.kind !== "final" && !m.id?.endsWith("__final"));
  return { daily, final };
}

export interface FinalScore {
  finalScore: number;          // 0..100 blended
  computedPct: number;         // 0..100 consistency-first aggregate (rounded to 0.1)
  chairOverall: number | null; // echo of the input (null when not given)
  overallWeight: number;       // effective weight used (0 when no overall)
  dayCount: number;            // N — days in the denominator (excludes attended-unscored)
  totalDays: number;           // every conference day, counted or not
  presentDays: number;         // days with ≥1 scored criterion
  excludedDays: number;        // attended-but-unscored days dropped from the denominator
  daily: DailyScore[];         // per-day breakdown, aligned to the day set
}

/**
 * Final score for ONE delegate.
 *   computedPct = Σ over the COUNTED days ( scored ? dailyPct : 0 ) / (number of counted days)
 *   finalScore  = round( (1-w)·computedPct + w·chairOverall ),  w applied only if overall given
 *
 * A day is counted unless the delegate was recorded present and the chair never scored
 * them — see the model note at the top of the file.
 */
export function computeFinalScore(
  dailyMarkings: Marking[],
  templates: MarkingTemplate[],
  days: string[],
  chairOverall: number | null | undefined,
  overallWeight: number = DEFAULT_OVERALL_WEIGHT,
  fallbackMode: MarkingMode = "decimal",
): FinalScore {
  const dayset = days && days.length ? Array.from(new Set(days)).sort() : deriveDays(dailyMarkings);
  const totalDays = dayset.length;

  // First daily doc per day (deterministic ids mean there's at most one).
  const byDay = new Map<string, Marking>();
  for (const m of dailyMarkings) {
    if (m.dateStr && !byDay.has(m.dateStr)) byDay.set(m.dateStr, m);
  }

  const daily: DailyScore[] = dayset.map(d => {
    const ds = computeDailyScore(byDay.get(d), templates, fallbackMode);
    // The one exclusion: the delegate was in the room and simply wasn't scored. Every
    // other shape — absent, or no record at all — keeps its 0 in the denominator, which
    // is what makes the aggregate consistency-first.
    const counted = !(isAttended(ds.attendanceStatus) && !ds.present);
    return { ...ds, dateStr: d, counted };
  });

  const presentDays = daily.filter(d => d.present).length;
  const countedDays = daily.filter(d => d.counted);
  const N = countedDays.length;
  const numerator = countedDays.reduce((acc, d) => acc + (d.present && d.pct != null ? d.pct : 0), 0);
  const rawComputed = N > 0 ? numerator / N : 0;

  // The chair's holistic overall is entered on the event's marking scale, so it's
  // normalised to 0..100 the same way a criterion is before blending.
  const hasOverall = isScored(chairOverall);
  const overallPct = hasOverall ? criterionPct(chairOverall as number, fallbackMode) : 0;
  const w = hasOverall ? clamp(overallWeight, 0, 1) : 0;
  const rawFinal = (1 - w) * rawComputed + w * overallPct;

  return {
    finalScore: Math.round(clamp(rawFinal, 0, 100)),
    computedPct: Math.round(rawComputed * 10) / 10,
    chairOverall: hasOverall ? (chairOverall as number) : null,
    overallWeight: w,
    dayCount: N,
    totalDays,
    presentDays,
    excludedDays: totalDays - N,
    daily,
  };
}
