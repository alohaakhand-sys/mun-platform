import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireUid } from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

// Requester withdraws their own pending migration request.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ref = adminDb.collection("migrationRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const m = snap.data() as any;

  if (m.requesterUid !== uid) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (m.status !== "pending") {
    return NextResponse.json({ error: "Only a pending request can be cancelled." }, { status: 400 });
  }

  await ref.update({ status: "cancelled", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true, status: "cancelled" });
}
