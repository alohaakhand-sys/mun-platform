/**
 * One page of the marking-doc repair (see api/admin/repair-markings): moves literal
 * "scores.<criterion>" / "scoreEntries.<criterion>" fields, written by the pre-2026-10-25
 * setCriterionScore / setScoreEntries, into the real nested maps and deletes them. A literal
 * value was the chair's latest save, so it wins over a nested one. Server-only.
 */
import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";

export async function repairMarkingsPage(db: Firestore, after: string | null, page = 300) {
  let q = db.collection("markings").orderBy(FieldPath.documentId()).limit(page);
  if (after) q = q.startAfter(after);
  const snap = await q.get();
  let repaired = 0;
  const batch = db.batch();
  for (const d of snap.docs) {
    const data = d.data();
    const stray = Object.keys(data).filter((k) => k.startsWith("scores.") || k.startsWith("scoreEntries."));
    if (!stray.length) continue;
    const args: unknown[] = [];
    for (const k of stray) {
      const dot = k.indexOf(".");
      // The real nested path gets the literal value; the literal field (ONE segment) is deleted.
      args.push(new FieldPath(k.slice(0, dot), k.slice(dot + 1)), data[k]);
      args.push(new FieldPath(k), FieldValue.delete());
    }
    args.push("updatedAt", FieldValue.serverTimestamp());
    const [first, value, ...more] = args as [FieldPath, unknown, ...unknown[]];
    batch.update(d.ref, first, value, ...more);
    repaired++;
  }
  if (repaired) await batch.commit();
  return { scanned: snap.size, repaired, next: snap.size === page ? snap.docs[snap.docs.length - 1].id : null };
}
