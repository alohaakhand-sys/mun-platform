import Stripe from "stripe";

// Server-side Stripe client. NEVER import this into a Client Component —
// the secret key must never reach the browser.
const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  // Don't throw at import time in dev so the rest of the app still boots;
  // the route handlers guard on this and return a clear error.
  console.warn("[stripe] STRIPE_SECRET_KEY is not set — payment routes will fail.");
}

export const stripe = new Stripe(secretKey || "sk_test_placeholder", {
  // Pin the API version so behavior is stable across Stripe upgrades.
  apiVersion: "2026-05-27.dahlia",
  typescript: true,
});

// Gateway-agnostic now — the platform can also run on ZiniPay or dev mode, so these two
// checks live with the rest of the payment config. Re-exported here for older imports.
export { isStripeConfigured, isDevPaymentAllowed } from "@/lib/payments/config";
