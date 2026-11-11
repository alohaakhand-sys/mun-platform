import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { resolvePlan, planLabel } from "@/lib/data/eventPlan";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * GET → every event (up to 300) with its plan, how it became Pro, its Pro payment, ticket revenue
 * (real payments only, no Developer Payment Mode) and the platform fee, plus totals.
 * Only paid registrations are read, and only their amount fields.
 * GET ?eventId=… → that event's paid registrations, for refunds.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const eventId = new URL(req.url).searchParams.get("eventId");
  const apps = adminDb.collection("applications");

  if (eventId) {
    const snap = await apps.where("eventId", "==", eventId).where("paymentStatus", "in", ["paid", "refunded"]).limit(500).get();
    return NextResponse.json({
      payments: snap.docs.map((d) => {
        const a = d.data() as any;
        return {
          id: d.id, name: a.applicantName || "", role: a.role || "", amount: Number(a.paidAmount) || 0, status: a.paymentStatus,
          provider: a.paymentProvider || "", dev: a.devPaid === true, paidAt: a.paidAt?.toMillis?.() ?? null, refundNote: a.refundNote || "",
        };
      }),
    });
  }

  const settings = (await adminDb.collection("systemSettings").doc("global").get()).data();
  const events = await adminDb.collection("events").limit(300).get();
  const rows = await Promise.all(events.docs.map(async (e) => {
    const ev = e.data() as any;
    const plan = resolvePlan(ev, settings as any);
    const paid = await apps.where("eventId", "==", e.id).where("paymentStatus", "==", "paid").select("paidAmount", "devPaid").get();
    // Real payments only: Developer Payment Mode marks devPaid.
    const gross = paid.docs.reduce((t, d) => (d.get("devPaid") === true ? t : t + (Number(d.get("paidAmount")) || 0)), 0);
    const proPaid = ev.plan?.source === "paid" && ev.plan?.provider !== "dev" ? Number(ev.plan?.paidAmount) || 0 : 0;
    return {
      id: e.id, title: ev.title || "", organizerId: ev.organizerId || "", status: ev.status || "draft",
      tier: plan.tier, source: plan.source || null, label: planLabel(plan), provider: ev.plan?.provider || null,
      participants: plan.participants, committees: plan.committees, approvedCount: ev.approvedCount || 0,
      committeeCount: (ev.committees || []).length, feePercent: plan.feePercent,
      proPaid: r2(proPaid), ticketGross: r2(gross), fee: r2(gross * plan.feePercent / 100),
    };
  }));
  const totals = {
    proRevenue: r2(rows.reduce((s, r) => s + r.proPaid, 0)),
    ticketGross: r2(rows.reduce((s, r) => s + r.ticketGross, 0)),
    platformFees: r2(rows.reduce((s, r) => s + r.fee, 0)),
    pro: rows.filter((r) => r.tier === "pro").length,
    custom: rows.filter((r) => r.tier === "custom").length,
    free: rows.filter((r) => r.tier === "free").length,
  };
  return NextResponse.json({ rows, totals, truncated: events.size === 300 });
}
