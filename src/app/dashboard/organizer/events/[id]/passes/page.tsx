"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase/client";
import { useEventPlan } from "@/lib/hooks/useEventPlan";
import { roleLabel } from "@/lib/services/staffService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardCheck, Download, RefreshCw, ScanLine, Crown } from "lucide-react";

// The pass report (setup/qr-passes-plan.md, phase P5): every meal, coupon, check-in day and ride
// with how many claimed it. Pro adds who claimed each one (when, scanned by whom, by hand,
// accepted outside its time, undone), who hasn't yet, and a CSV of everything.

type Row = { target: string; title: string; window: string; uses: number; claimed: number; eligible: number };
type Line = { uid: string; name: string; role: string; committee: string; count: number; lastAt: number | null; lastBy: string; manual: boolean; override: boolean; undone: number };
type Detail = { target: { id: string; title: string; uses: number }; claimed: Line[]; notYet: Line[] };

async function authed(path: string) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Couldn't load the report.");
  return res;
}
const kindOf = (id: string) => id.split(":")[0];
const GROUPS: [string, string][] = [["meal", "Meals"], ["coupon", "Coupons"], ["checkin", "Check-in"], ["ride", "Transport"]];
const clock = (ms: number) => new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const who = (l: Line) => [/^[a-z-]+$/.test(l.role) ? roleLabel(l.role) : l.role, l.committee].filter(Boolean).join(" · ");

export default function PassReportPage() {
  const eventId = useParams().id as string;
  const { plan } = useEventPlan(eventId);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pro = !!plan?.features.passes;

  const load = async () => {
    setBusy(true); setError("");
    try { setRows((await (await authed(`/api/passes/report?eventId=${encodeURIComponent(eventId)}`)).json()).rows); } catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  useEffect(() => { load(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function show(target: string) {
    if (!pro) return;
    setOpen(target); setDetail(null); setError("");
    try { setDetail(await (await authed(`/api/passes/report?eventId=${encodeURIComponent(eventId)}&target=${encodeURIComponent(target)}`)).json()); }
    catch (e: any) { setError(e.message); setOpen(null); }
  }
  async function downloadCsv() {
    setBusy(true); setError("");
    try {
      const res = await authed(`/api/passes/report?eventId=${encodeURIComponent(eventId)}&format=csv`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob());
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "passes.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><ClipboardCheck className="w-7 h-7" /> Pass report</h1>
          <p className="text-muted-foreground mt-1">What was handed out with the QR passes, and to whom.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/dashboard/scan/${eventId}`} />} nativeButton={false}><ScanLine className="w-4 h-4 mr-1.5" /> Scan</Button>
          <Button variant="outline" onClick={load} disabled={busy}><RefreshCw className="w-4 h-4 mr-1.5" /> Refresh</Button>
          {pro && <Button onClick={downloadCsv} disabled={busy}><Download className="w-4 h-4 mr-1.5" /> CSV</Button>}
        </div>
      </div>
      {!pro && plan && (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Crown className="w-4 h-4 text-amber-600" /> Free events count meals. Who claimed what, coupons, check-in, transport and the CSV come with Pro (Plan).</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid lg:grid-cols-[1fr_420px] gap-6 items-start">
        <div className="space-y-4">
          {rows === null ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
            : rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to hand out yet: add meals (Modules → Food) or coupons.</p>
            : GROUPS.map(([k, label]) => {
              const list = rows.filter((r) => kindOf(r.target) === k);
              if (!list.length) return null;
              return (
                <Card key={k}>
                  <CardHeader className="pb-2"><CardTitle className="text-base">{label}</CardTitle></CardHeader>
                  <CardContent className="space-y-1 pt-0">
                    {list.map((r) => {
                      const pct = r.eligible ? Math.round((r.claimed / r.eligible) * 100) : 0;
                      return (
                        <button key={r.target} onClick={() => show(r.target)} disabled={!pro}
                          className={`w-full text-left rounded-lg px-3 py-2 ${open === r.target ? "bg-primary/10" : pro ? "hover:bg-secondary" : ""}`}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{r.title}</span>
                            <span className="font-mono text-xs">{r.claimed} / {r.eligible}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
        </div>

        {open && (
          <Card className="lg:sticky lg:top-24">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{detail?.target.title || "…"}</CardTitle>
              {detail && <CardDescription>{detail.claimed.length} claimed · {detail.notYet.length} not yet{detail.target.uses > 1 ? ` · ${detail.target.uses} uses each` : ""}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto">
              {!detail ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Claimed</p>
                    {detail.claimed.length === 0 ? <p className="text-sm text-muted-foreground">Nobody yet.</p> : detail.claimed.map((l) => (
                      <div key={l.uid} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{l.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{l.lastAt ? clock(l.lastAt) : ""}{detail.target.uses > 1 ? ` · ${l.count}/${detail.target.uses}` : ""}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{who(l)}</span>
                          {l.lastBy && <span>· by {l.lastBy}</span>}
                          {l.manual && <Badge variant="secondary" className="h-4 text-[10px]">by hand</Badge>}
                          {l.override && <Badge variant="secondary" className="h-4 text-[10px]">outside time</Badge>}
                          {l.undone > 0 && <Badge variant="outline" className="h-4 text-[10px]">{l.undone} undone</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Not yet</p>
                    {detail.notYet.length === 0 ? <p className="text-sm text-muted-foreground">Everyone has it.</p> : detail.notYet.map((l) => (
                      <div key={l.uid} className="text-sm flex items-center justify-between gap-2">
                        <span className="truncate">{l.name}</span>
                        <span className="text-xs text-muted-foreground truncate">{who(l)}{l.undone > 0 ? " · undone" : ""}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
