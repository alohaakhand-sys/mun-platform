"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { getEventById, getEventStartMs } from "@/lib/services/eventService";
import { resolvePlan } from "@/lib/data/eventPlan";
import { getFoodSlots, getCoupons, getTransportRoutes, FoodSlot, Coupon, TransportRoute } from "@/lib/services/optionalModulesService";
import { roleLabel } from "@/lib/services/staffService";
import { parseTimeWindow, minutesNow, eventDays, dateIn, type EventDay } from "@/lib/data/passAudience";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ScanLine, Search, Undo2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Camera } from "lucide-react";

// The scanner (setup/qr-passes-plan.md, phase P2). Pick what you are handing out, then scan
// passes one after another; the server decides and counts (/api/passes/scan). Owner,
// co-organizers and staff with "Scan passes". Online only: a scan without a connection fails
// loudly instead of being queued.

type Holder = { uid: string; name: string; photoUrl: string; role: string; committee: string; kind: string };
type ScanResult = {
  result: "ok" | "already_used" | "not_eligible" | "outside_window" | "invalid" | "wrong_event" | "replaced" | "pro_required" | "paused";
  holder?: Holder; target?: { title: string; uses?: number }; remaining?: number;
  usedAt?: number | null; usedBy?: string; window?: string; reason?: string; otherEvent?: string;
  redemptionId?: string; at?: number;
};
type LookupItem = { target: string; title: string; uses: number; used: number; lastAt: number | null };
type Person = { uid: string; name: string; role: string; committee: string; country?: string };
type ReportRow = { target: string; title: string; window: string; uses: number; claimed: number; eligible: number };

async function api(path: string, body?: unknown) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't reach the server. Check your connection.");
  return data;
}

