import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireUid, notifyUser, setAssignment, resyncCommitteeGroup } from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

// The current occupant accepts or declines a swap request.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action } = await req.json();

  const ref = adminDb.collection("migrationRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const m = snap.data() as any;

  if (m.occupantUid !== uid) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (m.status !== "awaiting_swap") {
    return NextResponse.json({ error: "This swap request is no longer awaiting a response." }, { status: 400 });
  }

  // Deadline guard.
  const deadlineMs = m.swapDeadline?.toMillis?.() ?? 0;
  if (deadlineMs && deadlineMs < Date.now()) {
    await ref.update({ status: "failed", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await notifyUser({
      uid: m.requesterUid,
      email: m.requesterEmail,
      type: "migration_failed",
      title: "Migration request failed",
      body: `Your request to move to ${m.toCommittee} / ${m.toCountry} expired before the current delegate responded.`,
      href: `/dashboard/conferences/${m.eventId}`,
      eventId: m.eventId,
      emoji: "⌛",
      accent: "#b45309",
    });
    return NextResponse.json({ error: "This swap request has expired." }, { status: 400 });
  }

  if (action === "decline") {
    await ref.update({ status: "failed", swapResponse: "declined", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await notifyUser({
      uid: m.requesterUid,
      email: m.requesterEmail,
      type: "migration_failed",
      title: "Migration request failed",
      body: `The current delegate in ${m.toCommittee} / ${m.toCountry} declined the swap, so your migration could not be completed.`,
      href: `/dashboard/conferences/${m.eventId}`,
      eventId: m.eventId,
      emoji: "🚫",
      accent: "#dc2626",
    });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  if (action !== "accept") {
    return NextResponse.json({ error: "action must be 'accept' or 'decline'." }, { status: 400 });
  }

  // ACCEPT — swap both seats.
  await setAssignment(m.requesterAppId, m.toCommittee, m.toCountry);
  await setAssignment(m.occupantAppId, m.fromCommittee, m.fromCountry);
  await resyncCommitteeGroup(m.eventId, m.requesterUid, m.requesterName || "Delegate", m.fromCommittee, m.toCommittee);
  await resyncCommitteeGroup(m.eventId, m.occupantUid, m.occupantName || "Delegate", m.toCommittee, m.fromCommittee);
  await ref.update({ status: "completed", swapResponse: "accepted", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });

  await notifyUser({
    uid: m.requesterUid,
    email: m.requesterEmail,
    type: "migration_completed",
    title: "Swap completed",
    body: `Your swap was accepted — you're now in ${m.toCommittee} / ${m.toCountry}.`,
    href: `/dashboard/conferences/${m.eventId}`,
    eventId: m.eventId,
    emoji: "✅",
    accent: "#16a34a",
  });
  await notifyUser({
    uid: m.occupantUid,
    email: m.occupantEmail,
    type: "migration_completed",
    title: "Swap completed",
    body: `You accepted the swap — you're now in ${m.fromCommittee} / ${m.fromCountry}.`,
    href: `/dashboard/conferences/${m.eventId}`,
    eventId: m.eventId,
    emoji: "✅",
    accent: "#16a34a",
  });
  return NextResponse.json({ ok: true, status: "completed" });
}
