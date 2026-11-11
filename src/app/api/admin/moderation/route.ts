import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { logAuditServer } from "@/lib/server/auditServer";

// Content moderation for the App Admin. Reputation counters on users/{uid} (ratingSum/ratingCount,
// endorsementCounts.<slug>) are kept right the same way /api/reputation/* keeps them.
//   GET ?type=articles|ratings|recommendations|endorsements[&uid=<member>]  → newest 50
//   GET ?type=comments&articleId=…                                         → that article's comments
//   POST { type, id, articleId?, action: "delete" | "unpublish" | "hide" }

const TYPES = ["articles", "comments", "ratings", "recommendations", "endorsements"] as const;
type Kind = (typeof TYPES)[number];
const ms = (v: any) => v?.toMillis?.() ?? null;

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as Kind;
  const uid = url.searchParams.get("uid") || "";
  if (!TYPES.includes(type)) return NextResponse.json({ error: "Unknown type." }, { status: 400 });

  if (type === "comments") {
    const articleId = url.searchParams.get("articleId") || "";
    if (!articleId) return NextResponse.json({ error: "articleId required." }, { status: 400 });
    const snap = await adminDb.collection("articles").doc(articleId).collection("comments").limit(200).get();
    const items = snap.docs.map((d) => {
      const c = d.data() as any;
      return { id: d.id, author: c.authorName || c.authorId || "", authorId: c.authorId || "", text: String(c.content ?? c.text ?? c.body ?? "").slice(0, 600), createdAt: ms(c.createdAt) };
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return NextResponse.json({ items });
  }

  let q: FirebaseFirestore.Query = adminDb.collection(type);
  if (uid) q = q.where(type === "articles" ? "authorId" : "toUid", "==", uid);
  else q = q.orderBy("createdAt", "desc");
  const snap = await q.limit(50).get();
  const items = snap.docs.map((d) => {
    const x = d.data() as any;
    switch (type) {
      case "articles": return { id: d.id, title: x.title || "", author: x.authorName || "", authorId: x.authorId || "", published: x.published === true, hidden: x.hiddenByAdmin === true, createdAt: ms(x.createdAt) };
      case "ratings": return { id: d.id, from: x.raterName || x.raterUid, to: x.toUid, stars: x.stars, createdAt: ms(x.createdAt) };
      case "recommendations": return { id: d.id, from: x.authorName || x.authorUid, to: x.toUid, text: String(x.body || "").slice(0, 600), status: x.status, createdAt: ms(x.createdAt) };
      default: return { id: d.id, from: x.endorserName || x.endorserUid, to: x.toUid, skill: x.skill, createdAt: ms(x.createdAt) };
    }
  });
  if (uid) items.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { type, id, articleId, action } = (await req.json().catch(() => ({}))) as { type: Kind; id: string; articleId?: string; action: string };
  if (!TYPES.includes(type) || !id) return NextResponse.json({ error: "type and id required." }, { status: 400 });

  const ref = type === "comments"
    ? adminDb.collection("articles").doc(String(articleId || "")).collection("comments").doc(id)
    : adminDb.collection(type).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const x = snap.data() as any;

  if (type === "articles" && action === "unpublish") {
    await ref.update({ published: false, hiddenByAdmin: true, updatedAt: FieldValue.serverTimestamp() });
  } else if (type === "recommendations" && action === "hide") {
    await ref.update({ status: "hidden", updatedAt: FieldValue.serverTimestamp() });
  } else if (action === "delete") {
    if (type === "ratings") {
      await adminDb.runTransaction(async (tx) => {
        tx.delete(ref);
        tx.set(adminDb.collection("users").doc(x.toUid), { ratingSum: FieldValue.increment(-(Number(x.stars) || 0)), ratingCount: FieldValue.increment(-1) }, { merge: true });
      });
    } else if (type === "endorsements") {
      await adminDb.runTransaction(async (tx) => {
        tx.delete(ref);
        if (x.skillSlug) tx.set(adminDb.collection("users").doc(x.toUid), { endorsementCounts: { [x.skillSlug]: FieldValue.increment(-1) } }, { merge: true });
      });
    } else if (type === "articles") {
      // Its comments go with it (a few hundred at most per article).
      const comments = await ref.collection("comments").limit(500).get();
      const b = adminDb.batch();
      comments.docs.forEach((c) => b.delete(c.ref));
      b.delete(ref);
      await b.commit();
    } else {
      await ref.delete();
    }
  } else {
    return NextResponse.json({ error: "Unknown action for this type." }, { status: 400 });
  }

  await logAuditServer({
    actorUid: auth.uid, action: `moderation_${type}_${action}`, targetType: type, targetId: id,
    targetName: String(x.title || x.skill || x.body || x.content || x.stars || "").slice(0, 80),
  });
  return NextResponse.json({ ok: true });
}
