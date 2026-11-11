import { doc, getDoc, updateDoc, setDoc, collection, collectionGroup, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface NotificationPreferences {
  emailOnApproval: boolean;
  emailOnRejection: boolean;
  emailOnNewEvent: boolean;
  pushNotifications: boolean;
}

export interface PrivacySettings {
  showProfile: boolean;
  showApplicationHistory: boolean;
  /** Show the MUN Stats card (conferences / blogs / awards) on the public profile. */
  showStats?: boolean;
  /**
   * Who may read your email and phone (users/{uid}/private/contact): "everyone" signed in
   * (the default when unset) or only your active "connections". Enforced by firestore.rules.
   */
  contactVisibility?: "everyone" | "connections";
}

/**
 * A member's email and phone. They live in users/{uid}/private/contact, not on the public profile
 * doc (which every signed-in member can read), so the owner's contactVisibility can be enforced.
 */
export interface UserContact {
  email?: string;
  phoneNumber?: string;
}

/** Someone's contact, or null when you may not see it (or they have none). */
export async function getUserContact(uid: string): Promise<UserContact | null> {
  try {
    const snap = await getDoc(doc(db, "users", uid, "private", "contact"));
    return snap.exists() ? (snap.data() as UserContact) : null;
  } catch {
    return null; // denied by their contactVisibility
  }
}

/** Your own email / phone (only you write it). */
export async function saveMyContact(uid: string, contact: UserContact): Promise<void> {
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (contact.email !== undefined) clean.email = contact.email.trim();
  if (contact.phoneNumber !== undefined) clean.phoneNumber = contact.phoneNumber.trim();
  await setDoc(doc(db, "users", uid, "private", "contact"), clean, { merge: true });
}

/** A single MUN experience entry (conference role, society position, etc.). */
export interface ExperienceEntry {
  id: string;
  org: string;
  orgShort?: string;
  roleTitle: string;
  employmentType?: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  description?: string;
}

/** A single education record. */
export interface EducationEntry {
  id: string;
  school: string;
  degree?: string;
  field?: string;
  startYear?: string;
  endYear?: string;
  activities?: string;
}

/** A manually-added honor/award (platform awards come from resultService). */
export interface AwardEntry {
  id: string;
  title: string;
  issuer?: string;
  date?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  photoURL?: string;
  coverURL?: string;
  institution?: string;
  bio?: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  notificationPreferences?: NotificationPreferences;
  privacySettings?: PrivacySettings;
  onboardingComplete?: boolean;
  isAdmin?: boolean;
  proStatus?: 'none' | 'pending' | 'active' | 'rejected' | 'expired';
  proFeatures?: string[];
  proAppliedAt?: any;
  proActivatedAt?: any;
  proExpiresAt?: any;

  // Location / personal (already written by settings, previously accessed via `as any`)
  city?: string;
  country?: string;
  nationality?: string;
  occupation?: string;
  fieldOfStudy?: string;

  // Social handles
  instagram?: string;
  linkedin?: string;
  tiktok?: string;

  // Rich profile fields (LinkedIn-style redesign, all optional)
  headline?: string;
  openToWork?: boolean;
  openToRoles?: string;
  skills?: string[];
  interests?: string[];
  experience?: ExperienceEntry[];
  education?: EducationEntry[];
  awards?: AwardEntry[];

  // Peer-reputation aggregates — written ONLY by the server (admin SDK) via the
  // /api/reputation/* routes. Clients read these but never write them.
  ratingSum?: number;                        // sum of all star scores received
  ratingCount?: number;                      // number of raters (avg = sum / count)
  endorsementCounts?: Record<string, number>; // skillSlug -> endorsement count

  // Denormalized MUN Stats — written by the owner's own profile view (they can read
  // their applications/articles; visitors can't), so the public profile can show
  // counts without needing read access to those private collections.
  publicStats?: { conferences: number; blogs: number; awards: number };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      return { uid: snap.id, ...data } as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  try {
    await updateDoc(doc(db, "users", uid), data as Record<string, unknown>);
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
}

export async function getAllUsers(): Promise<UserProfile[]> {
  try {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
}

/** A member's display name without their email (which is private): displayName, else first + last. */
export function userLabel(u: { displayName?: string | null; firstName?: string; lastName?: string } | null | undefined): string {
  return (u?.displayName || `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || "").trim();
}

/**
 * App Admin only: every user with their private contact merged in (one collection-group read of
 * users/{uid}/private/contact; the rules let admins read all of them).
 */
export async function getAllUsersWithContact(): Promise<UserProfile[]> {
  const [users, contacts] = await Promise.all([
    getAllUsers(),
    getDocs(collectionGroup(db, "private")).catch(() => null),
  ]);
  const byUid = new Map<string, UserContact>();
  contacts?.docs.forEach((d) => {
    if (d.id === "contact") byUid.set(d.ref.parent.parent?.id || "", d.data() as UserContact);
  });
  return users.map((u) => {
    const c = byUid.get(u.uid);
    return c ? { ...u, email: c.email || u.email, phoneNumber: c.phoneNumber || u.phoneNumber } : u;
  });
}

export async function updateUserRole(uid: string, role: string): Promise<void> {
  try {
    const { setDoc } = await import("firebase/firestore");
    await setDoc(doc(db, "users", uid), { role }, { merge: true });
  } catch (error) {
    console.error("Error updating user role:", error);
    throw error;
  }
}
