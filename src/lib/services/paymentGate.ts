/**
 * Registration-fee gate — one source of truth for "has this delegate paid for their
 * seat, what do they owe, and by when".
 *
 * Conference practice this models (IMUNA/NHSMUN, CASE, Black Hat, Gartner all state it
 * the same way): a registration is NOT secured until the fee is received, the amount is
 * fixed by the pricing window the payment lands in, and an unpaid seat is released at
 * the window's deadline. So an unpaid delegate must see what they owe and a way to pay
 * it — not a normal-looking "Pending" card that walks straight into the portal.
 *
 * Waivers/financial aid: organizers mark an application paid by hand from the
 * Applications tab, which flips `paymentStatus` and clears this gate. There is no
 * separate "waived" state to keep in sync.
 *
 * `paymentStatus` is written ONLY by the Stripe webhook (or an organizer) — never the
 * browser — so this is a display/navigation gate, not a security boundary. The real
 * enforcement is that an unpaid application cannot be approved (see isAwaitingPayment
 * in applicationService) and every paid feature keys off `status === "approved"`.
 */
import {
  EventData,
  getRolePrice,
  getRoleTier,
  getApplicationTimeline,
} from "./eventService";
import type { ApplicationData } from "./applicationService";

export type PaymentGateStatus = "not-required" | "due" | "paid" | "refunded";

export interface PaymentGate {
  /** This applicant's role carries a fee in the current pricing window. */
  required: boolean;
  /** Total owed in whole currency units (team roles multiply by member count). */
  amount: number;
  /** Human label for the tier being charged ("Delegate", "Early Bird", …). */
  tierLabel: string;
  status: PaymentGateStatus;
  /** Deadline for the CURRENT pricing window — epoch ms, or undefined if open-ended. */
  dueAt?: number;
  /** Whole days remaining until dueAt (negative once past it). */
  daysLeft?: number;
  /** Past the deadline with the fee still outstanding. */
  overdue: boolean;
  /**
   * Hold the delegate on a "pay to continue" screen instead of the conference portal.
   * True only while money is genuinely owed — free events and paid-up delegates pass.
   */
  blocksPortal: boolean;
}

type GateEvent = Parameters<typeof getRolePrice>[0] & Parameters<typeof getApplicationTimeline>[0];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The deadline that applies to the fee right now. Each pricing window has its own
 * cut-off — miss it and the price changes (or the seat goes), which is exactly what a
 * delegate needs to see on the card.
 */
function dueAtFor(event: GateEvent, now: Date): number | undefined {
  const t = getApplicationTimeline(event, now);
  const pick =
    t.phase === "early" ? t.earlyEndAt :
    t.phase === "late" ? t.lateEndAt :
    t.closeAt;
  return pick != null && !Number.isNaN(pick) ? pick : undefined;
}

export function getPaymentGate(
  app: Pick<ApplicationData, "role" | "paymentStatus" | "teamSize" | "status"> | null | undefined,
  event: (Partial<EventData> & GateEvent) | null | undefined,
  now: Date = new Date()
): PaymentGate {
  const idle: PaymentGate = {
    required: false, amount: 0, tierLabel: "", status: "not-required",
    overdue: false, blocksPortal: false,
  };
  if (!app || !event) return idle;

  const amount = getRolePrice(event, app.role || "", app.teamSize || 1, now);
  if (amount <= 0) return idle; // free event, or a free role on a paid event

  const tierLabel = getRoleTier(event, app.role || "")?.label || app.role || "Registration";
  const dueAt = dueAtFor(event, now);
  // Truncated toward zero so the count never overstates in either direction: 4.9 days
  // left reads "4 days left", and 1 hour past the deadline is 0 (rendered "Overdue",
  // not "1 day overdue").
  const daysLeft = dueAt != null ? Math.trunc((dueAt - now.getTime()) / DAY_MS) : undefined;

  // A rejected/withdrawn application owes nothing — showing it a payment demand would
  // be worse than useless.
  const dead = app.status === "rejected" || (app.status as string) === "withdrawn";

  let status: PaymentGateStatus;
  if (app.paymentStatus === "paid") status = "paid";
  else if (app.paymentStatus === "refunded" || dead) status = "refunded";
  else status = "due";

  return {
    required: true,
    amount,
    tierLabel,
    status,
    dueAt,
    daysLeft,
    overdue: status === "due" && dueAt != null && now.getTime() > dueAt,
    blocksPortal: status === "due",
  };
}

/** `$1,250` — whole dollars, no trailing `.00` noise on typical MUN fees. */
export function formatFee(amount: number): string {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "3 days left" / "Due today" / "5 days overdue" — the urgency line under the amount. */
export function formatDueLabel(gate: PaymentGate): string | null {
  if (gate.dueAt == null || gate.daysLeft == null) return null;
  // Branch on `overdue`, not the sign of daysLeft — a deadline an hour in the past
  // truncates to 0, and "Due today" would be exactly the wrong thing to tell someone
  // whose seat is already up for release.
  if (gate.overdue) {
    const d = Math.abs(gate.daysLeft);
    if (d < 1) return "Overdue";
    return `${d} day${d === 1 ? "" : "s"} overdue`;
  }
  const d = gate.daysLeft;
  if (d <= 0) return "Due today";
  if (d === 1) return "1 day left";
  return `${d} days left`;
}

/** Absolute deadline, e.g. "15 Aug 2026". */
export function formatDueDate(gate: PaymentGate): string | null {
  if (gate.dueAt == null) return null;
  return new Date(gate.dueAt).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

/** Deep link to the delegate's Payments page, focused on this application's row. */
export function paymentsHref(applicationId?: string, eventId?: string): string {
  const q = new URLSearchParams();
  if (applicationId) q.set("app", applicationId);
  if (eventId) q.set("event", eventId);
  const s = q.toString();
  return s ? `/dashboard/payments?${s}` : "/dashboard/payments";
}
