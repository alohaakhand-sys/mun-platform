/**
 * Legacy checkout path. Checkout is gateway-agnostic now (Stripe / ZiniPay / dev mode,
 * selected by the App Admin) — the implementation lives in /api/payments/checkout and
 * this route forwards to it so older clients keep working.
 */
export { POST } from "@/app/api/payments/checkout/route";
