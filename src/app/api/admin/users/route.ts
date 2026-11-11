import { NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";

/**
 * GET ?after=<uid> → 50 members at a time; GET ?email=<address> → that one member.
 * Emails come from Firebase Auth (no Firestore reads), so the page never sweeps the whole users
 * collection or everyone's private contact doc (Spark: 50k reads a day).
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();

  let docs: FirebaseFirestore.DocumentSnapshot[] = [];
  let next: string | null = null;
  if (email) {
    const u = await adminAuth.getUserByEmail(email).catch(() => null);
    if (u) {
      const d = await adminDb.collection("users").doc(u.uid).get();
      if (d.exists) docs = [d];
    }
  } else {
    let q = adminDb.collection("users").orderBy(FieldPath.documentId()).limit(50);
    const after = url.searchParams.get("after");
    if (after) q = q.startAfter(after);
    const snap = await q.get();
    docs = snap.docs;
    next = snap.size === 50 ? snap.docs[snap.size - 1].id : null;
  }

  const authUsers = docs.length ? await adminAuth.getUsers(docs.map((d) => ({ uid: d.id }))) : { users: [] as any[] };
  const emailOf = new Map(authUsers.users.map((u: any) => [u.uid, u.email || ""]));
  const users = docs.map((d) => {
    const u = d.data() as any;
    return {
      uid: d.id,
      displayName: u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ") || "",
      email: emailOf.get(d.id) || "",
      role: u.role || "user",
      isAdmin: u.isAdmin === true,
      verifiedOrganizer: u.verifiedOrganizer === true,
      disabled: u.disabled === true,
    };
  });
  return NextResponse.json({ users, next });
}
