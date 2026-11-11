import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyInvoice } from "@/lib/payments/zinipay";
import { markEventPro } from "@/lib/payments/settle";

/**
 * After a Pro checkout returns: is the event Pro yet? ZiniPay is re-asked here (its return is
 * not proof); Stripe settles through its signed webhook, so this only reports. Only the invoice
 * id stored on the event at checkout can settle it.
 */
export async function POST(req: NextRequest) {
  try {
    const { eventId } = await req.json();
    if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });
    const snap = await adminDb.collection("events").doc(eventId).get();
    if (!snap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    const ev = snap.data() as any;
    if (ev.plan?.tier === "pro") return NextResponse.json({ status: "paid" });
    if (!ev.proInvoiceId) return NextResponse.json({ status: "pending" });

    const result = await verifyInvoice(ev.proInvoiceId);
    if (result.status !== "COMPLETED") return NextResponse.json({ status: result.status === "FAILED" ? "failed" : "pending" });
    const expected = Number(ev.proChargedAmount || 0);
    if (expected > 0 && result.amount > 0 && result.amount + 0.01 < expected) return NextResponse.json({ status: "underpaid" }, { status: 409 });

    const settings = (await adminDb.collection("systemSettings").doc("global").get()).data() as any;
    await markEventPro({
      eventId, provider: "zinipay", amount: Number(settings?.proEventPrice ?? 0),
      chargedAmount: result.amount || expected, currency: ev.proCurrency || "BDT", reference: ev.proInvoiceId,
    });
    return NextResponse.json({ status: "paid" });
  } catch (error: any) {
    console.error("[pro/verify] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
