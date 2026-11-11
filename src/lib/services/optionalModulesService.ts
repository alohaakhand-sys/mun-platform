import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, setDoc,
  onSnapshot, query, where, serverTimestamp, arrayUnion, Timestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { PassAudience, MemberFacts } from "@/lib/data/passAudience";

// ── Food Coupons ──────────────────────────────────────────────────────────────

export interface FoodSlot {
  id?: string;
  mealName: string;
  timeWindow: string;
  venue: string;
  day: string;
  /** Who may claim it with their pass; missing = approved applicants (DEFAULT_MEAL_AUDIENCE). */
  audience?: PassAudience;
  /** Times each person may claim it; missing = 1. */
  usesPerPerson?: number;
}

export async function getFoodSlots(eventId: string): Promise<FoodSlot[]> {
  try {
    const snap = await getDocs(collection(db, "events", eventId, "foodSlots"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FoodSlot));
  } catch { return []; }
}

/**
 * The signed-in member's own pass facts: their member marker (which meals are theirs) and what
 * they already claimed (redemptions are written by the scanner's server route only).
 */
export async function getMyPassUse(eventId: string, uid: string): Promise<{
  member: MemberFacts | null;
  used: Record<string, { count: number; lastAt: number | null }>;
  /** Their approved application (transport routes list application ids). */
  applicationId: string | null;
}> {
  const [m, r, a] = await Promise.all([
    getDoc(doc(db, "events", eventId, "members", uid)).catch(() => null),
    getDocs(query(collection(db, "events", eventId, "redemptions"), where("holderUid", "==", uid))).catch(() => null),
    getDocs(query(collection(db, "applications"), where("userId", "==", uid), where("eventId", "==", eventId))).catch(() => null),
  ]);
  const used: Record<string, { count: number; lastAt: number | null }> = {};
  r?.docs.forEach((d) => {
    const x = d.data() as any;
    used[x.target] = { count: Number(x.count) || 0, lastAt: x.lastAt?.toMillis?.() ?? null };
  });
  const applicationId = a?.docs.find((d) => (d.data() as any).status === "approved")?.id ?? null;
  return { member: m?.exists() ? (m.data() as MemberFacts) : null, used, applicationId };
}

// ── Custom coupons (Pro: plan feature `passes`) ───────────────────────────────

export type CouponKind = "gift" | "meal" | "drink" | "kit" | "other";

export interface Coupon {
  id?: string;
  title: string;
  note?: string;
  kind: CouponKind;
  day?: string;
  timeWindow?: string;
  venue?: string;
  audience: PassAudience;
  usesPerPerson: number;
  active: boolean;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}

export async function getCoupons(eventId: string): Promise<Coupon[]> {
  try {
    const snap = await getDocs(collection(db, "events", eventId, "coupons"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon));
  } catch { return []; }
}

