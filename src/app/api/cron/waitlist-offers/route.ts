import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { cronRefusal } from "@/lib/server/cronAuth";

export const dynamic = "force-dynamic";

const OFFER_TTL_MS = 48 * 60 * 60 * 1000;

// Hourly: a waitlist seat offer not taken within 48h expires, and the next applicant waiting for
// that committee is offered it (the expireWaitlistOffers Cloud Function, now run by Coolify).
// One collection-group query (fieldOverride waitlist.status).
export async function GET(req: Request) {
  const refused = cronRefusal(req);
  if (refused) return refused;
  const cutoff = Date.now() - OFFER_TTL_MS;
  const snap = await adminDb.collectionGroup("waitlist").where("status", "==", "offered").get();
  let expired = 0;
  let offered = 0;
  for (const d of snap.docs) {
    const data = d.data() as any;
    const at = data.notifiedAt?.toMillis?.() ?? 0;
    if (!at || at > cutoff) continue;
    await d.ref.update({ status: "expired" });
    expired++;
    const siblings = await d.ref.parent.where("status", "==", "waiting").get();
    const next = siblings.docs
      .map((x) => ({ ref: x.ref, ...(x.data() as any) }))
      .filter((x) => x.committeeId === data.committeeId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
    if (next) {
      await next.ref.update({ status: "offered", notifiedAt: FieldValue.serverTimestamp() });
      offered++;
      if (next.userId) {
        await adminDb.collection("notifications").add({
          uid: next.userId, type: "waitlist_offer", eventId: d.ref.parent.parent?.id || "", read: false,
          createdAt: FieldValue.serverTimestamp(), title: "A seat opened up for you",
          body: "You've been offered a seat from the waitlist. It's held for 48 hours.", href: "/dashboard/conferences",
        });
      }
    }
  }
  return NextResponse.json({ ok: true, checked: snap.size, expired, offered });
}
