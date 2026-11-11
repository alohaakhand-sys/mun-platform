"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, writeBatch, serverTimestamp, collection } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { ALL_FEATURES, FEATURE_LABELS, type EventPlan, type PlanFeatures, type PlanTier, type UpgradeRequest } from "@/lib/data/eventPlan";

// The App Admin sets one event's plan (src/lib/data/eventPlan.ts): Free with its own caps, Pro
// (everything), or custom (each limit, feature and fee chosen here). Used for upgrade requests
// (admin → Applications) and direct overrides (admin → Events). A non-Free plan gives the owner
// the Verified organizer badge; a quota request can also raise the owner's Free-events cap.

type Draft = {
  tier: PlanTier;
  participants: string; // "" = the plan's default (Free cap / unlimited)
  committees: string;
  unlimitedParticipants: boolean;
  unlimitedCommittees: boolean;
  features: Required<PlanFeatures>;
  fee: string; // "" = the tier's default fee
  freeEvents: string; // the owner's Free-events cap, "" = the default
  note: string;
};

const NO_FEATURES: Required<PlanFeatures> = { video: false, ai: false, bulkEmail: false, ornate: false, customTheme: false, passes: false };

function draftFrom(plan: EventPlan | null | undefined, request?: UpgradeRequest | null, freeEvents?: number): Draft {
  const lim = plan?.limits || {};
  const fromRequest = request?.kind === "quota" ? request.wanted : undefined;
  const isPro = request?.kind === "pro";
  return {
    tier: isPro ? "custom" : (plan?.tier || "free"),
    participants: fromRequest?.participants != null ? String(fromRequest.participants) : typeof lim.participants === "number" ? String(lim.participants) : "",
    committees: fromRequest?.committees != null ? String(fromRequest.committees) : typeof lim.committees === "number" ? String(lim.committees) : "",
    unlimitedParticipants: isPro || lim.participants === null,
    unlimitedCommittees: isPro || lim.committees === null,
    features: isPro ? ALL_FEATURES : { ...NO_FEATURES, ...(plan?.features || {}) },
    fee: plan?.feePercent != null ? String(plan.feePercent) : "",
    freeEvents: fromRequest?.events != null ? String(fromRequest.events) : freeEvents != null ? String(freeEvents) : "",
    note: "",
  };
}

