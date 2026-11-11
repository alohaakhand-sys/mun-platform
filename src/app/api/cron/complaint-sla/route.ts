import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { cronRefusal } from "@/lib/server/cronAuth";

export const dynamic = "force-dynamic";

const SLA_MS = 48 * 60 * 60 * 1000;

// Every 6 hours: an open or escalated complaint with no action for 48h moves up a level
// (1 organizer, 2 main organizer when there is one, else 3 App Admin) and the new handler gets a
// notification (the complaintSlaCheck Cloud Function, now run by Coolify).
export async function GET(req: Request) {
  const refused = cronRefusal(req);
  if (refused) return refused;
  const now = Date.now();
  const [open, escalated] = await Promise.all([
    adminDb.collection("complaints").where("status", "==", "open").get(),
    adminDb.collection("complaints").where("status", "==", "escalated").get(),
  ]);
  let adminUid: string | null | undefined;
  const firstAdmin = async () => {
    if (adminUid !== undefined) return adminUid;
    const a = await adminDb.collection("users").where("role", "==", "App Admin").limit(1).get();
    adminUid = a.empty ? null : a.docs[0].id;
    return adminUid;
  };
  let moved = 0;
  for (const doc of [...open.docs, ...escalated.docs]) {
    const c = doc.data() as any;
    const last = c.escalatedAt?.toMillis?.() ?? c.createdAt?.toMillis?.() ?? now;
    if (now - last <= SLA_MS) continue;
    const level = Number(c.escalationLevel) || 0;
    if (level >= 3) continue; // already with the App Admin
    const ev = c.eventId ? ((await adminDb.collection("events").doc(c.eventId).get()).data() as any) : null;
    let next = level + 1;
    let role = "";
    let to: string | null = null;
    if (next === 1) { role = "organizer"; to = ev?.organizerId || null; }
    else if (next === 2 && ev?.mainOrganizerId) { role = "mainOrganizer"; to = ev.mainOrganizerId; }
    else { next = 3; role = "appAdmin"; to = await firstAdmin(); }
    await doc.ref.update({
      status: "escalated", escalationLevel: next, assignedRole: role, assignedTo: to, escalatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion({ action: "escalated", actorUid: "system", actorRole: "system", message: "SLA: auto-escalated after 48h inactivity.", timestamp: new Date().toISOString() }),
      actorUids: FieldValue.arrayUnion(...["system", ...(to ? [to] : [])]),
    });
    if (to) {
      await adminDb.collection("notifications").add({
        uid: to, type: "complaint_escalated", eventId: c.eventId || "", read: false, createdAt: FieldValue.serverTimestamp(),
        title: "A complaint was escalated to you", body: String(c.subject || "No action for 48 hours.").slice(0, 300),
        href: next === 3 ? "/dashboard/admin/complaints" : `/dashboard/organizer/events/${c.eventId}/complaints`,
      });
    }
    moved++;
  }
  return NextResponse.json({ ok: true, checked: open.size + escalated.size, escalated: moved });
}
