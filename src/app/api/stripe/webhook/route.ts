import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { adminDb } from "@/lib/firebase/admin";
import Stripe from "stripe";
import { markEventPro } from "@/lib/payments/settle";

// Stripe webhook. This is the ONLY trusted place a payment is marked "paid".
// The browser redirect is not proof of payment — only a signed webhook is.
//
// Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
// then copy the printed `whsec_...` into STRIPE_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 503 });
  }

  // Raw body is required for signature verification — do NOT use req.json().
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error("[stripe/webhook] signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const applicationId = session.metadata?.applicationId;
      const amount = session.metadata?.amount;

      // A paid Pro upgrade for an event (/api/pro/checkout).
      if (session.metadata?.kind === "pro" && session.metadata?.eventId && session.payment_status === "paid") {
        await markEventPro({ eventId: session.metadata.eventId, provider: "stripe", amount: amount ? Number(amount) : (session.amount_total || 0) / 100, reference: session.id });
        console.log(`[stripe/webhook] event ${session.metadata.eventId} is Pro`);
        return NextResponse.json({ received: true });
      }

      if (applicationId && session.payment_status === "paid") {
        await adminDb.collection("applications").doc(applicationId).update({
          paymentStatus: "paid",
          paidAmount: amount ? Number(amount) : (session.amount_total || 0) / 100,
          stripeSessionId: session.id,
          paidAt: new Date(),
        });
        console.log(`[stripe/webhook] application ${applicationId} marked paid`);
      }
    }
  } catch (err: any) {
    console.error("[stripe/webhook] handler error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // Always 200 so Stripe stops retrying once we've recorded the event.
  return NextResponse.json({ received: true });
}
