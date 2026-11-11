import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";

// Always compute a fresh roster (no caching).
export const dynamic = "force-dynamic";

// Mirror of staffService role helpers — kept inline so this route has no client deps.
function isChairTier(role?: string): boolean {
  const r = (role || "").toLowerCase();
  return r !== "co-organizer" && r.includes("chair");
}
function isExecBoard(role?: string): boolean {
  const r = (role || "").toLowerCase();
  return r === "director" || r === "usg" || r === "eb";
}

type Member = {
  uid: string;
  name: string;
  role: string;
  committee: string;
  country: string;
  isStaff: boolean;
  photoURL: string;
};

// Public-to-members roster for the delegate event portal. Delegates cannot read the
// applications collection client-side (firestore.rules scope reads to their own doc),
// so we aggregate approved delegates + accepted chairs server-side with the admin SDK.
// Gated to event participants/accepted staff so rosters aren't scrapeable by outsiders.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let callerUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      callerUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const [appsSnap, staffSnap, eventSnap] = await Promise.all([
      adminDb.collection("applications").where("eventId", "==", eventId).get(),
      adminDb.collection("events").doc(eventId).collection("staff").get(),
      adminDb.collection("events").doc(eventId).get(),
    ]);
    const eventData = eventSnap.data() || {};

    // Membership gate: the caller must be a participant or an accepted staff member.
    const isParticipant = appsSnap.docs.some((d) => d.data().userId === callerUid);
    const isStaffMember = staffSnap.docs.some(
      (d) => d.data().uid === callerUid && d.data().inviteStatus === "accepted"
    );
    if (!isParticipant && !isStaffMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const byUid = new Map<string, Member>();

    // Approved delegates (+ the caller's own row regardless of status).
    appsSnap.forEach((d) => {
      const a = d.data();
      if (!a.userId) return;
      const isSelf = a.userId === callerUid;
      if (a.status !== "approved" && !isSelf) return;
      byUid.set(a.userId, {
        uid: a.userId,
        name: a.applicantName || "Member",
        role: a.role || "Delegate",
        committee:
          a.assignedCommittee || a.preferredCommittee || a.choices?.primary?.committee || "",
        country: a.assignedCountry || a.choices?.primary?.country || "",
        isStaff: false,
        photoURL: "",
      });
    });

    // Every accepted staff member — chairs, exec board, co-organizers, observers,
    // faculty advisors — overwrite role + committee for shared uids. The "View all"
    // people directory groups them into role sections, so we surface all of them.
    staffSnap.forEach((d) => {
      const s = d.data();
      if (s.inviteStatus !== "accepted") return;
      if (!s.uid) return;
      const existing = byUid.get(s.uid);
      byUid.set(s.uid, {
        uid: s.uid,
        name: s.name || existing?.name || "Staff",
        role: s.role || existing?.role || "Staff",
        committee: s.committeeId || existing?.committee || "",
        country: existing?.country || "",
        isStaff: true,
        photoURL: "",
      });
    });

    // The event owner — labelled "Organizer" so the directory always has its top section,
    // even when the owner never created an application or staff doc for themselves.
    const ownerUid = eventData.organizerId as string | undefined;
    if (ownerUid) {
      const existing = byUid.get(ownerUid);
      byUid.set(ownerUid, {
        uid: ownerUid,
        name: eventData.organizerName || existing?.name || "Organizer",
        role: "Organizer",
        committee: "",
        country: existing?.country || "",
        isStaff: true,
        photoURL: "",
      });
    }

    // Resolve current profile photos in chunks of 30 (Firestore "in" limit).
    const uids = Array.from(byUid.keys());
    for (let i = 0; i < uids.length; i += 30) {
      const chunk = uids.slice(i, i + 30);
      if (chunk.length === 0) continue;
      const usersSnap = await adminDb
        .collection("users")
        .where("__name__", "in", chunk)
        .get();
      usersSnap.forEach((u) => {
        const photo = u.data()?.photoURL;
        const m = byUid.get(u.id);
        if (m && photo) m.photoURL = photo;
      });
    }

    return NextResponse.json({ members: Array.from(byUid.values()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[events/members] error:", message);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}
