import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, collectionGroup, writeBatch, setDoc, deleteDoc, limit as fsLimit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { sameCommittee } from "@/lib/utils/committee";
import type { EventPlan } from "@/lib/data/eventPlan";

/**
 * Committees are keyed by NAME everywhere. When a committee is renamed, cascade the new
 * name to every doc that references the old one so rosters, markings, results and the
 * study guide don't orphan. Batched + idempotent (no-op if name unchanged).
 *
 * ADD EVERY NAME-KEYED COLLECTION HERE OR IT ORPHANS SILENTLY. `committeeDocs` was missed when it
 * shipped: every list finds a paper by matching `committee` client-side through `sameCommittee`, so
 * a rename made the whole committee's working papers and draft resolutions invisible to their own
 * authors, to the chair, and to the projector — with no error anywhere.
 *
 * ONE BATCH, so a rename is all-or-nothing; a partial cascade is worse than none because half the
 * platform then disagrees about the committee's name. Firestore caps a batch at 500 writes — a
 * committee whose rows across ALL of these exceed that will throw rather than half-apply, which is
 * the correct failure. Chunk this function if a conference ever gets that large.
 */
export async function cascadeCommitteeRename(eventId: string, oldName: string, newName: string): Promise<void> {
  if (!oldName || !newName || oldName === newName) return;
  const batch = writeBatch(db);

  // Seats AND ranked choices: a pending applicant's choice that still names the old committee
  // would otherwise point at nothing (and swipe-approve / placement would skip it).
  const appsSnap = await getDocs(query(collection(db, "applications"), where("eventId", "==", eventId)));
  appsSnap.forEach(d => {
    const a = d.data() as any;
    const patch: Record<string, any> = {};
    if (a.assignedCommittee === oldName) patch.assignedCommittee = newName;
    if (sameCommittee(a.preferredCommittee, oldName)) patch.preferredCommittee = newName;
    if (Array.isArray(a.committeePreferences) && a.committeePreferences.some((p: any) => sameCommittee(p?.committee, oldName))) {
      patch.committeePreferences = a.committeePreferences.map((p: any) => sameCommittee(p?.committee, oldName) ? { ...p, committee: newName } : p);
    }
    for (const slot of ["primary", "secondary", "tertiary"]) {
      if (sameCommittee(a.choices?.[slot]?.committee, oldName)) patch[`choices.${slot}.committee`] = newName;
    }
    if (Object.keys(patch).length) batch.update(d.ref, patch);
  });

  // The committee group chat is keyed by committee name (handlePostApprovalTasks): rename it, or
  // the next approval opens a second chat under the new name.
  const convSnap = await getDocs(query(collection(db, "conversations"), where("type", "==", "group"), where("eventId", "==", eventId), where("committeeId", "==", oldName)));
  convSnap.forEach(d => {
    const g = d.data() as any;
    const patch: Record<string, any> = { committeeId: newName };
    if (typeof g.groupName === "string" && g.groupName.endsWith(` - ${oldName}`)) {
      patch.groupName = g.groupName.slice(0, -oldName.length) + newName;
    }
    batch.update(d.ref, patch);
  });

  const staffSnap = await getDocs(query(collection(db, "events", eventId, "staff"), where("committeeId", "==", oldName)));
  staffSnap.forEach(d => batch.update(d.ref, { committeeId: newName }));

  const markSnap = await getDocs(query(collection(db, "markings"), where("eventId", "==", eventId), where("committeeId", "==", oldName)));
  markSnap.forEach(d => batch.update(d.ref, { committeeId: newName }));

  const resSnap = await getDocs(query(collection(db, "events", eventId, "results"), where("committeeId", "==", oldName)));
  resSnap.forEach(d => batch.update(d.ref, { committeeId: newName, committeeName: newName }));

  // Committee documents, plus the committee name denormalized onto each paper's consent rows —
  // that copy is what the endorsement inbox card reads, so leaving it stale would reintroduce the
  // same class of drift one level down.
  const docsSnap = await getDocs(query(collection(db, "events", eventId, "committeeDocs"), where("committee", "==", oldName)));
  for (const d of docsSnap.docs) {
    batch.update(d.ref, { committee: newName });
    const endSnap = await getDocs(collection(d.ref, "docEndorsements"));
    endSnap.forEach(e => batch.update(e.ref, { committee: newName }));
  }

  const sgOld = await getDoc(doc(db, "events", eventId, "studyGuides", oldName));
  if (sgOld.exists()) {
    batch.set(doc(db, "events", eventId, "studyGuides", newName), sgOld.data());
    batch.delete(sgOld.ref);
  }

  await batch.commit();
}

