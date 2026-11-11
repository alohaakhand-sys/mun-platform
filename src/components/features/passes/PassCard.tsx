"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { auth } from "@/lib/firebase/client";
import { roleLabel } from "@/lib/services/staffService";
import { getFoodSlots, getCoupons, getMyPassUse, getTransportRoutes } from "@/lib/services/optionalModulesService";
import { getEventById, getEventStartMs } from "@/lib/services/eventService";
import { resolvePlan } from "@/lib/data/eventPlan";
import { inAudience, DEFAULT_MEAL_AUDIENCE, eventDays } from "@/lib/data/passAudience";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, QrCode, RefreshCw } from "lucide-react";

// The holder's personal QR pass for one event (setup/qr-passes-plan.md). One code for every
// meal, coupon, check-in and ride: the scanner picks what it is scanning, and the server decides
// what this person may redeem. The code is signed on the server (/api/passes/mine).

type Holder = { uid: string; name: string; role: string; committee: string; kind: "organizer" | "staff" | "applicant" };

export function PassCard({ eventId, eventTitle }: { eventId: string; eventTitle?: string }) {
  const [state, setState] = useState<{ qr: string; holder: Holder } | { error: string } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState(null);
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/passes/mine?eventId=${encodeURIComponent(eventId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't load your pass.");
        const qr = await QRCode.toDataURL(data.code, { margin: 1, width: 640, errorCorrectionLevel: "M" });
        if (alive) setState({ qr, holder: data.holder });
      } catch (e: any) {
        if (alive) setState({ error: e?.message || "Couldn't load your pass." });
      }
    })();
    return () => { alive = false; };
  }, [eventId, tick]);

  return (
    <Card className="max-w-sm mx-auto overflow-hidden">
      <CardContent className="p-6 flex flex-col items-center text-center gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <QrCode className="w-4 h-4" /> {eventTitle || "Event pass"}
        </div>
        {state === null ? (
          <div className="w-64 h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : "error" in state ? (
          <div className="w-64 min-h-40 flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-muted-foreground">{state.error}</p>
            <Button variant="outline" size="sm" onClick={() => setTick((t) => t + 1)}><RefreshCw className="w-4 h-4 mr-2" /> Try again</Button>
          </div>
        ) : (
          <>
            {/* White plate so the code reads in dark mode too. */}
            <div className="bg-white p-3 rounded-xl">
              <img src={state.qr} alt="Your pass QR code" className="w-64 h-64" style={{ imageRendering: "pixelated" }} />
            </div>
            <div>
              <p className="text-lg font-bold">{state.holder.name}</p>
              <p className="text-sm text-muted-foreground">
                {[state.holder.kind === "applicant" ? state.holder.role : roleLabel(state.holder.role), state.holder.committee].filter(Boolean).join(" · ")}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Show this to staff for meals, coupons and check-in. One pass for everything.</p>
            <PassHoldings eventId={eventId} uid={state.holder.uid} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

type Holding = { id: string; title: string; uses: number; used: number; lastAt: number | null; checkin?: boolean };

/** What this pass can claim: their meals and coupons, check-in days and rides, with what's already used. */
function PassHoldings({ eventId, uid }: { eventId: string; uid: string }) {
  const [rows, setRows] = useState<Holding[] | null>(null);
  useEffect(() => {
    Promise.all([getFoodSlots(eventId), getCoupons(eventId), getMyPassUse(eventId, uid), getEventById(eventId), getTransportRoutes(eventId)]).then(([meals, coupons, mine, ev, routes]) => {
      if (!mine.member) { setRows([]); return; }
      const m = mine.member;
      const row = (id: string, title: string, uses: number) => ({ id, title, uses, used: mine.used[id]?.count || 0, lastAt: mine.used[id]?.lastAt ?? null });
      const pro = !!ev && resolvePlan(ev).features.passes;
      const start = ev ? getEventStartMs(ev) : NaN;
      const days = pro ? eventDays(Number.isNaN(start) ? null : start, (ev as any).endDate, (ev as any).timeZone) : [];
      const myRoutes = routes.filter((r) => !!mine.applicationId && r.registeredDelegates?.includes(mine.applicationId));
      setRows([
        ...meals.filter((s) => inAudience(uid, m, s.audience, DEFAULT_MEAL_AUDIENCE)).map((s) => row(`meal:${s.id}`, [s.mealName, s.day].filter(Boolean).join(" · "), s.usesPerPerson ?? 1)),
        ...(pro ? coupons.filter((c) => c.active && inAudience(uid, m, c.audience, [])).map((c) => row(`coupon:${c.id}`, [c.title, c.day].filter(Boolean).join(" · "), c.usesPerPerson)) : []),
        ...days.map((d) => ({ ...row(`checkin:${d.key}`, `Check-in · ${d.label}`, 1), checkin: true })),
        ...myRoutes.flatMap((r) => days.map((d) => row(`ride:${r.id}:${d.key}`, `${r.routeName || "Ride"} · ${d.label}`, 1))),
      ]);
    });
  }, [eventId, uid]);
  if (!rows?.length) return null;
  return (
    <div className="w-full text-left border-t border-border/50 pt-3 space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What your pass holds</p>
      {rows.map((r) => {
        const left = r.uses - r.used;
        return (
          <div key={r.id} className={`flex items-center justify-between text-sm ${left <= 0 ? "opacity-50" : ""}`}>
            <span className={left <= 0 ? "line-through" : ""}>{r.title}</span>
            <span className="text-xs text-muted-foreground">
              {left <= 0 ? `${r.checkin ? "Checked in" : "Used"}${r.lastAt ? ` ${new Date(r.lastAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}` : r.uses > 1 ? `${left} of ${r.uses} left` : r.checkin ? "Not yet" : "Ready"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
