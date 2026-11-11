import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, query, where, orderBy, collectionGroup, onSnapshot
} from "firebase/firestore";
import { syncMembers } from "./membershipService";
import { db } from "@/lib/firebase/client";

/** Roles that belong to the Executive Board (oversight tier — not chairs). */
export const EXEC_BOARD_ROLES = ["director", "usg"] as const;
/** Roles that work a single committee under the EB (the "chair" tier). */
export const CHAIR_TIER_ROLES = ["chair", "vice-chair"] as const;
/** Read-only spectator/supervisor tier (no write access by default). */
export const READONLY_ROLES = ["observer", "faculty-advisor"] as const;

export function isExecBoardRole(role?: string): boolean {
  const r = (role || "").toLowerCase();
  return r === "director" || r === "usg" || r === "eb";
}

export function isChairTierRole(role?: string): boolean {
  const r = (role || "").toLowerCase();
  return r !== "co-organizer" && r.includes("chair");
}

export function isObserverRole(role?: string): boolean {
  return (role || "").toLowerCase() === "observer";
}

export function isFacultyStaffRole(role?: string): boolean {
  const r = (role || "").toLowerCase();
  return r === "faculty-advisor" || r === "faculty_advisor";
}

// ── Application-role helpers ────────────────────────────────────────────────
// Application docs store roles in human form ("Faculty Advisor", "Team Delegation
// Lead", "Delegate") while staff docs use kebab-case. These tolerate every variant
// so comparisons stop being scattered, fragile dual-checks across the codebase.
export function isFacultyRole(role?: string): boolean {
  return (role || "").toLowerCase().includes("faculty");
}

export function isTeamLeadRole(role?: string): boolean {
  const r = (role || "").toLowerCase();
  return r.includes("team") && (r.includes("lead") || r.includes("head"));
}

export function isObserverApp(role?: string): boolean {
  return (role || "").toLowerCase().includes("observer");
}

export function isDelegateRole(role?: string): boolean {
  const r = (role || "").toLowerCase();
  return r.includes("delegate") && !isTeamLeadRole(r);
}

export interface PermissionsMap {
  canViewApplications: boolean;
  canMarkDelegates: boolean;
  canSendAnnouncements: boolean;
  canManageSchedule: boolean;
  canViewFinancials: boolean;
  canApproveResults: boolean;
  canScanPasses: boolean;
}

export const DEFAULT_PERMISSIONS: PermissionsMap = {
  canViewApplications: false,
  canMarkDelegates: false,
  canSendAnnouncements: false,
  canManageSchedule: false,
  canViewFinancials: false,
  canApproveResults: false,
  canScanPasses: false,
};

/**
 * Canonical permission → capability map. Keep UI gating (useEventStaffRole) and
 * firestore.rules (hasPerm) in sync with this. Owner/co-organizer bypass these.
 *
 *  canViewApplications  → read applications, see delegate roster
 *  canMarkDelegates     → create/update markings; submit results (awards)
 *  canSendAnnouncements → write event announcements (bulk email)
 *  canManageSchedule    → edit the event schedule
 *  canViewFinancials    → financials page (co-organizer only by design)
 *  canApproveResults    → approve results, unlock certificates
 *  canScanPasses        → scan QR passes: meals, coupons, check-in (setup/qr-passes-plan.md)
 *
 * NOTE: committee "room alerts" + per-committee study guides are NOT a PermissionsMap
 * field — they are inherent to the committee's chair tier (isCommitteeChair) and EB/org.
 */
export function hasStaffPermission(
  staff: Pick<StaffMember, "permissions"> | null | undefined,
  key: keyof PermissionsMap
): boolean {
  return !!staff?.permissions?.[key];
}

export const ROLE_PRESETS: Record<string, Partial<PermissionsMap>> = {
  "co-organizer": {
    canViewApplications: true,
    canSendAnnouncements: true,
    canManageSchedule: true,
    canViewFinancials: true,
    canApproveResults: true,
    canScanPasses: true,
  },
  usg: {
    canViewApplications: true,
    canManageSchedule: true,
  },
  director: {
    canViewApplications: true,
    canMarkDelegates: true, // event-wide oversight marking (not committee-bound)
  },
  // Chair / vice-chair marking + study guide + room alerts are inherent to the
  // committee they're assigned to (enforced via isCommitteeChair in rules + the
  // committee hub), NOT a PermissionsMap toggle — so presets stay empty. Organizers
  // can still grant extra event-wide abilities (e.g. canSendAnnouncements) per person.
  chair: {},
  "vice-chair": {},
  observer: {},
  "faculty-advisor": {},
};

