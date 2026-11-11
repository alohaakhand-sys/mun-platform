/**
 * Server-side registration-fee pricing — the ONE place a checkout amount is decided,
 * shared by every payment provider (Stripe, ZiniPay, dev mode).
 *
 * The amount is always derived from the EVENT doc read with the Admin SDK, never from
 * the request body, so a tampered client can't change what it owes. Mirrors
 * getApplicationTimeline + rolePriceForPhase in eventService, kept server-local so this
 * file pulls in no client Firebase code.
 */

export const TEAM_ROLE = "Team Delegation Lead";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type ServerRoleTier = {
  role: string;
  enabled: boolean;
  price: number;
  label?: string;
  earlyBirdPrice?: number;
  latePrice?: number;
};

function tsOf(v?: string): number | undefined {
  if (!v) return undefined;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? undefined : t;
}

function eventStartMs(event: any): number {
  const fromDate = tsOf(event?.date);
  if (fromDate != null) return fromDate;
  if (event?.startDate) {
    const t = new Date(`${event.startDate}T${event.startTime || "00:00"}`).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return NaN;
}

function effectiveCloseAt(event: any): number {
  const s = event?.applicationSchedule;
  const start = eventStartMs(event);
  const def = Number.isNaN(start) ? NaN : start - ONE_DAY_MS;
  if (s?.lateComer?.enabled) return tsOf(s.lateComer.endAt) ?? def;
  if (s?.earlyBird?.enabled) return def;
  return tsOf(s?.regularCloseAt) ?? def;
}

export function phaseNow(event: any): "early" | "regular" | "late" | "closed" {
  const s = event?.applicationSchedule;
  const t = Date.now();
  const earlyOn = !!s?.earlyBird?.enabled;
  const lateOn = earlyOn && !!s?.lateComer?.enabled;
  const ee = earlyOn ? tsOf(s.earlyBird.endAt) : undefined;
  const ls = lateOn ? tsOf(s.lateComer.startAt) : undefined;
  const le = lateOn ? tsOf(s.lateComer.endAt) : undefined;
  const close = effectiveCloseAt(event);
  if (!Number.isNaN(close) && t > close) return "closed";
  if (earlyOn && ee != null && t <= ee) return "early";
  if (lateOn && ls != null && le != null && t >= ls && t <= le) return "late";
  return "regular";
}

function tierPriceForPhase(tier: ServerRoleTier, phase: string): number {
  if (phase === "early") return Math.max(0, tier.earlyBirdPrice ?? tier.price ?? 0);
  if (phase === "late") return Math.max(0, tier.latePrice ?? tier.price ?? 0);
  return Math.max(0, tier.price ?? 0);
}

/**
 * Per-role registration fee, priced at the current shared-schedule phase. Prefers
 * `roleTiers`; falls back to legacy `ticketingTiers` for old events. Team roles multiply
 * by member count.
 */
export function resolveRolePrice(
  event: any,
  role: string,
  teamSize: number
): { price: number; label: string } {
  const roleTiers: ServerRoleTier[] = event.roleTiers || [];
  if (roleTiers.length > 0) {
    const tier = roleTiers.find((t) => t.enabled && t.role === role);
    if (!tier) return { price: 0, label: role };
    const unit = tierPriceForPhase(tier, phaseNow(event));
    const multiplier = role === TEAM_ROLE ? Math.max(1, teamSize || 1) : 1;
    return { price: unit * multiplier, label: tier.label || role };
  }
  // Legacy fallback: first paid ticketing tier applies to everyone.
  const legacy: { name: string; price: number }[] = event.ticketingTiers || [];
  const paid = legacy.find((t) => t.price > 0) || legacy[0];
  return { price: paid?.price || 0, label: paid?.name || role };
}
