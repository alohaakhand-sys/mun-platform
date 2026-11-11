import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type MigrationStatus =
  | "pending"        // awaiting organizer review
  | "awaiting_swap"  // organizer approved; target occupied; waiting on occupant
  | "completed"      // migrated (direct or swap done)
  | "rejected"       // organizer rejected
  | "failed"         // swap declined or deadline expired
  | "cancelled";     // requester withdrew

export type MigrationType = "direct" | "swap" | null;

/** Who started the migration: a delegate request, or an organizer/admin direct move. */
export type MigrationSource = "delegate" | "admin";

export interface MigrationRequest {
  id?: string;
  eventId: string;
  eventTitle?: string;
  requesterUid: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterAppId: string;
  fromCommittee: string;
  fromCountry: string;
  toCommittee: string;
  toCountry: string;
  type?: MigrationType;
  status: MigrationStatus;
  /** "delegate" (request flow) or "admin" (organizer direct move). Absent = delegate (legacy). */
  source?: MigrationSource;
  /** uid/name of the organizer who performed an admin direct move. */
  decidedByUid?: string;
  decidedByName?: string;
  occupantUid?: string;
  occupantAppId?: string;
  occupantName?: string;
  occupantEmail?: string;
  swapDeadline?: any;
  swapResponse?: "accepted" | "declined";
  reason?: string;
  createdAt?: any;
  updatedAt?: any;
  resolvedAt?: any;
}

export const ACTIVE_MIGRATION_STATUSES: MigrationStatus[] = ["pending", "awaiting_swap"];

const toMillis = (v: any) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;
const byNewest = (a: MigrationRequest, b: MigrationRequest) => toMillis(b.createdAt) - toMillis(a.createdAt);

/** The requester's most recent migration request for an event (active preferred). */
export async function getMyMigrationRequest(eventId: string, uid: string): Promise<MigrationRequest | null> {
  try {
    // Single-field filter; narrow to event + pick latest client-side (no composite index).
    const snap = await getDocs(query(collection(db, "migrationRequests"), where("requesterUid", "==", uid)));
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }) as MigrationRequest)
      .filter((r) => r.eventId === eventId)
      .sort(byNewest);
    return rows.find((r) => ACTIVE_MIGRATION_STATUSES.includes(r.status)) || rows[0] || null;
  } catch (e) {
    console.error("getMyMigrationRequest error:", e);
    return null;
  }
}

/** Pending swap offers where the current user is the occupant being asked to swap. */
export async function getSwapOffersForOccupant(uid: string): Promise<MigrationRequest[]> {
  try {
    const snap = await getDocs(query(collection(db, "migrationRequests"), where("occupantUid", "==", uid)));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }) as MigrationRequest)
      .filter((r) => r.status === "awaiting_swap")
      .sort(byNewest);
  } catch (e) {
    console.error("getSwapOffersForOccupant error:", e);
    return [];
  }
}

/** All migration requests for an event (organizer view). */
export async function getEventMigrationRequests(eventId: string): Promise<MigrationRequest[]> {
  try {
    const snap = await getDocs(query(collection(db, "migrationRequests"), where("eventId", "==", eventId)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as MigrationRequest).sort(byNewest);
  } catch (e) {
    console.error("getEventMigrationRequests error:", e);
    return [];
  }
}

/** POST helper that attaches the caller's Firebase ID token for the server routes. */
export async function callMigrationApi(
  path: string,
  idToken: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const resp = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: data.error || "Request failed" };
    return { ok: true, ...data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
