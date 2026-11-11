"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { PlanEditorDialog } from "@/components/features/admin/PlanEditorDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Crown, Loader2 } from "lucide-react";

// Plans and money across events (src/lib/data/eventPlan.ts): which events are Pro and how they got
// there, Pro revenue, ticket revenue and the platform's fee. Data: /api/admin/plans (server sums).

type Row = {
  id: string; title: string; organizerId: string; status: string; tier: "free" | "pro" | "custom";
  source: string | null; label: string; provider: string | null; participants: number | null;
  committees: number | null; approvedCount: number; committeeCount: number; feePercent: number;
  proPaid: number; ticketGross: number; fee: number;
};
type Totals = { proRevenue: number; ticketGross: number; platformFees: number; pro: number; custom: number; free: number };
type Payment = { id: string; name: string; role: string; amount: number; status: string; provider: string; dev: boolean; paidAt: number | null; refundNote: string };

const money = (n: number) => `$${n.toLocaleString()}`;
const SOURCE: Record<string, string> = { paid: "Paid", request: "Request", admin: "Admin", legacy: "Early event" };

async function adminFetch(path: string, body?: unknown) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function AdminPlansPage() {
  const { authorized } = useAdminGuard();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState("");
  const [tier, setTier] = useState<"all" | "pro" | "custom" | "free">("all");
  const [search, setSearch] = useState("");
  const [planFor, setPlanFor] = useState<Row | null>(null);
  const [paymentsFor, setPaymentsFor] = useState<Row | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refundNote, setRefundNote] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await adminFetch("/api/admin/plans");
      setRows(data.rows); setTotals(data.totals);
    } catch (e: any) { setError(e.message); setRows([]); }
  }, []);
  useEffect(() => { if (authorized) void load(); }, [authorized, load]);

  const openPayments = async (r: Row) => {
    setPaymentsFor(r); setPayments(null); setRefundNote("");
    try { setPayments((await adminFetch(`/api/admin/plans?eventId=${r.id}`)).payments); } catch (e: any) { setError(e.message); setPayments([]); }
  };

  const refund = async (p: Payment) => {
    if (!confirm(`Record a refund of ${money(p.amount)} for ${p.name || "this registration"}? Send the money back in the gateway first.`)) return;
    setRefunding(p.id);
    try {
      await adminFetch("/api/admin/refund", { applicationId: p.id, note: refundNote });
      if (paymentsFor) await openPayments(paymentsFor);
      await load();
    } catch (e: any) { alert(e.message); }
    setRefunding(null);
  };

  const shown = useMemo(() => (rows || []).filter((r) =>
    (tier === "all" || r.tier === tier) && (!search || r.title.toLowerCase().includes(search.toLowerCase()))), [rows, tier, search]);

  if (!authorized) return null;
  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Crown className="w-7 h-7" /> Plans &amp; revenue</h1>
        <p className="text-muted-foreground mt-1">Which events are Pro and how, what they paid, ticket revenue and the platform&apos;s fee.</p>
      </div>

      {totals ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["Pro revenue", money(totals.proRevenue)],
            ["Ticket revenue", money(totals.ticketGross)],
            ["Platform fees", money(totals.platformFees)],
            ["Pro · custom · Free", `${totals.pro} · ${totals.custom} · ${totals.free}`],
          ].map(([label, value]) => (
            <Card key={label} className="border-border/60"><CardContent className="p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </CardContent></Card>
          ))}
        </div>
      ) : <Skeleton className="h-24 rounded-2xl" />}

      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle>Events</CardTitle>
            <CardDescription>Developer Payment Mode payments are left out of every total.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "pro", "custom", "free"] as const).map((t) => (
              <Button key={t} size="sm" variant={tier === t ? "default" : "outline"} onClick={() => setTier(t)} className="capitalize">{t}</Button>
            ))}
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title" className="w-48 h-9" />
          </div>
        </CardHeader>
        {error && <p className="px-6 pb-3 text-sm text-destructive">{error}</p>}
        {rows === null ? <CardContent><Skeleton className="h-48 rounded-xl" /></CardContent> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 hidden md:table-cell">Use</th>
                  <th className="px-4 py-3 text-right">Pro paid</th>
                  <th className="px-4 py-3 text-right">Tickets</th>
                  <th className="px-4 py-3 text-right">Fee</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-secondary transition-colors">
                    <td className="px-4 py-3"><p className="font-medium">{r.title || r.id}</p><p className="text-xs text-muted-foreground capitalize">{r.status}</p></td>
                    <td className="px-4 py-3">
                      <Badge variant={r.tier === "free" ? "secondary" : "default"}>{r.label}</Badge>
                      {r.source && <p className="text-xs text-muted-foreground mt-1">{SOURCE[r.source] || r.source}{r.provider ? ` · ${r.provider}` : ""}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      {r.approvedCount} / {r.participants ?? "∞"} participants<br />{r.committeeCount} / {r.committees ?? "∞"} committees
                    </td>
                    <td className="px-4 py-3 text-right">{r.proPaid ? money(r.proPaid) : "—"}</td>
                    <td className="px-4 py-3 text-right">{money(r.ticketGross)}</td>
                    <td className="px-4 py-3 text-right">{money(r.fee)}<p className="text-xs text-muted-foreground">{r.feePercent}%</p></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setPlanFor(r)}>Plan</Button>
                      <Button size="sm" variant="ghost" onClick={() => openPayments(r)}>Payments</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No events.</div>}
          </div>
        )}
      </Card>

      <PlanEditorDialog open={!!planFor} onOpenChange={(v) => { if (!v) setPlanFor(null); }} eventId={planFor?.id || ""} eventTitle={planFor?.title} onSaved={load} />

      <Dialog open={!!paymentsFor} onOpenChange={(v) => { if (!v) setPaymentsFor(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Payments</DialogTitle>
            <DialogDescription>{paymentsFor?.title}. A refund here only records it: send the money back in Stripe or ZiniPay first.</DialogDescription>
          </DialogHeader>
          <Input value={refundNote} onChange={(e) => setRefundNote(e.target.value)} placeholder="Refund note to the delegate (optional)" />
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {payments === null ? <Skeleton className="h-24" /> : payments.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No paid registrations.</p> :
              payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border rounded-lg p-3 text-sm">
                  <div>
                    <p className="font-medium">{p.name || p.id} · {money(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">{p.role}{p.provider ? ` · ${p.provider}` : ""}{p.dev ? " · developer mode" : ""}{p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString()}` : ""}</p>
                    {p.refundNote && <p className="text-xs text-muted-foreground">{p.refundNote}</p>}
                  </div>
                  {p.status === "paid" ? (
                    <Button size="sm" variant="outline" disabled={refunding === p.id} onClick={() => refund(p)}>
                      {refunding === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refund"}
                    </Button>
                  ) : <Badge variant="secondary">Refunded</Badge>}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
