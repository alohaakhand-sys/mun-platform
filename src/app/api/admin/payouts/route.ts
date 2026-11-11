import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { walletFor, type WalletSummary } from "@/lib/server/walletServer";

/**
 * GET: the latest payout requests (newest 100) and, for organizers with a pending one, their
 * wallet (balance before this request), so the admin can see a request that's more than earned.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const snap = await adminDb.collection("payoutRequests").orderBy("requestedAt", "desc").limit(100).get();
  const payouts = snap.docs.map((d) => {
    const p = d.data() as any;
    return {
      id: d.id, organizerId: p.organizerId, organizerName: p.organizerName || "", organizerEmail: p.organizerEmail || "",
      amount: Number(p.amount) || 0, status: p.status, note: p.note || "", adminNote: p.adminNote || "", reference: p.reference || "",
      requestedAt: p.requestedAt?.toMillis?.() ?? null, processedAt: p.processedAt?.toMillis?.() ?? null,
    };
  });
  const settings = (await adminDb.collection("systemSettings").doc("global").get()).data();
  const wallets: Record<string, WalletSummary> = {};
  for (const id of new Set(payouts.filter((p) => p.status === "pending").map((p) => p.organizerId))) {
    if (id) wallets[id] = await walletFor(id, settings);
  }
  return NextResponse.json({ payouts, wallets });
}