export type CommitteeDifficulty = "Beginner" | "Intermediate" | "Advanced";

export interface Committee {
  name: string;
  countries: string[];
  capacity?: number;
  chairs?: string[];
  /** @deprecated Legacy single value. Use `difficulties` (mirrors `difficulties[0]`). */
  difficulty?: CommitteeDifficulty;
  /** One or more difficulty levels for this committee. */
  difficulties?: CommitteeDifficulty[];
  description?: string;
  /** @deprecated Legacy single value. Use `agendas` (mirrors `agendas[0]`). */
  topic?: string;
  /** One or more agenda / topic lines for this committee. */
  agendas?: string[];
}

/** @deprecated Free-form tiers replaced by per-role `roleTiers`. Kept for legacy-doc fallback. */
export interface TicketingTier {
  name: string;
  price: number;
  capacity: number;
}

/** The roles an applicant can apply as on the public application page. */
export type ApplicationRole =
  | "Delegate"
  | "Head Delegate"
  | "Observer"
  | "Faculty Advisor"
  | "Team Delegation Lead";

export const APPLICATION_ROLES: ApplicationRole[] = [
  "Delegate",
  "Head Delegate",
  "Observer",
  "Faculty Advisor",
  "Team Delegation Lead",
];

/** Roles that pick a committee + ranked country preferences (vs faculty, which picks none). */
export const PREFERENCE_ROLES: ApplicationRole[] = [
  "Delegate",
  "Head Delegate",
  "Observer",
  "Team Delegation Lead",
];

/** Team Delegation Lead is billed per member (price × teamSize). */
export const TEAM_ROLE: ApplicationRole = "Team Delegation Lead";

/**
 * Per-role ticket tier: which roles the organizer accepts for this event, and the
 * registration fee for each. Drives the public role dropdown and Stripe pricing.
 * NOTE: seat limits are NOT here — capacity lives on committees (single source).
 */
export interface RoleTier {
  role: ApplicationRole;
  enabled: boolean; // organizer accepts this role for this event
  price: number; // regular per-person, USD; 0 = free
  label?: string; // optional public display override
  // Per-person prices for the early-bird / late-comer phases. The PHASE TIMING is
  // shared across all roles and lives on the event (`applicationSchedule`); a role
  // only carries the three prices. A phase price falls back to `price` when unset.
  earlyBirdPrice?: number;
  latePrice?: number;
  /** @deprecated Timing moved to event.applicationSchedule. Legacy read only. */
  earlyBirdDeadline?: string;
  /** @deprecated Timing moved to event.applicationSchedule. Legacy read only. */
  lateStartDate?: string;
}

/** Which pricing window is currently active for a role. */
export type PricePhase = "early" | "regular" | "late";

/**
 * Event-level shared application schedule (single timeline for every accepted role).
 * Applications OPEN at creation (no manual open). They run as Regular until they
 * close. Early-bird / late-comer are optional sub-windows toggled by the organizer.
 * Late-comer requires early-bird; when on, its end is the hard application close.
 * Boundaries are full ISO datetimes.
 */
export interface ApplicationSchedule {
  earlyBird?: { enabled: boolean; endAt: string };
  lateComer?: { enabled: boolean; startAt: string; endAt: string };
  // Manual close — honored ONLY when neither early-bird nor late-comer is enabled.
  regularCloseAt?: string;
}

export interface ScheduleItem {
  title: string;
  startTime: string;
  endTime: string;
  type: "main" | "session" | "break" | "social";
  location: string;
  description?: string;
}

export interface MarkingTemplate {
  id: string;
  name: string;
  // Every criterion is scored on a fixed -100..+100 scale (minus = penalty for
  // invalid/dismissed points, out-of-order motions, disruption, absence). `maxScore`
  // is retained for back-compat + as the auto-fill cap fallback, but the input range
  // is MARK_MIN..MARK_MAX (see markingScore.ts); the daily % is an equal-weight
  // average of scored criteria, so no per-criterion weight is needed.
  maxScore: number;
  // Optional: auto-fill this rubric column from a live-session participation metric.
  // Legacy templates leave these unset (behavior unchanged). The chair always
  // accepts/overrides the suggestion — it never silently overwrites a score.
  // "points"/"motions" count only what the CHAIR ruled on (recognized / executed);
  // "pointsRaised"/"motionsProposed" count the delegate's own act regardless of outcome.
  // "speeches" is GSL-only (unchanged); "caucusSpeeches" and "allSpeeches" cover the
  // moderated caucus floor. "points"/"motions" count only what the CHAIR ruled on
  // (recognized / executed); "pointsRaised"/"motionsProposed" count the delegate's own
  // act regardless of what the floor did with it.
  autoFillFrom?: "speeches" | "caucusSpeeches" | "allSpeeches" | "speakingMinutes"
    | "points" | "pointsRaised" | "motions" | "motionsProposed" | "votesCast";
  autoFillCap?: number;
}

