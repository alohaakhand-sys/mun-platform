import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";
import { resolveRolePrice, TEAM_ROLE } from "@/lib/payments/pricing";
import {
  getPaymentConfig,
  isDevPaymentAllowed,
  isStripeConfigured,
} from "@/lib/payments/config";
import { createInvoice, isZiniPayConfigured } from "@/lib/payments/zinipay";
import { markApplicationPaid } from "@/lib/payments/settle";

/**
 * Gateway-agnostic checkout. The active gateway is chosen by the App Admin
 * (Admin → Payments → `systemSettings/global.paymentMode`), never by the client.
 *
 * The price is read from the EVENT doc server-side, so a tampered request can't change
 * what it owes. /api/stripe/checkout forwards here for backwards compatibility.
 */
export async function POST(req: NextRequest) {
  try {
    const { applicationId, eventId, returnTo } = await req.json();
    if (!applicationId || !eventId) {
      return NextResponse.json({ error: "applicationId and eventId required" }, { status: 400 });
    }

    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const event = eventSnap.data() as any;

    const appSnap = await adminDb.collection("applications").doc(applicationId).get();
    if (!appSnap.exists || (appSnap.data() as any).eventId !== eventId) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    const app = appSnap.data() as any;

    if (app.paymentStatus === "paid") {
      return NextResponse.json({ error: "This registration is already paid." }, { status: 400 });
    }

    const { price, label } = resolveRolePrice(event, app.role, app.teamSize || 1);
    if (!(price > 0)) {
      return NextResponse.json(
        { error: "This role has no registration fee — no payment needed." },
        { status: 400 }
      );
    }

    const config = await getPaymentConfig();
    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    // The phone app (returnTo "app") gets the gateway back to /app-return, which reopens the app
    // on its "Confirming payment" screen; the website keeps its own pages.
    const toApp = returnTo === "app";
    const appReturn = (q: string) => `${origin}/app-return?to=payments&app=${applicationId}&${q}`;
    const cancelUrl = toApp ? appReturn("payment=cancelled") : `${origin}/dashboard/conferences?payment=cancelled`;

    // ── DEV PAYMENT MODE — bypasses every gateway, marks paid instantly. ──────────────
    // Triggered either by the platform-wide mode or the per-event legacy toggle; both
    // still require ALLOW_DEV_PAYMENTS and non-live Stripe keys.
    if (isDevPaymentAllowed() && (config.mode === "dev" || event.devPaymentMode)) {
      await markApplicationPaid({
        applicationId,
        provider: "dev",
        amount: price,
        reference: `dev_${applicationId}`,
      });
      return NextResponse.json({
        url: toApp ? appReturn("payment=success&gw=dev") : `${origin}/dashboard/payments?payment=success&dev=1&app=${applicationId}`,
        provider: "dev",
      });
    }

    // ── ZiniPay (bKash / Nagad, BDT) ─────────────────────────────────────────────────
    if (config.mode === "zinipay") {
      if (!isZiniPayConfigured()) {
        return NextResponse.json(
          { error: "ZiniPay is not configured. Set ZINIPAY_API_KEY in .env.local." },
          { status: 503 }
        );
      }
      // The tier price is charged in ZiniPay's currency after the admin-set multiplier
      // (1 = the tier price already IS the BDT amount).
      const charged = Math.round(price * config.zinipayMultiplier);
      if (!(charged > 0)) {
        return NextResponse.json({ error: "Converted amount is zero — check the ZiniPay rate." }, { status: 400 });
      }

      // NOTE: ZiniPay rejects a redirect_url whose domain doesn't match the brand's
      // registered website, so this must be the deployed origin, not localhost.
      const invoice = await createInvoice({
        amount: charged,
        customerName: app.applicantName || undefined,
        customerEmail: app.applicantEmail || undefined,
        metadata: { applicationId, eventId, role: String(app.role || "").slice(0, 60) },
        redirectUrl: toApp ? appReturn("payment=success&gw=zinipay") : `${origin}/dashboard/payments?payment=success&gw=zinipay&app=${applicationId}`,
        cancelUrl,
        webhookUrl: `${origin}/api/zinipay/webhook`,
      });

      // Stored BEFORE the redirect: both the webhook and the return-verify look the
      // application up by this invoice id, and refuse anything that doesn't match.
      await adminDb.collection("applications").doc(applicationId).update({
        zinipayInvoiceId: invoice.invoiceId,
        zinipayChargedAmount: charged,
        zinipayCurrency: config.zinipayCurrency,
        paymentProvider: "zinipay",
      });

      return NextResponse.json({ url: invoice.paymentUrl, provider: "zinipay" });
    }

    // ── Stripe (default) ─────────────────────────────────────────────────────────────
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured. Set STRIPE_SECRET_KEY in .env.local." },
        { status: 503 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Prices are in the smallest currency unit (cents).
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(price * 100),
            product_data: {
              name: `${event.title} — ${label} Registration`,
              description:
                app.role === TEAM_ROLE
                  ? `${app.role} (${app.teamSize || 1} members)`
                  : `${app.role} application`,
            },
          },
        },
      ],
      customer_email: app.applicantEmail || undefined,
      // Source of truth for the webhook — flips the application to paid.
      metadata: { applicationId, eventId, tierName: app.role, amount: String(price) },
      success_url: toApp ? appReturn("payment=success&gw=stripe") : `${origin}/dashboard/payments?payment=success&app=${applicationId}`,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url, provider: "stripe" });
  } catch (error: any) {
    console.error("[payments/checkout] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
