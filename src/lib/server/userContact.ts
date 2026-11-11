import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * A member's email and phone, server side. They live in users/{uid}/private/contact (the public
 * profile doc no longer carries them, so their contactVisibility can be enforced by the rules).
 * Falls back to the old profile fields for accounts not migrated yet, then to Firebase Auth.
 */
export async function getUserContact(uid: string): Promise<{ email: string; phoneNumber: string }> {
  if (!uid) return { email: "", phoneNumber: "" };
  const [contact, profile] = await Promise.all([
    adminDb.collection("users").doc(uid).collection("private").doc("contact").get().catch(() => null),
    adminDb.collection("users").doc(uid).get().catch(() => null),
  ]);
  const c = (contact?.data() as any) || {};
  const p = (profile?.data() as any) || {};
  let email: string = c.email || p.email || "";
  if (!email) email = (await adminAuth.getUser(uid).catch(() => null))?.email || "";
  return { email, phoneNumber: c.phoneNumber || p.phoneNumber || "" };
}

export async function getUserEmail(uid: string): Promise<string> {
  return (await getUserContact(uid)).email;
}

/** Same, when the caller already has the profile doc's data (saves re-reading it). */
export async function emailOf(uid: string, profileData?: Record<string, any>): Promise<string> {
  const c = await adminDb.collection("users").doc(uid).collection("private").doc("contact").get().catch(() => null);
  const email = (c?.data() as any)?.email || profileData?.email || "";
  return email || (await adminAuth.getUser(uid).catch(() => null))?.email || "";
}