// The marking pattern the chairs score on. "decimal" = the original ±100 scale;
// "binary" = a −1/0/+1 scale (min-max-normalised to 0..100 by markingScore.ts).
// The organizer picks one per event; absent ⇒ "decimal" (full back-compat).
export type MarkingMode = "decimal" | "binary";

// Event-level scoring configuration for the percentage-based marking system.
// Absent ⇒ defaults (overallWeight 0.30, days derived from the committee's markings).
export interface ScoringConfig {
  // Blend weight of the chair's manual holistic "overall" mark in the final score
  // (0..1). final = (1-w)·computedPct + w·chairOverall, applied only when the chair
  // actually enters an overall. Default 0.30.
  overallWeight?: number;
  // Optional explicit conference-day set (YYYY-MM-DD). When unset the day set is
  // derived from the distinct dateStr of the committee's daily markings.
  markingDays?: string[];
  // Which marking pattern chairs score on for this event. Default "decimal".
  markingMode?: MarkingMode;
}

export interface EventData {
  id: string;
  title: string;
  date: string;
  location: string;
  // Structured place data captured from the DataForSEO Google Maps location picker.
  // All optional — free-typed locations (and online events) leave them unset.
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string;
  format: string;
  description: string;
  committees: Committee[];
  coverUrl?: string;
  schedule?: ScheduleItem[];

  // Organizer specific fields
  organizerId?: string;
  status?: "draft" | "published";
  /** @deprecated Use `roleTiers`. Read only as fallback for legacy events. */
  ticketingTiers?: TicketingTier[];
  // Per-role accepted-roles + pricing config (replaces ticketingTiers).
  roleTiers?: RoleTier[];
  totalCapacity?: number;
  executiveBoard?: any[];

  // Event Details
  expectedDelegates?: number;
  targetAudience?: string;
  website?: string;
  contactEmail?: string;
  socialMedia?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    linkedin?: string;
  } | null;

  // Event start/end (decomposed; `date` is the canonical composed start). Optional —
  // older events only have `date`. Used to derive the application close.
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timeZone?: string;

  // Shared application schedule (single timeline for all accepted roles). Replaces
  // the per-role applicationDeadlines windows.
  applicationSchedule?: ApplicationSchedule;
  // Derived effective hard close (epoch ms). Persisted on every schedule/date save so
  // firestore.rules + Stripe checkout can gate without re-deriving. See computeApplicationCloseAt.
  applicationCloseAt?: number;

  /** @deprecated Per-role windows replaced by the shared applicationSchedule. Legacy read only. */
  applicationDeadlines?: {
    delegates?: { startDate?: string; endDate?: string };
    headDelegates?: { startDate?: string; endDate?: string };
    facultyAdvisor?: { startDate?: string; endDate?: string };
    observers?: { startDate?: string; endDate?: string };
  };

  // Settings
  theme?: string;
  certificateTemplate?: string;
  countryAssignmentMode?: "manual" | "ai";
  optionalModules?: string[];
  markingTemplates?: MarkingTemplate[];
  // Percentage-based marking config (blend weight + optional explicit day set).
  scoringConfig?: ScoringConfig;
  allowPublicStaff?: boolean;
  // How many committees an applicant may rank on the public form (default 1 =
  // single committee). Effective max is clamped to the number of committees.
  committeeChoicesAllowed?: number;
  // DEV ONLY (remove before production): when on, checkout skips Stripe and marks
  // the application paid instantly. Only honored in non-live builds — see
  // isDevPaymentAllowed() in stripe/server.ts.
  devPaymentMode?: boolean;

  // Plan (src/lib/data/eventPlan.ts): written only by the App Admin / server. No plan = Free.
  plan?: EventPlan | null;
  /** Approved participant seats; moves with each approval in the same write (seatTx names it). */
  approvedCount?: number;
  seatTx?: string;

  // Assignment Tracking
  assignmentDeadline?: string | any;
  assignmentStatus?: "pending" | "in_progress" | "completed" | "auto_assigned" | "overdue";
  deadlineRemindersSent?: Record<string, any>;
  
  // Audit
  lastEditedAt?: string | any;
  lastEditedBy?: string;
}

