import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";
import { getPaymentConfig, isDevPaymentAllowed, isStripeConfigured } from "@/lib/payments/config";
import { createInvoice, isZiniPayConfigured } from "@/lib/payments/zinipay";
import { markEventPro } from "@/lib/payments/settle";
import { requireUid } from "@/lib/server/migrationServer";
import { PLAN_DEFAULTS } from "@/lib/data/eventPlan";

/**
 * Pay to make ONE event Pro (src/lib/data/eventPlan.ts). The event's owner only. The price is the
 * App Admin's `systemSettings/global.proEventPrice`, read here, never sent by the client. Same
 * gateways as delegate fees (Admin → Payments): the Stripe webhook or the ZiniPay webhook /
 * /api/pro/verify then call markEventPro.
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const { eventId, returnTo } = await req.json();
    if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    const event = eventSnap.data() as any;
    if (event.organizerId !== uid) return NextResponse.json({ error: "Only the event's owner can upgrade it." }, { status: 403 });
    if (event.plan?.tier === "pro") return NextResponse.json({ error: "This event is already Pro." }, { status: 400 });

    const settings = (await adminDb.collection("systemSettings").doc("global").get()).data() as any;
    const price = Number(settings?.proEventPrice ?? PLAN_DEFAULTS.proEventPrice);
    if (!(price > 0)) return NextResponse.json({ error: "Pro isn't for sale right now. Send a request instead." }, { status: 400 });

    const config = await getPaymentConfig();
    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const toApp = returnTo === "app";
    const appReturn = (q: string) => `${origin}/app-return?to=plan&event=${eventId}&${q}`;
    const webReturn = (q: string) => `${origin}/dashboard/organizer/events/${eventId}/plan?${q}`;
    const back = (q: string) => (toApp ? appReturn(q) : webReturn(q));

    if (isDevPaymentAllowed() && (config.mode === "dev" || event.devPaymentMode)) {
      await markEventPro({ eventId, provider: "dev", amount: price, reference: `dev_pro_${eventId}` });
      return NextResponse.json({ url: back("payment=success&gw=dev"), provider: "dev" });
    }

    if (config.mode === "zinipay") {
      if (!isZiniPayConfigured()) return NextResponse.json({ error: "ZiniPay is not configured." }, { status: 503 });
      const charged = Math.round(price * config.zinipayMultiplier);
      if (!(charged > 0)) return NextResponse.json({ error: "Converted amount is zero — check the ZiniPay rate." }, { status: 400 });
      const owner = (await adminDb.collection("users").doc(uid).get()).data() as any;
      const invoice = await createInvoice({
        amount: charged,
        customerName: [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") || undefined,
        metadata: { kind: "pro", eventId },
        redirectUrl: back("payment=success&gw=zinipay"),
        cancelUrl: back("payment=cancelled"),
        webhookUrl: `${origin}/api/zinipay/webhook`,
      });
      // Stored before the redirect: the webhook and /api/pro/verify find the event by it.
      await eventSnap.ref.update({ proInvoiceId: invoice.invoiceId, proChargedAmount: charged, proCurrency: config.zinipayCurrency });
      return NextResponse.json({ url: invoice.paymentUrl, provider: "zinipay" });
    }

    if (!isStripeConfigured()) return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: { name: `MUN Pilot Pro — ${event.title}`, description: "Pro for this event: no caps, live video, AI, big email sends." },
        },
      }],
      metadata: { kind: "pro", eventId, amount: String(price) },
      success_url: back("payment=success&gw=stripe"),
      cancel_url: back("payment=cancelled"),
    });
    return NextResponse.json({ url: session.url, provider: "stripe" });
  } catch (error: any) {
    console.error("[pro/checkout] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
