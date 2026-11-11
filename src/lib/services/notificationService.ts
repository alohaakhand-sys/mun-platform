import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

// Generic in-app notification. Created server-side only (admin, inside API routes);
// clients only read their own and flip `read`.
export interface AppNotification {
  id: string;
  uid: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  eventId?: string;
  read: boolean;
  createdAt?: any;
}

const toMillis = (v: any) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/** Realtime subscription to a user's latest notifications (newest first). */
export function subscribeMyNotifications(uid: string, cb: (items: AppNotification[]) => void) {
  // Single-field filter (no composite index); sort + cap client-side.
  const q = query(collection(db, "notifications"), where("uid", "==", uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as AppNotification)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, 30);
      cb(items);
    },
    (err) => {
      console.error("notifications subscribe error:", err);
      cb([]);
    }
  );
}

export async function markNotificationRead(id: string) {
  try {
    await updateDoc(doc(db, "notifications", id), { read: true });
  } catch (e) {
    console.error("markNotificationRead error:", e);
  }
}

export async function markAllNotificationsRead(uid: string) {
  try {
    const snap = await getDocs(query(collection(db, "notifications"), where("uid", "==", uid)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      if (!(d.data() as any).read) batch.update(d.ref, { read: true });
    });
    await batch.commit();
  } catch (e) {
    console.error("markAllNotificationsRead error:", e);
  }
}