export async function saveCoupon(eventId: string, c: Coupon, uid: string): Promise<string> {
  const { id, createdAt: _c, updatedAt: _u, ...rest } = c;
  // Firestore rejects undefined; empty optional fields are simply left out.
  const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== ""));
  if (id) {
    await updateDoc(doc(db, "events", eventId, "coupons", id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(collection(db, "events", eventId, "coupons"), { ...data, createdBy: uid, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteCoupon(eventId: string, id: string): Promise<void> {
  await deleteDoc(doc(db, "events", eventId, "coupons", id));
}

// ── Transport ─────────────────────────────────────────────────────────────────

export interface TransportRoute {
  id?: string;
  routeName: string;
  pickupPoint: string;
  dropoffPoint: string;
  departureTime: string;
  returnTime: string;
  capacity: number;
  registeredDelegates: string[];
}

export async function getTransportRoutes(eventId: string): Promise<TransportRoute[]> {
  try {
    const snap = await getDocs(collection(db, "events", eventId, "transportRoutes"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as TransportRoute));
  } catch { return []; }
}

export async function registerForTransport(
  eventId: string,
  routeId: string,
  applicationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const routeRef = doc(db, "events", eventId, "transportRoutes", routeId);
    const routeSnap = await getDoc(routeRef);
    if (!routeSnap.exists()) return { success: false, error: "Route not found" };
    const routeData = routeSnap.data() as TransportRoute;
    if ((routeData.registeredDelegates || []).length >= routeData.capacity)
      return { success: false, error: "Route is full" };
    if ((routeData.registeredDelegates || []).includes(applicationId))
      return { success: false, error: "Already registered" };
    await updateDoc(routeRef, { registeredDelegates: arrayUnion(applicationId) });
    return { success: true };
  } catch (error: any) { return { success: false, error: error.message }; }
}

// ── Accommodation ─────────────────────────────────────────────────────────────

export interface AccommodationBlock {
  id?: string;
  blockName: string;
  roomType: string;
  pricePerNight: number;
  availableRooms: number;
}

export interface AccommodationRequest {
  id?: string;
  delegateUid: string;
  blockId: string;
  blockName: string;
  status: "pending" | "confirmed" | "rejected";
  requestedAt?: any;
}

export async function getAccommodationBlocks(eventId: string): Promise<AccommodationBlock[]> {
  try {
    const snap = await getDocs(collection(db, "events", eventId, "accommodationBlocks"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AccommodationBlock));
  } catch { return []; }
}

export async function getAccommodationRequest(
  eventId: string,
  delegateUid: string
): Promise<AccommodationRequest | null> {
  try {
    const q = query(
      collection(db, "events", eventId, "accommodationRequests"),
      where("delegateUid", "==", delegateUid)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as AccommodationRequest;
  } catch { return null; }
}

export async function requestAccommodation(
  eventId: string,
  data: Omit<AccommodationRequest, "id" | "requestedAt">
): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(
      collection(db, "events", eventId, "accommodationRequests"),
      { ...data, requestedAt: serverTimestamp() }
    );
    return { success: true, id: ref.id };
  } catch (error) { return { success: false, error }; }
}

// ── Live MUN ──────────────────────────────────────────────────────────────────

export interface LiveSession {
  id?: string;
  title: string;
  committeeName: string;
  currentSpeaker: string;
  topic: string;
  status: "live" | "idle";
}

export function subscribeLiveSessions(
  eventId: string,
  callback: (sessions: LiveSession[]) => void
) {
  return onSnapshot(collection(db, "events", eventId, "liveSessions"), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as LiveSession)));
  });
}

// ── Study Guide ───────────────────────────────────────────────────────────────

export interface StudyGuide {
  content?: string;       // markdown text (preferred storage)
  fileName?: string;      // optional display name
  format?: "markdown" | "pdf-legacy";
  url?: string;           // legacy: PDF stored in Storage (deprecated)
  uploadedAt: any;
  uploadedBy: string;
}

export async function getStudyGuide(
  eventId: string,
  committeeName: string
): Promise<StudyGuide | null> {
  try {
    const snap = await getDoc(doc(db, "events", eventId, "studyGuides", committeeName));
    if (!snap.exists()) return null;
    return snap.data() as StudyGuide;
  } catch { return null; }
}

export async function saveStudyGuide(
  eventId: string,
  committeeName: string,
  data: StudyGuide
): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "studyGuides", committeeName), data as any);
    return { success: true };
  } catch {
    // doc may not exist, use set
    try {
      const { setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "events", eventId, "studyGuides", committeeName), data);
      return { success: true };
    } catch (error) { return { success: false, error }; }
  }
}

export async function deleteStudyGuide(
  eventId: string,
  committeeName: string
): Promise<{ success: boolean; error?: any }> {
  try {
    await deleteDoc(doc(db, "events", eventId, "studyGuides", committeeName));
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

// ── Food Slots (write) ────────────────────────────────────────────────────────

export async function addFoodSlot(eventId: string, data: Omit<FoodSlot, "id">): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(collection(db, "events", eventId, "foodSlots"), data);
    return { success: true, id: ref.id };
  } catch (error) { return { success: false, error }; }
}

export async function updateFoodSlot(eventId: string, slotId: string, data: Partial<FoodSlot>): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "foodSlots", slotId), data as any);
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

