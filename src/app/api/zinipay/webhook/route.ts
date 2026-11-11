import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyInvoice } from "@/lib/payments/zinipay";
import { markApplicationPaid, markEventPro } from "@/lib/payments/settle";
import { resolveRolePrice } from "@/lib/payments/pricing";

/**
 * ZiniPay webhook — `{ "invoice_id": "…", "status": "true" }`.
 *
 * The body is UNSIGNED, so it is treated purely as a nudge: the invoice id is looked up
 * against an application we ourselves created, and the status is then re-fetched from
 * ZiniPay's verify endpoint. Nothing in the request body can mark anything paid.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let invoiceId = "";
  try {
    const body = await req.json().catch(() => ({} as any));
    invoiceId = String(body?.invoice_id || body?.invoiceId || "");
    if (!invoiceId) {
      return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
    }

    const found = await adminDb
      .collection("applications")
      .where("zinipayInvoiceId", "==", invoiceId)
      .limit(1)
      .get();
    if (found.empty) {
      // A Pro upgrade for an event (/api/pro/checkout) carries its invoice on the event.
      const ev = await adminDb.collection("events").where("proInvoiceId", "==", invoiceId).limit(1).get();
      if (!ev.empty) {
        const e = ev.docs[0].data() as any;
        if (e.plan?.tier === "pro") return NextResponse.json({ received: true });
        const result = await verifyInvoice(invoiceId);
        const expected = Number(e.proChargedAmount || 0);
        if (result.status === "COMPLETED" && !(expected > 0 && result.amount > 0 && result.amount + 0.01 < expected)) {
          const settings = (await adminDb.collection("systemSettings").doc("global").get()).data() as any;
          await markEventPro({ eventId: ev.docs[0].id, provider: "zinipay", amount: Number(settings?.proEventPrice ?? 0), chargedAmount: result.amount || expected, currency: e.proCurrency || "BDT", reference: invoiceId });
          console.log(`[zinipay/webhook] event ${ev.docs[0].id} is Pro`);
        }
        return NextResponse.json({ received: true });
      }
      // Not one of ours (or already cleared) — 200 so ZiniPay stops retrying.
      console.warn(`[zinipay/webhook] no application for invoice ${invoiceId}`);
      return NextResponse.json({ received: true });
    }

    const doc = found.docs[0];
    const app = doc.data() as any;
    if (app.paymentStatus === "paid") return NextResponse.json({ received: true });

    const result = await verifyInvoice(invoiceId);
    if (result.status !== "COMPLETED") {
      console.log(`[zinipay/webhook] invoice ${invoiceId} is ${result.status} — not settling`);
      return NextResponse.json({ received: true });
    }

    const expected = Number(app.zinipayChargedAmount || 0);
    if (expected > 0 && result.amount > 0 && result.amount + 0.01 < expected) {
      console.error(
        `[zinipay/webhook] underpaid invoice ${invoiceId}: got ${result.amount}, expected ${expected}`
      );
      return NextResponse.json({ received: true });
    }

    const eventSnap = await adminDb.collection("events").doc(app.eventId).get();
    const { price } = resolveRolePrice((eventSnap.data() as any) || {}, app.role, app.teamSize || 1);

    await markApplicationPaid({
      applicationId: doc.id,
      provider: "zinipay",
      amount: price,
      chargedAmount: result.amount || expected,
      currency: app.zinipayCurrency || "BDT",
      transactionId: result.transactionId,
      paymentMethod: result.paymentMethod,
      reference: invoiceId,
    });
    console.log(`[zinipay/webhook] application ${doc.id} marked paid`);
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`[zinipay/webhook] handler error (${invoiceId}):`, err.message);
    // 500 so ZiniPay retries a transient failure.
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
