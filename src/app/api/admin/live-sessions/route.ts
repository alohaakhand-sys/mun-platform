import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";

// App-admin live-session monitor: list every running committee session across all events,
// and force-close one. Uses the Admin SDK (bypasses rules) after verifying the caller is an
// app admin — mirrors the auth pattern in src/app/api/announcements/send.
export const dynamic = "force-dynamic";


const isPresent = (s?: string) => s === "present" || s === "present_and_voting";
const toMs = (t: any): number => (typeof t?.toMillis === "function" ? t.toMillis() : 0);

// ── Read-quota guards (the project runs on the Firestore Spark plan: 50k reads/day) ──
// This route used to scan the whole "sessions" collection group, costing one read per session
// doc that had ever existed — an unbounded, ever-growing bill on a hard 50k/day cap. It now
// reads the `liveSessions` registry (see registerLiveSession in sessionService), so the cost is
// ~2 reads per CURRENTLY RUNNING session. Two further guards:
//   1. a process-wide cache — every admin tab shares one refresh per SCAN_TTL_MS;
//   2. a permanent event-title cache — titles are re-read only for events we've never seen.
// On quota exhaustion we serve the last good snapshot rather than 500-ing, so the UI can
// say what happened instead of hammering a dead backend.
const SCAN_TTL_MS = 60_000;
const MAX_TRACKED = 100;
let scanCache: { at: number; sessions: any[] } | null = null;
const titleCache = new Map<string, string>();

async function eventTitle(eventId: string): Promise<string> {
  const hit = titleCache.get(eventId);
  if (hit !== undefined) return hit;
  const e = await adminDb.collection("events").doc(eventId).get();
  const title = ((e.data() as any)?.title) || "Untitled event";
  titleCache.set(eventId, title);
  return title;
}

async function scanSessions() {
  const index = await adminDb.collection("liveSessions").limit(MAX_TRACKED).get();
  const entries = index.docs
    .map((d) => ({ indexId: d.id, ...(d.data() as any) }))
    .filter((e) => e.eventId && e.sessionId);
  if (entries.length === 0) return [];

  // One batched read for the referenced session docs. The registry is only a hint — a chair
  // who closed their laptop mid-session leaves an orphan — so the session doc still decides
  // whether a row is really running, and dead entries get pruned here.
  const refs = entries.map((e) =>
    adminDb.collection("events").doc(e.eventId).collection("sessions").doc(e.sessionId));
  const snaps = await adminDb.getAll(...refs);

  const stale: string[] = [];
  const live: { entry: any; s: any }[] = [];
  snaps.forEach((snap, i) => {
    const entry = entries[i];
    const s = snap.exists ? (snap.data() as any) : null;
    if (!s || s.phase === "closed" || s.finalized) stale.push(entry.indexId);
    else live.push({ entry, s });
  });
  // Fire-and-forget: pruning is housekeeping, and a failed delete just costs one read next time.
  if (stale.length) {
    const batch = adminDb.batch();
    stale.forEach((id) => batch.delete(adminDb.collection("liveSessions").doc(id)));
    batch.commit().catch((e) => console.error("[admin/live-sessions] prune", e));
  }

  const sessions = await Promise.all(live.map(async ({ entry, s }) => {
    const attendance = s.attendance || {};
    const present = Object.values(attendance).filter((a: any) => isPresent(a?.status)) as any[];
    const stage: string[] = s.live?.stage || [];
    const speaker =
      s.gsl?.activeSpeaker?.country ||
      (stage.length ? (attendance[stage[0]]?.country || "") : "");
    return {
      eventId: entry.eventId,
      sessionId: entry.sessionId,
      eventTitle: await eventTitle(entry.eventId),
      committeeId: s.committeeId || entry.committeeId || "",
      dateStr: s.dateStr || entry.dateStr || "",
      phase: s.phase || "",
      presentCount: present.length,
      totalDelegates: Object.keys(attendance).length,
      presentCountries: present.map((a) => a.country).filter(Boolean).slice(0, 40),
      onStageCount: stage.length,
      currentSpeaker: speaker,
      updatedAtMs: Math.max(toMs(s.updatedAt), s.live?.keepAliveAt || 0),
      createdAtMs: toMs(s.createdAt),
    };
  }));

  sessions.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return sessions;
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const fresh = scanCache && Date.now() - scanCache.at < SCAN_TTL_MS;
  if (fresh) return NextResponse.json({ sessions: scanCache!.sessions, cachedAtMs: scanCache!.at });

  try {
    const sessions = await scanSessions();
    scanCache = { at: Date.now(), sessions };
    return NextResponse.json({ sessions, cachedAtMs: scanCache.at });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const quotaExceeded = (e as any)?.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(message);
    console.error("[admin/live-sessions] GET", message);
    // Quota is a project-wide daily cap, not a bug — tell the client so it stops polling.
    if (scanCache) {
      return NextResponse.json({
        sessions: scanCache.sessions, cachedAtMs: scanCache.at, stale: true, quotaExceeded,
      });
    }
    return NextResponse.json(
      { error: quotaExceeded ? "Firestore daily read quota exhausted" : "Failed to load sessions", quotaExceeded },
      { status: quotaExceeded ? 429 : 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => ({}));
    const eventId = String(body.eventId || "");
    const sessionId = String(body.sessionId || "");
    if (!eventId || !sessionId) {
      return NextResponse.json({ error: "eventId and sessionId required" }, { status: 400 });
    }
    // Force-close → phase "closed". The clients' useAgoraLive watches phase and tears the
    // live video down for everyone; the console locks its controls.
    await adminDb.collection("events").doc(eventId).collection("sessions").doc(sessionId)
      .update({ phase: "closed" });
    // Drop it from the live registry — the chair client isn't the one closing it here, so
    // sessionService's unregisterLiveSession never runs. Keep the ID scheme in sync with
    // `liveIndexId` there.
    await adminDb.collection("liveSessions").doc(`${eventId}__${sessionId}`).delete().catch(() => {});
    scanCache = null; // force the next poll to reflect the close immediately
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin/live-sessions] POST", message);
    return NextResponse.json({ error: "Failed to stop session" }, { status: 500 });
  }
}
