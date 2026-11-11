import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyInvoice } from "@/lib/payments/zinipay";
import { markApplicationPaid } from "@/lib/payments/settle";
import { resolveRolePrice } from "@/lib/payments/pricing";

/**
 * Confirms a ZiniPay payment after the delegate is redirected back.
 *
 * A browser landing on `?payment=success` is NOT proof of payment — this route re-asks
 * ZiniPay. Safe without auth because nothing here is client-supplied except the
 * application id: the invoice id comes from the application doc (written at checkout),
 * the amount comes from the event, and only a genuinely COMPLETED invoice for THAT
 * invoice id settles the row.
 */
export async function POST(req: NextRequest) {
  try {
    const { applicationId } = await req.json();
    if (!applicationId) {
      return NextResponse.json({ error: "applicationId required" }, { status: 400 });
    }

    const appSnap = await adminDb.collection("applications").doc(applicationId).get();
    if (!appSnap.exists) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    const app = appSnap.data() as any;
    if (app.paymentStatus === "paid") return NextResponse.json({ status: "paid" });

    const invoiceId = app.zinipayInvoiceId;
    if (!invoiceId) return NextResponse.json({ status: "unknown" });

    const result = await verifyInvoice(invoiceId);
    if (result.status !== "COMPLETED") {
      return NextResponse.json({ status: result.status === "FAILED" ? "failed" : "pending" });
    }

    // Underpayment guard: the amount ZiniPay collected must cover what we invoiced.
    const expected = Number(app.zinipayChargedAmount || 0);
    if (expected > 0 && result.amount > 0 && result.amount + 0.01 < expected) {
      console.error(
        `[payments/verify] underpaid invoice ${invoiceId}: got ${result.amount}, expected ${expected}`
      );
      return NextResponse.json({ status: "underpaid" }, { status: 409 });
    }

    const eventSnap = await adminDb.collection("events").doc(app.eventId).get();
    const { price } = resolveRolePrice((eventSnap.data() as any) || {}, app.role, app.teamSize || 1);

    await markApplicationPaid({
      applicationId,
      provider: "zinipay",
      amount: price,
      chargedAmount: result.amount || expected,
      currency: app.zinipayCurrency || "BDT",
      transactionId: result.transactionId,
      paymentMethod: result.paymentMethod,
      reference: invoiceId,
    });

    return NextResponse.json({ status: "paid" });
  } catch (error: any) {
    console.error("[payments/verify] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