type RoleTierEvent = Pick<EventData, "roleTiers" | "ticketingTiers"> | null | undefined;

/**
 * Returns the accepted (enabled) role tiers for an event. When an event predates
 * `roleTiers` (legacy `ticketingTiers` only), synthesizes a single "Delegate" tier
 * from the first paid tier so checkout/wizard keep working.
 */
export function getEnabledRoleTiers(event: RoleTierEvent): RoleTier[] {
  const tiers = event?.roleTiers;
  if (tiers && tiers.length > 0) return tiers.filter((t) => t.enabled);
  // Legacy fallback: derive a Delegate tier from the old ticketing tiers.
  const legacy = event?.ticketingTiers || [];
  if (legacy.length === 0) return [];
  const paid = legacy.find((t) => t.price > 0) || legacy[0];
  return [
    { role: "Delegate", enabled: true, price: paid.price || 0 },
  ];
}

/** Finds the tier config for a specific role (enabled roles only). */
export function getRoleTier(event: RoleTierEvent, role: string): RoleTier | undefined {
  return getEnabledRoleTiers(event).find((t) => t.role === role);
}

// ── Shared application schedule (timeline) ─────────────────────────────────────

/** Event fields needed to derive the application timeline. */
export type ScheduleEvent =
  | (Pick<EventData, "date" | "startDate" | "startTime" | "applicationSchedule" | "applicationCloseAt">)
  | null
  | undefined;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Parses an ISO datetime string to epoch ms, or undefined when blank/invalid. */
