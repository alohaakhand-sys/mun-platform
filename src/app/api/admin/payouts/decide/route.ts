import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { logAuditServer } from "@/lib/server/auditServer";

/**
 * POST { payoutId, status: "paid" | "rejected", note?, reference? }: the admin settles a pending
 * payout (the transfer itself happens off-platform), the organizer is notified, and the audit
 * entry is written here.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { payoutId, status, note, reference } = (await req.json().catch(() => ({}))) as Record<string, string>;
  if (!payoutId || (status !== "paid" && status !== "rejected")) {
    return NextResponse.json({ error: "payoutId and status (paid | rejected) required." }, { status: 400 });
  }
  const ref = adminDb.collection("payoutRequests").doc(payoutId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Payout not found." }, { status: 404 });
  const p = snap.data() as any;
  if (p.status !== "pending") return NextResponse.json({ error: `Already ${p.status}.` }, { status: 400 });

  const adminNote = String(note || "").trim().slice(0, 500);
  const ref2 = String(reference || "").trim().slice(0, 120);
  await ref.update({
    status, processedAt: FieldValue.serverTimestamp(), processedBy: auth.uid,
    ...(adminNote ? { adminNote } : {}), ...(ref2 ? { reference: ref2 } : {}),
  });
  const amount = `$${Number(p.amount || 0).toLocaleString()}`;
  await adminDb.collection("notifications").add({
    uid: p.organizerId, type: "payout", read: false, createdAt: FieldValue.serverTimestamp(),
    title: status === "paid" ? `Payout of ${amount} sent` : `Payout of ${amount} declined`,
    body: (adminNote || (status === "paid" ? `Reference: ${ref2 || "—"}` : "The MUN Pilot team declined this payout request.")).slice(0, 300),
    href: "/dashboard/organizer/financials",
  });
  await logAuditServer({
    actorUid: auth.uid, action: status === "paid" ? "payout_marked_paid" : "payout_rejected",
    targetType: "payoutRequest", targetId: payoutId, targetName: `${p.organizerName || p.organizerId} — ${amount}`,
    before: { status: "pending" }, after: { status, reference: ref2 || undefined, note: adminNote || undefined },
  });
  return NextResponse.json({ ok: true });
}
