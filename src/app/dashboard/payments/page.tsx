"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { getUserApplications, ApplicationData } from "@/lib/services/applicationService";
import { getEventById, EventData, getRolePrice, getRoleTier } from "@/lib/services/eventService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Wallet, Clock, CheckCircle2, RefreshCw, Printer, CreditCard } from "lucide-react";

interface PaymentRow {
  application: ApplicationData & { id: string };
  event: EventData;
  amount: number;
  status: "paid" | "pending" | "refunded";
  tierName: string;
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [justPaid, setJustPaid] = useState(false);

  // `?app=<id>` — arriving from a conference card's "Pay" CTA. Highlight and scroll to
  // that one row so the delegate doesn't have to hunt for their event in the table.
  const [focusAppId, setFocusAppId] = useState<string | null>(null);
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);
  // ZiniPay has no signed webhook, so the return trip asks the server to re-verify the
  // invoice before anything is trusted (`?gw=zinipay&app=<id>`).
  const [verifyAppId, setVerifyAppId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const paid = q.get("payment") === "success";
    if (paid) setJustPaid(true);
    setFocusAppId(q.get("app"));
    if (paid && q.get("gw") === "zinipay" && q.get("app")) setVerifyAppId(q.get("app"));
  }, []);

  const loadRows = useCallback(async () => {
    if (!user) return;
    const apps = (await getUserApplications(user.uid)) as (ApplicationData & { id: string })[];
    const withEvents = await Promise.all(
      apps.map(async (app) => {
        const event = await getEventById(app.eventId);
        if (!event) return null;
        // Fee is derived from the applicant's role tier (team multiplies by size).
        const amount = getRolePrice(event, app.role, app.teamSize || 1);
        const roleTier = getRoleTier(event, app.role);
        // Free role → always "paid" (nothing owed). Paid role → use the real
        // paymentStatus, which only a server route (webhook / verify) ever writes.
        let status: PaymentRow["status"];
        if (amount <= 0) status = "paid";
        else if (app.paymentStatus === "paid") status = "paid";
        else if (app.paymentStatus === "refunded" || app.status === "rejected") status = "refunded";
        else status = "pending";
        return { application: app, event, amount, status, tierName: roleTier?.label || app.role || "—" } as PaymentRow;
      })
    );
    setRows(withEvents.filter(Boolean) as PaymentRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!loading && focusAppId && focusRowRef.current) {
      focusRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading, focusAppId, rows.length]);

  // ZiniPay return trip: confirm the invoice server-side, then refresh. The webhook
  // usually gets there first — this is the fallback that doesn't depend on it.
  useEffect(() => {
    if (!verifyAppId) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: verifyAppId }),
        });
      } catch {
        // Verification is retried by the poll below; nothing to show the delegate here.
      }
      if (!cancelled) loadRows();
    })();
    return () => { cancelled = true; };
  }, [verifyAppId, loadRows]);

  // After a fresh gateway redirect the webhook may not have flipped the status
  // yet. Poll a few times so the "confirming" banner self-clears once paid.
  useEffect(() => {
    if (!justPaid) return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      loadRows();
      if (tries >= 5) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [justPaid, loadRows]);

  const totalSpent = rows.filter((r) => r.status === "paid").reduce((acc, r) => acc + r.amount, 0);
  const totalPending = rows.filter((r) => r.status === "pending").reduce((acc, r) => acc + r.amount, 0);
  const totalRefunded = rows.filter((r) => r.status === "refunded").reduce((acc, r) => acc + r.amount, 0);

  const [payingId, setPayingId] = useState<string | null>(null);

  const handlePayNow = async (row: PaymentRow) => {
    const appId = (row.application as any).id;
    setPayingId(appId);
    try {
      const resp = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: appId, eventId: row.event.id }),
      });
      const data = await resp.json();
      if (resp.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error || "Could not start payment.");
    } catch {
      alert("Could not reach payment service.");
    }
    setPayingId(null);
  };

  const handlePrintReceipt = (row: PaymentRow) => {
    const win = window.open("", "_blank");
    if (!win) return;

    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const fmtDate = (d?: string) => {
      if (!d) return "—";
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    };
    const issued = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const receiptNo = (row.application as any).id?.slice(0, 8).toUpperCase() || "—";
    const applicant = esc(row.application.applicantName || user?.email || "—");
    const statusLabel = row.status === "refunded" ? "Refunded" : "Paid";
    const statusColor = row.status === "refunded" ? "#2563eb" : "#16a34a";
    const statusBg = row.status === "refunded" ? "#dbeafe" : "#dcfce7";

    win.document.write(`
      <!DOCTYPE html>
      <html lang="en"><head><meta charset="utf-8" />
      <title>Receipt · ${esc(row.event.title)}</title>
      <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #f1f5f9; color: #0f172a; padding: 40px 20px;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .sheet {
          max-width: 640px; margin: 0 auto; background: #fff; border-radius: 20px;
          overflow: hidden; box-shadow: 0 10px 40px rgba(15,23,42,0.08); border: 1px solid #e2e8f0;
        }
        .header {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: #fff; padding: 32px 36px; display: flex; align-items: center;
          justify-content: space-between; gap: 16px;
        }
        .brand { display: flex; align-items: center; gap: 12px; }
        .brand .mark {
          width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,0.18);
          display: grid; place-items: center; font-size: 20px; font-weight: 700;
        }
        .brand .name { font-size: 15px; font-weight: 600; letter-spacing: 0.2px; opacity: 0.95; }
        .header h1 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; opacity: 0.85; }
        .header .doc-title { font-size: 22px; font-weight: 700; margin-top: 2px; }
        .meta {
          display: grid; grid-template-columns: 1fr 1fr; gap: 20px 28px;
          padding: 28px 36px; border-bottom: 1px solid #f1f5f9;
        }
        .meta .item .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 600; }
        .meta .item .value { font-size: 15px; color: #1e293b; font-weight: 600; margin-top: 4px; }
        .badge {
          display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px;
          font-size: 12px; font-weight: 700; color: ${statusColor}; background: ${statusBg};
        }
        .badge::before { content: ""; width: 7px; height: 7px; border-radius: 999px; background: ${statusColor}; }
        .items { padding: 28px 36px; }
        table { width: 100%; border-collapse: collapse; }
        thead th {
          text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
          color: #94a3b8; font-weight: 600; padding: 0 0 12px; border-bottom: 1px solid #e2e8f0;
        }
        thead th:last-child, tbody td:last-child { text-align: right; }
        tbody td { padding: 16px 0; font-size: 15px; color: #334155; border-bottom: 1px solid #f1f5f9; }
        tbody td .sub { display: block; font-size: 12px; color: #94a3b8; font-weight: 400; margin-top: 2px; }
        .total-row td { font-size: 18px; font-weight: 700; color: #0f172a; border-bottom: none; padding-top: 18px; }
        .total-row td:last-child { color: #4f46e5; }
        .footer {
          padding: 20px 36px 28px; font-size: 12px; color: #94a3b8;
          display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9;
        }
        @media print {
          body { background: #fff; padding: 0; }
          .sheet { box-shadow: none; border: none; border-radius: 0; max-width: 100%; }
        }
      </style></head>
      <body>
        <div class="sheet">
          <div class="header">
            <div>
              <h1>Payment Receipt</h1>
              <div class="doc-title">${esc(row.event.title)}</div>
            </div>
            <div class="brand">
              <div class="mark">M</div>
              <div class="name">MUN Platform</div>
            </div>
          </div>

          <div class="meta">
            <div class="item"><div class="label">Receipt No.</div><div class="value">#${esc(receiptNo)}</div></div>
            <div class="item"><div class="label">Status</div><div class="value"><span class="badge">${statusLabel}</span></div></div>
            <div class="item"><div class="label">Applicant</div><div class="value">${applicant}</div></div>
            <div class="item"><div class="label">Role</div><div class="value">${esc(row.application.role)}</div></div>
            <div class="item"><div class="label">Event Date</div><div class="value">${esc(fmtDate(row.event.date))}</div></div>
            <div class="item"><div class="label">Issued</div><div class="value">${esc(issued)}</div></div>
          </div>

          <div class="items">
            <table>
              <thead><tr><th>Description</th><th>Amount</th></tr></thead>
              <tbody>
                <tr>
                  <td>${esc(row.tierName)} Registration<span class="sub">${esc(row.event.title)}</span></td>
                  <td>$${row.amount.toFixed(2)}</td>
                </tr>
                <tr class="total-row"><td>Total Paid</td><td>$${row.amount.toFixed(2)}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="footer">
            <span>Generated by MUN Platform</span>
            <span>${esc(issued)}</span>
          </div>
        </div>
        <script>window.onload = function(){ window.print(); }<\/script>
      </body></html>
    `);
    win.document.close();
  };

  const StatusBadge = ({ status }: { status: PaymentRow["status"] }) => {
    const config = {
      paid: { label: "Paid", color: "text-green-500 bg-green-500/10 border-green-500/20", icon: CheckCircle2 },
      pending: { label: "Pending", color: "text-yellow-600 bg-yellow-500/10 border-yellow-500/20", icon: Clock },
      refunded: { label: "Refunded", color: "text-blue-500 bg-blue-500/10 border-blue-500/20", icon: RefreshCw },
    }[status];
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`gap-1 text-xs ${config.color}`}>
        <Icon className="w-3 h-3" /> {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex items-center gap-4"
      >
        <div className="grid place-items-center w-11 h-11 rounded-sm border border-border bg-secondary text-foreground shrink-0">
          <Receipt className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">Payment History</span></h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Registration fees across all conferences.</p>
        </div>
      </motion.div>

      {justPaid && !loading && rows.some((r) => r.status === "pending") && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          Payment successful. It may take a few seconds to appear below while the payment
          provider confirms it.
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center glass-card rounded-2xl border-dashed">
          <div className="grid place-items-center w-16 h-16 rounded-2xl bg-secondary text-muted-foreground mb-4">
            <Receipt className="w-8 h-8" />
          </div>
          <p className="text-lg font-semibold mb-1">No payment history yet</p>
          <p className="text-sm text-muted-foreground">Apply to a conference to see your registration fees here.</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Spent", value: `$${totalSpent}`, icon: Wallet, text: "text-emerald-500", bg: "bg-emerald-500/10" },
              { label: "Pending", value: `$${totalPending}`, icon: Clock, text: "text-amber-500", bg: "bg-amber-500/10" },
              { label: "Refunded", value: `$${totalRefunded}`, icon: RefreshCw, text: "text-blue-500", bg: "bg-blue-500/10" },
            ].map(({ label, value, icon: Icon, text, bg }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="glass-card rounded-2xl p-5 flex items-center gap-4"
              >
                <div className={`grid place-items-center w-12 h-12 rounded-xl ${bg} ${text} shrink-0`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Table */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="grid place-items-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                  <Receipt className="w-[18px] h-[18px]" />
                </div>
                Transactions
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Event</th>
                    <th className="text-left px-4 py-3 hidden sm:table-cell">Date</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Tier</th>
                    <th className="text-left px-4 py-3">Amount</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rows.map((row) => (
                    <tr
                      key={(row.application as any).id}
                      ref={(row.application as any).id === focusAppId ? focusRowRef : undefined}
                      className={`transition-colors ${
                        (row.application as any).id === focusAppId
                          ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/30"
                          : "hover:bg-secondary"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.event.title}</p>
                        <p className="text-xs text-muted-foreground">{row.application.role}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{row.event.date}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{row.tierName}</td>
                      <td className="px-4 py-3 font-medium">{row.amount > 0 ? `$${row.amount}` : "Free"}</td>
                      <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {row.status === "pending" && row.amount > 0 ? (
                          <Button
                            size="sm"
                            className="h-8 gap-1"
                            disabled={payingId === (row.application as any).id}
                            onClick={() => handlePayNow(row)}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            {payingId === (row.application as any).id ? "…" : "Pay Now"}
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrintReceipt(row)}>
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
