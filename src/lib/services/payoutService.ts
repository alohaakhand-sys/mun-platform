import {
  collection,
  addDoc,
  doc,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

// Payout requests for the platform-managed Stripe model: the platform's single
// Stripe account collects every registration fee, so organizers don't connect
// their own account — they request a payout of their accrued balance and an
// App Admin fulfills the transfer (off-platform) and marks it paid here.
export interface PayoutRequest {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  amount: number;
  status: "pending" | "paid" | "rejected";
  note?: string;
  requestedAt: any;
  processedAt?: any;
}

const COLLECTION = "payoutRequests";

export async function createPayoutRequest(input: {
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  amount: number;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!(input.amount > 0)) return { success: false, error: "Amount must be positive." };
  try {
    await addDoc(collection(db, COLLECTION), {
      organizerId: input.organizerId,
      organizerName: input.organizerName,
      organizerEmail: input.organizerEmail,
      amount: input.amount,
      note: input.note || "",
      status: "pending",
      requestedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error creating payout request:", error);
    return { success: false, error: error.message };
  }
}

export async function getPayoutsByOrganizer(organizerId: string): Promise<PayoutRequest[]> {
  if (!organizerId) return [];
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTION), where("organizerId", "==", organizerId), orderBy("requestedAt", "desc"))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayoutRequest));
  } catch (error) {
    console.error("Error fetching organizer payouts:", error);
    return [];
  }
}

export async function getAllPayouts(): Promise<PayoutRequest[]> {
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), orderBy("requestedAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayoutRequest));
  } catch (error) {
    console.error("Error fetching payouts:", error);
    return [];
  }
}

export async function setPayoutStatus(
  payoutId: string,
  status: "paid" | "rejected"
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateDoc(doc(db, COLLECTION, payoutId), {
      status,
      processedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating payout status:", error);
    return { success: false, error: error.message };
  }
}
