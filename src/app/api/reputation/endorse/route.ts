import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireUid, notifyUser } from "@/lib/server/migrationServer";
import { assertEligible, getUserBrief, slugifySkill, HttpError } from "@/lib/server/reputationServer";

export const dynamic = "force-dynamic";

// Toggle an endorsement for one of the target's listed skills. Composite doc id
// (endorser_target_skillSlug) makes it idempotent; the per-skill counter on the
// target user doc drives the "Endorsed by N" number.
export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { toUid, skill } = await req.json();
    if (!toUid || !skill || typeof skill !== "string") {
      return NextResponse.json({ error: "A skill is required." }, { status: 400 });
    }

    await assertEligible(uid, toUid);
    const target = await getUserBrief(toUid);

    // Only endorse a skill the target actually lists (case-insensitive match).
    const match = target.skills.find((s) => s.trim().toLowerCase() === skill.trim().toLowerCase());
    if (!match) {
      return NextResponse.json({ error: "That skill isn't listed on this profile." }, { status: 400 });
    }
    const slug = slugifySkill(match);
    if (!slug) return NextResponse.json({ error: "Invalid skill." }, { status: 400 });

    const endorser = await getUserBrief(uid);
    const endRef = adminDb.collection("endorsements").doc(`${uid}_${toUid}_${slug}`);
    const userRef = adminDb.collection("users").doc(toUid);

    const endorsed = await adminDb.runTransaction(async (tx) => {
      const prev = await tx.get(endRef);
      if (prev.exists) {
        tx.delete(endRef);
        tx.set(userRef, { endorsementCounts: { [slug]: FieldValue.increment(-1) } }, { merge: true });
        return false;
      }
      tx.set(endRef, {
        endorserUid: uid,
        endorserName: endorser.name,
        endorserPhotoURL: endorser.photoURL,
        toUid,
        skill: match,
        skillSlug: slug,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(userRef, { endorsementCounts: { [slug]: FieldValue.increment(1) } }, { merge: true });
      return true;
    });

    // Notify only when adding an endorsement, not when removing one.
    if (endorsed) {
      await notifyUser({
        uid: toUid,
        email: target.email,
        type: "endorsement",
        title: "Skill endorsed",
        body: `${endorser.name} endorsed your ${match}.`,
        href: "/dashboard/settings",
        emoji: "👍",
        accent: "#6d28d9",
      });
    }

    return NextResponse.json({ ok: true, endorsed, skillSlug: slug });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("endorse error:", e);
    return NextResponse.json({ error: "Could not update endorsement." }, { status: 500 });
  }
}
