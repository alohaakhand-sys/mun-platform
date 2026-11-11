import { adminDb } from "@/lib/firebase/admin";
import { isCommitteeDais, isEventOrganizer } from "@/lib/server/migrationServer";
import { isEventManager } from "@/lib/server/membership";
import { belongsToCommittee, sameCommittee } from "@/lib/utils/committee";

/**
 * Server-side role checks for routes that act on a committee or send mail for an event. They
 * mirror firestore.rules (accepted staff docs, committee scope by name) so a route can't be used
 * by someone the rules would refuse.
 */

/** An accepted director / USG whose scope covers [committee] (no committeeId = every committee). */
export async function isExecBoardOver(eventId: string, uid: string, committee: string): Promise<boolean> {
  const staff = await adminDb.collection("events").doc(eventId).collection("staff").doc(uid).get();
  if (!staff.exists) return false;
  const s = staff.data() as any;
  if (s.inviteStatus !== "accepted") return false;
  const role = String(s.role || "").toLowerCase();
  if (role !== "director" && role !== "usg" && role !== "eb") return false;
  return !s.committeeId || sameCommittee(String(s.committeeId), committee);
}

/** Runs this committee: its chair or vice-chair, an EB member over it, the organizer or a co-organizer. */
export async function canRunCommittee(eventId: string, uid: string, committee: string): Promise<boolean> {
  return (await isCommitteeDais(eventId, uid, committee)) ||
    (await isExecBoardOver(eventId, uid, committee)) ||
    (await isEventOrganizer(eventId, uid));
}

/** Works on this event: its owner, a co-organizer, an App Admin, or any accepted staff member. */
export async function isEventStaffOrManager(eventId: string, uid: string): Promise<boolean> {
  if (await isEventManager(eventId, uid)) return true;
  const staff = await adminDb.collection("events").doc(eventId).collection("staff").doc(uid).get();
  return staff.exists && (staff.data() as any)?.inviteStatus === "accepted";
}

/** May send this event's announcements: owner, co-organizer, admin, or accepted staff with canSendAnnouncements. */
export async function canSendAnnouncements(eventId: string, uid: string): Promise<boolean> {
  if (await isEventManager(eventId, uid)) return true;
  const staff = await adminDb.collection("events").doc(eventId).collection("staff").doc(uid).get();
  const s = staff.data() as any;
  return staff.exists && s?.inviteStatus === "accepted" && s?.permissions?.canSendAnnouncements === true;
}


/** An approved delegate of [committee] (staffService.isDelegateRole: team leads are not delegates). */
export function isApprovedDelegateOf(app: any, committee: string): boolean {
  const r = String(app?.role || "").toLowerCase();
  const teamLead = r.includes("team") && (r.includes("lead") || r.includes("head"));
  return app?.status === "approved" && r.includes("delegate") && !teamLead && belongsToCommittee(app, committee);
}

/** Plain text for an email's HTML. */
export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Does this event's plan (src/lib/data/eventPlan.ts) include [feature]? Pro is per event. */
export async function eventHasFeature(eventId: string, feature: keyof import("@/lib/data/eventPlan").PlanFeatures): Promise<boolean> {
  if (!eventId) return false;
  const { resolvePlan } = await import("@/lib/data/eventPlan");
  const ev = (await adminDb.collection("events").doc(eventId).get()).data() as any;
  return !!ev && resolvePlan(ev).features[feature];
}

/** A send to more than FREE_RECIPIENT_LIMIT people needs an event whose plan has bulk email. */
export async function bulkSendRefusal(eventId: string, count: number): Promise<string | null> {
  const { FREE_RECIPIENT_LIMIT } = await import("@/lib/data/eventPlan");
  if (count <= FREE_RECIPIENT_LIMIT || (await eventHasFeature(eventId, "bulkEmail"))) return null;
  return `Sending to more than ${FREE_RECIPIENT_LIMIT} people needs a Pro event. Upgrade it under Plan.`;
}
