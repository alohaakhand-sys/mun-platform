import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireUid, notifyUser, getOrganizerRecipients } from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

const norm = (s: any) => (typeof s === "string" ? s.trim().toLowerCase() : "");

// Delegate creates a migration request (move to another committee/country).
export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, toCommittee, toCountry, reason } = await req.json();
  if (!eventId || !toCommittee || !toCountry) {
    return NextResponse.json({ error: "eventId, toCommittee and toCountry are required." }, { status: 400 });
  }

  // The caller's application for this event.
  const appsSnap = await adminDb.collection("applications").where("eventId", "==", eventId).get();
  const mine = appsSnap.docs.find((d) => (d.data() as any).userId === uid);
  if (!mine) return NextResponse.json({ error: "No application found for this event." }, { status: 404 });
  const app = mine.data() as any;

  if (app.status !== "approved") {
    return NextResponse.json({ error: "Only approved delegates can request a migration." }, { status: 400 });
  }
  if (app.role === "Faculty Advisor") {
    return NextResponse.json({ error: "This role has no committee seat to migrate." }, { status: 400 });
  }

  const fromCommittee = app.assignedCommittee || app.preferredCommittee || app.choices?.primary?.committee || "";
  const fromCountry = app.assignedCountry || "";
  if (!fromCommittee || !fromCountry) {
    return NextResponse.json({ error: "You need an assigned committee and country before requesting a migration." }, { status: 400 });
  }
  if (norm(fromCommittee) === norm(toCommittee) && norm(fromCountry) === norm(toCountry)) {
    return NextResponse.json({ error: "That is already your current seat." }, { status: 400 });
  }

  // Block duplicate active requests.
  const existing = await adminDb.collection("migrationRequests").where("requesterUid", "==", uid).get();
  const hasActive = existing.docs.some((d) => {
    const m = d.data() as any;
    return m.eventId === eventId && (m.status === "pending" || m.status === "awaiting_swap");
  });
  if (hasActive) {
    return NextResponse.json({ error: "You already have an active migration request for this event." }, { status: 400 });
  }

  const ev = await adminDb.collection("events").doc(eventId).get();
  const eventTitle = (ev.data() as any)?.title || "the conference";

  const docRef = await adminDb.collection("migrationRequests").add({
    eventId,
    eventTitle,
    requesterUid: uid,
    requesterName: app.applicantName || "Delegate",
    requesterEmail: app.applicantEmail || "",
    requesterAppId: mine.id,
    fromCommittee,
    fromCountry,
    toCommittee,
    toCountry,
    type: null,
    status: "pending",
    ...(reason ? { reason: String(reason).slice(0, 500) } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const recipients = await getOrganizerRecipients(eventId);
  await Promise.all(
    recipients.map((r) =>
      notifyUser({
        uid: r.uid,
        email: r.email,
        type: "migration_request",
        title: "New migration request",
        body: `${app.applicantName || "A delegate"} requested to move to ${toCommittee} / ${toCountry} (from ${fromCommittee} / ${fromCountry}).`,
        href: `/dashboard/organizer/events/${eventId}/allocation?tab=migrations`,
        eventId,
        emoji: "🔁",
        accent: "#2563eb",
      })
    )
  );

  return NextResponse.json({ ok: true, id: docRef.id });
}
