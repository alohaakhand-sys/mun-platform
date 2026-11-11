import { collection, addDoc, getDocs, query, orderBy, limit, where, serverTimestamp, Timestamp, onSnapshot, Query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type ActivityType =
  | "application_submitted"
  | "application_approved"
  | "application_rejected"
  | "position_paper_submitted"
  | "event_published"
  | "marking_submitted";

export interface ActivityData {
  id: string;
  userId: string;
  actorName: string;
  actorRole: string;
  actorPhotoURL?: string;
  type: ActivityType;
  action: string;
  targetId: string;
  targetTitle: string;
  createdAt?: Timestamp;
  isPublic: boolean;
}

export async function logActivity(data: Omit<ActivityData, "id" | "createdAt">): Promise<void> {
  try {
    await addDoc(collection(db, "activities"), { ...data, createdAt: serverTimestamp() });
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}

export function getRecentActivitiesRealtime(
  uid: string,
  scope: "All" | "Mine" | "Following",
  limitCount: number,
  followingUids: string[],
  callback: (activities: ActivityData[]) => void
): () => void {
  const ref = collection(db, "activities");
  let q: Query = query(ref, orderBy("createdAt", "desc"), limit(limitCount));

  if (scope === "Mine" && uid) {
    q = query(ref, where("userId", "==", uid), orderBy("createdAt", "desc"), limit(limitCount));
  } else if (scope === "Following" && followingUids.length > 0) {
    // Cannot do 'in' array of length 0 or > 30. For simple case assume <= 30.
    const subset = followingUids.slice(0, 30);
    q = query(
      ref,
      where("userId", "in", subset),
      where("isPublic", "==", true),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );
  } else if (scope === "All") {
    q = query(ref, where("isPublic", "==", true), orderBy("createdAt", "desc"), limit(limitCount));
  }

  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityData)));
  }, err => {
    console.error("Activity stream error", err);
  });
}

export async function getRecentActivities(limitCount: number): Promise<ActivityData[]> {
  try {
    const q = query(collection(db, "activities"), orderBy("createdAt", "desc"), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityData));
  } catch (error) {
    console.error("Error fetching recent activities:", error);
    return [];
  }
}