function tsOf(v?: string): number | undefined {
  if (!v) return undefined;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/** Event start moment (epoch ms): canonical `date`, falling back to startDate+startTime. NaN if unknown. */
export function getEventStartMs(event: ScheduleEvent): number {
  const e = event as any;
  const fromDate = tsOf(e?.date);
  if (fromDate != null) return fromDate;
  if (e?.startDate) {
    const t = new Date(`${e.startDate}T${e.startTime || "00:00"}`).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return NaN;
}

/**
 * Effective hard application close (epoch ms). Late-comer end wins when late is on;
 * else one day before event start when early-bird is on (manual close ignored); else
 * the manual close if set, otherwise one day before event start. NaN when undeterminable.
 */
export function computeApplicationCloseAt(event: ScheduleEvent): number {
  const sched = (event as any)?.applicationSchedule as ApplicationSchedule | undefined;
  const startMs = getEventStartMs(event);
  const defaultClose = Number.isNaN(startMs) ? NaN : startMs - ONE_DAY_MS;
  if (sched?.lateComer?.enabled) return tsOf(sched.lateComer.endAt) ?? defaultClose;
  if (sched?.earlyBird?.enabled) return defaultClose;
  return tsOf(sched?.regularCloseAt) ?? defaultClose;
}

export interface ApplicationTimeline {
  earlyEndAt?: number;
  lateStartAt?: number;
  lateEndAt?: number;
  closeAt: number; // effective hard close (epoch ms); may be NaN if event start unknown & no manual close
  phase: "early" | "regular" | "late" | "closed";
  isOpen: boolean;
}

/**
 * The single source of truth for application timing. Applications open at creation
 * (no manual open), run as Regular until they close. Early-bird / late-comer are
 * optional shared sub-windows; late-comer requires early-bird and its end is the close.
 */
export function getApplicationTimeline(event: ScheduleEvent, now: Date = new Date()): ApplicationTimeline {
  const sched = (event as any)?.applicationSchedule as ApplicationSchedule | undefined;
  const t = now.getTime();
  const earlyOn = !!sched?.earlyBird?.enabled;
  const lateOn = earlyOn && !!sched?.lateComer?.enabled; // late-comer requires early-bird
  const earlyEndAt = earlyOn ? tsOf(sched!.earlyBird!.endAt) : undefined;
  const lateStartAt = lateOn ? tsOf(sched!.lateComer!.startAt) : undefined;
  const lateEndAt = lateOn ? tsOf(sched!.lateComer!.endAt) : undefined;
  const closeAt = computeApplicationCloseAt(event);

  let phase: ApplicationTimeline["phase"];
  if (!Number.isNaN(closeAt) && t > closeAt) phase = "closed";
  else if (earlyOn && earlyEndAt != null && t <= earlyEndAt) phase = "early";
  else if (lateOn && lateStartAt != null && lateEndAt != null && t >= lateStartAt && t <= lateEndAt) phase = "late";
  else phase = "regular";

  return { earlyEndAt, lateStartAt, lateEndAt, closeAt, phase, isOpen: phase !== "closed" };
}

/** Whether the event is currently accepting applications (shared timeline). */
export function isApplicationOpen(event: ScheduleEvent, now?: Date): boolean {
  return getApplicationTimeline(event, now).isOpen;
}

/**
 * Non-blocking sanity checks on a shared schedule against the event start. Returns a
 * list of human warnings (empty = OK). Used by the editor and on save.
 */
export function validateApplicationSchedule(
  sched: ApplicationSchedule | undefined,
  eventStartMs: number,
  now: number = Date.now()
): string[] {
  const warns: string[] = [];
  if (!sched) return warns;
  const start = Number.isNaN(eventStartMs) ? undefined : eventStartMs;
  const earlyOn = !!sched.earlyBird?.enabled;
  const lateOn = !!sched.lateComer?.enabled;
  const earlyEnd = tsOf(sched.earlyBird?.endAt);
  const lateStart = tsOf(sched.lateComer?.startAt);
  const lateEnd = tsOf(sched.lateComer?.endAt);
  const close = tsOf(sched.regularCloseAt);

  if (earlyOn) {
    if (earlyEnd == null) warns.push("Early bird needs an end date & time.");
    else {
      if (earlyEnd <= now) warns.push("Early bird ends in the past.");
      if (start != null && earlyEnd >= start) warns.push("Early bird must end before the event starts.");
    }
  }
  if (lateOn) {
    if (!earlyOn) warns.push("Late comer requires early bird to be enabled.");
    if (lateStart == null || lateEnd == null) warns.push("Late comer needs a start and end date & time.");
    else {
      if (lateStart >= lateEnd) warns.push("Late comer start must be before its end.");
      if (earlyEnd != null && lateStart < earlyEnd) warns.push("Late comer should start after early bird ends.");
      if (start != null && lateEnd > start) warns.push("Late comer must end on or before the event starts.");
    }
  }
  if (!earlyOn && !lateOn && close != null) {
    if (close <= now) warns.push("Applications close in the past.");
    if (start != null && close > start) warns.push("Applications must close on or before the event starts.");
  }
  return warns;
}

/** Per-person price for a role at a given phase. Phase price falls back to regular. */
function rolePriceForPhase(tier: RoleTier, phase: PricePhase): number {
  if (phase === "early") return Math.max(0, tier.earlyBirdPrice ?? tier.price ?? 0);
  if (phase === "late") return Math.max(0, tier.latePrice ?? tier.price ?? 0);
  return Math.max(0, tier.price ?? 0);
}

/**
 * Resolves a tier's effective per-person price + active phase right now, driven by the
 * event's SHARED application schedule (early-bird / late-comer windows). The "closed"
 * timeline phase maps to the regular price for display purposes.
 */
export function getEffectiveRoleUnitPrice(
  event: ScheduleEvent,
  tier: RoleTier,
  now: Date = new Date()
): { price: number; phase: PricePhase } {
  const { phase } = getApplicationTimeline(event, now);
  const p: PricePhase = phase === "early" ? "early" : phase === "late" ? "late" : "regular";
  return { price: rolePriceForPhase(tier, p), phase: p };
}

/** Per-person price for a role; team roles multiply by member count. 0 when free/not found. */
export function getRolePrice(event: RoleTierEvent & ScheduleEvent, role: string, teamSize = 1, now: Date = new Date()): number {
  const tier = getRoleTier(event, role);
  if (!tier) return 0;
  const { price } = getEffectiveRoleUnitPrice(event, tier, now);
  const multiplier = role === TEAM_ROLE ? Math.max(1, teamSize) : 1;
  return price * multiplier;
}

/** Effective unit price + which phase is active for a role right now. For UI labels. */
export function getRolePriceInfo(
  event: RoleTierEvent & ScheduleEvent,
  role: string,
  now: Date = new Date()
): { unitPrice: number; phase: PricePhase; tier?: RoleTier } {
  const tier = getRoleTier(event, role);
  if (!tier) return { unitPrice: 0, phase: "regular" };
  const { price, phase } = getEffectiveRoleUnitPrice(event, tier, now);
  return { unitPrice: price, phase, tier };
}

/**
 * A seed `roleTiers` config for events that don't have one yet. Pre-enables Delegate
 * (carrying over any legacy paid price) and leaves the rest disabled for the organizer
 * to opt into. Non-destructive — only used to populate the Allocation editor.
 */
export function getDefaultRoleTiers(event: RoleTierEvent): RoleTier[] {
  if (event?.roleTiers && event.roleTiers.length > 0) return event.roleTiers;
  const legacy = event?.ticketingTiers || [];
  const legacyPaid = legacy.find((t) => t.price > 0) || legacy[0];
  return APPLICATION_ROLES.map((role) => ({
    role,
    enabled: role === "Delegate",
    price: role === "Delegate" ? legacyPaid?.price || 0 : 0,
  }));
}

/**
 * How many committees an applicant may rank on the public form. Defaults to 1
 * (single committee) and is clamped to [1, number of committees] — you can't rank
 * more committees than exist.
 */
export function getCommitteeChoicesAllowed(
  event: Pick<EventData, "committeeChoicesAllowed" | "committees"> | null | undefined
): number {
  const committeeCount = event?.committees?.length || 0;
  if (committeeCount <= 0) return 1;
  const raw = Math.floor(event?.committeeChoicesAllowed || 1);
  return Math.min(Math.max(1, raw), committeeCount);
}

/**
 * The marking pattern chairs score on for this event. Defaults to "decimal"
 * (the original ±100 scale) when unset, so legacy events are unchanged.
 */
export function getMarkingMode(
  event: Pick<EventData, "scoringConfig"> | null | undefined
): MarkingMode {
  return event?.scoringConfig?.markingMode === "binary" ? "binary" : "decimal";
}

// ── Application windows (per-role deadlines) ───────────────────────────────────

export type DeadlineRoleKey = "delegates" | "headDelegates" | "facultyAdvisor" | "observers";

/** Maps an application role to its deadline-config key. Team lead shares the delegate window. */
export function roleDeadlineKey(role: string): DeadlineRoleKey {
  switch (role) {
    case "Head Delegate": return "headDelegates";
    case "Faculty Advisor": return "facultyAdvisor";
    case "Observer": return "observers";
    default: return "delegates"; // Delegate + Team Delegation Lead
  }
}

// "no-window" = organizer set no dates for this role → always open.
export type WindowState = "open" | "before" | "after" | "no-window";

/**
 * Current state of a role's public application window. Dates are 'YYYY-MM-DD'
 * (date inputs): start is inclusive from 00:00, end inclusive through 23:59:59.
 * An empty start/end is unbounded on that side; no dates at all = always open.
 */
export function getRoleWindowState(
  event: Pick<EventData, "applicationDeadlines"> | null | undefined,
  role: string,
  now: Date = new Date()
): WindowState {
  const w = event?.applicationDeadlines?.[roleDeadlineKey(role)];
  if (!w || (!w.startDate && !w.endDate)) return "no-window";
  const t = now.getTime();
  if (w.startDate) {
    const start = new Date(`${w.startDate}T00:00:00`).getTime();
    if (!isNaN(start) && t < start) return "before";
  }
  if (w.endDate) {
    const end = new Date(`${w.endDate}T23:59:59`).getTime();
    if (!isNaN(end) && t > end) return "after";
  }
  return "open";
}

/**
 * @deprecated Per-role windows are gone — timing is the shared event-level schedule.
 * Kept as a thin wrapper (role arg ignored) so existing callers compile.
 */
export function isRoleApplicationOpen(event: ScheduleEvent, _role?: string, now?: Date): boolean {
  return isApplicationOpen(event, now);
}

/** @deprecated Use isApplicationOpen. Thin wrapper over the shared timeline. */
export function anyRoleApplicationOpen(event: ScheduleEvent, now?: Date): boolean {
  return isApplicationOpen(event, now);
}

/**
 * Public application status (shared timeline). Applications open at creation, so there
 * is no "upcoming" state — it's open until the effective close, then closed.
 */
export function getEventApplicationStatus(
  event: ScheduleEvent,
  now: Date = new Date()
): { state: "open" | "closed"; closeAt: number } {
  const { isOpen, closeAt } = getApplicationTimeline(event, now);
  return { state: isOpen ? "open" : "closed", closeAt };
}

// ── Capacity (single source of truth = committees) ─────────────────────────────

type CapacityEvent = Pick<EventData, "committees"> | null | undefined;

/** Total event seat capacity = sum of every committee's capacity. */
export function getEventCapacity(event: CapacityEvent): number {
  return (event?.committees || []).reduce((sum, c) => sum + (c.capacity || 0), 0);
}

/** Capacity configured for a single committee (0 / undefined = unlimited). */
export function getCommitteeCapacity(event: CapacityEvent, name: string): number {
  return (event?.committees || []).find((c) => c.name === name)?.capacity || 0;
}

/** A committee is full once approved delegates reach its capacity. 0 cap = never full. */
export function isCommitteeFull(capacity: number, approved: number): boolean {
  return capacity > 0 && approved >= capacity;
}

/** Agenda/topic lines for a committee — new `agendas[]`, falling back to legacy `topic`. */
export function getCommitteeAgendas(c: Committee): string[] {
  if (c.agendas && c.agendas.length) return c.agendas;
  return c.topic ? [c.topic] : [];
}

/** Difficulty levels for a committee — new `difficulties[]`, falling back to legacy `difficulty`. */
export function getCommitteeDifficulties(c: Committee): CommitteeDifficulty[] {
  if (c.difficulties && c.difficulties.length) return c.difficulties;
  return c.difficulty ? [c.difficulty] : [];
}

export async function getEventById(eventId: string): Promise<EventData | null> {
  try {
    const eventSnap = await getDoc(doc(db, "events", eventId));
    if (eventSnap.exists()) {
      return { id: eventSnap.id, ...eventSnap.data() } as EventData;
    }
    return null;
  } catch (error) {
    console.error("Error fetching event:", error);
    return null;
  }
}

export async function getEventsByIds(eventIds: string[]): Promise<EventData[]> {
  if (!eventIds || eventIds.length === 0) return [];
  const uniqueIds = Array.from(new Set(eventIds));

  // Per-doc reads (not a batched `in` query). The events read rule is evaluated
  // per document; a single applied-to event the caller can't read (e.g. reverted
  // to draft, or a legacy doc missing `status`) would make an `in` query fail as a
  // whole and drop every event. allSettled isolates each failure so readable
  // events still resolve; unreadable ones are skipped (caller shows fallbacks).
  const settled = await Promise.allSettled(
    uniqueIds.map(async id => {
      const snap = await getDoc(doc(db, "events", id));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as EventData) : null;
    })
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<EventData | null> => r.status === "fulfilled")
    .map(r => r.value)
    .filter((e): e is EventData => e !== null);
}

export async function getAllEvents(): Promise<EventData[]> {
  try {
    const snap = await getDocs(collection(db, "events"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as EventData));
  } catch (error) {
    console.error("Error fetching all events:", error);
    return [];
  }
}

/**
 * Every published event. `max` caps the read, which the HOMEPAGE passes and the
 * /events browser does not: the homepage is the platform’s most-hit route and
 * Firestore bills per document returned, so an unbounded scan there would spend
 * the whole Spark daily read budget on anonymous visitors. Equality filter only —
 * no orderBy — so the cap needs no composite index; ordering happens client-side
 * on `getEventStartMs`.
 */
export async function getPublishedEvents(max?: number): Promise<EventData[]> {
  try {
    const base = query(collection(db, "events"), where("status", "==", "published"));
    const snap = await getDocs(max ? query(base, fsLimit(max)) : base);
    // Unlisted events open by link only: never in a browse or recommendation list.
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as EventData))
      .filter(e => (e as any).visibility !== "unlisted");
  } catch (error) {
    console.error("Error fetching published events:", error);
    return [];
  }
}

