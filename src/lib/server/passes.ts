/**
 * QR passes (setup/qr-passes-plan.md): one signed pass per person per event.
 *
 *   MP1.<eventId>.<uid>.<version>.<sig>    sig = HMAC-SHA256(PASS_SECRET, "MP1|eventId|uid|version")
 *
 * The code names nobody and no coupon: the server decides at scan time what the holder may
 * redeem, so a coupon added later works with the same QR. `events/{eventId}/passes/{uid}` holds
 * the version (server-only in the rules); a reset bumps it and every older code stops working,
 * printed ID cards included. PASS_SECRET is server-only, never NEXT_PUBLIC.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { syncMembership, type Membership } from "@/lib/server/membership";
import { DEFAULT_MEAL_AUDIENCE, ALL_GROUPS, parseTimeWindow, eventDays, inAudience, type AudienceGroup, type PassAudience, type EventDay } from "@/lib/data/passAudience";

const PREFIX = "MP1";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function passesConfigured(): boolean {
  return !!process.env.PASS_SECRET;
}

function sign(eventId: string, uid: string, version: number): string {
  return createHmac("sha256", process.env.PASS_SECRET || "")
    .update(`${PREFIX}|${eventId}|${uid}|${version}`)
    .digest("base64url")
    .slice(0, 22);
}

export function encodePass(eventId: string, uid: string, version: number): string {
  return `${PREFIX}.${eventId}.${uid}.${version}.${sign(eventId, uid, version)}`;
}

export interface ParsedPass { eventId: string; uid: string; version: number }

/** The pass inside a scanned code, or null when it isn't one of ours or the signature is wrong. */
export function parsePass(code: string): ParsedPass | null {
  const parts = String(code || "").trim().split(".");
  if (parts.length !== 5 || parts[0] !== PREFIX) return null;
  const [, eventId, uid, v, sig] = parts;
  const version = Number(v);
  if (!ID.test(eventId) || !ID.test(uid) || !Number.isInteger(version) || version < 1) return null;
  const want = Buffer.from(sign(eventId, uid, version));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { eventId, uid, version };
}

const passRef = (eventId: string, uid: string) => adminDb.collection("events").doc(eventId).collection("passes").doc(uid);

/** The holder's current pass version; the first call issues version 1. */
export async function currentPassVersion(eventId: string, uid: string): Promise<number> {
  const ref = passRef(eventId, uid);
  const snap = await ref.get();
  const v = Number((snap.data() as any)?.version);
  if (snap.exists && v >= 1) return v;
  await ref.set({ version: 1, issuedAt: FieldValue.serverTimestamp() }, { merge: true });
  return 1;
}

/** Replace a pass (lost phone, shared screenshot): every older code stops working. */
export async function resetPass(eventId: string, uid: string, by: string): Promise<number> {
  const ref = passRef(eventId, uid);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = (Number((snap.data() as any)?.version) || 1) + 1;
    tx.set(ref, { version: next, resetAt: FieldValue.serverTimestamp(), resetBy: by }, { merge: true });
    return next;
  });
}

/** What the person is in the event; a missing marker is rebuilt from the records once. */
export async function memberOf(eventId: string, uid: string): Promise<Membership | null> {
  const snap = await adminDb.collection("events").doc(eventId).collection("members").doc(uid).get();
  if (snap.exists) {
    const m = snap.data() as any;
    return { role: m.role || "", committee: m.committee || "", kind: m.kind };
  }
  return syncMembership(eventId, uid);
}

export async function displayNameOf(uid: string): Promise<string> {
  const u = (await adminDb.collection("users").doc(uid).get()).data() as any;
  return String(u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Member");
}

// ── Scanning (phase P2) ───────────────────────────────────────────────────────────────────────
//
// munpilot runs as one long-lived Node process (Coolify), so a short in-memory cache keeps a
// busy lunch queue near 1 read + 1 write per scan (Spark: 50k reads/day). Pass versions and
// redemptions are never cached: a reset or a scan elsewhere must count at once.

const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await load();
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
  return v;
}
const MIN = 60_000;

export interface EventFacts { id: string; title: string; organizerId: string; timeZone?: string; plan?: unknown; days: EventDay[] }

/** The event's start (epoch ms): its `date`, else startDate + startTime (eventService getEventStartMs). */
function startMsOf(e: any): number | null {
  const d = e?.date ? new Date(e.date).getTime() : NaN;
  if (!Number.isNaN(d)) return d;
  const s = e?.startDate ? new Date(`${e.startDate}T${e.startTime || "00:00"}`).getTime() : NaN;
  return Number.isNaN(s) ? null : s;
}

