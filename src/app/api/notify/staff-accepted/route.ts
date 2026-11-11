import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUid, notifyUser, getOrganizerRecipients } from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

// A staff member accepted their invitation → notify the event's organizers
// (owner + accepted co-organizers) on both the in-app bell and by email.
export async function POST(req: Request) {
  const uid = await requireUid(req); // the accepting staff member
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await req.json();
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  // Read the freshly-written staff doc (keyed by uid) for trustworthy name/role/committee.
  const snap = await adminDb.collection("events").doc(eventId).collection("staff").doc(uid).get();
  if (!snap.exists) return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  const s = snap.data() as any;
  const name = s.name || "A staff member";
  const roleLabel = String(s.role || "staff").replace(/-/g, " "); // no client-only import
  const committee = s.committeeId ? ` for ${s.committeeId}` : "";

  const recipients = (await getOrganizerRecipients(eventId)).filter((r) => r.uid !== uid); // no self-notify
  await Promise.all(
    recipients.map((r) =>
      notifyUser({
        uid: r.uid,
        email: r.email,
        type: "staff_accepted",
        title: "Invitation accepted",
        body: `${name} accepted their invitation as ${roleLabel}${committee}. Allocate their committee in the Invitation tab.`,
        href: `/dashboard/organizer/events/${eventId}/allocation?tab=staff`,
        eventId,
        emoji: "✅",
        accent: "#16a34a",
      })
    )
  );

  return NextResponse.json({ ok: true });
}
