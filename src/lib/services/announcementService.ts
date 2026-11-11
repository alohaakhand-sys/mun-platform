import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface AudienceFilter {
  roles: string[];
  committees: string[];
  /** Explicit recipient userIds. When non-empty, overrides role/committee filters. */
  userIds?: string[];
  paymentStatus: "paid" | "unpaid" | "all";
}

export interface AnnouncementRecipient {
  uid: string;
  name: string;
  email: string;
  role: string;
}

export interface Announcement {
  id?: string;
  subject: string;
  body: string;   // markdown authored in the WYSIWYG composer
  audience: AudienceFilter;
  status: "draft" | "scheduled" | "queued" | "sending" | "sent" | "partial" | "failed";
  sentBy: string;
  recipientCount: number;
  /** Epoch millis for a scheduled send. A cloud function flips due docs to "queued". */
  scheduledAt?: number;
  createdAt?: any;
  sentAt?: any;
  deliveryStats?: {
    sent: number;
    failed: number;
  };
  recipients?: AnnouncementRecipient[];
}

export async function getAnnouncements(eventId: string): Promise<Announcement[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "events", eventId, "announcements"), orderBy("createdAt", "desc"))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
  } catch (error) {
    console.error("Error fetching announcements:", error);
    return [];
  }
}

import { onSnapshot } from "firebase/firestore";

export function subscribeAnnouncements(eventId: string, callback: (announcements: Announcement[]) => void) {
  const q = query(collection(db, "events", eventId, "announcements"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
    callback(data);
  });
}

export async function saveAnnouncement(
  eventId: string,
  data: Omit<Announcement, "id" | "createdAt">
): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(collection(db, "events", eventId, "announcements"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return { success: true, id: ref.id };
  } catch (error) {
    console.error("Error saving announcement:", error);
    return { success: false, error };
  }
}

export async function updateAnnouncement(
  eventId: string,
  announcementId: string,
  data: Partial<Announcement>
): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "announcements", announcementId), data as any);
    return { success: true };
  } catch (error) {
    console.error("Error updating announcement:", error);
    return { success: false, error };
  }
}

export async function deleteAnnouncement(
  eventId: string,
  announcementId: string
): Promise<{ success: boolean; error?: any }> {
  try {
    await deleteDoc(doc(db, "events", eventId, "announcements", announcementId));
    return { success: true };
  } catch (error) {
    console.error("Error deleting announcement:", error);
    return { success: false, error };
  }
}

const ROLE_KEYWORDS: Record<string, string[]> = {
  'delegate': ['delegate', 'lead'],
  'chair': ['chair', 'director', 'vice-chair'],
  'observer': ['observer'],
  'faculty-advisor': ['faculty advisor', 'faculty-advisor', 'advisor'],
  'staff': ['staff', 'co-organizer', 'usg'],
};

export function roleMatches(appRole: string, filterRoles: string[]): boolean {
  if (!filterRoles || filterRoles.length === 0) return true;
  if (filterRoles.includes("all")) return true;
  
  const lc = (appRole || '').toLowerCase();
  return filterRoles.some(rid =>
    ROLE_KEYWORDS[rid]?.some(kw => lc.includes(kw)) ?? false
  );
}

export function isUserInAudience(appRole: string, audience: any): boolean {
  if (!audience) return true;
  if (typeof audience === "string") {
    if (audience === "all") return true;
    if (audience === "delegates") {
      return roleMatches(appRole, ["delegate"]);
    }
    return true;
  }
  if (typeof audience === "object") {
    const roles = audience.roles || [];
    if (roles.length === 0) return true;
    return roleMatches(appRole, roles);
  }
  return true;
}

