/**
 * Which payment gateway is live right now — resolved SERVER-SIDE only.
 *
 * The App Admin picks the mode in Admin → Payments; it is stored on
 * `systemSettings/global.paymentMode`. Credentials never live in Firestore — they stay in
 * `.env.local` (`STRIPE_SECRET_KEY`, `ZINIPAY_API_KEY`, …), so switching modes in the UI
 * only ever flips WHICH configured gateway is used, never what its keys are.
 *
 * A mode whose credentials are missing falls back to the first configured one, so a
 * mis-click in the admin panel can't take checkout offline.
 */
import { adminDb } from "@/lib/firebase/admin";
import { isZiniPayConfigured } from "./zinipay";

export type PaymentMode = "stripe" | "zinipay" | "dev";

export const isStripeConfigured = () =>
  (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_");

/** Simulated payments: env opt-in AND never on live Stripe keys. */
export const isDevPaymentAllowed = () =>
  process.env.ALLOW_DEV_PAYMENTS === "true" &&
  !(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_");

export interface PaymentConfig {
  /** The mode checkout will actually use (after the configured-credentials fallback). */
  mode: PaymentMode;
  /** What the admin selected, even if it isn't usable. */
  requestedMode: PaymentMode;
  /** Fee units → ZiniPay charge units (BDT). 1 means the tier price IS the BDT amount. */
  zinipayMultiplier: number;
  /** Display-only currency label for the ZiniPay charge. */
  zinipayCurrency: string;
}

const DEFAULTS = { mode: "stripe" as PaymentMode, zinipayMultiplier: 1, zinipayCurrency: "BDT" };

// One settings read per minute, process-wide. The project is on the Firestore Spark
// plan (50k reads/day) — a per-checkout read would be fine, but every payment API route
// touches this, so it is cached like the other admin scans.
const TTL_MS = 60_000;
let cache: { at: number; cfg: PaymentConfig } | null = null;

function usable(mode: PaymentMode): boolean {
  if (mode === "stripe") return isStripeConfigured();
  if (mode === "zinipay") return isZiniPayConfigured();
  return isDevPaymentAllowed();
}

export async function getPaymentConfig(force = false): Promise<PaymentConfig> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.cfg;

  let s: any = {};
  try {
    const snap = await adminDb.doc("systemSettings/global").get();
    s = (snap.data() as any) || {};
  } catch (e) {
    console.error("[payments/config] settings read failed, using defaults:", e);
  }

  const requested: PaymentMode =
    s.paymentMode === "zinipay" || s.paymentMode === "dev" || s.paymentMode === "stripe"
      ? s.paymentMode
      : DEFAULTS.mode;

  // Fall back to whatever IS configured rather than dead-ending checkout.
  const mode: PaymentMode = usable(requested)
    ? requested
    : (["stripe", "zinipay", "dev"] as PaymentMode[]).find(usable) || requested;

  const rawMultiplier = Number(s.zinipayMultiplier);
  const cfg: PaymentConfig = {
    mode,
    requestedMode: requested,
    zinipayMultiplier: rawMultiplier > 0 ? rawMultiplier : DEFAULTS.zinipayMultiplier,
    zinipayCurrency: s.zinipayCurrency || DEFAULTS.zinipayCurrency,
  };
  cache = { at: Date.now(), cfg };
  return cfg;
}

/** Drop the cache so an admin's mode change takes effect on the next request. */
export function invalidatePaymentConfig() {
  cache = null;
}
