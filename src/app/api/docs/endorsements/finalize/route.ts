import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireUid, isEventOrganizer, notifyUser, isCommitteeDais } from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

// Close the endorsement window for a paper (idempotent). Confirmed sponsors = author +
// accepters; confirmed signatories = accepters; leftover pending rows → expired; paper
// status collecting-endorsements → submitted (so it becomes introduceable). Callable by
// the author, an organizer/co-organizer, or an admin — the author's client fires it at
// window close (or early, once every request has been answered).
export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, docId } = await req.json();
  if (!eventId || !docId) {
    return NextResponse.json({ error: "eventId and docId are required." }, { status: 400 });
  }

  const docRef = adminDb
    .collection("events").doc(eventId)
    .collection("committeeDocs").doc(docId);
  const snap = await docRef.get();
  if (!snap.exists) return NextResponse.json({ error: "Paper not found." }, { status: 404 });

  const paper = snap.data() as any;
  const isAuthor = paper.submittedBy === uid;
  // The committee's dais too: a vice-chair with delegate power authors the paper on a delegation's
  // behalf, so their client is the one running the window and firing this at close.
  if (!isAuthor
    && !(await isCommitteeDais(eventId, uid, paper.committee || ""))
    && !(await isEventOrganizer(eventId, uid))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  // Idempotent: nothing to do once the window has already been closed.
  if (paper.status !== "collecting-endorsements") {
    return NextResponse.json({ ok: true, alreadyFinal: true });
  }

  const endSnap = await docRef.collection("docEndorsements").get();
  const rows = endSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const endsAt = Number(paper.endorsementEndsAt || 0);
  const windowClosed = endsAt > 0 && Date.now() >= endsAt;
  const anyPending = rows.some((r) => r.status === "pending");
  // Before the window closes we may only finalize when everyone has already answered.
  if (!windowClosed && anyPending) {
    return NextResponse.json({ error: "Endorsement window still open." }, { status: 409 });
  }

  const batch = adminDb.batch();
  for (const r of rows) {
    if (r.status === "pending") {
      batch.update(docRef.collection("docEndorsements").doc(r.id), { status: "expired" });
    }
  }

  const own = paper.submittedCountry ? [paper.submittedCountry] : [];
  const sponsors = Array.from(
    new Set([...own, ...rows.filter((r) => r.status === "accepted" && r.role === "sponsor").map((r) => r.country)])
  );
  const signatories = Array.from(
    new Set(rows.filter((r) => r.status === "accepted" && r.role === "signatory").map((r) => r.country))
  );

  batch.update(docRef, {
    sponsors,
    signatories,
    status: "submitted",
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  // Close the loop for the author (in-app only — realtime tracker already updated their view).
  notifyUser({
    uid: paper.submittedBy,
    type: "doc_endorsement_closed",
    title: "Endorsements settled",
    body: `“${paper.title || "Your paper"}” is ready to introduce — ${sponsors.length} sponsor${sponsors.length === 1 ? "" : "s"}, ${signatories.length} signator${signatories.length === 1 ? "y" : "ies"}.`,
    href: "/dashboard/documents",
    eventId,
    emoji: "✅",
    accent: "#059669",
  }).catch(() => {});

  return NextResponse.json({ ok: true, sponsors, signatories });
}