export async function createEvent(data: Omit<EventData, "id">): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, "events"), {
      ...data,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error: any) {
    console.error("Error creating event:", error);
    // A new event starts Free, and the rules hold it to the Free committee cap (eventPlan.ts).
    if (error?.code === "permission-denied" && (data.committees?.length || 0) > 0) {
      const { getSystemSettings } = await import("./systemSettingsService");
      const cap = (await getSystemSettings().catch(() => null))?.freeCommitteeCap ?? 5;
      if ((data.committees?.length || 0) > cap) throw new Error(`A new event starts on the Free plan, which allows ${cap} committees. Create it with ${cap} or fewer, then upgrade it to add more.`);
    }
    throw error;
  }
}

/**
 * Free events an organizer may have published at once (eventPlan.ts): their own override
 * (users.planOverrides.freeEvents, set by the App Admin) or the admin's default. Returns how many
 * published, unfinished Free events they have (not counting `exceptId`) and the cap. The rules
 * can't count documents, so this is checked by the app and the website before publishing.
 */
export async function freeEventsInUse(organizerUid: string, exceptId: string): Promise<{ used: number; cap: number }> {
  const [{ getSystemSettings }, { resolvePlan, PLAN_DEFAULTS }] = await Promise.all([
    import("./systemSettingsService"), import("@/lib/data/eventPlan"),
  ]);
  const [events, settings, me] = await Promise.all([
    getOrganizerEvents(organizerUid), getSystemSettings().catch(() => null), getDoc(doc(db, "users", organizerUid)),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const used = events.filter((e) => e.id !== exceptId && e.status === "published" && !resolvePlan(e, settings).isPro &&
    String((e as any).endDate || e.date || "").slice(0, 10) >= today).length;
  const cap = Number((me.data() as any)?.planOverrides?.freeEvents ?? settings?.freeEventCap ?? PLAN_DEFAULTS.freeEventCap);
  return { used, cap };
}

export async function getOrganizerEvents(organizerUid: string): Promise<EventData[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "events"), where("organizerId", "==", organizerUid))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as EventData));
  } catch (error) {
    console.error("Error fetching organizer events:", error);
    return [];
  }
}

