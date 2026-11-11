import { NextResponse } from "next/server";
import { adminDb, adminRtdb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { logAuditServer } from "@/lib/server/auditServer";

/**
 * DELETE: the App Admin removes an event for good: the event doc and everything under it (staff,
 * members, sessions, committee docs, announcements, waitlist…), its applications, its upgrade
 * requests and its live-membership mirror, so no orphan keeps counting toward wallets or caps.
 * Payout requests are the organizer's money history and stay.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ref = adminDb.collection("events").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const ev = snap.data() as any;

  const dropAll = async (q: FirebaseFirestore.Query) => {
    let n = 0;
    for (;;) {
      const page = await q.limit(400).get();
      if (page.empty) return n;
      const b = adminDb.batch();
      page.docs.forEach((d) => b.delete(d.ref));
      await b.commit();
      n += page.size;
    }
  };
  const applications = await dropAll(adminDb.collection("applications").where("eventId", "==", id));
  const requests = await dropAll(adminDb.collection("upgradeRequests").where("eventId", "==", id));
  await adminDb.recursiveDelete(ref);
  await adminRtdb().ref(`eventMembers/${id}`).remove().catch(() => {});

  await logAuditServer({
    actorUid: auth.uid, action: "event_deleted", targetType: "event", targetId: id, targetName: ev.title,
    before: { organizerId: ev.organizerId, status: ev.status, plan: ev.plan?.tier || "free" },
    after: { applicationsDeleted: applications, upgradeRequestsDeleted: requests },
  });
  return NextResponse.json({ ok: true, applications, requests });
}
