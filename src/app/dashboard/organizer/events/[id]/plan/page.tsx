"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, EventData } from "@/lib/services/eventService";
import { getSystemSettings, SystemSettings } from "@/lib/services/systemSettingsService";
import { resolvePlan, planLabel, FEATURE_LABELS, PLAN_DEFAULTS, type PlanFeatures, type UpgradeRequest } from "@/lib/data/eventPlan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import { Check, Lock, Crown, Loader2, Clock } from "lucide-react";

// An event's plan (src/lib/data/eventPlan.ts): what it has, how full it is, and the two ways up:
// pay for Pro now (/api/pro/checkout), or send the App Admin a request (Pro, or more Free room).

export default function EventPlanPage() {
  const { id: eventId } = useParams() as { id: string };
  const sp = useSearchParams();
  const { user, profile } = useAuth();
  const [event, setEvent] = useState<EventData | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [requests, setRequests] = useState<(UpgradeRequest & { id: string })[]>([]);
  const [asking, setAsking] = useState<"pro" | "quota" | null>(null);
  const [form, setForm] = useState({ orgName: "", website: "", message: "", participants: "", committees: "", events: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const [ev, s, r] = await Promise.all([
      getEventById(eventId),
      getSystemSettings(),
      getDocs(query(collection(db, "upgradeRequests"), where("organizerId", "==", user.uid), where("eventId", "==", eventId))),
    ]);
    setEvent(ev); setSettings(s);
    setRequests(r.docs.map((d) => ({ id: d.id, ...d.data() } as any)).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
  }, [eventId, user]);

  useEffect(() => { void load(); }, [load]);

  // Back from the gateway: ZiniPay is re-asked by /api/pro/verify; Stripe's webhook settles it.
  useEffect(() => {
    if (sp.get("payment") !== "success") return;
    let tries = 0;
    const tick = async () => {
      const r = await fetch("/api/pro/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId }) }).then((x) => x.json()).catch(() => null);
      if (r?.status === "paid") { setNotice("This event is Pro. Everything is unlocked."); void load(); return; }
      if (r?.status === "failed") { setNotice("The payment didn't go through. Nothing was charged."); return; }
      if (++tries < 6) setTimeout(tick, 3000); else setNotice("Still confirming the payment. Refresh in a minute.");
    };
    void tick();
  }, [sp, eventId, load]);

  if (!event || !settings) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-48 rounded-xl" /></div>;

  const plan = resolvePlan(event, settings);
  const owner = event.organizerId === user?.uid;
  const pending = requests.find((r) => r.status === "pending");
  const price = settings.proEventPrice ?? PLAN_DEFAULTS.proEventPrice;

  const pay = async () => {
    setBusy(true); setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch("/api/pro/checkout", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ eventId }) });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || "Couldn't start the payment.");
      window.location.href = j.url;
    } catch (e: any) { setError(e.message); setBusy(false); }
  };

  const send = async () => {
    if (!user || !asking) return;
    setBusy(true); setError("");
    const wanted: Record<string, number> = {};
    for (const k of ["participants", "committees", "events"] as const) if (form[k].trim()) wanted[k] = Math.max(0, Math.floor(Number(form[k])));
    try {
      await addDoc(collection(db, "upgradeRequests"), {
        eventId, eventTitle: event.title, organizerId: user.uid,
        organizerName: [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || user.email || "Organizer",
        kind: asking, message: form.message.trim(), status: "pending", createdAt: serverTimestamp(),
        ...(form.orgName.trim() ? { orgName: form.orgName.trim() } : {}),
        ...(form.website.trim() ? { website: form.website.trim() } : {}),
        ...(Object.keys(wanted).length ? { wanted } : {}),
      });
      setAsking(null); setForm({ orgName: "", website: "", message: "", participants: "", committees: "", events: "" });
      await load();
    } catch (e: any) { setError(e.message || "Couldn't send the request."); }
    setBusy(false);
  };

  const ready = form.message.trim() && (asking === "pro" ? form.orgName.trim() : form.participants || form.committees || form.events);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">Plan <Badge variant={plan.isPro ? "default" : "secondary"}>{planLabel(plan)}</Badge></h1>
        <p className="text-muted-foreground mt-1">Pro belongs to this event. It doesn&apos;t carry over to your other events.</p>
      </div>
      {notice && <div className="rounded-xl border bg-secondary px-4 py-3 text-sm">{notice}</div>}

      <Card>
        <CardHeader>
          <CardTitle>This event</CardTitle>
          <CardDescription>
            {event.approvedCount || 0} of {plan.participants ?? "∞"} participants · {event.committees?.length || 0} of {plan.committees ?? "∞"} committees · {plan.feePercent}% platform fee on ticket revenue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[]).map((f) => (
            <div key={f} className={`flex items-center gap-2 text-sm ${plan.features[f] ? "" : "text-muted-foreground"}`}>
              {plan.features[f] ? <Check className="w-4 h-4 text-primary" /> : <Lock className="w-4 h-4" />} {FEATURE_LABELS[f]}
            </div>
          ))}
        </CardContent>
      </Card>

      {pending && (
        <Card>
          <CardContent className="py-5 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">{pending.kind === "pro" ? "Pro request under review" : "Request for more room under review"}</p>
              <p className="text-muted-foreground">We&apos;ll notify you when the MUN Pilot team decides. Everything in your current plan keeps working.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {owner && plan.tier !== "pro" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Crown className="w-5 h-5" /> Upgrade</CardTitle>
            <CardDescription>Pro: no caps, live video, AI without the daily limit, big email sends, Ornate Gold and a custom colour, at a {settings.proFeePercent ?? PLAN_DEFAULTS.proFeePercent}% fee.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={pay} disabled={busy} className="gap-2">{busy && !asking ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Go Pro now · ${price}</Button>
            {!pending && !asking && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setAsking("pro")}>Request Pro</Button>
                {plan.tier === "free" && <Button variant="outline" onClick={() => setAsking("quota")}>Ask for more room</Button>}
              </div>
            )}
            {asking && (
              <div className="space-y-3 rounded-xl border p-4">
                {asking === "pro" ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Organization</Label><Input value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {([["participants", settings.freeParticipantCap], ["committees", settings.freeCommitteeCap], ["events", settings.freeEventCap]] as const).map(([k, d]) => (
                      <div key={k} className="space-y-1.5"><Label className="capitalize">{k === "events" ? "Free events" : k}</Label>
                        <Input type="number" min={0} placeholder={String(d ?? "")} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Why</Label>
                  <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} placeholder="Your conference, its size and what you need…" />
                  <AiTextareaAssist value={form.message} onPick={(v) => setForm((f) => ({ ...f, message: v }))} surface="pro-apply-motivation" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={send} disabled={busy || !ready}>{busy ? "Sending…" : "Submit"}</Button>
                  <Button variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {requests.some((r) => r.status !== "pending") && (
        <Card>
          <CardHeader><CardTitle>Past requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {requests.filter((r) => r.status !== "pending").map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm border rounded-lg p-3">
                <span>{r.kind === "pro" ? "Pro" : "More room"}{r.adminNote ? ` · ${r.adminNote}` : ""}</span>
                <Badge variant="outline">{r.status === "approved" ? "Approved" : "Declined"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
