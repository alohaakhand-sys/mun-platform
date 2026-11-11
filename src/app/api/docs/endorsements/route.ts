import { NextResponse } from "next/server";
import { getUserEmail } from "@/lib/server/userContact";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireUid, notifyUser, findOccupant, isCommitteeDais } from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

const norm = (s: any) => (typeof s === "string" ? s.trim().toLowerCase() : "");

// Fan out sponsor / signatory endorsement requests for a freshly submitted paper.
// Runs with the admin SDK because a delegate cannot list applications to resolve who
// holds a country, and cannot write notifications for other users. The author's client
// stamps `endorsementEndsAt` on the paper and passes the SAME `endsAt` here so every
// countdown agrees.
export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, docId, sessionId, endsAt, rows } = await req.json();
  if (!eventId || !docId || !endsAt || !Array.isArray(rows)) {
    return NextResponse.json({ error: "eventId, docId, endsAt and rows are required." }, { status: 400 });
  }

  const docRef = adminDb
    .collection("events").doc(eventId)
    .collection("committeeDocs").doc(docId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return NextResponse.json({ error: "Paper not found." }, { status: 404 });

  const paper = docSnap.data() as any;
  const committee: string = paper.committee || "";
  // The author, or the committee's dais acting under delegate power (the vice-chair's Represent
  // panel writes a paper whose `submittedBy` is the DELEGATION, so an author-only check denies the
  // very caller that just created it).
  if (paper.submittedBy !== uid && !(await isCommitteeDais(eventId, uid, committee))) {
    return NextResponse.json({ error: "Only the author can request endorsements." }, { status: 403 });
  }

  // THE AUTHOR IS THE DELEGATION, NOT THE CALLER. Under a vice-chair proxy the two differ, and
  // every line below wants the author: the request must read "Bangladesh asked you to sponsor",
  // and the author's own delegation is the one that must be excluded from its own consent list.
  // Only the 403 above is about who is holding the keyboard.
  const authorUid: string = paper.submittedBy || uid;
  const requestedByCountry: string = paper.submittedCountry || "";
  const requestedByName: string = paper.submittedByName || "Delegate";
  const docTitle: string = paper.title || "a paper";
  const docType = paper.type;

  // In-session: prefer whoever is PRESENT holding the country (proxies/subs included).
  let attendance: Record<string, any> = {};
  if (sessionId) {
    const sSnap = await adminDb
      .collection("events").doc(eventId)
      .collection("sessions").doc(sessionId).get();
    attendance = (sSnap.data() as any)?.attendance || {};
  }

  const resolveTarget = async (
    country: string
  ): Promise<{ uid: string; email: string } | null> => {
    for (const [au, a] of Object.entries<any>(attendance)) {
      if (au === authorUid) continue;
      if (norm(a?.country) === norm(country)) {
        return { uid: au, email: await getUserEmail(au) };
      }
    }
    // Off-session (or empty seat in the room): fall back to the assigned occupant.
    const occ = await findOccupant(eventId, committee, country, authorUid);
    return occ ? { uid: occ.uid, email: occ.email } : null;
  };

  const seen = new Set<string>(); // one request per delegate per paper
  const notes: Promise<any>[] = [];
  let created = 0;

  for (const r of rows) {
    if (!r || (r.role !== "sponsor" && r.role !== "signatory") || !r.country) continue;
    const target = await resolveTarget(r.country);
    if (!target || target.uid === authorUid || seen.has(target.uid)) continue;
    seen.add(target.uid);

    await docRef.collection("docEndorsements").add({
      role: r.role,
      country: r.country,
      targetUid: target.uid,
      status: "pending",
      requestedByUid: authorUid,
      requestedByName,
      requestedByCountry,
      eventId,
      docId,
      docTitle,
      docType,
      committee,
      ...(sessionId ? { sessionId } : {}),
      endsAt: Number(endsAt),
      createdAt: FieldValue.serverTimestamp(),
    });
    created++;

    const verb = r.role === "sponsor" ? "sponsor" : "sign";
    notes.push(
      notifyUser({
        uid: target.uid,
        email: target.email,
        type: "doc_endorsement_request",
        title: `Asked to ${verb} a draft`,
        body: `${requestedByCountry || requestedByName} asked your delegation to ${verb} “${docTitle}”. Respond within ${Math.round((Number(endsAt) - Date.now()) / 1000) || 90}s.`,
        href: "/dashboard/documents",
        eventId,
        emoji: "✍️",
        accent: "#7c3aed",
      })
    );
  }

  await Promise.allSettled(notes);
  return NextResponse.json({ ok: true, created });
}
