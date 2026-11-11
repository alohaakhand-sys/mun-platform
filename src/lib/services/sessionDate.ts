/**
 * The session-day string, `YYYY-MM-DD`.
 *
 * A session id is `${committeeId}__${dateStr}` (see `makeSessionId`), so every participant
 * MUST agree on the day or they silently resolve different session documents — the delegate
 * lands on "No live session right now" while the chair sees a running committee, with no
 * diagnostic anywhere.
 *
 * The day is therefore taken in the EVENT's timezone, not the viewer's. A delegate dialling in
 * from another country resolves the same day as the chair sitting in the room.
 *
 * Older events predate `timeZone` and leave it unset; those fall back to the viewer's local
 * date, which is the previous behaviour.
 *
 * KNOWN REMAINING GAP: a sitting that crosses midnight in the event's own timezone still rolls
 * to a new id, so someone joining at 00:05 computes tomorrow while the chair's document is on
 * yesterday. Fixing that needs session *discovery* (query the committee's open session) rather
 * than id computation, which is deliberately out of scope here.
 *
 * Pure — no Firebase import, so server routes can use it too.
 */

/** Local-date fallback for events with no timezone set. */
function localDateStr(now: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;
}

/**
 * `YYYY-MM-DD` for `now` as seen in `timeZone` (an IANA name, e.g. "Asia/Dhaka").
 * Falls back to the viewer's local date when the zone is absent or unrecognised.
 */
export function sessionDateStr(timeZone?: string | null, now: Date = new Date()): string {
  if (timeZone) {
    try {
      // en-CA renders as YYYY-MM-DD, which is exactly the id format.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      // Unrecognised IANA zone — fall through rather than break the session.
    }
  }
  return localDateStr(now);
}
