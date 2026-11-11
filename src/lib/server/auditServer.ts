// Audit entries written by the server (admin SDK), so a critical admin action can't skip or forge
// its log. auditLogs is append-only in firestore.rules: admins read and create, nobody edits.
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminAuth } from "@/lib/firebase/admin";

export async function logAuditServer(entry: {
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const [user, auth] = await Promise.all([
      adminDb.collection("users").doc(entry.actorUid).get(),
      adminAuth.getUser(entry.actorUid).catch(() => null),
    ]);
    const doc: Record<string, unknown> = {
      actorUid: entry.actorUid,
      actorEmail: auth?.email || "",
      actorRole: (user.data() as any)?.role || "",
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      source: "server",
      timestamp: FieldValue.serverTimestamp(),
    };
    if (entry.targetName) doc.targetName = entry.targetName;
    if (entry.before !== undefined) doc.before = JSON.stringify(entry.before);
    if (entry.after !== undefined) doc.after = JSON.stringify(entry.after);
    await adminDb.collection("auditLogs").add(doc);
  } catch (e) {
    console.error("[audit] server log failed:", e);
  }
}
