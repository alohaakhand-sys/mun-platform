import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { isAdminUser, syncAdminMirror } from "@/lib/server/membership";
import { logAuditServer } from "@/lib/server/auditServer";

/**
 * POST { action: "disable" | "enable" | "delete", reason? }: the App Admin bans, unbans or deletes
 * a member. Disable = Firebase Auth disabled + sessions revoked (they're signed out within the
 * hour, and can't sign in) + users.disabled for the UI. Delete removes the Auth account, the
 * profile and its private contact; their applications and messages stay as history.
 * Never yourself, never an App Admin (change their role first).
 */
export async function POST(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { uid } = await params;
  const { action, reason } = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  if (!["disable", "enable", "delete"].includes(String(action))) return NextResponse.json({ error: "action must be disable, enable or delete." }, { status: 400 });
  if (uid === auth.uid) return NextResponse.json({ error: "You can't do this to your own account." }, { status: 400 });

  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  const u = (snap.data() as any) || {};
  if (isAdminUser(u)) return NextResponse.json({ error: "This is an App Admin. Change their role first." }, { status: 400 });
  const note = String(reason || "").trim().slice(0, 300);
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || undefined;

  if (action === "delete") {
    await adminAuth.deleteUser(uid).catch((e) => { if (e?.code !== "auth/user-not-found") throw e; });
    await ref.collection("private").doc("contact").delete().catch(() => {});
    if (snap.exists) await ref.delete();
    await syncAdminMirror(uid, false);
  } else {
    const disabled = action === "disable";
    await adminAuth.updateUser(uid, { disabled });
    if (disabled) await adminAuth.revokeRefreshTokens(uid);
    if (snap.exists) await ref.update(disabled ? { disabled: true, disabledReason: note || null } : { disabled: false, disabledReason: null });
  }

  await logAuditServer({
    actorUid: auth.uid, action: action === "disable" ? "user_disabled" : action === "enable" ? "user_enabled" : "user_deleted", targetType: "user", targetId: uid, targetName: name,
    after: note ? { reason: note } : undefined,
  });
  return NextResponse.json({ ok: true });
}