export function PlanEditorDialog({
  open, onOpenChange, eventId, eventTitle, request, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  eventTitle?: string;
  /** Deciding an upgrade request: its status, note and the organizer's notification go with the save. */
  request?: (UpgradeRequest & { id: string }) | null;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [owner, setOwner] = useState<string>("");
  // The stored plan: a paid Pro's payment record (paidAmount, provider, reference…) must survive an edit.
  const [prev, setPrev] = useState<EventPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !eventId) return;
    setDraft(null); setError("");
    (async () => {
      const ev = (await getDoc(doc(db, "events", eventId))).data() as any;
      const uid = ev?.organizerId || "";
      setOwner(uid);
      setPrev(ev?.plan || null);
      const u = uid ? ((await getDoc(doc(db, "users", uid))).data() as any) : null;
      setDraft(draftFrom(ev?.plan, request, u?.planOverrides?.freeEvents));
    })().catch((e) => setError(e?.message || "Couldn't load the event."));
  }, [open, eventId, request]);

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Math.floor(Number(v))));

  async function save(decision: "approved" | "rejected" | null) {
    if (!draft) return;
    setSaving(true); setError("");
    try {
      const b = writeBatch(db);
      if (decision !== "rejected") {
        const limits: Record<string, number | null> = {};
        if (draft.tier !== "pro") {
          if (draft.unlimitedParticipants) limits.participants = null; else if (num(draft.participants) != null) limits.participants = num(draft.participants)!;
          if (draft.unlimitedCommittees) limits.committees = null; else if (num(draft.committees) != null) limits.committees = num(draft.committees)!;
        }
        const { tier: _t, source: _s, limits: _l, features: _f, feePercent: _p, activatedAt: _a, requestId: _r, ...payment } = (prev || {}) as any;
        const plan: EventPlan = {
          ...payment,
          tier: draft.tier,
          source: prev?.source === "paid" && draft.tier === "pro" ? "paid" : request ? "request" : "admin",
          ...(Object.keys(limits).length ? { limits } : {}),
          ...(draft.tier === "custom" || draft.tier === "free" ? { features: draft.features } : {}),
          ...(draft.fee.trim() !== "" ? { feePercent: Math.min(100, Math.max(0, Number(draft.fee))) } : {}),
          activatedAt: serverTimestamp(),
          ...(request ? { requestId: request.id } : {}),
        };
        b.update(doc(db, "events", eventId), { plan });
        if (owner) {
          const userPatch: Record<string, any> = {};
          if (draft.tier !== "free") userPatch.verifiedOrganizer = true;
          const fe = num(draft.freeEvents);
          if (fe != null) userPatch.planOverrides = { freeEvents: fe };
          if (Object.keys(userPatch).length) b.set(doc(db, "users", owner), userPatch, { merge: true });
        }
      }
      if (request) {
        b.update(doc(db, "upgradeRequests", request.id), {
          status: decision || "approved", adminNote: draft.note.trim(), decidedAt: serverTimestamp(),
        });
        b.set(doc(collection(db, "notifications")), {
          uid: request.organizerId, type: "upgrade_request", eventId,
          title: decision === "rejected" ? "Upgrade request declined" : request.kind === "pro" ? "Your event is Pro" : "More room approved",
          body: (draft.note.trim() || (decision === "rejected" ? "The MUN Pilot team declined this request." : `New limits are live on ${eventTitle || "your event"}.`)).slice(0, 300),
          href: `/dashboard/organizer/events/${eventId}/plan`, read: false, createdAt: serverTimestamp(),
        });
      }
      await b.commit();
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{request ? (request.kind === "pro" ? "Pro request" : "More room request") : "Event plan"}</DialogTitle>
          <DialogDescription>{eventTitle || eventId}</DialogDescription>
        </DialogHeader>
        {request && (
          <div className="rounded-lg border bg-secondary p-3 text-sm space-y-1">
            {request.orgName && <p><span className="text-muted-foreground">Organization:</span> {request.orgName}</p>}
            {request.website && <p><span className="text-muted-foreground">Website:</span> {request.website}</p>}
            {request.wanted && <p><span className="text-muted-foreground">Wants:</span> {Object.entries(request.wanted).map(([k, v]) => `${v} ${k}`).join(", ")}</p>}
            <p className="whitespace-pre-wrap">{request.message}</p>
          </div>
        )}
        {!draft ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-2">
              {(["free", "custom", "pro"] as PlanTier[]).map((t) => (
                <Button key={t} type="button" variant={draft.tier === t ? "default" : "outline"} onClick={() => set({ tier: t, ...(t === "pro" ? { features: ALL_FEATURES } : {}) })}>
                  {t === "free" ? "Free" : t === "custom" ? "Custom" : "Pro"}
                </Button>
              ))}
            </div>
            {draft.tier !== "pro" && (
              <div className="grid grid-cols-2 gap-3">
                {([["participants", "unlimitedParticipants", "Participants"], ["committees", "unlimitedCommittees", "Committees"]] as const).map(([k, u, label]) => (
                  <div key={k} className="space-y-1.5">
                    <Label>{label}</Label>
                    <Input type="number" min={0} disabled={draft[u]} placeholder={draft.tier === "free" ? "Free default" : "Unlimited"}
                      value={draft[k]} onChange={(e) => set({ [k]: e.target.value } as any)} />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={draft[u]} onCheckedChange={(v) => set({ [u]: v } as any)} /> Unlimited
                    </label>
                  </div>
                ))}
              </div>
            )}
            {draft.tier !== "pro" && (
              <div className="space-y-2">
                <Label>Features</Label>
                {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[]).map((f) => (
                  <label key={f} className="flex items-center justify-between text-sm">
                    {FEATURE_LABELS[f]}
                    <Switch checked={draft.features[f]} onCheckedChange={(v) => set({ features: { ...draft.features, [f]: v } })} />
                  </label>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Platform fee (%)</Label>
                <Input type="number" min={0} max={100} placeholder="Tier default" value={draft.fee} onChange={(e) => set({ fee: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Owner&apos;s Free events at once</Label>
                <Input type="number" min={0} placeholder="Default" value={draft.freeEvents} onChange={(e) => set({ freeEvents: e.target.value })} />
              </div>
            </div>
            {request && (
              <div className="space-y-1.5">
                <Label>Note to the organizer (optional)</Label>
                <Textarea value={draft.note} onChange={(e) => set({ note: e.target.value })} rows={2} />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter className="gap-2">
          {request ? (
            <>
              <Button variant="outline" disabled={saving || !draft} onClick={() => save("rejected")}>Decline</Button>
              <Button disabled={saving || !draft} onClick={() => save("approved")}>{saving ? "Saving…" : "Approve with this plan"}</Button>
            </>
          ) : (
            <Button disabled={saving || !draft} onClick={() => save(null)}>{saving ? "Saving…" : "Save plan"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
