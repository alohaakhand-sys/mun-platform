// An event's plan: what it may do and how big it may grow. Pro belongs to the EVENT, not the
// person. Three kinds:
//   free   — the regular plan, capped by the admin's systemSettings defaults;
//   pro    — paid upfront, everything unlocked, no caps;
//   custom — requested and approved by the App Admin, who sets each limit, feature and fee
//            (events that existed before plans are custom/legacy with nothing capped).
// `event.plan` is written only by the App Admin or the server (firestore.rules). An event without
// one is Free. Mirrored in the app's domain/Plan.kt.

export type PlanTier = "free" | "pro" | "custom";
export type PlanSource = "paid" | "request" | "admin" | "legacy";

export interface PlanFeatures {
  /** Agora camera/mic in committee sessions and ceremonies. */
  video?: boolean;
  /** AI help inside this event doesn't count against the person's daily quota. */
  ai?: boolean;
  /** Announcements and committee emails to more than FREE_RECIPIENT_LIMIT people. */
  bulkEmail?: boolean;
  /** The Ornate Gold certificate. */
  ornate?: boolean;
  /** A custom theme colour. */
  customTheme?: boolean;
  /** QR passes beyond meals: custom coupons, check-in, transport scans, ID-card QR, full report. */
  passes?: boolean;
}

export interface EventPlan {
  tier: PlanTier;
  source?: PlanSource;
  /** null = unlimited; absent = the plan's default (Free: the admin's caps; Pro/custom: none). */
  limits?: { participants?: number | null; committees?: number | null };
  features?: PlanFeatures;
  /** Platform fee % taken from this event's ticket revenue; absent = the tier's default. */
  feePercent?: number | null;
  activatedAt?: any;
  paidAmount?: number;
  requestId?: string;
}

/** The admin-set numbers plans fall back on (systemSettings/global). */
export interface PlanSettings {
  platformFeePercent?: number;
  proFeePercent?: number;
  proEventPrice?: number;
  freeParticipantCap?: number;
  freeCommitteeCap?: number;
  freeEventCap?: number;
  freeAiDailyQuota?: number;
}

export const PLAN_DEFAULTS: Required<PlanSettings> = {
  platformFeePercent: 7,
  proFeePercent: 3,
  proEventPrice: 49,
  freeParticipantCap: 50,
  freeCommitteeCap: 5,
  freeEventCap: 2,
  freeAiDailyQuota: 10,
};

export const FREE_RECIPIENT_LIMIT = 50;

export const ALL_FEATURES: Required<PlanFeatures> = { video: true, ai: true, bulkEmail: true, ornate: true, customTheme: true, passes: true };
const NO_FEATURES: Required<PlanFeatures> = { video: false, ai: false, bulkEmail: false, ornate: false, customTheme: false, passes: false };

export const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  video: "Live video",
  ai: "AI without the daily limit",
  bulkEmail: "Emails to more than 50 people",
  ornate: "Ornate Gold certificate",
  customTheme: "Custom theme colour",
  passes: "QR coupons, check-in and transport scans",
};

export interface ResolvedPlan {
  tier: PlanTier;
  source?: PlanSource;
  /** null = unlimited. */
  participants: number | null;
  committees: number | null;
  features: Required<PlanFeatures>;
  feePercent: number;
  isPro: boolean;
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** The event's effective plan: its stored plan over the admin's defaults. */
export function resolvePlan(event: { plan?: EventPlan | null } | null | undefined, settings?: PlanSettings | null): ResolvedPlan {
  const s = { ...PLAN_DEFAULTS, ...(settings || {}) };
  const p = event?.plan;
  const tier: PlanTier = p?.tier === "pro" || p?.tier === "custom" ? p.tier : "free";
  const limit = (k: "participants" | "committees", freeDefault: number): number | null => {
    const v = p?.limits?.[k];
    if (v === null) return null;
    if (typeof v === "number") return v;
    return tier === "free" ? freeDefault : null;
  };
  const features: Required<PlanFeatures> =
    tier === "pro" ? ALL_FEATURES
    : tier === "custom" ? { ...NO_FEATURES, ...(p?.features || {}) } as Required<PlanFeatures>
    : { ...NO_FEATURES, ...(p?.features || {}) } as Required<PlanFeatures>;
  const feeDefault = tier === "free" ? s.platformFeePercent : s.proFeePercent;
  return {
    tier,
    source: p?.source,
    participants: limit("participants", s.freeParticipantCap),
    committees: limit("committees", s.freeCommitteeCap),
    features,
    feePercent: Math.min(100, Math.max(0, num(p?.feePercent, feeDefault))),
    isPro: tier !== "free",
  };
}

export function planLabel(plan: ResolvedPlan): string {
  return plan.tier === "pro" ? "Pro" : plan.tier === "custom" ? (plan.source === "legacy" ? "Pro (early event)" : "Pro (approved)") : "Free";
}

// ── Seats: approved participants, the number the participant cap counts ──────────────────

/** Staff who come through an application (chairs etc.) don't take a participant seat. */
const STAFF_APP_ROLES = ["staff", "co-organizer", "usg", "chair", "director", "vice-chair"];
export function takesSeat(app: { role?: string; status?: string }): boolean {
  if (app.status !== "approved") return false;
  const r = (app.role || "").toLowerCase();
  return !STAFF_APP_ROLES.some((s) => r.includes(s));
}

/** +1 when this change approves a participant, −1 when it un-approves one, else 0. */
export function seatDelta(prev: { role?: string; status?: string }, next: { role?: string; status?: string }): number {
  return (takesSeat(next) ? 1 : 0) - (takesSeat(prev) ? 1 : 0);
}

/** Room left under the participant cap (null = unlimited). */
export function seatsLeft(event: { approvedCount?: number; plan?: EventPlan | null } | null | undefined, settings?: PlanSettings | null): number | null {
  const cap = resolvePlan(event, settings).participants;
  return cap == null ? null : Math.max(0, cap - (event?.approvedCount || 0));
}

/** An upgrade request (upgradeRequests/{id}): Pro for an event, or more Free room. */
export interface UpgradeRequest {
  id?: string;
  eventId: string;
  eventTitle?: string;
  organizerId: string;
  organizerName?: string;
  kind: "pro" | "quota";
  /** Quota requests: the numbers asked for (participants per event, committees per event, Free events at once). */
  wanted?: { participants?: number; committees?: number; events?: number };
  orgName?: string;
  website?: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  adminNote?: string;
  createdAt?: any;
  decidedAt?: any;
}
