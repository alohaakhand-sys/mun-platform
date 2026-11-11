import {
  collection, doc, getDocs, addDoc, updateDoc, serverTimestamp, query, where, writeBatch, collectionGroup
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type AwardType = "best_delegate" | "outstanding" | "honorable" | "verbal_mention" | "none";
export type ResultStatus = "pending" | "approved" | "revision_requested";

export interface DelegateResult {
  id?: string;
  delegateUid: string;
  delegateName: string;
  committeeId: string;
  committeeName: string;
  awardType: AwardType;
  score: number; // 0..100 finalScore for new results; legacy results hold a raw sum
  notes: string;
  status: ResultStatus;
  approvedBy: string | null;
  approvedAt: any | null;
  submittedBy: string;
  createdAt?: any;
  // Provenance for the percentage-based system. New results set scoreKind:"percent"
  // so `/100` views can distinguish them from legacy raw-sum scores.
  computedPct?: number;
  chairOverall?: number | null;
  scoreKind?: "percent";
}

export async function getEventResults(eventId: string): Promise<DelegateResult[]> {
  try {
    const snap = await getDocs(collection(db, "events", eventId, "results"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DelegateResult));
  } catch (error) {
    console.error("Error fetching results:", error);
    return [];
  }
}

export async function getUserAchievements(uid: string): Promise<DelegateResult[]> {
  try {
    const q = query(collectionGroup(db, "results"), where("delegateUid", "==", uid), where("status", "==", "approved"));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, eventId: d.ref.parent.parent?.id || "", ...d.data() } as DelegateResult & { eventId: string }))
      .filter(r => r.awardType && r.awardType !== "none");
  } catch (error) {
    console.error("Error fetching user achievements:", error);
    return [];
  }
}

export async function getResultsByCommittee(
  eventId: string,
  committeeId: string
): Promise<DelegateResult[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "events", eventId, "results"), where("committeeId", "==", committeeId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DelegateResult));
  } catch (error) {
    console.error("Error fetching committee results:", error);
    return [];
  }
}

export async function submitResult(
  eventId: string,
  result: Omit<DelegateResult, "id" | "createdAt">
): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(collection(db, "events", eventId, "results"), {
      ...result,
      createdAt: serverTimestamp(),
    });
    return { success: true, id: ref.id };
  } catch (error) {
    console.error("Error submitting result:", error);
    return { success: false, error };
  }
}

export async function approveResult(
  eventId: string,
  resultId: string,
  approverUid: string
): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "results", resultId), {
      status: "approved",
      approvedBy: approverUid,
      approvedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error approving result:", error);
    return { success: false, error };
  }
}

export async function requestRevision(
  eventId: string,
  resultId: string,
  notes: string
): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "results", resultId), {
      status: "revision_requested",
      notes,
    });
    return { success: true };
  } catch (error) {
    console.error("Error requesting revision:", error);
    return { success: false, error };
  }
}

export async function bulkApprove(
  eventId: string,
  resultIds: string[],
  approverUid: string
): Promise<{ success: boolean; error?: any }> {
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    for (const id of resultIds) {
      batch.update(doc(db, "events", eventId, "results", id), {
        status: "approved",
        approvedBy: approverUid,
        approvedAt: now,
      });
    }
    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error("Error bulk approving:", error);
    return { success: false, error };
  }
}
