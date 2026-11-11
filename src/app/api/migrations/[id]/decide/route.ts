import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  requireUid,
  isEventOrganizer,
  notifyUser,
  findOccupant,
  setAssignment,
  resyncCommitteeGroup,
} from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

// Organizer approves or rejects a pending migration request.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action, swapDeadlineHours } = await req.json();

  const ref = adminDb.collection("migrationRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const m = snap.data() as any;

  if (!(await isEventOrganizer(m.eventId, uid))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (m.status !== "pending") {
    return NextResponse.json({ error: "This request has already been processed." }, { status: 400 });
  }

  if (action === "reject") {
    await ref.update({ status: "rejected", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await notifyUser({
      uid: m.requesterUid,
      email: m.requesterEmail,
      type: "migration_rejected",
      title: "Migration request declined",
      body: `Your request to move to ${m.toCommittee} / ${m.toCountry} was declined by the organizer.`,
      href: `/dashboard/conferences/${m.eventId}`,
      eventId: m.eventId,
      emoji: "🚫",
      accent: "#dc2626",
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action !== "approve") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'." }, { status: 400 });
  }

  // Is the target seat occupied by someone else?
  const occ = await findOccupant(m.eventId, m.toCommittee, m.toCountry, m.requesterUid);

  if (!occ) {
    // DIRECT move — target country is free.
    await setAssignment(m.requesterAppId, m.toCommittee, m.toCountry);
    await resyncCommitteeGroup(m.eventId, m.requesterUid, m.requesterName || "Delegate", m.fromCommittee, m.toCommittee);
    await ref.update({ type: "direct", status: "completed", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await notifyUser({
      uid: m.requesterUid,
      email: m.requesterEmail,
      type: "migration_completed",
      title: "Migration approved",
      body: `You've been moved to ${m.toCommittee} / ${m.toCountry}.`,
      href: `/dashboard/conferences/${m.eventId}`,
      eventId: m.eventId,
      emoji: "✅",
      accent: "#16a34a",
    });
    return NextResponse.json({ ok: true, type: "direct" });
  }

  // SWAP — the seat is held; ask the occupant.
  const hours = Math.max(1, Math.min(720, Number(swapDeadlineHours) || 48));
  const deadline = Timestamp.fromMillis(Date.now() + hours * 3600 * 1000);
  await ref.update({
    type: "swap",
    status: "awaiting_swap",
    occupantUid: occ.uid,
    occupantAppId: occ.appId,
    occupantName: occ.name,
    occupantEmail: occ.email,
    swapDeadline: deadline,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await notifyUser({
    uid: occ.uid,
    email: occ.email,
    type: "migration_swap_offer",
    title: "Seat swap request",
    body: `${m.requesterName || "A delegate"} would like to swap into your seat (${m.toCommittee} / ${m.toCountry}). If you accept, you'll move to ${m.fromCommittee} / ${m.fromCountry}. Respond within ${hours} hours.`,
    href: `/dashboard/conferences/${m.eventId}`,
    eventId: m.eventId,
    emoji: "🔄",
    accent: "#7c3aed",
  });
  await notifyUser({
    uid: m.requesterUid,
    email: m.requesterEmail,
    type: "migration_approved",
    title: "Migration approved — awaiting swap",
    body: `The organizer approved your request. The current delegate in ${m.toCommittee} / ${m.toCountry} has ${hours} hours to accept the swap.`,
    href: `/dashboard/conferences/${m.eventId}`,
    eventId: m.eventId,
    emoji: "⏳",
    accent: "#2563eb",
  });
  return NextResponse.json({ ok: true, type: "swap" });
}
