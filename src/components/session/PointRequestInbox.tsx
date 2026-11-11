"use client";

/**
 * The chair's accept/reject card for a raised point.
 *
 * WHY THIS EXISTS ON TOP OF THE POINTS QUEUE PANEL. A point interrupts a speech that is running —
 * every second the chair spends noticing a badge and drilling into a tool panel is a second the
 * room spends waiting on a ruling. The previous surface was an on-video banner that showed only
 * the single highest-priority point, hard-coded to the dark stage, and it sat beside a second
 * accept/reject surface (the Points tool) that resolved the same doc. This replaces the banner:
 * one card per pending point, all of them, in the shell where the chair is already looking.
 *
 * Modelled on `YieldRequestInbox` / `docs/EndorsementInbox` — the accept/reject pattern this
 * codebase already settled on. Same token map, so the three read as one family.
 *
 * ONE CODE PATH. Recognize / Dismiss call `resolvePoint`, the exact function `PointsQueuePanel`
 * calls, with the same participation-credit asymmetry: recognizing passes `identity` (the delegate
 * earns the point on their marking record), dismissing deliberately does not.
 *
 * NO SUBSCRIPTION OF ITS OWN — `points` arrives as a prop from the console's existing listener. On
 * a 50k-reads/day tier an extra unbounded listener on a collection that grows all session is a real
 * cost, and `YieldRequestInbox` set this precedent.
 *
 * Mounted OUTSIDE the console's `.dark` video stage (see ChairSessionConsole), so it is styled from
 * semantic tokens alone and reads correctly in both live themes — the trap the banner it replaces
 * fell into with its literal `bg-[#171310]`.
 */
import { useState } from "react";
import {
  resolvePoint, POINT_META,
  type RaisedPoint, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { DismissWithReason } from "./console/shared";
import { TYPE_ICON, TYPE_TONE } from "./PointsQueuePanel";
import { Check, Loader2, CornerUpRight } from "lucide-react";

/** Same class map as YieldRequestInbox / EndorsementInbox — the three must not drift apart. */
const T = {
  wrap: "space-y-2",
  head: "text-xs font-semibold uppercase tracking-wide text-muted-foreground/80",
  card: "rounded-xl border border-border/60 bg-secondary/40 p-3 space-y-2",
  title: "text-sm font-semibold text-foreground",
  sub: "text-xs text-muted-foreground",
  accept: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25",
} as const;

/** Tone → the icon chip's colours. Mirrors `panelTone` without pulling the whole panel scaffold. */
const CHIP: Record<string, string> = {
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  primary: "bg-primary/15 text-primary",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  muted: "bg-secondary text-muted-foreground",
};

export function PointRequestInbox({
  eventId, sessionId, points, canControl, userId, identityFor, nameFor, className,
}: {
  eventId: string;
  sessionId: string;
  /** The console's live `points` subscription, already filtered to pending and priority-sorted. */
  points: RaisedPoint[];
  canControl: boolean;
  userId: string;
  identityFor: (delegateId: string) => ParticipationIdentity;
  /** Delegate display name, when the console has the roster. Falls back to the country. */
  nameFor?: (delegateId: string) => string | undefined;
  className?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  if (!canControl || points.length === 0) return null;

  const resolve = async (p: RaisedPoint, action: "recognize" | "dismiss", reason = "") => {
    if (!p.id || busy) return;
    setBusy(p.id);
    try {
      // Recognizing credits participation (the delegate spoke to the chamber); dismissing must
      // not. That asymmetry is carried by whether `identity` is passed — see `resolvePoint`.
      await (action === "recognize"
        ? resolvePoint(eventId, sessionId, p, "recognized", userId, identityFor(p.delegateId))
        : resolvePoint(eventId, sessionId, p, "dismissed", userId, undefined, reason));
    } catch (e) {
      console.error("resolve point", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn(
      "fixed top-16 left-1/2 -translate-x-1/2 z-[80] w-[min(92vw,480px)] pointer-events-auto flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-4 duration-200",
      className
    )}>
      {points.map((p) => {
        const meta = POINT_META[p.type];
        const Icon = TYPE_ICON[p.type];
        const who = nameFor?.(p.delegateId) || getCountryName(p.country) || p.country || "A delegate";
        return (
          <div key={p.id} className="rounded-2xl border border-primary/25 bg-background/95 backdrop-blur-md p-3.5 shadow-2xl shadow-primary/10 dark:shadow-black/60 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", CHIP[TYPE_TONE[p.type]] || CHIP.muted)}>
                <Icon className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-snug">
                  <span className="font-bold text-primary">{meta.label}</span>
                  {" — "}{who}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1 flex-wrap">
                  <CountryFlag code={p.country} size={13} />
                  {meta.canInterrupt ? "May interrupt the speaker" : "Waiting to be recognized"}
                  {p.targetCountry && (
                    <>
                      <CornerUpRight className="w-3 h-3 shrink-0" />
                      to {getCountryName(p.targetCountry) || p.targetCountry}
                    </>
                  )}
                  {p.proxyByName && <span className="italic">· raised by {p.proxyByName}</span>}
                </p>
                {p.note && (
                  <p className="mt-1 text-[12px] leading-snug text-foreground/80 italic">&ldquo;{p.note}&rdquo;</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" disabled={busy === p.id} onClick={() => resolve(p, "recognize")}
                className="h-8.5 flex-1 min-w-[8rem] rounded-lg text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50">
                {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                Recognize
              </button>
              <DismissWithReason
                disabled={busy === p.id}
                onConfirm={(reason) => resolve(p, "dismiss", reason)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
