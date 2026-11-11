/**
 * The single write that flips an application to "paid".
 *
 * Every provider funnels through here so the shape of a paid application is identical
 * whichever gateway collected the money: `paidAmount` is always in the event's own fee
 * units (what Financials/receipts total), while `paidChargedAmount` + `paidCurrency`
 * record what the gateway actually charged (ZiniPay bills BDT).
 *
 * Only server routes holding the Admin SDK call this — the browser can never write
 * paymentStatus (see firestore.rules).
 */
import { adminDb } from "@/lib/firebase/admin";

export interface SettleInput {
  applicationId: string;
  provider: "stripe" | "zinipay" | "dev";
  /** Fee-unit amount owed (the ledger figure). */
  amount: number;
  /** What the gateway charged, if it differs from `amount`. */
  chargedAmount?: number;
  currency?: string;
  transactionId?: string;
  paymentMethod?: string;
  /** Gateway-side reference (Stripe session id / ZiniPay invoice id). */
  reference?: string;
}

export async function markApplicationPaid(input: SettleInput): Promise<boolean> {
  const ref = adminDb.collection("applications").doc(input.applicationId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  // Idempotent: webhook and redirect-verify both land here, and whoever is second is a no-op.
  if ((snap.data() as any)?.paymentStatus === "paid") return true;

  const patch: Record<string, any> = {
    paymentStatus: "paid",
    paidAmount: input.amount,
    paidAt: new Date(),
    paymentProvider: input.provider,
  };
  if (input.chargedAmount != null) patch.paidChargedAmount = input.chargedAmount;
  if (input.currency) patch.paidCurrency = input.currency;
  if (input.transactionId) patch.paymentTransactionId = input.transactionId;
  if (input.paymentMethod) patch.paymentMethod = input.paymentMethod;
  // `stripeSessionId` predates multi-gateway support and is read by existing screens,
  // so it stays the generic reference column.
  if (input.reference) patch.stripeSessionId = input.reference;
  if (input.provider === "dev") patch.devPaid = true;

  await ref.update(patch);
  return true;
}

/**
 * The single write that makes an event Pro after a paid upgrade (/api/pro/checkout). Every
 * gateway funnels through here, so a paid Pro plan looks the same whoever collected it. The
 * owner gets the Verified organizer badge (users.verifiedOrganizer, rules keep it server-only).
 */
export async function markEventPro(input: {
  eventId: string;
  provider: "stripe" | "zinipay" | "dev";
  amount: number;
  chargedAmount?: number;
  currency?: string;
  reference?: string;
}): Promise<boolean> {
  const ref = adminDb.collection("events").doc(input.eventId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const ev = snap.data() as any;
  // Idempotent: the webhook and the return-verify both land here.
  if (ev?.plan?.tier === "pro") return true;
  await ref.update({
    plan: {
      tier: "pro",
      source: "paid",
      paidAmount: input.amount,
      ...(input.chargedAmount != null ? { paidChargedAmount: input.chargedAmount } : {}),
      ...(input.currency ? { paidCurrency: input.currency } : {}),
      provider: input.provider,
      ...(input.reference ? { reference: input.reference } : {}),
      activatedAt: new Date(),
    },
  });
  if (ev?.organizerId) await adminDb.collection("users").doc(ev.organizerId).set({ verifiedOrganizer: true }, { merge: true });
  return true;
}
