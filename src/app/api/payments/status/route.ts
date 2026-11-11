import { NextResponse } from "next/server";
import { getPaymentConfig, isDevPaymentAllowed, isStripeConfigured } from "@/lib/payments/config";
import { isZiniPayConfigured, ziniPayMode } from "@/lib/payments/zinipay";

/**
 * Gateway configuration report for Admin → Payments.
 *
 * NEVER returns a secret — only booleans, the detected key mode, and the public Stripe
 * publishable key. Safe to call from the client.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  const stripeMode = secret.startsWith("sk_live_")
    ? "live"
    : secret.startsWith("sk_test_")
    ? "test"
    : "unknown";

  // Deliberately the CACHED config (60s TTL). This route is unauthenticated — the
  // organizer Financials page reads it too — and the project is on the Spark plan's
  // 50k reads/day, so it must not cost a Firestore read per caller. A mode change shows
  // up here within a minute, which is what the admin panel tells the admin.
  const config = await getPaymentConfig();

  return NextResponse.json({
    // The gateway checkout will actually use, and what the admin asked for. They differ
    // only when the selected gateway's credentials are missing.
    activeMode: config.mode,
    requestedMode: config.requestedMode,
    zinipayMultiplier: config.zinipayMultiplier,
    zinipayCurrency: config.zinipayCurrency,

    stripe: {
      configured: isStripeConfigured(),
      // Webhook is the only trusted source that flips a Stripe payment to "paid".
      webhookConfigured: webhookSecret.startsWith("whsec_"),
      publishableConfigured: publishable.startsWith("pk_"),
      publishableKey: publishable.startsWith("pk_") ? publishable : null,
      mode: stripeMode,
      ready: isStripeConfigured() && webhookSecret.startsWith("whsec_"),
    },
    zinipay: {
      configured: isZiniPayConfigured(),
      mode: ziniPayMode(),
      ready: isZiniPayConfigured(),
    },
    dev: {
      // Env opt-in AND never on live Stripe keys.
      allowed: isDevPaymentAllowed(),
    },
    // Flat alias kept for the organizer Financials page's per-event dev toggle.
    devPaymentsAllowed: isDevPaymentAllowed(),
  });
}
