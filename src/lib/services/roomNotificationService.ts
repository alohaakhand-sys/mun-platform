import {
  collection, addDoc, query, where, onSnapshot, serverTimestamp, Timestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface RoomNotification {
  id?: string;
  message: string;
  type: "info" | "warning" | "urgent";
  createdAt: any;
  createdBy: string;
  expiresAt: any;
}

export async function sendRoomNotification(
  eventId: string,
  committeeId: string,
  data: {
    message: string;
    type: "info" | "warning" | "urgent";
    expiryMinutes: number;
    createdBy: string;
  }
): Promise<{ success: boolean; error?: any }> {
  if (!eventId || !committeeId) return { success: false, error: "Missing eventId or committeeId" };
  try {
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + data.expiryMinutes * 60 * 1000)
    );
    await addDoc(
      collection(db, "events", eventId, "committees", committeeId, "notifications"),
      {
        message: data.message,
        type: data.type,
        createdBy: data.createdBy,
        createdAt: serverTimestamp(),
        expiresAt,
      }
    );
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

export function subscribeRoomNotifications(
  eventId: string,
  committeeId: string,
  callback: (notifications: RoomNotification[]) => void
): () => void {
  if (!eventId || !committeeId) { callback([]); return () => {}; }
  const now = Timestamp.now();
  const q = query(
    collection(db, "events", eventId, "committees", committeeId, "notifications"),
    where("expiresAt", ">", now)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as RoomNotification)));
  });
}
