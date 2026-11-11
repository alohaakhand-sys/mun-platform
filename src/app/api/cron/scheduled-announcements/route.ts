import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { cronRefusal } from "@/lib/server/cronAuth";

export const dynamic = "force-dynamic";

// Every 15 minutes: sends scheduled announcements whose time has come, through the normal send
// route (internal call, sent in place). Replaces the dispatchScheduledAnnouncements and
// processAnnouncement Cloud Functions. One collection-group query (fieldOverride announcements.status).
export async function GET(req: Request) {
  const refused = cronRefusal(req);
  if (refused) return refused;
  const now = Date.now();
  const snap = await adminDb.collectionGroup("announcements").where("status", "==", "scheduled").get();
  const due = snap.docs.filter((d) => {
    const at = Number((d.data() as any).scheduledAt) || 0;
    return at > 0 && at <= now;
  });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const d of due) {
    const a = d.data() as any;
    const eventId = d.ref.parent.parent?.id;
    if (!eventId) continue;
    // Claim it first, so an overlapping run can't send it twice.
    const claimed = await adminDb.runTransaction(async (tx) => {
      const cur = await tx.get(d.ref);
      if ((cur.data() as any)?.status !== "scheduled") return false;
      tx.update(d.ref, { status: "queued" });
      return true;
    });
    if (!claimed) continue;
    let ok = false;
    let error = "";
    try {
      const res = await fetch(`${origin}/api/announcements/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": process.env.CRON_SECRET || "" },
        body: JSON.stringify({
          eventId, subject: a.subject, body: a.body, audience: a.audience,
          sentBy: a.sentBy || "", recipientCount: a.recipientCount || 0, existingId: d.id,
        }),
      });
      ok = res.ok;
      if (!ok) error = String((await res.json().catch(() => ({})))?.error || `Send failed (${res.status})`);
    } catch (e) {
      error = String(e);
    }
    if (!ok) await d.ref.update({ status: "failed", errorMessage: error.slice(0, 300) });
    results.push({ id: d.id, ok, ...(error ? { error } : {}) });
  }
  return NextResponse.json({ ok: true, checked: snap.size, sent: results.filter((r) => r.ok).length, results });
}
