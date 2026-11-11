/**
 * Client side of event membership (server: lib/server/membership.ts). The marker the live read
 * rules check is written ONLY by the server, recomputed from the event's records; a client can
 * only ask for a recompute. Two callers:
 *
 *  - after a change to someone else's standing (approve, reject, withdraw, staff role change):
 *    `syncMembers(eventId, [uid])` — organizer / co-organizer / admin only, enforced server-side;
 *  - as a self-heal when a member opens a live surface: `ensureMyMembership(eventId)`, once per
 *    event per page load. It covers every approval path that never called the first one (and
 *    events from before markers existed), so a missed call can't lock a delegate out.
 *
 * Fire-and-forget by design: a failure here must never break the action that triggered it.
 */
import { auth } from "@/lib/firebase/client";

async function post(eventId: string, userIds?: string[]): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !eventId) return false;
  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/members/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(userIds ? { eventId, userIds } : { eventId }),
    });
    return res.ok;
  } catch (e) {
    console.error("[membership] sync", e);
    return false;
  }
}

/** Recompute these users' markers after their standing in the event changed. */
export function syncMembers(eventId: string, userIds: string[]): Promise<boolean> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!eventId || ids.length === 0) return Promise.resolve(false);
  return post(eventId, ids);
}

const ensured = new Map<string, Promise<boolean>>();

/**
 * The signed-in user's own marker, at most once per event per page load. Await it before
 * subscribing to a live surface the first time; later calls return the same promise.
 */
export function ensureMyMembership(eventId: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || !eventId) return Promise.resolve(false);
  const key = `${uid}:${eventId}`;
  let p = ensured.get(key);
  if (!p) {
    p = post(eventId);
    ensured.set(key, p);
    p.then((ok) => { if (!ok) ensured.delete(key); });
  }
  return p;
}