/**
 * Returns event IDs where the user is an accepted co-organizer (staff doc with
 * role "co-organizer"). Co-organizers get near-full organizer access per plan D5.
 */
export async function getCoOrganizedEventIds(uid: string): Promise<string[]> {
  try {
    const snap = await getDocs(
      query(
        collectionGroup(db, "staff"),
        where("uid", "==", uid),
        where("inviteStatus", "==", "accepted"),
        where("role", "==", "co-organizer")
      )
    );
    // staff doc path: events/{eventId}/staff/{uid}
    return snap.docs.map(d => d.ref.path.split("/")[1]);
  } catch (error) {
    console.error("Error fetching co-organized event ids:", error);
    return [];
  }
}

/** Fetches full event docs the user co-organizes. */
export async function getCoOrganizedEvents(uid: string): Promise<EventData[]> {
  const ids = await getCoOrganizedEventIds(uid);
  const events = await Promise.all(ids.map(id => getEventById(id)));
  return events.filter((e): e is EventData => e !== null);
}

/** True if the user is an accepted co-organizer of the event (checks staff doc only). */
export async function isUserCoOrganizer(eventId: string, uid: string): Promise<boolean> {
  try {
    const staffSnap = await getDoc(doc(db, "events", eventId, "staff", uid));
    if (!staffSnap.exists()) return false;
    const data = staffSnap.data();
    return data.role === "co-organizer" && data.inviteStatus === "accepted";
  } catch (error) {
    console.error("Error checking co-organizer status:", error);
    return false;
  }
}

