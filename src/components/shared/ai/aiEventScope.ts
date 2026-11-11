/**
 * The event the member is working in, read from the page address, so AI calls made inside a
 * Pro event don't count against the daily quota (src/lib/server/aiQuota.ts). Organizer event
 * pages, the conference portal and the chair's committee console all carry the event id.
 */
const EVENT_PATHS = [
  /^\/dashboard\/organizer\/events\/([A-Za-z0-9_-]+)/,
  /^\/dashboard\/conferences\/([A-Za-z0-9_-]+)/,
  /^\/dashboard\/chair\/committee\/([A-Za-z0-9_-]+)/,
];

export function currentAiEventId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const path = window.location.pathname;
  for (const re of EVENT_PATHS) {
    const m = path.match(re);
    if (m) return m[1];
  }
  return undefined;
}
