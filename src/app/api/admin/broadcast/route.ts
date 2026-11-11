import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { logAuditServer } from "@/lib/server/auditServer";

const MAX_RECIPIENTS = 2000; // a send is one write per person (Spark: 20k writes a day)

/**
 * POST { audience: "all" | "organizers" | "event", eventId?, title, body, href? }: an in-app
 * notification (the bell, and the phone's alerts) to everyone, every event owner, or one event's
 * members. Capped at 2,000 people per send.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { audience, eventId, title, body, href } = (await req.json().catch(() => ({}))) as Record<string, string>;
  const t = String(title || "").trim().slice(0, 120);
  const b = String(body || "").trim().slice(0, 600);
  if (!t || !b) return NextResponse.json({ error: "Title and message are required." }, { status: 400 });

  let uids: string[] = [];
  if (audience === "all") {
    uids = (await adminDb.collection("users").select().limit(MAX_RECIPIENTS + 1).get()).docs.map((d) => d.id);
  } else if (audience === "organizers") {
    uids = [...new Set((await adminDb.collection("events").select("organizerId").get()).docs.map((d) => String(d.get("organizerId") || "")).filter(Boolean))];
  } else if (audience === "event" && eventId) {
    uids = (await adminDb.collection("events").doc(eventId).collection("members").select().limit(MAX_RECIPIENTS + 1).get()).docs.map((d) => d.id);
  } else {
    return NextResponse.json({ error: "audience must be all, organizers, or event (with eventId)." }, { status: 400 });
  }
  if (uids.length > MAX_RECIPIENTS) return NextResponse.json({ error: `More than ${MAX_RECIPIENTS} people. Narrow the audience.` }, { status: 400 });

  const link = typeof href === "string" && href.startsWith("/") ? href.slice(0, 200) : "";
  for (let i = 0; i < uids.length; i += 400) {
    const batch = adminDb.batch();
    for (const uid of uids.slice(i, i + 400)) {
      batch.set(adminDb.collection("notifications").doc(), {
        uid, type: "broadcast", title: t, body: b, ...(link ? { href: link } : {}), ...(audience === "event" ? { eventId } : {}),
        read: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  await logAuditServer({ actorUid: auth.uid, action: "broadcast_sent", targetType: "notification", targetId: audience === "event" ? String(eventId) : audience, targetName: t, after: { recipients: uids.length } });
  return NextResponse.json({ ok: true, sent: uids.length });
}
