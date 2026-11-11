"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { getEventMigrationRequests, callMigrationApi, MigrationRequest, MigrationStatus } from "@/lib/services/migrationService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRightLeft, Loader2, Clock, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";

const ms = (v: any) => (v?.toMillis?.() ?? (v?.seconds ? v.seconds * 1000 : (v ? new Date(v).getTime() : 0))) || 0;

const STATUS_BADGE: Record<MigrationStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  awaiting_swap: { label: "Awaiting swap", cls: "bg-primary/10 text-primary border-primary/20" },
  completed: { label: "Completed", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  rejected: { label: "Rejected", cls: "bg-red-500/10 text-red-600 border-red-500/20" },
  failed: { label: "Failed", cls: "bg-secondary text-slate-600 border-slate-500/20" },
  cancelled: { label: "Cancelled", cls: "bg-secondary text-slate-600 border-slate-500/20" },
};

function Seat({ committee, country }: { committee: string; country: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      {committee} /
      <CountryFlag code={country} size={14} /> {getCountryName(country)}
    </span>
  );
}

export function MigrationRequests() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();
  const { isOrganizerLevel, loading: roleLoading } = useEventStaffRole(eventId);

  const [requests, setRequests] = useState<MigrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());

  const reload = async () => {
    // Lazily expire overdue swaps so the list reflects failures, then fetch.
    await fetch(`/api/migrations/expire?eventId=${eventId}`).catch(() => {});
    // Admin-initiated direct moves live in the Direct Migration tab, not here.
    setRequests((await getEventMigrationRequests(eventId)).filter((r) => r.source !== "admin"));
    setLoading(false);
  };

  useEffect(() => { if (eventId) reload(); /* eslint-disable-next-line */ }, [eventId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const token = async () => (user ? await user.getIdToken() : "");

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusyId(id); setError(null);
    const res = await callMigrationApi(`/api/migrations/${id}/decide`, await token(), {
      action,
      swapDeadlineHours: Number(hours[id]) || 48,
    });
    setBusyId(null);
    if (!res.ok) { setError(res.error || "Action failed."); return; }
    reload();
  };

  if (roleLoading || loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
  }

  if (!isOrganizerLevel) {
    return (
      <Card className="glass-card border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          You don&apos;t have access to manage migration requests.
        </CardContent>
      </Card>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const awaiting = requests.filter((r) => r.status === "awaiting_swap");
  const resolved = requests.filter((r) => ["completed", "rejected", "failed", "cancelled"].includes(r.status));

  return (
    <div className="space-y-6">
      <div className="border-b border-border/40 pb-3">
        <h2 className="text-xl font-semibold flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary/10 text-primary"><ArrowRightLeft className="w-[18px] h-[18px]" /></span>
          Migration Requests
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Delegates asking to move committee/country. Approving a move into a taken seat offers a swap to its current holder.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {requests.length === 0 && (
        <Card className="glass-card border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">No migration requests yet.</CardContent></Card>
      )}

      {/* Pending — actionable */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Needs review ({pending.length})</h3>
          {pending.map((r) => (
            <div key={r.id} className="glass-card rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-semibold">{r.requesterName || "Delegate"}</p>
                  <p className="text-muted-foreground inline-flex items-center gap-1.5 flex-wrap mt-0.5">
                    <Seat committee={r.fromCommittee} country={r.fromCountry} /> → <Seat committee={r.toCommittee} country={r.toCountry} />
                  </p>
                  {r.reason && <p className="text-xs text-muted-foreground mt-1 italic">“{r.reason}”</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-end gap-2 pt-1 border-t border-border/40">
                <div className="space-y-1 mr-auto">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Swap deadline (hrs)</label>
                  <Input type="number" min={1} value={hours[r.id!] ?? "48"} onChange={(e) => setHours((p) => ({ ...p, [r.id!]: e.target.value }))} className="h-8 w-24" />
                </div>
                <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => decide(r.id!, "reject")}
                  className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive gap-1.5">
                  <XCircle className="w-4 h-4" /> Reject
                </Button>
                <Button size="sm" disabled={busyId === r.id} onClick={() => decide(r.id!, "approve")} className="gap-1.5">
                  {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Awaiting swap */}
      {awaiting.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Awaiting swap ({awaiting.length})</h3>
          {awaiting.map((r) => (
            <div key={r.id} className="glass-card rounded-2xl p-4 text-sm flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{r.requesterName} → {r.occupantName || "current delegate"}</p>
                <p className="text-muted-foreground inline-flex items-center gap-1.5 flex-wrap mt-0.5">
                  <Seat committee={r.fromCommittee} country={r.fromCountry} /> ↔ <Seat committee={r.toCommittee} country={r.toCountry} />
                </p>
              </div>
              <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/20">
                <Clock className="w-3 h-3" /> {Math.max(0, Math.ceil((ms(r.swapDeadline) - now) / 3600000))}h left
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">History ({resolved.length})</h3>
          {resolved.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/40 bg-secondary p-3 text-sm flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{r.requesterName}{r.type === "swap" && r.occupantName ? ` ↔ ${r.occupantName}` : ""}</p>
                <p className="text-muted-foreground inline-flex items-center gap-1.5 flex-wrap mt-0.5">
                  <Seat committee={r.fromCommittee} country={r.fromCountry} /> → <Seat committee={r.toCommittee} country={r.toCountry} />
                </p>
              </div>
              <Badge variant="outline" className={STATUS_BADGE[r.status].cls}>{STATUS_BADGE[r.status].label}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
