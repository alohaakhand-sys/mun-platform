import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { logAuditServer } from "@/lib/server/auditServer";
import { resolvePlan, planLabel } from "@/lib/data/eventPlan";

const LIMIT = 5000;

function csv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((r) => r.map((v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
}
const iso = (v: any) => (v?.toDate ? v.toDate().toISOString() : typeof v === "string" ? v : "");

/**
 * GET ?type=users|payments|payouts|plans → a CSV download (up to 5,000 rows). Exports are an
 * occasional admin action; each row is one read. Emails for users come from Firebase Auth.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const type = new URL(req.url).searchParams.get("type") || "";
  let rows: (string | number | boolean | null | undefined)[][] = [];

  if (type === "users") {
    const snap = await adminDb.collection("users").select("firstName", "lastName", "displayName", "role", "verifiedOrganizer", "disabled", "createdAt").limit(LIMIT).get();
    const emails = new Map<string, string>();
    for (let i = 0; i < snap.docs.length; i += 100) {
      const got = await adminAuth.getUsers(snap.docs.slice(i, i + 100).map((d) => ({ uid: d.id })));
      got.users.forEach((u) => emails.set(u.uid, u.email || ""));
    }
    rows = [["uid", "name", "email", "role", "verifiedOrganizer", "disabled", "createdAt"],
      ...snap.docs.map((d) => {
        const u = d.data() as any;
        return [d.id, u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" "), emails.get(d.id) || "", u.role || "", u.verifiedOrganizer === true, u.disabled === true, iso(u.createdAt)];
      })];
  } else if (type === "payments") {
    const snap = await adminDb.collection("applications").where("paymentStatus", "in", ["paid", "refunded"])
      .select("eventId", "applicantName", "role", "paidAmount", "paymentStatus", "paymentProvider", "devPaid", "paidAt", "refundedAt").limit(LIMIT).get();
    rows = [["applicationId", "eventId", "name", "role", "amount", "status", "provider", "developerMode", "paidAt", "refundedAt"],
      ...snap.docs.map((d) => {
        const a = d.data() as any;
        return [d.id, a.eventId, a.applicantName, a.role, a.paidAmount, a.paymentStatus, a.paymentProvider, a.devPaid === true, iso(a.paidAt), iso(a.refundedAt)];
      })];
  } else if (type === "payouts") {
    const snap = await adminDb.collection("payoutRequests").limit(LIMIT).get();
    rows = [["payoutId", "organizerId", "organizerName", "organizerEmail", "amount", "status", "reference", "adminNote", "requestedAt", "processedAt"],
      ...snap.docs.map((d) => {
        const p = d.data() as any;
        return [d.id, p.organizerId, p.organizerName, p.organizerEmail, p.amount, p.status, p.reference, p.adminNote, iso(p.requestedAt), iso(p.processedAt)];
      })];
  } else if (type === "plans") {
    const settings = (await adminDb.collection("systemSettings").doc("global").get()).data() as any;
    const snap = await adminDb.collection("events").limit(LIMIT).get();
    rows = [["eventId", "title", "organizerId", "status", "plan", "source", "proPaid", "participantsCap", "committeesCap", "approvedCount", "feePercent"],
      ...snap.docs.map((d) => {
        const e = d.data() as any;
        const p = resolvePlan(e, settings);
        return [d.id, e.title, e.organizerId, e.status, planLabel(p), p.source || "", e.plan?.paidAmount ?? "", p.participants ?? "unlimited", p.committees ?? "unlimited", e.approvedCount ?? 0, p.feePercent];
      })];
  } else {
    return Response.json({ error: "type must be users, payments, payouts or plans." }, { status: 400 });
  }

  await logAuditServer({ actorUid: auth.uid, action: "data_exported", targetType: "export", targetId: type, after: { rows: rows.length - 1 } });
  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="munpilot-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
