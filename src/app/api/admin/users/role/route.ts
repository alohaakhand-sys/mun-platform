import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { isAdminUser, syncAdminMirror } from "@/lib/server/membership";
import { logAuditServer } from "@/lib/server/auditServer";
import { ASSIGNABLE_ROLES } from "@/lib/utils/roles";

/**
 * POST { uid, role }: an App Admin changes a member's role. Server-side so the guard rails hold:
 * only the assignable roles, never demote yourself, never remove the last App Admin, and the
 * audit entry (before → after) is written here, not by the browser.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { uid, role } = (await req.json().catch(() => ({}))) as { uid?: string; role?: string };
  if (!uid || !role || !(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: `Role must be one of: ${ASSIGNABLE_ROLES.join(", ")}.` }, { status: 400 });
  }

  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const before = snap.data() as any;
  const wasAdmin = isAdminUser(before);
  const willBeAdmin = role === "App Admin";

  if (wasAdmin && !willBeAdmin) {
    if (uid === auth.uid) return NextResponse.json({ error: "You can't remove your own App Admin role." }, { status: 400 });
    // Another admin must remain (role "App Admin"/"admin", or the isAdmin flag).
    const [byRole, byAlias, byFlag] = await Promise.all([
      adminDb.collection("users").where("role", "==", "App Admin").limit(3).get(),
      adminDb.collection("users").where("role", "==", "admin").limit(3).get(),
      adminDb.collection("users").where("isAdmin", "==", true).limit(3).get(),
    ]);
    const others = new Set([...byRole.docs, ...byAlias.docs, ...byFlag.docs].map((d) => d.id).filter((id) => id !== uid));
    if (others.size === 0) return NextResponse.json({ error: "This is the last App Admin. Make someone else an App Admin first." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { role };
  if (!willBeAdmin && before?.isAdmin === true) patch.isAdmin = false;
  await ref.update(patch);
  if (wasAdmin !== willBeAdmin) await syncAdminMirror(uid, willBeAdmin);

  await logAuditServer({
    actorUid: auth.uid, action: "role_changed", targetType: "user", targetId: uid,
    targetName: [before?.firstName, before?.lastName].filter(Boolean).join(" ") || undefined,
    before: { role: before?.role ?? null, isAdmin: before?.isAdmin ?? null }, after: patch,
  });
  return NextResponse.json({ ok: true, role });
}
