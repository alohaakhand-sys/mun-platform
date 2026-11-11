import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  requireUid,
  isEventOrganizer,
  notifyUser,
  findOccupant,
  setAssignment,
  resyncCommitteeGroup,
} from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

const norm = (s: any) => (typeof s === "string" ? s.trim().toLowerCase() : "");

// Organizer/admin moves a delegate directly to a committee/country — no request flow.
// The delegate (and, when swapping, the displaced occupant) get an in-app
// notification + email. Logged to migrationRequests with source:"admin" for history.
export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, applicationId, toCommittee, toCountry, reason } = await req.json();
  if (!eventId || !applicationId || !toCommittee || !toCountry) {
    return NextResponse.json({ error: "eventId, applicationId, toCommittee and toCountry are required." }, { status: 400 });
  }
  if (!(await isEventOrganizer(eventId, uid))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Load + validate the delegate's application.
  const appSnap = await adminDb.collection("applications").doc(applicationId).get();
  if (!appSnap.exists) return NextResponse.json({ error: "Delegate application not found." }, { status: 404 });
  const app = appSnap.data() as any;
  if (app.eventId !== eventId) return NextResponse.json({ error: "Application does not belong to this event." }, { status: 400 });
  if (app.status !== "approved") return NextResponse.json({ error: "Only approved delegates can be migrated." }, { status: 400 });

  const fromCommittee = app.assignedCommittee || app.preferredCommittee || app.choices?.primary?.committee || "";
  const fromCountry = app.assignedCountry || "";
  if (norm(fromCommittee) === norm(toCommittee) && norm(fromCountry) === norm(toCountry)) {
    return NextResponse.json({ error: "Delegate is already in that committee and country." }, { status: 400 });
  }

  // Validate the target committee exists on the event (country is permissive).
  const ev = await adminDb.collection("events").doc(eventId).get();
  const event = ev.data() as any;
  const committees: any[] = event?.committees || [];
  if (committees.length > 0 && !committees.some((c) => norm(c.name) === norm(toCommittee))) {
    return NextResponse.json({ error: "Target committee is not part of this event." }, { status: 400 });
  }
  const eventTitle = event?.shortName || event?.title || "the conference";

  const delegateName = app.applicantName || "Delegate";
  const delegateEmail = app.applicantEmail || "";

  // Is the target seat held by someone else? An occupied seat is ALWAYS resolved by
  // swapping (no seat sharing) — which needs a seat to give the occupant in return.
  const occ = await findOccupant(eventId, toCommittee, toCountry, app.userId);
  if (occ && (!fromCommittee || !fromCountry)) {
    return NextResponse.json(
      { error: "That seat is taken and this delegate has no current committee/country to swap back. Assign them a country first, or pick a free seat." },
      { status: 409 }
    );
  }
  const willSwap = !!occ;

  // If swapping, move the occupant into the delegate's vacated seat first.
  if (willSwap && occ) {
    await setAssignment(occ.appId, fromCommittee, fromCountry);
    await resyncCommitteeGroup(eventId, occ.uid, occ.name, toCommittee, fromCommittee);
    await notifyUser({
      uid: occ.uid,
      email: occ.email,
      type: "migration_admin_swapped",
      title: "You've been reassigned",
      body: `An organizer reassigned you to ${fromCommittee} / ${fromCountry} in ${eventTitle}.`,
      href: `/dashboard/conferences/${eventId}`,
      eventId,
      emoji: "🔄",
      accent: "#7c3aed",
    });
  }

  // Move the delegate to the target seat.
  await setAssignment(applicationId, toCommittee, toCountry);
  await resyncCommitteeGroup(eventId, app.userId, delegateName, fromCommittee, toCommittee);
  await notifyUser({
    uid: app.userId,
    email: delegateEmail,
    type: "migration_admin_moved",
    title: "You've been reassigned",
    body: `An organizer moved you to ${toCommittee} / ${toCountry} in ${eventTitle}.${reason ? ` Note: ${reason}` : ""}`,
    href: `/dashboard/conferences/${eventId}`,
    eventId,
    emoji: "🧭",
    accent: "#2563eb",
  });

  // Log to history (admin-sourced, already completed).
  let decidedByName = "Organizer";
  try {
    const me = await adminDb.collection("users").doc(uid).get();
    decidedByName = (me.data() as any)?.displayName || (me.data() as any)?.firstName || "Organizer";
  } catch {}

  await adminDb.collection("migrationRequests").add({
    eventId,
    eventTitle,
    requesterUid: app.userId,
    requesterName: delegateName,
    requesterEmail: delegateEmail,
    requesterAppId: applicationId,
    fromCommittee,
    fromCountry,
    toCommittee,
    toCountry,
    type: willSwap ? "swap" : "direct",
    status: "completed",
    source: "admin",
    decidedByUid: uid,
    decidedByName,
    ...(willSwap && occ
      ? { occupantUid: occ.uid, occupantAppId: occ.appId, occupantName: occ.name, occupantEmail: occ.email, swapResponse: "accepted" }
      : {}),
    ...(reason ? { reason } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    resolvedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, type: willSwap ? "swap" : "direct", swapped: willSwap });
}