export const STAFF_ROLE_OPTIONS: { value: StaffMember["role"]; label: string }[] = [
  { value: "co-organizer", label: "Co-Organizer" },
  { value: "usg", label: "Under-Secretary-General" },
  { value: "director", label: "Director" },
  { value: "chair", label: "Chair" },
  { value: "vice-chair", label: "Vice Chair" },
  { value: "observer", label: "Observer" },
  { value: "faculty-advisor", label: "Faculty Advisor" },
];

/** Roles a person may apply for when the organizer allows public staff applications. */
export const STAFF_APPLY_ROLES: StaffMember["role"][] = ["chair", "vice-chair", "director"];

/**
 * Apply to join an event's staff (event.allowPublicStaff). Writes the applicant's own UID-keyed
 * staff doc with status "applied" — no permissions, no committee, no delegate power; the rules
 * allow exactly that shape and nothing reads an "applied" doc as staff. The organizer accepts
 * (status → accepted) or rejects (doc deleted) on the Staff page.
 */
export async function applyForStaff(
  eventId: string,
  me: { uid: string; name: string; email: string },
  role: StaffMember["role"]
): Promise<{ success: boolean; error?: any }> {
  try {
    await setDoc(doc(db, "events", eventId, "staff", me.uid), {
      uid: me.uid,
      name: me.name || "Applicant",
      email: me.email,
      role,
      committeeId: null,
      permissions: { ...DEFAULT_PERMISSIONS },
      inviteStatus: "applied",
      addedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error applying for staff:", error);
    return { success: false, error };
  }
}

/** Withdraw my pending staff application (the rules let me delete my own staff doc). */
export async function withdrawStaffApplication(eventId: string, uid: string): Promise<{ success: boolean; error?: any }> {
  try {
    await deleteDoc(doc(db, "events", eventId, "staff", uid));
    return { success: true };
  } catch (error) {
    console.error("Error withdrawing staff application:", error);
    return { success: false, error };
  }
}

export function roleLabel(role: string): string {
  return STAFF_ROLE_OPTIONS.find(o => o.value === role)?.label
    ?? role.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export interface StaffMember {
  id?: string;
  uid: string;
  name: string;
  email: string;
  role: "co-organizer" | "usg" | "director" | "chair" | "vice-chair" | "observer" | "faculty-advisor";
  committeeId: string | null;
  permissions: PermissionsMap;
  /**
   * Vice-chair only: when true, the vice-chair may act as a PROXY DELEGATE in their
   * committee's live session — raise motions/points/speak requests and cast votes on
   * behalf of any delegation (surfaces the "Represent" tool in the console). Ignored
   * for every other role. See useEventStaffRole.canActAsDelegate.
   */
  delegatePower?: boolean;
  inviteStatus: "invited" | "applied" | "accepted" | "rejected";
  addedAt?: any;
}

export async function getEventStaff(eventId: string): Promise<StaffMember[]> {
  try {
    const snap = await getDocs(collection(db, "events", eventId, "staff"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember));
  } catch (error) {
    console.error("Error fetching staff:", error);
    return [];
  }
}

/**
 * Live staff roster. Prefer this over getEventStaff on management screens: doc ids change
 * when an invite is accepted (see resolveStaffRef), so a one-shot fetch goes stale the
 * moment someone accepts while the page is open.
 */
export function subscribeEventStaff(
  eventId: string,
  cb: (staff: StaffMember[]) => void
): () => void {
  return onSnapshot(
    collection(db, "events", eventId, "staff"),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember))),
    error => console.error("Error subscribing to staff:", error)
  );
}

export interface ExecBoardAssignment {
  eventId: string;
  staffId: string;
  role: StaffMember["role"];
  committeeId: string | null;
}

/**
 * Accepted Executive Board (director/usg) assignments for a user, across all events.
 * committeeId === null means event-wide scope (oversees all committees).
 */
export async function getExecBoardAssignments(uid: string): Promise<ExecBoardAssignment[]> {
  try {
    const snap = await getDocs(
      query(
        collectionGroup(db, "staff"),
        where("uid", "==", uid),
        where("inviteStatus", "==", "accepted")
      )
    );
    return snap.docs
      .filter(d => isExecBoardRole(d.data().role))
      .map(d => ({
        eventId: d.ref.path.split("/")[1],
        staffId: d.id,
        role: d.data().role,
        committeeId: d.data().committeeId ?? null,
      }));
  } catch (error) {
    console.error("Error fetching exec board assignments:", error);
    return [];
  }
}

/** The current user's staff doc for an event (UID-keyed), or null if none. */
export async function getMyStaffDoc(eventId: string, uid: string): Promise<StaffMember | null> {
  try {
    const snap = await getDoc(doc(db, "events", eventId, "staff", uid));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as StaffMember;
  } catch (error) {
    console.error("Error fetching my staff doc:", error);
    return null;
  }
}

