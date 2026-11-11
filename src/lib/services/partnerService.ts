import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface Partner {
  id?: string;
  name: string;
  logoUrl: string;
  description: string;
  websiteUrl: string;
  tier: "gold" | "silver" | "bronze" | "media";
  order: number;
  createdAt?: any;
}

export async function getEventPartners(eventId: string): Promise<Partner[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "events", eventId, "partners"), orderBy("order", "asc"))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Partner));
  } catch (error) {
    console.error("Error fetching partners:", error);
    return [];
  }
}

export async function addPartner(
  eventId: string,
  partner: Omit<Partner, "id" | "createdAt">
): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(collection(db, "events", eventId, "partners"), {
      ...partner,
      createdAt: serverTimestamp(),
    });
    return { success: true, id: ref.id };
  } catch (error) {
    console.error("Error adding partner:", error);
    return { success: false, error };
  }
}

export async function updatePartner(
  eventId: string,
  partnerId: string,
  data: Partial<Partner>
): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "partners", partnerId), data as any);
    return { success: true };
  } catch (error) {
    console.error("Error updating partner:", error);
    return { success: false, error };
  }
}

export async function deletePartner(
  eventId: string,
  partnerId: string
): Promise<{ success: boolean; error?: any }> {
  try {
    await deleteDoc(doc(db, "events", eventId, "partners", partnerId));
    return { success: true };
  } catch (error) {
    console.error("Error deleting partner:", error);
    return { success: false, error };
  }
}

export async function reorderPartners(
  eventId: string,
  partners: Pick<Partner, "id" | "order">[]
): Promise<{ success: boolean; error?: any }> {
  try {
    const batch = writeBatch(db);
    for (const p of partners) {
      if (p.id) {
        batch.update(doc(db, "events", eventId, "partners", p.id), { order: p.order });
      }
    }
    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error("Error reordering partners:", error);
    return { success: false, error };
  }
}
