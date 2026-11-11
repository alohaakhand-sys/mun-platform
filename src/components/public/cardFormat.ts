/**
 * Display helpers for the public homepage. Pure formatting only — no fetching, no
 * Firestore types beyond what the two services already export — so the homepage
 * card components stay dumb and these stay testable.
 */

import {
  EventData,
  getApplicationTimeline,
  getEnabledRoleTiers,
  getEffectiveRoleUnitPrice,
  getEventStartMs,
} from "@/lib/services/eventService";
import { formatFee } from "@/lib/services/paymentGate";

/**
 * `Sat, 12 September` — the press-sheet date line above a card title. Built from two
 * formatters on purpose: asking en-GB for weekday+day+month in one pass yields
 * "Sat 12 September", and the comma is what makes it read as a dateline.
 */
export function formatCardDate(ms: number): string {
  if (!Number.isFinite(ms)) return "Date to be announced";
  const d = new Date(ms);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(d);
  const rest = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(d);
  return `${weekday}, ${rest}`;
}

/** `Friday, 12 September 2026` — the longer form the hero slab can afford. */
export function formatSlideDate(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}

/**
 * The cheapest way into the conference: `Free`, `$750`, or null when the organiser
 * has not configured any accepted role yet (in which case the card simply omits the
 * price rather than claiming the event is free).
 *
 * Phase-aware — it asks `getEffectiveRoleUnitPrice`, so an event currently in its
 * early-bird window advertises the early-bird figure, exactly like the wizard does.
 */
export function formatFromPrice(event: EventData): string | null {
  const tiers = getEnabledRoleTiers(event);
  if (tiers.length === 0) return null;
  const prices = tiers.map((t) => getEffectiveRoleUnitPrice(event, t).price);
  const min = Math.min(...prices);
  if (!Number.isFinite(min)) return null;
  return min <= 0 ? "Free" : formatFee(min);
}

// Words that never belong in an acronym.
const STOPWORDS = new Set([
  "of", "the", "and", "for", "on", "in", "to", "a", "an", "at", "by",
]);

/**
 * The word stamped on a card placard. Committees are stored free-text, so this
 * handles the three shapes organisers actually type:
 *   "UNSC"                              -> UNSC   (already an acronym)
 *   "Security Council (UNSC)"           -> UNSC   (parenthetical wins)
 *   "United Nations Security Council"   -> UNSC   (initials, stopwords dropped)
 * Falls back to the event title's initials when an event has no committees yet.
 */
export function placardLabel(event: EventData): string {
  const first = event.committees?.[0]?.name?.trim();
  const source = first || event.title || "MUN";

  const paren = source.match(/\(([A-Za-z0-9]{2,8})\)/);
  if (paren) return paren[1].toUpperCase();

  const bare = source.replace(/\(.*?\)/g, "").trim();
  if (bare.length <= 8 && !bare.includes(" ")) return bare.toUpperCase();

  const acronym = bare
    .split(/[\s-]+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()))
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);

  return acronym || bare.slice(0, 6).toUpperCase();
}

/** `MP` — two-letter monogram for a byline avatar. */
export function initials(name?: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MP";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * `5 min read`. Article bodies are markdown (the tiptap editor writes markdown under
 * the hood), so strip the syntax before counting or a link-heavy guide reads long.
 */
export function readingTime(content?: string): string {
  const words = (content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~\-|]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

/**
 * `Sat, 15 August 2026 · 9:00 AM` — an event's start as a person reads it. Events store
 * `date` as an ISO-ish string ("2026-08-15T09:00"), which the detail page used to print
 * verbatim. Falls back to that raw string when it won't parse, so nothing disappears.
 */
export function formatEventWhen(ms: number, raw?: string): string {
  if (!Number.isFinite(ms)) return raw || "Date to be announced";
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  }).format(d);
  const [wd, ...rest] = day.split(" ");
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  return `${wd.replace(/,$/, "")}, ${rest.join(" ")} · ${time}`;
}

/** `In-person` / `Online` / `Hybrid` — the stamp on a detailed card's placard. */
export function formatLabel(event: EventData): string {
  return event.format === "online" ? "Online" : event.format === "hybrid" ? "Hybrid" : "In-person";
}

/** The location line on a card — falls back to the format for online events. */
export function locationLabel(event: EventData): string {
  const loc = event.locationName || event.location;
  if (loc && loc.trim()) return loc.trim();
  return event.format === "online" ? "Online" : "Venue to be announced";
}

/**
 * When an event is over (epoch ms): its end date/time when the organiser set one,
 * otherwise the end of its start day. NaN when the start is unknown too.
 */
export function eventEndMs(event: EventData): number {
  const e = event as EventData & { endDate?: string; endTime?: string };
  if (e.endDate) {
    const t = new Date(`${e.endDate}T${e.endTime || "23:59"}`).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const start = getEventStartMs(event);
  if (!Number.isFinite(start)) return NaN;
  const d = new Date(start);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** `10 Nov` — short day + month for deadline chips. */
export function formatShortDate(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(ms));
}

/**
 * Application status chip for an event card (P01): whether applications are open right
 * now, read from the shared application timeline (the same source the wizard and the
 * Firestore rules gate on). Finished events say "Ended"; events under way get no chip.
 */
export function applicationTag(
  event: EventData,
  now: Date = new Date()
): { label: string; tone: "ok" | "wait" | "mute" } | null {
  const t0 = now.getTime();
  const end = eventEndMs(event);
  if (Number.isFinite(end) && t0 > end) return { label: "Ended", tone: "mute" };
  // Under way: no application chip (the /events card says "Happening now").
  const start = getEventStartMs(event);
  if (Number.isFinite(start) && t0 >= start) return null;
  const t = getApplicationTimeline(event, now);
  if (t.phase === "closed") return { label: "Applications closed", tone: "mute" };
  if (t.phase === "early") {
    return {
      label: t.earlyEndAt != null ? `Early bird · ends ${formatShortDate(t.earlyEndAt)}` : "Early bird",
      tone: "wait",
    };
  }
  if (t.phase === "late") return { label: "Late price", tone: "wait" };
  return { label: "Applications open", tone: "ok" };
}

/**
 * `Applications close 10 Nov.` — the deadline line on a hero slide. Null when the
 * close moment is unknown or already past.
 */
export function closesLine(event: EventData, now: Date = new Date()): string | null {
  const t = getApplicationTimeline(event, now);
  if (!t.isOpen || Number.isNaN(t.closeAt)) return null;
  return `Applications close ${formatShortDate(t.closeAt)}.`;
}