export async function deleteFoodSlot(eventId: string, slotId: string): Promise<{ success: boolean; error?: any }> {
  try {
    await deleteDoc(doc(db, "events", eventId, "foodSlots", slotId));
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

// ── Transport Routes (write) ──────────────────────────────────────────────────

export async function addTransportRoute(eventId: string, data: Omit<TransportRoute, "id" | "registeredDelegates">): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(collection(db, "events", eventId, "transportRoutes"), { ...data, registeredDelegates: [] });
    return { success: true, id: ref.id };
  } catch (error) { return { success: false, error }; }
}

export async function updateTransportRoute(eventId: string, routeId: string, data: Partial<TransportRoute>): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "transportRoutes", routeId), data as any);
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

export async function deleteTransportRoute(eventId: string, routeId: string): Promise<{ success: boolean; error?: any }> {
  try {
    await deleteDoc(doc(db, "events", eventId, "transportRoutes", routeId));
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

// ── Accommodation Blocks (write) ──────────────────────────────────────────────

export async function addAccommodationBlock(eventId: string, data: Omit<AccommodationBlock, "id">): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(collection(db, "events", eventId, "accommodationBlocks"), data);
    return { success: true, id: ref.id };
  } catch (error) { return { success: false, error }; }
}

export async function updateAccommodationBlock(eventId: string, blockId: string, data: Partial<AccommodationBlock>): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "accommodationBlocks", blockId), data as any);
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

export async function deleteAccommodationBlock(eventId: string, blockId: string): Promise<{ success: boolean; error?: any }> {
  try {
    await deleteDoc(doc(db, "events", eventId, "accommodationBlocks", blockId));
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

export async function getAccommodationRequests(eventId: string): Promise<AccommodationRequest[]> {
  try {
    const snap = await getDocs(collection(db, "events", eventId, "accommodationRequests"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AccommodationRequest));
  } catch { return []; }
}

export async function approveAccommodationRequest(eventId: string, reqId: string, status: "confirmed" | "rejected"): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "accommodationRequests", reqId), { status });
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

// ── Live Sessions (write) ─────────────────────────────────────────────────────

export async function addLiveSession(eventId: string, data: Omit<LiveSession, "id">): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(collection(db, "events", eventId, "liveSessions"), data);
    return { success: true, id: ref.id };
  } catch (error) { return { success: false, error }; }
}

export async function updateLiveSession(eventId: string, sessionId: string, data: Partial<LiveSession>): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "liveSessions", sessionId), data as any);
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

export async function deleteLiveSession(eventId: string, sessionId: string): Promise<{ success: boolean; error?: any }> {
  try {
    await deleteDoc(doc(db, "events", eventId, "liveSessions", sessionId));
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

// ── Dress Code ────────────────────────────────────────────────────────────────

export interface DressCode {
  text: string;
  images: string[];
}

export async function getDressCode(eventId: string): Promise<DressCode | null> {
  try {
    const snap = await getDoc(doc(db, "events", eventId, "settings", "dressCode"));
    if (!snap.exists()) return null;
    return snap.data() as DressCode;
  } catch { return null; }
}

export async function saveDressCode(eventId: string, dressCode: DressCode): Promise<{ success: boolean; error?: any }> {
  try {
    await setDoc(doc(db, "events", eventId, "settings", "dressCode"), dressCode);
    return { success: true };
  } catch (error) { return { success: false, error }; }
}

// ── Rules & Regulations ─────────────────────────────────────────────────────────
// Event-wide guide authored by the organizer/co-org, readable by every role in the
// event (chairs, delegates, EB, observers…). Markdown under the hood. Stored on the
// existing settings collection, so the settings/{docId} firestore rule already gates
// it: read = any signed-in user, write = organizer/co-organizer/admin.

export interface RulesGuide {
  content: string;      // markdown text
  updatedAt: any;
  updatedBy: string;
}

export async function getRulesGuide(eventId: string): Promise<RulesGuide | null> {
  try {
    const snap = await getDoc(doc(db, "events", eventId, "settings", "rulesRegulations"));
    if (!snap.exists()) return null;
    return snap.data() as RulesGuide;
  } catch { return null; }
}

export async function saveRulesGuide(eventId: string, data: RulesGuide): Promise<{ success: boolean; error?: any }> {
  try {
    await setDoc(doc(db, "events", eventId, "settings", "rulesRegulations"), data);
    return { success: true };
  } catch (error) { return { success: false, error }; }
}