/** Accepted assignments for a user across all events, filtered by a role predicate. */
async function getStaffAssignments(
  uid: string,
  predicate: (role?: string) => boolean
): Promise<ExecBoardAssignment[]> {
  try {
    const snap = await getDocs(
      query(
        collectionGroup(db, "staff"),
        where("uid", "==", uid),
        where("inviteStatus", "==", "accepted")
      )
    );
    return snap.docs
      .filter(d => predicate(d.data().role))
      .map(d => ({
        eventId: d.ref.path.split("/")[1],
        staffId: d.id,
        role: d.data().role,
        committeeId: d.data().committeeId ?? null,
      }));
  } catch (error) {
    console.error("Error fetching staff assignments:", error);
    return [];
  }
}

/** Accepted observer assignments across all events. */
export function getObserverAssignments(uid: string): Promise<ExecBoardAssignment[]> {
  return getStaffAssignments(uid, isObserverRole);
}

/** Accepted staff faculty-advisor assignments across all events. */
export function getFacultyStaffAssignments(uid: string): Promise<ExecBoardAssignment[]> {
  return getStaffAssignments(uid, isFacultyStaffRole);
}

export async function addStaffMember(
  eventId: string,
  member: Omit<StaffMember, "id" | "addedAt">
): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(collection(db, "events", eventId, "staff"), {
      ...member,
      addedAt: serverTimestamp(),
    });
    return { success: true, id: ref.id };
  } catch (error) {
    console.error("Error adding staff member:", error);
    return { success: false, error };
  }
}

/**
 * A staff doc CHANGES ITS ID when the invite is accepted: the organizer creates it with
 * an auto-id (uid unknown at invite time), and acceptance deletes that doc and re-creates
 * it UID-keyed (rules resolve staff via `staff/$(request.auth.uid)`). Any list fetched
 * before the accept therefore holds a dead id — writes against it fail with
 * "No document to update". Resolve the live doc by uid, then by email, before giving up.
 */
async function resolveStaffRef(
  eventId: string,
  staffId: string,
  hint?: Pick<StaffMember, "uid" | "email"> | Partial<StaffMember>
) {
  const staffCol = collection(db, "events", eventId, "staff");
  const direct = doc(staffCol, staffId);
  if ((await getDoc(direct)).exists()) return direct;

  if (hint?.uid && hint.uid !== staffId) {
    const byUid = doc(staffCol, hint.uid);
    if ((await getDoc(byUid)).exists()) return byUid;
  }

  const email = hint?.email?.trim().toLowerCase();
  if (email) {
    const snap = await getDocs(query(staffCol, where("email", "==", email)));
    if (!snap.empty) return snap.docs[0].ref;
  }
  return null;
}

export async function updateStaffMember(
  eventId: string,
  staffId: string,
  data: Partial<StaffMember>,
  /** The staff object being edited — lets a stale (pre-accept) id be re-resolved. */
  hint?: Partial<StaffMember>
): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "staff", staffId), data as any);
    // A role change pauses access until re-accepted: the membership marker follows.
    if (hint?.uid) void syncMembers(eventId, [hint.uid]);
    return { success: true, id: staffId };
  } catch (error: any) {
    if (error?.code === "not-found") {
      try {
        const ref = await resolveStaffRef(eventId, staffId, hint);
        if (ref) {
          await updateDoc(ref, data as any);
          if (hint?.uid) void syncMembers(eventId, [hint.uid]);
          return { success: true, id: ref.id };
        }
      } catch (retryError) {
        console.error("Error updating staff member (after re-resolve):", retryError);
        return { success: false, error: retryError };
      }
    }
    console.error("Error updating staff member:", error);
    return { success: false, error };
  }
}

export async function removeStaffMember(
  eventId: string,
  staffId: string,
  /** The staff object being removed — lets a stale (pre-accept) id be re-resolved. */
  hint?: Partial<StaffMember>
): Promise<{ success: boolean; error?: any }> {
  try {
    // deleteDoc on a missing doc is a silent no-op, so resolve first — otherwise a
    // re-keyed member vanishes from the UI while their staff doc (and access) survives.
    const ref = await resolveStaffRef(eventId, staffId, hint);
    if (!ref) return { success: true };
    await deleteDoc(ref);
    // Removed staff lose live read access (unless they also hold an approved application).
    // A UID-keyed doc's id IS the uid; an auto-id one just recomputes to nothing.
    void syncMembers(eventId, [hint?.uid || ref.id]);
    return { success: true };
  } catch (error) {
    console.error("Error removing staff member:", error);
    return { success: false, error };
  }
}
