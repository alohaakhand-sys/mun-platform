import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireUid, notifyUser } from "@/lib/server/migrationServer";
import { getUserBrief, HttpError } from "@/lib/server/reputationServer";

export const dynamic = "force-dynamic";

// The RECIPIENT approves or hides a recommendation left on their profile. This is
// an ownership action (rec.toUid === caller), not an eligibility one.
export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { recId, action } = await req.json();
    if (!recId || (action !== "approve" && action !== "hide")) {
      return NextResponse.json({ error: "recId and action ('approve'|'hide') are required." }, { status: 400 });
    }

    const ref = adminDb.collection("recommendations").doc(recId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });
    const r = snap.data() as any;
    if (r.toUid !== uid) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const status = action === "approve" ? "approved" : "hidden";
    await ref.update({ status, decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });

    // Let the author know when their recommendation goes live.
    if (action === "approve" && r.authorUid) {
      const [target, author] = await Promise.all([getUserBrief(uid), getUserBrief(r.authorUid)]);
      await notifyUser({
        uid: r.authorUid,
        email: author.email,
        type: "recommendation_approved",
        title: "Recommendation published",
        body: `${target.name} approved your recommendation — it's now on their profile.`,
        href: `/dashboard/profile/${uid}`,
        emoji: "✅",
        accent: "#16a34a",
      });
    }

    return NextResponse.json({ ok: true, status });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("recommend decide error:", e);
    return NextResponse.json({ error: "Could not update recommendation." }, { status: 500 });
  }
}
