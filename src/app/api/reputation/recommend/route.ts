import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireUid, notifyUser } from "@/lib/server/migrationServer";
import { assertEligible, getUserBrief, HttpError } from "@/lib/server/reputationServer";

export const dynamic = "force-dynamic";

// A peer writes a recommendation. It lands as `pending` and only becomes public
// after the recipient approves it (see recommend/decide).
export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { toUid, body, relationship } = await req.json();
    const raw = String(body || "").trim();
    if (!toUid || !raw) {
      return NextResponse.json({ error: "A recommendation message is required." }, { status: 400 });
    }
    const text = raw.length > 2000 ? raw.slice(0, 2000) : raw;

    await assertEligible(uid, toUid);

    // One pending recommendation per author→target at a time.
    const mine = await adminDb.collection("recommendations").where("authorUid", "==", uid).get();
    const hasPending = mine.docs.some((d) => {
      const r = d.data() as any;
      return r.toUid === toUid && r.status === "pending";
    });
    if (hasPending) {
      return NextResponse.json(
        { error: "You already have a pending recommendation for this person." },
        { status: 409 }
      );
    }

    const author = await getUserBrief(uid);
    const ref = await adminDb.collection("recommendations").add({
      authorUid: uid,
      authorName: author.name,
      authorPhotoURL: author.photoURL,
      authorHeadline: author.headline,
      toUid,
      ...(relationship ? { relationship: String(relationship).slice(0, 140) } : {}),
      body: text,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const target = await getUserBrief(toUid);
    await notifyUser({
      uid: toUid,
      email: target.email,
      type: "recommendation_pending",
      title: "New recommendation",
      body: `${author.name} wrote you a recommendation. Approve it to show it on your profile.`,
      href: "/dashboard/settings",
      emoji: "📝",
      accent: "#2563eb",
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("recommend error:", e);
    return NextResponse.json({ error: "Could not submit recommendation." }, { status: 500 });
  }
}