export function eventFacts(eventId: string): Promise<EventFacts | null> {
  return cached(`ev:${eventId}`, 2 * MIN, async () => {
    const snap = await adminDb.collection("events").doc(eventId).get();
    if (!snap.exists) return null;
    const e = snap.data() as any;
    return { id: eventId, title: e.title || "", organizerId: e.organizerId || "", timeZone: e.timeZone, plan: e.plan, days: eventDays(startMsOf(e), e.endDate, e.timeZone) };
  });
}

/** May `uid` scan passes at this event? Owner, co-organizer, App Admin, or staff with canScanPasses. */
export async function scannerAccess(eventId: string, uid: string): Promise<{ ok: boolean; organizer: boolean; name: string }> {
  return cached(`scanner:${eventId}:${uid}`, 2 * MIN, async () => {
    const ev = await eventFacts(eventId);
    if (!ev) return { ok: false, organizer: false, name: "" };
    const [staff, user] = await Promise.all([
      adminDb.collection("events").doc(eventId).collection("staff").doc(uid).get(),
      adminDb.collection("users").doc(uid).get(),
    ]);
    const s = staff.data() as any;
    const u = user.data() as any;
    const name = String(u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || s?.name || "Staff");
    const admin = u?.role === "App Admin" || u?.role === "admin" || u?.isAdmin === true;
    const accepted = s?.inviteStatus === "accepted";
    const organizer = ev.organizerId === uid || admin || (accepted && s?.role === "co-organizer");
    return { ok: organizer || (accepted && s?.permissions?.canScanPasses === true), organizer, name };
  });
}

export interface HolderCard { uid: string; name: string; photoUrl: string; role: string; committee: string; kind: string }

