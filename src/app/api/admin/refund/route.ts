import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { logAuditServer } from "@/lib/server/auditServer";

/**
 * POST { applicationId, note? }: the admin records a refund the gateway has already sent back
 * (Stripe / ZiniPay dashboard; the money itself is not moved here). The registration stops
 * counting as paid: the organizer's wallet and revenue drop it. The seat is the organizer's call.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { applicationId, note } = (await req.json().catch(() => ({}))) as Record<string, string>;
  if (!applicationId) return NextResponse.json({ error: "applicationId required." }, { status: 400 });
  const ref = adminDb.collection("applications").doc(applicationId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  const a = snap.data() as any;
  if (a.paymentStatus !== "paid") return NextResponse.json({ error: "Only a paid registration can be refunded." }, { status: 400 });

  const refundNote = String(note || "").trim().slice(0, 500);
  await ref.update({ paymentStatus: "refunded", refundedAt: FieldValue.serverTimestamp(), refundedBy: auth.uid, ...(refundNote ? { refundNote } : {}) });
  const amount = `$${Number(a.paidAmount || 0).toLocaleString()}`;
  if (a.userId) await adminDb.collection("notifications").add({
    uid: a.userId, type: "refund", eventId: a.eventId || "", read: false, createdAt: FieldValue.serverTimestamp(),
    title: `Refund of ${amount} recorded`, body: (refundNote || "Your registration fee was refunded.").slice(0, 300),
    href: "/dashboard/payments",
  });
  await logAuditServer({
    actorUid: auth.uid, action: "payment_refunded", targetType: "application", targetId: applicationId,
    targetName: `${a.applicantName || a.userId} — ${amount}`, before: { paymentStatus: "paid" }, after: { paymentStatus: "refunded", note: refundNote || undefined },
  });
  return NextResponse.json({ ok: true });
}
