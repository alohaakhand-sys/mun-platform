import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireUid, notifyUser } from "@/lib/server/migrationServer";
import { assertEligible, getUserBrief, HttpError } from "@/lib/server/reputationServer";

export const dynamic = "force-dynamic";

// A peer gives a 1–5 star rating. One rating per (rater, target) via the composite
// doc id — re-rating overwrites and adjusts the target's aggregate by the delta.
export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { toUid, stars } = await req.json();
    const n = Number(stars);
    if (!toUid || !Number.isInteger(n) || n < 1 || n > 5) {
      return NextResponse.json({ error: "A star rating from 1 to 5 is required." }, { status: 400 });
    }

    await assertEligible(uid, toUid);
    const rater = await getUserBrief(uid);

    const ratingRef = adminDb.collection("ratings").doc(`${uid}_${toUid}`);
    const userRef = adminDb.collection("users").doc(toUid);

    const wasNew = await adminDb.runTransaction(async (tx) => {
      const prev = await tx.get(ratingRef);
      const prevStars = prev.exists ? Number((prev.data() as any).stars) || 0 : 0;
      const isNew = !prev.exists;

      tx.set(
        ratingRef,
        {
          raterUid: uid,
          raterName: rater.name,
          raterPhotoURL: rater.photoURL,
          toUid,
          stars: n,
          ...(isNew ? { createdAt: FieldValue.serverTimestamp() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        userRef,
        {
          ratingSum: FieldValue.increment(n - prevStars),
          ratingCount: FieldValue.increment(isNew ? 1 : 0),
        },
        { merge: true }
      );

      return isNew;
    });

    // Notify only on a first-time rating — edits stay quiet.
    if (wasNew) {
      const target = await getUserBrief(toUid);
      await notifyUser({
        uid: toUid,
        email: target.email,
        type: "rating",
        title: "You received a rating",
        body: `${rater.name} rated you ${n}★.`,
        href: "/dashboard/settings",
        emoji: "⭐",
        accent: "#f59e0b",
      });
    }

    return NextResponse.json({ ok: true, stars: n });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("rate error:", e);
    return NextResponse.json({ error: "Could not save rating." }, { status: 500 });
  }
}
