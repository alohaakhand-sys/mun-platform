/**
 * Closes committee sittings left open from an earlier day.
 *
 * A sitting only closes when someone closes it: the chair's Close button, the chair console's
 * idle guard, an adjourn motion, or an admin force-stop. A chair who just shuts the laptop leaves
 * the session doc at `phase: "gsl"` forever. Live Control then lists it as running, the admin
 * monitor counts it, and its `live.stage` keeps minting a publisher token for whoever was last on
 * the floor. A session id is per day (`makeSessionId`), so yesterday's doc is never the one
 * anyone joins again: closing it loses nothing.
 *
 * Called by the daily cron route (api/cron/close-stale-sittings). The client twins, which close
 * one committee's or one event's leftovers, are `closeStaleSitting` in sessionService.
 *
 * Reads: one bounded collection-group query (`phase != "closed"`, limit) plus one event doc per
 * distinct event. Stays far inside the Spark budget because every run shrinks the set it scans.
 *
 * Server-only (admin SDK). Import from API routes, never from client components.
 */
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { sessionDateStr } from "@/lib/services/sessionDate";

const SCAN_LIMIT = 300;

export interface StaleSweepResult {
  scanned: number;
  closed: { eventId: string; sessionId: string; dateStr: string }[];
}

export async function closeStaleSittings(now: Date = new Date()): Promise<StaleSweepResult> {
  const snap = await adminDb.collectionGroup("sessions")
    .where("phase", "!=", "closed")
    .limit(SCAN_LIMIT)
    .get();

  const todayByEvent = new Map<string, string>();
  const closed: StaleSweepResult["closed"] = [];

  for (const d of snap.docs) {
    // Ceremonies are event-wide rooms with no day; the organizer ends them.
    if (d.id.startsWith("__ceremony__")) continue;
    const eventId = d.ref.parent.parent?.id;
    const s = d.data();
    const dateStr = String(s.dateStr || "");
    if (!eventId || !dateStr) continue;

    let today = todayByEvent.get(eventId);
    if (today === undefined) {
      const ev = await adminDb.collection("events").doc(eventId).get();
      today = sessionDateStr((ev.data() || {}).timeZone, now);
      todayByEvent.set(eventId, today);
    }
    // Strictly before today in the event's own timezone: a sitting running past midnight
    // tonight is still today's until the next run.
    if (dateStr >= today) continue;

    await d.ref.update({
      phase: "closed",
      "live.stage": [],
      "live.updatedAt": FieldValue.serverTimestamp(),
      autoClosedAt: FieldValue.serverTimestamp(),
    });
    // Keep in sync with `liveIndexId` in sessionService, as the admin force-stop route does.
    await adminDb.collection("liveSessions").doc(`${eventId}__${d.id}`).delete().catch(() => {});
    closed.push({ eventId, sessionId: d.id, dateStr });
  }
  return { scanned: snap.size, closed };
}