const roleText = (h: { kind?: string; role: string }) => (h.kind === "applicant" ? h.role : roleLabel(h.role));
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function ScanPage() {
  const eventId = useParams().eventId as string;
  const staff = useEventStaffRole(eventId);
  const allowed = staff.isOrganizerLevel || staff.can("canScanPasses");
  const [title, setTitle] = useState("");
  const [timeZone, setTimeZone] = useState<string | undefined>();
  const [slots, setSlots] = useState<FoodSlot[] | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  // Pro (`passes`): arrival check-in per day and boarding per route and day.
  const [days, setDays] = useState<EventDay[]>([]);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [mode, setMode] = useState<"redeem" | "lookup">("redeem");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [lookup, setLookup] = useState<{ holder: Holder; items: LookupItem[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "denied">("off");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ stop(): void; destroy(): void } | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  // "Accept anyway" repeats exactly the request that got `outside_window` (a scan or a manual redeem).
  const acceptRef = useRef<() => void>(() => {});
  const stateRef = useRef({ target, mode, busy });
  stateRef.current = { target, mode, busy };

  useEffect(() => {
    getEventById(eventId).then((e) => {
      setTitle(e?.title || ""); setTimeZone((e as any)?.timeZone);
      if (e && resolvePlan(e).features.passes) {
        const start = getEventStartMs(e);
        setDays(eventDays(Number.isNaN(start) ? null : start, (e as any).endDate, (e as any).timeZone));
        getTransportRoutes(eventId).then(setRoutes);
      }
    });
    getFoodSlots(eventId).then(setSlots);
    getCoupons(eventId).then(setCoupons);
  }, [eventId]);

  // Meals, active coupons, today's check-in and rides; whatever is running now on top.
  const meals = useMemo(() => {
    const now = minutesNow(timeZone);
    const today = dateIn(Date.now(), timeZone);
    const row = (id: string, title: string, day: string | undefined, time: string | undefined, venue: string | undefined) => {
      const w = parseTimeWindow(time);
      return { id, title: [title, day].filter(Boolean).join(" · "), sub: [time, venue].filter(Boolean).join(" · "), live: !!w && now >= w.start && now <= w.end, day: day || "", start: w?.start ?? 9999 };
    };
    return [
      ...(slots || []).map((s) => row(`meal:${s.id}`, s.mealName, s.day, s.timeWindow, s.venue)),
      ...coupons.filter((c) => c.active).map((c) => row(`coupon:${c.id}`, c.title, c.day, c.timeWindow, c.venue)),
      ...days.map((d) => ({ id: `checkin:${d.key}`, title: `Check-in · ${d.label}`, sub: d.date || "", live: d.date === today, day: d.label, start: 0 })),
      ...routes.flatMap((r) => days.map((d) => ({
        id: `ride:${r.id}:${d.key}`, title: `${r.routeName || `${r.pickupPoint} → ${r.dropoffPoint}`} · ${d.label}`,
        sub: [r.departureTime && `departs ${r.departureTime}`, `${r.registeredDelegates?.length || 0} registered`].filter(Boolean).join(" · "),
        live: d.date === today, day: d.label, start: 1,
      }))),
    ].sort((a, b) => Number(b.live) - Number(a.live) || a.day.localeCompare(b.day) || a.start - b.start);
  }, [slots, coupons, days, routes, timeZone]);
  const targetTitle = meals.find((m) => m.id === target)?.title;

  async function handleCode(code: string, override = false) {
    const { target: t, mode: m, busy: b } = stateRef.current;
    if (b) return;
    // A pass held in front of the camera is read many times a second: ignore it until it has been
    // out of frame for 8 seconds, so a "Claimed" card isn't replaced by "Already used".
    const now = Date.now();
    const seen = code === lastRef.current.code && now - lastRef.current.at < 8000;
    lastRef.current = { code, at: now };
    if (seen && !override) return;
    setBusy(true); setError("");
    try {
      if (m === "lookup") {
        const r = await api("/api/passes/lookup", { eventId, code });
        if (r.result !== "ok") { setResult(r); setLookup(null); } else { setLookup({ holder: r.holder, items: r.items }); setResult(null); }
      } else if (t) {
        const r: ScanResult = await api("/api/passes/scan", { eventId, target: t, code, override });
        acceptRef.current = () => handleCode(code, true);
        setResult(r);
        setLookup(null);
        navigator.vibrate?.(r.result === "ok" ? 80 : [60, 60, 60]);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function startCamera() {
    if (!videoRef.current) return;
    setCamera("starting");
    try {
      const QrScanner = (await import("qr-scanner")).default;
      const s = new QrScanner(videoRef.current, (r) => handleCode(r.data), { returnDetailedScanResult: true, highlightScanRegion: true, preferredCamera: "environment", maxScansPerSecond: 8 });
      await s.start();
      scannerRef.current = s;
      setCamera("on");
    } catch {
      setCamera("denied");
    }
  }
  useEffect(() => () => { scannerRef.current?.stop(); scannerRef.current?.destroy(); }, []);

  async function undo() {
    if (!result?.redemptionId || !result.at) return;
    setBusy(true);
    try {
      await api("/api/passes/undo", { eventId, redemptionId: result.redemptionId, at: result.at });
      setResult(null);
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }

  if (staff.loading) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!allowed) return <p className="py-20 text-center text-muted-foreground">You don&apos;t have permission to scan passes for this event. Ask the organizer to turn on &quot;Scan Passes&quot; for you.</p>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><ScanLine className="w-7 h-7" /> Scan passes</h1>
        <p className="text-muted-foreground mt-1">{title}</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">What are you handing out?</CardTitle>
              <CardDescription>Pick it once, then scan everyone&apos;s pass.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant={mode === "redeem" ? "default" : "outline"} onClick={() => { setMode("redeem"); setLookup(null); }}>Redeem</Button>
                <Button size="sm" variant={mode === "lookup" ? "default" : "outline"} onClick={() => { setMode("lookup"); setResult(null); }}>Check only</Button>
              </div>
              {mode === "redeem" && (slots === null ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : meals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to hand out yet. Add meals in Modules → Food, or coupons under Coupons.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {meals.map((m) => (
                    <button key={m.id} onClick={() => { setTarget(m.id); setResult(null); }}
                      className={`text-left rounded-xl border px-3 py-2 transition-colors ${target === m.id ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"}`}>
                      <p className="text-sm font-semibold flex items-center gap-1.5">{m.title}{m.live && <Badge className="text-[10px] h-4 px-1.5">Now</Badge>}</p>
                      <p className="text-xs text-muted-foreground">{m.sub}</p>
                    </button>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-0 relative bg-black aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {camera !== "on" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/90 p-6 text-center">
                  {camera === "denied" ? <p className="text-sm">Camera blocked or not found. Allow camera access in the browser and try again.</p> : null}
                  <Button onClick={startCamera} disabled={camera === "starting" || (mode === "redeem" && !target)} variant="secondary">
                    {camera === "starting" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                    {mode === "redeem" && !target ? "Pick what you hand out first" : "Start camera"}
                  </Button>
                </div>
              )}
              {busy && <div className="absolute top-3 right-3"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}
            </CardContent>
          </Card>
          {mode === "redeem" && targetTitle && <p className="text-sm text-muted-foreground">Scanning for <strong className="text-foreground">{targetTitle}</strong></p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="space-y-4">
          {result && <ResultCard r={result} onAccept={() => acceptRef.current()} onUndo={undo} busy={busy} />}
          {lookup && <LookupCard holder={lookup.holder} items={lookup.items} />}
          {staff.isOrganizerLevel && <FindByName eventId={eventId} target={target} targetTitle={targetTitle} onResult={(r, accept) => { acceptRef.current = accept; setResult(r); setLookup(null); }} />}
          <ReportCard eventId={eventId} />
        </div>
      </div>
    </div>
  );
}

function HolderLine({ h }: { h: Holder }) {
  return (
    <div className="flex items-center gap-3">
      {h.photoUrl ? <img src={h.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center font-bold">{h.name.slice(0, 1)}</div>}
      <div className="min-w-0">
        <p className="font-bold truncate">{h.name}</p>
        <p className="text-xs text-muted-foreground truncate">{[roleText(h), h.committee].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
  );
}

function ResultCard({ r, onAccept, onUndo, busy }: { r: ScanResult; onAccept: () => void; onUndo: () => void; busy: boolean }) {
  const look = {
    ok: { tone: "border-green-600 bg-green-600/10", icon: <CheckCircle2 className="w-6 h-6 text-green-600" />, title: "Claimed" },
    already_used: { tone: "border-amber-500 bg-amber-500/10", icon: <AlertTriangle className="w-6 h-6 text-amber-600" />, title: "Already used" },
    outside_window: { tone: "border-amber-500 bg-amber-500/10", icon: <AlertTriangle className="w-6 h-6 text-amber-600" />, title: "Outside meal time" },
    not_eligible: { tone: "border-red-600 bg-red-600/10", icon: <XCircle className="w-6 h-6 text-red-600" />, title: "Not for them" },
    invalid: { tone: "border-red-600 bg-red-600/10", icon: <XCircle className="w-6 h-6 text-red-600" />, title: "Not a MUN Pilot pass" },
    wrong_event: { tone: "border-red-600 bg-red-600/10", icon: <XCircle className="w-6 h-6 text-red-600" />, title: "Pass for another event" },
    replaced: { tone: "border-red-600 bg-red-600/10", icon: <XCircle className="w-6 h-6 text-red-600" />, title: "This pass was reset" },
    pro_required: { tone: "border-red-600 bg-red-600/10", icon: <XCircle className="w-6 h-6 text-red-600" />, title: "Coupons need a Pro event" },
    paused: { tone: "border-amber-500 bg-amber-500/10", icon: <AlertTriangle className="w-6 h-6 text-amber-600" />, title: "This coupon is paused" },
  }[r.result];
  const detail =
    r.result === "ok" ? (r.target?.uses && r.target.uses > 1 ? `${r.remaining} of ${r.target.uses} left` : r.target?.title) :
    r.result === "already_used" ? `${r.usedAt ? `At ${clock(r.usedAt)}` : "Earlier"}${r.usedBy ? ` by ${r.usedBy}` : ""}` :
    r.result === "outside_window" ? `${r.target?.title} runs ${r.window}` :
    r.result === "wrong_event" ? (r.otherEvent ? `It's for ${r.otherEvent}.` : "") :
    r.result === "replaced" ? "Ask them to open My Pass again for the new code." :
    r.reason || "";
  return (
    <Card className={`border-2 ${look.tone}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">{look.icon}<p className="text-lg font-bold">{look.title}</p></div>
        {r.holder && <HolderLine h={r.holder} />}
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        {r.result === "outside_window" && <Button size="sm" onClick={onAccept} disabled={busy}>Accept anyway</Button>}
        {r.result === "ok" && r.redemptionId && <Button size="sm" variant="outline" onClick={onUndo} disabled={busy}><Undo2 className="w-4 h-4 mr-1.5" /> Undo</Button>}
      </CardContent>
    </Card>
  );
}

function LookupCard({ holder, items }: { holder: Holder; items: LookupItem[] }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <HolderLine h={holder} />
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing for their role.</p> : (
          <div className="space-y-1.5">
            {items.map((i) => (
              <div key={i.target} className="flex items-center justify-between text-sm">
                <span className={i.used >= i.uses ? "text-muted-foreground line-through" : ""}>{i.title}</span>
                <span className="text-xs text-muted-foreground">{i.used >= i.uses ? `Used${i.lastAt ? ` ${clock(i.lastAt)}` : ""}` : i.uses > 1 ? `${i.uses - i.used} of ${i.uses} left` : "Ready"}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The organizer redeems for someone without a phone; recorded as a manual redeem. */
function FindByName({ eventId, target, targetTitle, onResult }: { eventId: string; target: string | null; targetTitle?: string; onResult: (r: ScanResult, accept: () => void) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const found = q.trim().length < 2 ? [] : (people || []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4" /> Find by name</CardTitle>
        <CardDescription>No phone or pass? Redeem by hand. It&apos;s recorded as manual.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input value={q} placeholder="Type a name" onFocus={() => { if (!people) api(`/api/passes/people?eventId=${encodeURIComponent(eventId)}`).then((d) => setPeople(d.people)).catch((e) => setErr(e.message)); }} onChange={(e) => setQ(e.target.value)} />
        {found.map((p) => (
          <div key={p.uid} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0"><p className="font-medium truncate">{p.name}</p><p className="text-xs text-muted-foreground truncate">{[p.role, p.committee].filter(Boolean).join(" · ")}</p></div>
            <Button size="sm" variant="outline" disabled={!target || busy !== null} onClick={async () => {
              const redeem = async (override: boolean) => {
                setBusy(p.uid); setErr("");
                try { onResult(await api("/api/passes/scan", { eventId, target, uid: p.uid, override }), () => redeem(true)); } catch (e: any) { setErr(e.message); }
                setBusy(null);
              };
              await redeem(false);
            }}>{busy === p.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : targetTitle ? "Redeem" : "Pick one first"}</Button>
          </div>
        ))}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}

function ReportCard({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = async () => {
    setBusy(true); setErr("");
    try { setRows((await api(`/api/passes/report?eventId=${encodeURIComponent(eventId)}`)).rows); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Claimed so far</CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows === null ? <p className="text-sm text-muted-foreground">Tap refresh to count.</p> : rows.map((r) => (
          <div key={r.target} className="flex items-center justify-between text-sm">
            <span>{r.title}</span><span className="font-mono text-xs">{r.claimed} / {r.eligible}</span>
          </div>
        ))}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}
