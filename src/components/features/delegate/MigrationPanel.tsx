"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, EventData } from "@/lib/services/eventService";
import {
  getMyMigrationRequest,
  getSwapOffersForOccupant,
  callMigrationApi,
  MigrationRequest,
} from "@/lib/services/migrationService";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { ArrowRightLeft, Loader2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface MigrationApp {
  id: string;
  eventId: string;
  role?: string;
  assignedCommittee?: string;
  assignedCountry?: string;
  preferredCommittee?: string;
  choices?: any;
}

const ms = (v: any) => (v?.toMillis?.() ?? (v?.seconds ? v.seconds * 1000 : (v ? new Date(v).getTime() : 0))) || 0;

function fmtRemaining(msLeft: number) {
  if (msLeft <= 0) return "expired";
  const h = Math.floor(msLeft / 3600000);
  const m = Math.floor((msLeft % 3600000) / 60000);
  const s = Math.floor((msLeft % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export function MigrationPanel({ application }: { application: MigrationApp }) {
  const { user } = useAuth();
  const eventId = application.eventId;

  const [event, setEvent] = useState<EventData | null>(null);
  const [myReq, setMyReq] = useState<MigrationRequest | null>(null);
  const [swapOffer, setSwapOffer] = useState<MigrationRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [committee, setCommittee] = useState("");
  const [country, setCountry] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const fromCommittee = application.assignedCommittee || application.preferredCommittee || application.choices?.primary?.committee || "";
  const fromCountry = application.assignedCountry || "";
  const isFaculty = application.role === "Faculty Advisor";
  const canRequest = !isFaculty && !!fromCommittee && !!fromCountry;

  const reload = async () => {
    if (!user) return;
    const [req, offers] = await Promise.all([
      getMyMigrationRequest(eventId, user.uid),
      getSwapOffersForOccupant(user.uid),
    ]);
    setMyReq(req);
    setSwapOffer(offers.find((o) => o.eventId === eventId) || null);
  };

  useEffect(() => { getEventById(eventId).then(setEvent); }, [eventId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [user, eventId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const committees = event?.committees || [];
  const countriesFor = (name: string) => committees.find((c) => c.name === name)?.countries || [];
  const token = async () => (user ? await user.getIdToken() : "");

  const submitRequest = async () => {
    if (!committee || !country) { setError("Pick a committee and country."); return; }
    setBusy(true); setError(null);
    const res = await callMigrationApi("/api/migrations/request", await token(), { eventId, toCommittee: committee, toCountry: country, reason });
    setBusy(false);
    if (!res.ok) { setError(res.error || "Failed to submit."); return; }
    setOpen(false); setCommittee(""); setCountry(""); setReason("");
    reload();
  };

  const cancelRequest = async () => {
    if (!myReq?.id) return;
    setBusy(true);
    await callMigrationApi(`/api/migrations/${myReq.id}/cancel`, await token(), {});
    setBusy(false); reload();
  };

  const respondSwap = async (action: "accept" | "decline") => {
    if (!swapOffer?.id) return;
    setBusy(true); setError(null);
    const res = await callMigrationApi(`/api/migrations/${swapOffer.id}/respond`, await token(), { action });
    setBusy(false);
    if (!res.ok) setError(res.error || "Failed.");
    reload();
  };

  if (!canRequest && !swapOffer) return null;

  const activeReq = myReq && (myReq.status === "pending" || myReq.status === "awaiting_swap") ? myReq : null;
  const resolvedReq = myReq && !activeReq && ["completed", "rejected", "failed"].includes(myReq.status) ? myReq : null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* Occupant swap offer */}
      {swapOffer && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <ArrowRightLeft className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">Seat swap request</p>
              <p className="text-muted-foreground mt-0.5">
                <strong>{swapOffer.requesterName || "A delegate"}</strong> wants to swap into your seat
                (<strong>{swapOffer.toCommittee} / {swapOffer.toCountry}</strong>). If you accept, you&apos;ll move to{" "}
                <strong>{swapOffer.fromCommittee} / {swapOffer.fromCountry}</strong>.
              </p>
              <p className="text-xs text-amber-600 mt-1 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> Respond within {fmtRemaining(ms(swapOffer.swapDeadline) - now)}
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => respondSwap("decline")}
              className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive">
              Decline
            </Button>
            <Button size="sm" disabled={busy} onClick={() => respondSwap("accept")} className="bg-primary hover:bg-primary text-white gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Accept swap
            </Button>
          </div>
        </div>
      )}

      {/* Active request status */}
      {canRequest && activeReq && (
        <div className="rounded-2xl border border-border/50 bg-secondary p-4 flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium text-foreground inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" />
              {activeReq.status === "pending" ? "Migration request pending review" : "Approved — awaiting the current delegate's swap"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              To {activeReq.toCommittee} / {activeReq.toCountry}
              {activeReq.status === "awaiting_swap" && activeReq.swapDeadline ? ` · expires in ${fmtRemaining(ms(activeReq.swapDeadline) - now)}` : ""}
            </p>
          </div>
          {activeReq.status === "pending" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={cancelRequest} className="text-muted-foreground">
              Cancel
            </Button>
          )}
        </div>
      )}

      {/* Resolved status (one-time info) */}
      {canRequest && resolvedReq && (
        <div className="rounded-2xl border border-border/50 bg-secondary p-3 text-xs text-muted-foreground inline-flex items-center gap-1.5">
          {resolvedReq.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
          Last migration request to {resolvedReq.toCommittee} / {resolvedReq.toCountry}: <span className="font-medium capitalize">{resolvedReq.status}</span>
        </div>
      )}

      {/* Request button + dialog */}
      {canRequest && !activeReq && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
            <ArrowRightLeft className="w-4 h-4" /> Request Migration
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-primary" /> Request a Migration</DialogTitle>
              <DialogDescription>
                Ask the organizer to move you to a different committee/country. You&apos;re currently in{" "}
                <strong>{fromCommittee} / {fromCountry || "—"}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Target committee</Label>
                <Select value={committee} onValueChange={(v) => { setCommittee(v || ""); setCountry(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select a committee" /></SelectTrigger>
                  <SelectContent>
                    {committees.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target country</Label>
                <Select value={country} onValueChange={(v) => setCountry(v || "")} disabled={!committee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a country">
                      {country ? (
                        <span className="inline-flex items-center gap-2"><CountryFlag code={country} size={16} /> {getCountryName(country)}</span>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {countriesFor(committee).map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="inline-flex items-center gap-2"><CountryFlag code={c} size={16} /> {getCountryName(c)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">If the seat is already taken, the organizer can offer a swap to its current holder.</p>
              </div>
              <div className="space-y-2">
                <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you want to move?" className="min-h-[70px]" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submitRequest} disabled={busy || !committee || !country} className="gap-1.5">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />} Submit request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