/** True if the user is the owner OR an accepted co-organizer of the event. */
export async function isEventOrganizerOrCoOrg(eventId: string, uid: string): Promise<boolean> {
  try {
    const event = await getEventById(eventId);
    if (event && (event as any).organizerId === uid) return true;
    const staffSnap = await getDoc(doc(db, "events", eventId, "staff", uid));
    if (!staffSnap.exists()) return false;
    const data = staffSnap.data();
    return data.role === "co-organizer" && data.inviteStatus === "accepted";
  } catch (error) {
    console.error("Error checking organizer/co-org access:", error);
    return false;
  }
}

export interface OrganizerStats {
  totalEvents: number;
  publishedEvents: number;
  totalApplications: number;
  totalApproved: number;
}

export async function getOrganizerStats(organizerUid: string): Promise<OrganizerStats> {
  try {
    const events = await getOrganizerEvents(organizerUid);
    const totalEvents = events.length;
    const publishedEvents = events.filter(e => e.status === "published").length;

    let totalApplications = 0;
    let totalApproved = 0;

    for (const event of events) {
      const appsSnap = await getDocs(
        query(collection(db, "applications"), where("eventId", "==", event.id))
      );
      totalApplications += appsSnap.size;
      totalApproved += appsSnap.docs.filter(d => d.data().status === "approved").length;
    }

    return { totalEvents, publishedEvents, totalApplications, totalApproved };
  } catch (error) {
    console.error("Error fetching organizer stats:", error);
    return { totalEvents: 0, publishedEvents: 0, totalApplications: 0, totalApproved: 0 };
  }
}

export async function updateEvent(eventId: string, data: Partial<Omit<EventData, "id">>): Promise<void> {
  try {
    await updateDoc(doc(db, "events", eventId), { ...data, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error updating event:", error);
    throw error;
  }
}
