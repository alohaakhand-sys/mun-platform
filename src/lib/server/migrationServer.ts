import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { getUserEmail } from "@/lib/server/userContact";
import { FieldValue } from "firebase-admin/firestore";
import { createTransporter, mailFrom, emailShell, appUrl } from "@/lib/email/mailer";
import { sameCommittee } from "@/lib/utils/committee";
import { syncMembership } from "@/lib/server/membership";

// Server-only helpers for the migration flow. All mutations run with the admin SDK
// so notifications can be created for OTHER users and assignments swapped safely.

const norm = (s: any) => (typeof s === "string" ? s.trim().toLowerCase() : "");

/** Resolve the caller's uid from a `Bearer <idToken>` Authorization header. */
export async function requireUid(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

/** Owner, accepted co-organizer, or platform admin of the event. */
export async function isEventOrganizer(eventId: string, uid: string): Promise<boolean> {
  const ev = await adminDb.collection("events").doc(eventId).get();
  if (ev.exists && (ev.data() as any).organizerId === uid) return true;
  const staff = await adminDb.collection("events").doc(eventId).collection("staff").doc(uid).get();
  if (staff.exists) {
    const s = staff.data() as any;
    if (s.inviteStatus === "accepted" && s.role === "co-organizer") return true;
  }
  const userDoc = await adminDb.collection("users").doc(uid).get();
  const role = (userDoc.data() as any)?.role;
  return role === "App Admin" || role === "admin";
}

/**
 * An accepted chair or vice-chair of THIS committee — the server-side twin of the rules'
 * `isCommitteeChair`, and the same role test the Agora token route makes.
 *
 * Used by the docs routes to accept a vice-chair acting under delegate power: they submit and
 * finalize a paper whose `submittedBy` is the delegation, not themselves, so an author-only check
 * rejects them. Committees are keyed by NAME everywhere, so compare with `sameCommittee` — a raw
 * `===` misses a casing or whitespace difference and silently denies a legitimate dais member.
 */
export async function isCommitteeDais(
  eventId: string,
  uid: string,
  committee: string
): Promise<boolean> {
  if (!committee) return false;
  const staff = await adminDb.collection("events").doc(eventId).collection("staff").doc(uid).get();
  if (!staff.exists) return false;
  const s = staff.data() as any;
  if (s.inviteStatus !== "accepted") return false;
  const role = String(s.role || "");
  if (role !== "chair" && role !== "vice-chair") return false;
  return sameCommittee(String(s.committeeId || ""), committee);
}

/** Emails of the event owner + accepted co-organizers (migration request recipients). */
export async function getOrganizerRecipients(
  eventId: string
): Promise<{ uid: string; email: string }[]> {
  const out: { uid: string; email: string }[] = [];
  const ev = await adminDb.collection("events").doc(eventId).get();
  const ownerId = (ev.data() as any)?.organizerId;
  if (ownerId) {
    out.push({ uid: ownerId, email: await getUserEmail(ownerId) });
  }
  const staffSnap = await adminDb.collection("events").doc(eventId).collection("staff").get();
  staffSnap.forEach((d) => {
    const s = d.data() as any;
    if (s.inviteStatus === "accepted" && s.role === "co-organizer" && s.uid && s.uid !== ownerId) {
      out.push({ uid: s.uid, email: s.email || "" });
    }
  });
  return out;
}

/** Write an in-app notification (admin). */
export async function createNotification(n: {
  uid: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  eventId?: string;
}) {
  await adminDb.collection("notifications").add({
    uid: n.uid,
    type: n.type,
    title: n.title,
    body: n.body,
    ...(n.href ? { href: n.href } : {}),
    ...(n.eventId ? { eventId: n.eventId } : {}),
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function sendMail(to: string, subject: string, html: string) {
  if (!to) return;
  try {
    const t = createTransporter();
    const from = mailFrom();
    await t.sendMail({ from, to: from, bcc: to, subject, html });
  } catch (e: any) {
    console.error("migration sendMail error:", e?.message);
  }
}

/** Fire both channels: dashboard notification + branded email (best-effort). */
export async function notifyUser(opts: {
  uid: string;
  email?: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  eventId?: string;
  emoji?: string;
  accent?: string;
}) {
  await createNotification({
    uid: opts.uid,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    href: opts.href,
    eventId: opts.eventId,
  });
  if (opts.email) {
    const href = opts.href ? `${appUrl()}${opts.href}` : undefined;
    const html = emailShell({
      emoji: opts.emoji || "🔔",
      heading: opts.title,
      bodyHtml: `<p>${opts.body}</p>`,
      ctaLabel: href ? "Open dashboard" : undefined,
      ctaHref: href,
      accent: opts.accent || "#6d28d9",
    });
    await sendMail(opts.email, opts.title, html);
  }
}

/** The approved delegate currently holding (committee, country), excluding `excludeUid`. */
export async function findOccupant(
  eventId: string,
  committee: string,
  country: string,
  excludeUid: string
): Promise<{ appId: string; uid: string; name: string; email: string } | null> {
  const snap = await adminDb.collection("applications").where("eventId", "==", eventId).get();
  for (const d of snap.docs) {
    const a = d.data() as any;
    if (a.status !== "approved" || a.userId === excludeUid) continue;
    const cm = a.assignedCommittee || a.preferredCommittee || a.choices?.primary?.committee || "";
    const co = a.assignedCountry || "";
    if (norm(cm) === norm(committee) && norm(co) === norm(country)) {
      return { appId: d.id, uid: a.userId, name: a.applicantName || "Delegate", email: a.applicantEmail || "" };
    }
  }
  return null;
}

/** Apply a delegate's new committee/country to their application doc (admin). */
export async function setAssignment(appId: string, committee: string, country: string) {
  const ref = adminDb.collection("applications").doc(appId);
  await ref.update({
    assignedCommittee: committee,
    assignedCountry: country,
  });
  // The membership marker carries the committee (live-session access): follow the move.
  try {
    const a = (await ref.get()).data() as any;
    if (a?.eventId && a?.userId) await syncMembership(a.eventId, a.userId);
  } catch (e) {
    console.error("[migration] membership re-sync failed:", e instanceof Error ? e.message : e);
  }
}

// ── Committee chat-group re-sync (best-effort) ────────────────────────────────
// Keeps committee group conversations consistent when a delegate changes committee.
// Fully guarded — failures never block the migration itself.

async function findCommitteeGroup(eventId: string, committee: string) {
  // Single-field query (no composite index); filter type/committee in code.
  const snap = await adminDb.collection("conversations").where("eventId", "==", eventId).get();
  return snap.docs.find((d) => {
    const c = d.data() as any;
    return c.type === "group" && norm(c.committeeId) === norm(committee);
  });
}

async function addToCommitteeGroup(eventId: string, committee: string, uid: string, name: string) {
  const existing = await findCommitteeGroup(eventId, committee);
  if (existing) {
    await existing.ref.update({
      participants: FieldValue.arrayUnion(uid),
      [`participantNames.${uid}`]: name,
      [`unreadCount.${uid}`]: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  const ev = await adminDb.collection("events").doc(eventId).get();
  const eventName = (ev.data() as any)?.shortName || (ev.data() as any)?.title || "Conference";
  await adminDb.collection("conversations").add({
    type: "group",
    groupName: `${eventName} - ${committee}`,
    participants: [uid],
    participantNames: { [uid]: name },
    participantPhotos: {},
    createdBy: uid,
    admins: [uid],
    unreadCount: { [uid]: 0 },
    lastMessage: "Group created",
    lastMessageSenderId: "system",
    eventId,
    committeeId: committee,
    autoGenerated: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function removeFromCommitteeGroup(eventId: string, committee: string, uid: string) {
  const existing = await findCommitteeGroup(eventId, committee);
  if (!existing) return;
  await existing.ref.update({
    participants: FieldValue.arrayRemove(uid),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Move a delegate between committee groups (no-op for same/empty committee). */
export async function resyncCommitteeGroup(
  eventId: string,
  uid: string,
  name: string,
  oldCommittee: string,
  newCommittee: string
) {
  if (!newCommittee || norm(oldCommittee) === norm(newCommittee)) return;
  try {
    if (oldCommittee) await removeFromCommitteeGroup(eventId, oldCommittee, uid);
    await addToCommitteeGroup(eventId, newCommittee, uid, name);
  } catch (e: any) {
    console.error("resyncCommitteeGroup error:", e?.message);
  }
}

// ── Lazy swap-deadline expiry ─────────────────────────────────────────────────

/** Flip overdue awaiting_swap requests to failed + notify requesters. Returns count. */
export async function expireOverdueSwaps(eventId?: string): Promise<number> {
  const base = adminDb.collection("migrationRequests").where("status", "==", "awaiting_swap");
  const q = eventId ? base.where("eventId", "==", eventId) : base;
  let snap;
  try {
    snap = await q.get();
  } catch {
    // Fallback if the composite (status,eventId) index is missing: status-only + filter.
    snap = await adminDb.collection("migrationRequests").where("status", "==", "awaiting_swap").get();
  }
  const now = Date.now();
  let count = 0;
  for (const d of snap.docs) {
    const m = d.data() as any;
    if (eventId && m.eventId !== eventId) continue;
    const deadlineMs = m.swapDeadline?.toMillis?.() ?? (m.swapDeadline ? new Date(m.swapDeadline).getTime() : 0);
    if (!deadlineMs || deadlineMs > now) continue;
    await d.ref.update({ status: "failed", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await notifyUser({
      uid: m.requesterUid,
      email: m.requesterEmail,
      type: "migration_failed",
      title: "Migration request failed",
      body: `Your request to move to ${m.toCommittee} / ${m.toCountry} expired — the current delegate didn't respond in time.`,
      href: `/dashboard/conferences/${m.eventId}`,
      eventId: m.eventId,
      emoji: "⌛",
      accent: "#b45309",
    });
    count++;
  }
  return count;
}
