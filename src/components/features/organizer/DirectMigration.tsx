"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { getEventById, Committee } from "@/lib/services/eventService";
import { getApplicationsByEvent, ApplicationData } from "@/lib/services/applicationService";
import { getEventMigrationRequests, callMigrationApi, MigrationRequest } from "@/lib/services/migrationService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Shuffle, Loader2, AlertCircle, CheckCircle2, Search, ArrowRight, MoveRight, Users } from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";

const norm = (s: any) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const ms = (v: any) => (v?.toMillis?.() ?? (v?.seconds ? v.seconds * 1000 : (v ? new Date(v).getTime() : 0))) || 0;

type Approved = {
  id: string;
  name: string;
  email: string;
  userId: string;
  committee: string;
  country: string;
};

function Seat({ committee, country }: { committee: string; country?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      {committee || "—"}
      {country ? (
        <>
          {" / "}<CountryFlag code={country} size={14} /> {getCountryName(country)}
        </>
      ) : (
        <span className="text-muted-foreground"> / no country</span>
      )}
    </span>
  );
}

export function DirectMigration() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();
  const { isOrganizerLevel, loading: roleLoading } = useEventStaffRole(eventId);

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [approved, setApproved] = useState<Approved[]>([]);
  const [history, setHistory] = useState<MigrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Move dialog state
  const [sel, setSel] = useState<Approved | null>(null);
  const [toCommittee, setToCommittee] = useState("");
  const [toCountry, setToCountry] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const seatOf = (a: ApplicationData): { committee: string; country: string } => ({
    committee: a.assignedCommittee || a.preferredCommittee || a.choices?.primary?.committee || "",
    country: a.assignedCountry || "",
  });

  const reload = async () => {
    const [event, apps, reqs] = await Promise.all([
      getEventById(eventId),
      getApplicationsByEvent(eventId),
      getEventMigrationRequests(eventId),
    ]);
    setCommittees(event?.committees ?? []);
    setApproved(
      apps
        .filter((a) => a.status === "approved")
        .map((a) => {
          const s = seatOf(a);
          return {
            id: (a as any).id,
            name: a.applicantName ?? a.userId,
            email: a.applicantEmail ?? "",
            userId: a.userId,
            committee: s.committee,
            country: s.country,
          };
        })
    );
    setHistory(reqs.filter((r) => r.source === "admin").sort((x, y) => ms(y.createdAt) - ms(x.createdAt)));
    setLoading(false);
  };

  useEffect(() => { if (eventId) reload(); /* eslint-disable-next-line */ }, [eventId]);

  const token = async () => (user ? await user.getIdToken() : "");

  const targetCountries = useMemo(
    () => committees.find((c) => norm(c.name) === norm(toCommittee))?.countries ?? [],
    [committees, toCommittee]
  );

  // Who currently holds the chosen target seat (excluding the delegate being moved)?
  const occupant = useMemo(() => {
    if (!sel || !toCommittee || !toCountry) return null;
    return approved.find(
      (a) => a.id !== sel.id && norm(a.committee) === norm(toCommittee) && norm(a.country) === norm(toCountry)
    ) || null;
  }, [approved, sel, toCommittee, toCountry]);

  const openMove = (a: Approved) => {
    setSel(a);
    setToCommittee("");
    setToCountry("");
    setReason("");
    setError(null);
  };

  // An occupied target seat is resolved by swapping — which needs the moved delegate
  // to already hold a committee + country to give the occupant in return.
  const canSwap = !!sel?.committee && !!sel?.country;
  const blockedByOccupant = !!occupant && !canSwap;

  const submit = async () => {
    if (!sel) return;
    if (!toCommittee || !toCountry) { setError("Pick a target committee and country."); return; }
    if (blockedByOccupant) { setError("That seat is taken. Assign this delegate a country first, or pick a free seat."); return; }
    setBusy(true); setError(null);
    const res = await callMigrationApi("/api/migrations/direct", await token(), {
      eventId,
      applicationId: sel.id,
      toCommittee,
      toCountry,
      reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error || "Migration failed."); return; }
    setFlash(`${sel.name} moved to ${toCommittee} / ${getCountryName(toCountry)}${res.swapped ? " (swapped)" : ""}.`);
    setSel(null);
    await reload();
    setTimeout(() => setFlash(null), 5000);
  };

  if (roleLoading || loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;
  }

  if (!isOrganizerLevel) {
    return (
      <Card className="glass-card border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          You don&apos;t have access to migrate delegates.
        </CardContent>
      </Card>
    );
  }

  const q = norm(search);
  const filtered = q
    ? approved.filter((a) => norm(a.name).includes(q) || norm(a.email).includes(q) || norm(a.committee).includes(q) || norm(getCountryName(a.country)).includes(q))
    : approved;

  return (
    <div className="space-y-6">
      <div className="border-b border-border/40 pb-3">
        <h2 className="text-xl font-semibold flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary/10 text-primary"><Shuffle className="w-[18px] h-[18px]" /></span>
          Direct Migration
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Move any approved delegate to another committee/country instantly. The delegate is emailed and notified.
          If the target seat is taken, you can swap the two delegates.
        </p>
      </div>

      {flash && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{flash}</span>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search delegate, committee, country…" className="pl-9 h-9" />
      </div>

      {/* Delegate list */}
      {approved.length === 0 ? (
        <Card className="glass-card border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">No approved delegates to migrate yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Approved delegates ({filtered.length})
          </h3>
          {filtered.map((a) => (
            <div key={a.id} className="glass-card rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold truncate">{a.name}</p>
                <p className="text-muted-foreground inline-flex items-center gap-1.5 flex-wrap mt-0.5">
                  <Seat committee={a.committee} country={a.country} />
                </p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => openMove(a)}>
                <MoveRight className="w-4 h-4" /> Move
              </Button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No delegates match “{search}”.</p>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Admin migrations ({history.length})</h3>
          {history.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/40 bg-secondary p-3 text-sm flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {r.requesterName}{r.type === "swap" && r.occupantName ? ` ↔ ${r.occupantName}` : ""}
                  {r.decidedByName ? <span className="text-muted-foreground font-normal"> · by {r.decidedByName}</span> : null}
                </p>
                <p className="text-muted-foreground inline-flex items-center gap-1.5 flex-wrap mt-0.5">
                  <Seat committee={r.fromCommittee} country={r.fromCountry} /> <ArrowRight className="w-3.5 h-3.5" /> <Seat committee={r.toCommittee} country={r.toCountry} />
                </p>
              </div>
              <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20">{r.type === "swap" ? "Swapped" : "Moved"}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Move dialog */}
      <Dialog open={!!sel} onOpenChange={(o) => { if (!o) setSel(null); }}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Move {sel?.name}</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/40 bg-secondary p-3 text-sm">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Currently</p>
                <Seat committee={sel.committee} country={sel.country} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Target committee</Label>
                <Select value={toCommittee} onValueChange={(v) => { setToCommittee(v ?? ""); setToCountry(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select committee" /></SelectTrigger>
                  <SelectContent>
                    {committees.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Target country</Label>
                {targetCountries.length > 0 ? (
                  <Select value={toCountry} onValueChange={(v) => setToCountry(v ?? "")} disabled={!toCommittee}>
                    <SelectTrigger><SelectValue placeholder={toCommittee ? "Select country" : "Pick a committee first"} /></SelectTrigger>
                    <SelectContent>
                      {targetCountries.map((c) => (
                        <SelectItem key={c} value={c}>
                          <span className="inline-flex items-center gap-1.5"><CountryFlag code={c} size={14} /> {getCountryName(c)}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={toCountry} onChange={(e) => setToCountry(e.target.value)} placeholder="Country code (e.g. US)" disabled={!toCommittee} />
                )}
              </div>

              {occupant && (
                canSwap ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                    <p className="flex items-center gap-1.5">
                      <Shuffle className="w-3.5 h-3.5 shrink-0" />
                      Seat held by <span className="font-semibold">{occupant.name}</span> — they&apos;ll be swapped into{" "}
                      <span className="font-medium">{sel.committee} / {getCountryName(sel.country)}</span>.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-600">
                    <p className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Seat held by <span className="font-semibold">{occupant.name}</span> and {sel.name} has no country to swap back.
                      Assign {sel.name} a country first, or pick a free seat.
                    </p>
                  </div>
                )
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Shown to the delegate in their notification." className="resize-none" />
              </div>

              {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSel(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || blockedByOccupant} className="gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : occupant ? <Shuffle className="w-4 h-4" /> : <MoveRight className="w-4 h-4" />}
              {occupant ? "Swap" : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
