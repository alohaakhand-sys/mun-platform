/**
 * API-route guard: the caller's Firebase ID token (Bearer) must belong to an App Admin, judged
 * from their users/{uid} doc (this project has no custom claims). Server-only.
 */
import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";

export async function requireAdmin(req: Request): Promise<{ uid: string } | { error: NextResponse }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return { error: NextResponse.json({ error: "Invalid token" }, { status: 401 }) };
  }
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const u = (userSnap.data() as any) || {};
  const isAdmin = u.role === "App Admin" || u.role === "admin" || u.isAdmin === true;
  if (!isAdmin) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { uid };
}
