/**
 * Event membership — who may read an event's live data.
 *
 * WHY A MARKER. Firestore rules have to decide "is this caller part of this event?" on every
 * session, subcollection and committee-paper read. Staff are easy (`staff/{uid}` is UID-keyed),
 * but a delegate's membership lives in `applications/{autoId}`, which rules can neither query
 * nor get() by a derived path. So each member gets `events/{eventId}/members/{uid}`, and the
 * Realtime Database gets the same fact at `/eventMembers/{eventId}/{uid}` (RTDB rules cannot read
 * Firestore, and presence lives in RTDB).
 *
 * ONLY THE SERVER WRITES IT, and only by RECOMPUTING from the source of truth — the event's
 * owner, accepted staff docs, approved applications. Nobody can mint a marker by asking: a sync
 * for a user who isn't a member deletes theirs. Rules deny every client write.
 *
 * Callers: /api/members/sync (after approvals and staff changes, and as a self-heal when a
 * member opens a live surface), the backfill route, and the admin-SDK routes that change
 * applications. Event-scoped, not committee-scoped, on purpose: a committee-name mismatch must
 * never lock a delegate out of their own sitting. Chat and marks keep their own committee rules.
 */
import { adminDb, adminRtdb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export interface Membership { role: string; committee: string; kind: "organizer" | "staff" | "applicant" }

function effectiveCommittee(a: any): string {
  return a?.assignedCommittee || a?.preferredCommittee || a?.choices?.primary?.committee || "";
}

/** What `uid` is in `eventId`, from the platform's own records; null = not a member. */
export async function computeMembership(eventId: string, uid: string): Promise<Membership | null> {
  const ev = adminDb.collection("events").doc(eventId);
  const [eventSnap, staffSnap, appsSnap] = await Promise.all([
    ev.get(),
    ev.collection("staff").doc(uid).get(),
    adminDb.collection("applications").where("userId", "==", uid).where("eventId", "==", eventId).get(),
  ]);
  if (!eventSnap.exists) return null;
  if ((eventSnap.data() as any)?.organizerId === uid) return { role: "organizer", committee: "", kind: "organizer" };
  const st = staffSnap.exists ? (staffSnap.data() as any) : null;
  if (st && st.inviteStatus === "accepted") return { role: st.role || "staff", committee: st.committeeId || "", kind: "staff" };
  const app = appsSnap.docs.map((d) => d.data() as any).find((a) => a.status === "approved");
  if (app) return { role: app.role || "Delegate", committee: effectiveCommittee(app), kind: "applicant" };
  return null;
}

/** Recompute and write (or delete) both copies of the marker. Returns what was written. */
export async function syncMembership(eventId: string, uid: string): Promise<Membership | null> {
  const m = await computeMembership(eventId, uid);
  const ref = adminDb.collection("events").doc(eventId).collection("members").doc(uid);
  if (m) await ref.set({ ...m, uid, updatedAt: FieldValue.serverTimestamp() });
  else await ref.delete().catch(() => {});
  try {
    const node = adminRtdb().ref(`eventMembers/${eventId}/${uid}`);
    if (m) await node.set(true); else await node.remove();
  } catch (e) {
    // No RTDB configured for this deployment: presence simply stays unavailable.
    console.error("[membership] rtdb mirror", e instanceof Error ? e.message : e);
  }
  return m;
}

/** App Admins read every room's presence (the ghost observer); RTDB can't read `users/{uid}`. */
export async function syncAdminMirror(uid: string, isAdmin: boolean): Promise<void> {
  try {
    const node = adminRtdb().ref(`platformAdmins/${uid}`);
    if (isAdmin) await node.set(true); else await node.remove();
  } catch (e) {
    console.error("[membership] admin mirror", e instanceof Error ? e.message : e);
  }
}

export async function isEventManager(eventId: string, uid: string): Promise<boolean> {
  const ev = adminDb.collection("events").doc(eventId);
  const [eventSnap, staffSnap, userSnap] = await Promise.all([ev.get(), ev.collection("staff").doc(uid).get(), adminDb.collection("users").doc(uid).get()]);
  if ((eventSnap.data() as any)?.organizerId === uid) return true;
  const st = staffSnap.exists ? (staffSnap.data() as any) : null;
  if (st?.inviteStatus === "accepted" && st.role === "co-organizer") return true;
  return isAdminUser(userSnap.data());
}

export function isAdminUser(u: any): boolean {
  return u?.role === "App Admin" || u?.role === "admin" || u?.isAdmin === true;
}

/**
 * Backfill / reconcile every event's markers, a few events per call (Spark read budget):
 * POST { after? } and repeat with the returned `next` until it is null. Each event is rebuilt
 * whole — markers for people no longer in it are deleted, and the RTDB mirror is replaced — so
 * running it again is safe and also repairs any drift.
 */
export async function backfillMembersPage(after: string | null, pageSize = 5): Promise<{ events: number; members: number; next: string | null }> {
  let q = adminDb.collection("events").orderBy("__name__").limit(pageSize);
  if (after) q = q.startAfter(after);
  const events = await q.get();
  let members = 0;
  for (const ev of events.docs) {
    const eventId = ev.id;
    const [staffSnap, appsSnap, existing] = await Promise.all([
      ev.ref.collection("staff").where("inviteStatus", "==", "accepted").get(),
      adminDb.collection("applications").where("eventId", "==", eventId).where("status", "==", "approved").get(),
      ev.ref.collection("members").get(),
    ]);
    const want = new Map<string, Membership>();
    for (const d of appsSnap.docs) {
      const a = d.data() as any;
      if (a.userId) want.set(a.userId, { role: a.role || "Delegate", committee: effectiveCommittee(a), kind: "applicant" });
    }
    // Staff outrank an application, and the owner outranks both — computeMembership's order.
    for (const d of staffSnap.docs) {
      const s = d.data() as any;
      if (s.uid) want.set(s.uid, { role: s.role || "staff", committee: s.committeeId || "", kind: "staff" });
    }
    const owner = (ev.data() as any)?.organizerId;
    if (owner) want.set(owner, { role: "organizer", committee: "", kind: "organizer" });

    const batch = adminDb.batch();
    for (const [uid, m] of want) batch.set(ev.ref.collection("members").doc(uid), { ...m, uid, updatedAt: FieldValue.serverTimestamp() });
    for (const d of existing.docs) if (!want.has(d.id)) batch.delete(d.ref);
    await batch.commit();
    try {
      await adminRtdb().ref(`eventMembers/${eventId}`).set(want.size ? Object.fromEntries([...want.keys()].map((u) => [u, true])) : null);
    } catch (e) {
      console.error("[membership] rtdb backfill", eventId, e instanceof Error ? e.message : e);
    }
    members += want.size;
  }
  const last = events.docs[events.docs.length - 1];
  return { events: events.size, members, next: events.size === pageSize && last ? last.id : null };
}
