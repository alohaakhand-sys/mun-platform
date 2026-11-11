/**
 * Who a coupon is for, and when a meal runs (setup/qr-passes-plan.md). Pure, so the organizer's
 * editors and the scan route share one definition. A person's group comes from their event
 * member marker (`events/{id}/members/{uid}`: kind + role), the same fact the rules trust.
 */

export type AudienceGroup = "delegate" | "observer" | "faculty" | "eb" | "staff";

export interface PassAudience {
  groups: AudienceGroup[];
  /** Named people (Pro coupons); a uid here is eligible whatever their group. */
  uids?: string[];
}

export const AUDIENCE_GROUPS: { key: AudienceGroup; label: string }[] = [
  { key: "delegate", label: "Delegates" },
  { key: "observer", label: "Observers" },
  { key: "faculty", label: "Faculty & team leads" },
  { key: "eb", label: "EB & chairs" },
  { key: "staff", label: "Other staff & organizers" },
];

/** A meal slot saved before audiences existed keeps its old reach: approved applicants. */
export const DEFAULT_MEAL_AUDIENCE: AudienceGroup[] = ["delegate", "observer", "faculty"];

export interface MemberFacts { kind: "organizer" | "staff" | "applicant"; role: string }

/** The audience group a member falls in (mirrors staffService's role helpers). */
export function groupOf(m: MemberFacts): AudienceGroup {
  const r = (m.role || "").toLowerCase();
  if (m.kind === "applicant") {
    if (r.includes("faculty") || (r.includes("team") && (r.includes("lead") || r.includes("head")))) return "faculty";
    if (r.includes("observer")) return "observer";
    return "delegate";
  }
  if (m.kind === "staff") {
    if (r === "director" || r === "usg" || r === "eb") return "eb";
    if (r !== "co-organizer" && r.includes("chair")) return "eb";
    if (r.includes("faculty")) return "faculty";
  }
  return "staff";
}

export function inAudience(uid: string, m: MemberFacts, audience: PassAudience | undefined, fallback: AudienceGroup[]): boolean {
  if (audience?.uids?.includes(uid)) return true;
  const groups = audience?.groups?.length ? audience.groups : fallback;
  return groups.includes(groupOf(m));
}

export function audienceLabel(audience: PassAudience | undefined, fallback: AudienceGroup[]): string {
  const groups = audience?.groups?.length ? audience.groups : fallback;
  if (groups.length === AUDIENCE_GROUPS.length) return "Everyone";
  const names = AUDIENCE_GROUPS.filter((g) => groups.includes(g.key)).map((g) => g.label);
  const extra = audience?.uids?.length ? [`${audience.uids.length} named`] : [];
  return [...names, ...extra].join(", ") || "Nobody";
}

/**
 * A meal's time window from the organizer's free text ("12:30 – 14:00", "1:00 PM - 2:00 PM"),
 * as minutes after midnight. Null when it can't be read; then no time check applies.
 */
export function parseTimeWindow(text: string | undefined): { start: number; end: number } | null {
  const times = [...String(text || "").matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*([ap]\.?m\.?)?/gi)]
    .filter((m) => m[2] !== undefined || m[3] !== undefined);
  if (times.length < 2) return null;
  const toMin = (m: RegExpMatchArray, otherAmPm?: string) => {
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    const ap = (m[3] || otherAmPm || "").toLowerCase().replace(/\./g, "");
    if (h > 23 || min > 59) return NaN;
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return h * 60 + min;
  };
  // "1:00 - 2:00 PM": the end's am/pm carries to the start. A bare hour ("1 - 2 PM") isn't read,
  // so "Day 1" never passes for a time.
  const end = toMin(times[1]);
  const start = toMin(times[0], times[0][3] ? undefined : times[1][3]);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return { start, end };
}

/** Minutes after midnight now, in the event's time zone (falls back to the server's). */
export function minutesNow(timeZone?: string, now = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timeZone || undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    return h * 60 + m;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export interface EventDay { key: string; label: string; date: string | null }

/** YYYY-MM-DD of an instant in the event's time zone. */
export function dateIn(ms: number, timeZone?: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString().slice(0, 10); }
}

/**
 * The event's days for check-in and rides: "Day 1"… from the start to the end date (1 to 7),
 * or two days when the dates are unknown. The app's dayLabels counts the same way, so `d1`, `d2`
 * name the same day everywhere.
 */
export function eventDays(startMs: number | null, endDate: string | undefined, timeZone?: string): EventDay[] {
  const start = startMs != null && Number.isFinite(startMs) ? dateIn(startMs, timeZone) : null;
  const end = /^\d{4}-\d{2}-\d{2}/.test(endDate || "") ? String(endDate).slice(0, 10) : null;
  const span = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 : 0;
  const n = span >= 1 ? Math.min(7, span) : 2;
  return Array.from({ length: n }, (_, i) => ({
    key: `d${i + 1}`,
    label: `Day ${i + 1}`,
    date: start ? new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10) : null,
  }));
}

/** Everyone in the event: the audience of a check-in. */
export const ALL_GROUPS: AudienceGroup[] = ["delegate", "observer", "faculty", "eb", "staff"];
