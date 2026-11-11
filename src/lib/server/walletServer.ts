// The organizer wallet computed on the server, the same math as the organizer's financials page:
// every paid application on events they own, less each event plan's platform fee, minus payouts
// already pending or paid. Used to check payout requests (rules can't compute a balance).
import { adminDb } from "@/lib/firebase/admin";
import { resolvePlan } from "@/lib/data/eventPlan";
import { resolveRolePrice } from "@/lib/payments/pricing";

export interface WalletSummary { gross: number; fees: number; earned: number; reserved: number; available: number }

export async function walletFor(organizerId: string, settings: any): Promise<WalletSummary> {
  const events = await adminDb.collection("events").where("organizerId", "==", organizerId).get();
  let gross = 0, fees = 0;
  for (const e of events.docs) {
    const ev = e.data() as any;
    const paid = await adminDb.collection("applications").where("eventId", "==", e.id).where("paymentStatus", "==", "paid").get();
    const sum = paid.docs.reduce((s, a) => {
      const d = a.data() as any;
      return s + (typeof d.paidAmount === "number" ? d.paidAmount : resolveRolePrice(ev, d.role, d.teamSize || 1).price);
    }, 0);
    gross += sum;
    fees += sum * resolvePlan(ev, settings).feePercent / 100;
  }
  const payouts = await adminDb.collection("payoutRequests").where("organizerId", "==", organizerId).get();
  const reserved = payouts.docs.map((p) => p.data() as any).filter((p) => p.status === "pending" || p.status === "paid")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const earned = gross - fees;
  return { gross: r2(gross), fees: r2(fees), earned: r2(earned), reserved: r2(reserved), available: r2(Math.max(0, earned - reserved)) };
}