export async function holderCard(eventId: string, uid: string): Promise<{ card: HolderCard; member: Membership } | null> {
  const member = await cached(`member:${eventId}:${uid}`, 2 * MIN, () => memberOf(eventId, uid));
  if (!member) return null;
  const user = await cached(`user:${uid}`, 10 * MIN, async () => (await adminDb.collection("users").doc(uid).get()).data() as any);
  const name = String(user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Member");
  return { card: { uid, name, photoUrl: user?.photoURL || "", role: member.role, committee: member.committee, kind: member.kind }, member };
}

export interface ScanTarget {
  id: string;
  title: string;
  /** Needs the event plan's `passes` feature (custom coupons; meals are Free). */
  pro: boolean;
  /** A paused coupon can't be redeemed. */
  active: boolean;
  /** A ride: only the applications registered on the route may board. */
  ride?: { registered: string[] };
  audience?: PassAudience;
  fallback: AudienceGroup[];
  uses: number;
  window: { start: number; end: number } | null;
  windowText: string;
}

/**
 * The event's meal slots as scan targets (one cached read of the collection). An edit to a slot
 * shows within 2 minutes; a NEW slot is found at once (scanTarget re-reads on a miss).
 */
export function mealTargets(eventId: string, fresh = false): Promise<(ScanTarget & { day: string; order: number })[]> {
  if (fresh) cache.delete(`meals:${eventId}`);
  return cached(`meals:${eventId}`, 2 * MIN, async () => {
    const snap = await adminDb.collection("events").doc(eventId).collection("foodSlots").get();
    return snap.docs.map((d) => {
      const slot = d.data() as any;
      const window = parseTimeWindow(slot.timeWindow);
      return {
        id: `meal:${d.id}`,
        title: [slot.mealName || "Meal", slot.day].filter(Boolean).join(" · "),
        audience: slot.audience,
        pro: false,
        active: true,
        fallback: DEFAULT_MEAL_AUDIENCE,
        uses: Math.max(1, Math.min(20, Number(slot.usesPerPerson) || 1)),
        window,
        windowText: slot.timeWindow || "",
        day: slot.day || "",
        order: window?.start ?? 24 * 60,
      };
    }).sort((x, y) => x.day.localeCompare(y.day) || x.order - y.order);
  });
}

/** What a scan can redeem. P2: meal slots (`meal:<slotId>`); coupons, check-in and rides come later. */
/** The organizer's custom coupons (`coupon:<id>`, Pro), cached like the meals. */
export function couponTargets(eventId: string): Promise<(ScanTarget & { day: string; order: number })[]> {
  return cached(`coupons:${eventId}`, 2 * MIN, async () => {
    const snap = await adminDb.collection("events").doc(eventId).collection("coupons").get();
    return snap.docs.map((d) => couponTarget(d.id, d.data()))
      .sort((x, y) => x.day.localeCompare(y.day) || x.order - y.order || x.title.localeCompare(y.title));
  });
}

function couponTarget(id: string, c: any): ScanTarget & { day: string; order: number } {
  const window = parseTimeWindow(c.timeWindow);
  return {
    id: `coupon:${id}`,
    title: [c.title || "Coupon", c.day].filter(Boolean).join(" · "),
    pro: true,
    active: c.active !== false,
    audience: c.audience,
    fallback: [],
    uses: Math.max(1, Math.min(20, Number(c.usesPerPerson) || 1)),
    window,
    windowText: c.timeWindow || "",
    day: c.day || "",
    order: window?.start ?? 24 * 60,
  };
}

/** Arrival check-in, once per person per event day (`checkin:d1`, Pro). */
async function checkinTargets(eventId: string): Promise<ScanTarget[]> {
  const ev = await eventFacts(eventId);
  return (ev?.days || []).map((d) => ({
    id: `checkin:${d.key}`, title: `Check-in · ${d.label}`, pro: true, active: true,
    audience: { groups: ALL_GROUPS }, fallback: [], uses: 1, window: null, windowText: "",
  }));
}

function rideTarget(routeId: string, r: any, day: EventDay): ScanTarget {
  return {
    id: `ride:${routeId}:${day.key}`,
    title: [r.routeName || [r.pickupPoint, r.dropoffPoint].filter(Boolean).join(" → ") || "Ride", day.label].join(" · "),
    pro: true, active: true, fallback: [], uses: 1, window: null, windowText: r.departureTime || "",
    ride: { registered: Array.isArray(r.registeredDelegates) ? r.registeredDelegates : [] },
  };
}

/** Boarding: each transport route on each event day (`ride:<routeId>:d1`, Pro). */
async function rideTargets(eventId: string): Promise<ScanTarget[]> {
  const [ev, routes] = await Promise.all([
    eventFacts(eventId),
    cached(`routes:${eventId}`, 2 * MIN, async () =>
      (await adminDb.collection("events").doc(eventId).collection("transportRoutes").get()).docs.map((d) => ({ id: d.id, data: d.data() as any }))),
  ]);
  return routes.flatMap((r) => (ev?.days || []).map((d) => rideTarget(r.id, r.data, d)));
}

/** Every meal, coupon, check-in day and ride of the event. */
export async function allTargets(eventId: string): Promise<ScanTarget[]> {
  const [meals, coupons, checkins, rides] = await Promise.all([mealTargets(eventId), couponTargets(eventId), checkinTargets(eventId), rideTargets(eventId)]);
  return [...meals, ...coupons, ...checkins, ...rides];
}

/** The holder's approved application in the event (rides list application ids), or null. */
export function applicationIdOf(eventId: string, uid: string): Promise<string | null> {
  return cached(`app:${eventId}:${uid}`, 10 * MIN, async () => {
    const snap = await adminDb.collection("applications").where("userId", "==", uid).where("eventId", "==", eventId).get();
    return snap.docs.find((d) => (d.data() as any).status === "approved")?.id ?? null;
  });
}

/** May this member redeem the target? Rides go by route registration, the rest by audience. */
export async function eligibleFor(eventId: string, t: ScanTarget, uid: string, member: Membership): Promise<boolean> {
  if (t.ride) {
    const appId = await applicationIdOf(eventId, uid);
    return !!appId && t.ride.registered.includes(appId);
  }
  return inAudience(uid, member, t.audience, t.fallback);
}

/**
 * What a scan can redeem: `meal:<slotId>`, `coupon:<couponId>`, `checkin:<day>`, `ride:<routeId>:<day>`.
 * A coupon is read fresh (one read) so pausing or editing it counts at the next scan.
 */
export async function scanTarget(eventId: string, target: string): Promise<ScanTarget | null> {
  if (target.startsWith("checkin:")) return (await checkinTargets(eventId)).find((t) => t.id === target) ?? null;
  if (target.startsWith("ride:")) {
    // Read the route fresh: someone may have registered a minute ago.
    const [, routeId, dayKey] = target.split(":");
    const day = (await eventFacts(eventId))?.days.find((d) => d.key === dayKey);
    if (!routeId || !ID.test(routeId) || !day) return null;
    const snap = await adminDb.collection("events").doc(eventId).collection("transportRoutes").doc(routeId).get();
    return snap.exists ? rideTarget(routeId, snap.data(), day) : null;
  }
  if (target.startsWith("coupon:")) {
    const id = target.slice("coupon:".length);
    if (!ID.test(id)) return null;
    const snap = await adminDb.collection("events").doc(eventId).collection("coupons").doc(id).get();
    return snap.exists ? couponTarget(id, snap.data()) : null;
  }
  if (!target.startsWith("meal:")) return null;
  return (await mealTargets(eventId)).find((t) => t.id === target)
    ?? (await mealTargets(eventId, true)).find((t) => t.id === target)
    ?? null;
}

export const redemptionRef = (eventId: string, target: string, uid: string) =>
  adminDb.collection("events").doc(eventId).collection("redemptions").doc(`${target}__${uid}`);

export async function passVersionOf(eventId: string, uid: string): Promise<number | null> {
  const snap = await passRef(eventId, uid).get();
  const v = Number((snap.data() as any)?.version);
  return snap.exists && v >= 1 ? v : null;
}

export interface PassPerson { uid: string; name: string; role: string; committee: string; country?: string; appId?: string }

/**
 * Everyone in the event for the organizer's Find by name: approved registrations, accepted staff
 * and the owner, named from their profiles (what the scan card shows; an application's
 * applicantName can be stale). Cached 5 minutes: one read per person per fill.
 */
export function eventPeople(eventId: string): Promise<PassPerson[]> {
  return cached(`people:${eventId}`, 5 * MIN, async () => {
    const ev = adminDb.collection("events").doc(eventId);
    const [apps, staff, event] = await Promise.all([
      adminDb.collection("applications").where("eventId", "==", eventId).where("status", "==", "approved")
        .select("userId", "applicantName", "role", "assignedCommittee", "preferredCommittee", "choices", "assignedCountry").get(),
      ev.collection("staff").where("inviteStatus", "==", "accepted").select("uid", "name", "role", "committeeId").get(),
      eventFacts(eventId),
    ]);
    const people = new Map<string, PassPerson>();
    // The same committee the member marker uses (membership.ts effectiveCommittee).
    const committeeOf = (a: any) => a.assignedCommittee || a.preferredCommittee || a.choices?.primary?.committee || "";
    apps.docs.forEach((d) => {
      const a = d.data() as any;
      if (a.userId) people.set(a.userId, { uid: a.userId, name: a.applicantName || "", role: a.role || "Delegate", committee: committeeOf(a), country: a.assignedCountry || "", appId: d.id });
    });
    staff.docs.forEach((d) => {
      const s = d.data() as any;
      if (s.uid) people.set(s.uid, { uid: s.uid, name: s.name || "", role: s.role || "staff", committee: s.committeeId || "" });
    });
    if (event?.organizerId && !people.has(event.organizerId)) people.set(event.organizerId, { uid: event.organizerId, name: "", role: "organizer", committee: "" });
    const list = [...people.values()];
    for (let i = 0; i < list.length; i += 300) {
      const refs = list.slice(i, i + 300).map((p) => adminDb.collection("users").doc(p.uid));
      const snaps = await adminDb.getAll(...refs, { fieldMask: ["displayName", "firstName", "lastName"] });
      snaps.forEach((s, j) => {
        const u = s.data() as any;
        const name = u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(" ");
        if (name) list[i + j].name = name;
        if (!list[i + j].name) list[i + j].name = "Member";
      });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  });
}

/**
 * Signed passes for many people at once (ID cards). Only event members get one; a person with no
 * pass yet is issued version 1. Two batched reads and at most one batched write per 300 people.
 */
export async function passCodesFor(eventId: string, uids: string[]): Promise<Record<string, string>> {
  const ev = adminDb.collection("events").doc(eventId);
  const out: Record<string, string> = {};
  for (let i = 0; i < uids.length; i += 300) {
    const chunk = uids.slice(i, i + 300).filter((u) => ID.test(u));
    if (!chunk.length) continue;
    const [members, passes] = await Promise.all([
      adminDb.getAll(...chunk.map((u) => ev.collection("members").doc(u))),
      adminDb.getAll(...chunk.map((u) => passRef(eventId, u))),
    ]);
    const batch = adminDb.batch();
    let writes = 0;
    chunk.forEach((uid, j) => {
      if (!members[j].exists) return;
      let v = Number((passes[j].data() as any)?.version);
      if (!(passes[j].exists && v >= 1)) {
        v = 1;
        batch.set(passRef(eventId, uid), { version: 1, issuedAt: FieldValue.serverTimestamp() }, { merge: true });
        writes++;
      }
      out[uid] = encodePass(eventId, uid, v);
    });
    if (writes) await batch.commit();
  }
  return out;
}
