"use client";

/**
 * The chair's accept/reject card for a delegate's yield.
 *
 * WHY THIS EXISTS ON TOP OF THE REQUESTS QUEUE. A yield is the one floor request with a clock
 * already running on it — every second the chair spends finding it is a second the recipient does
 * not get. It used to surface as the same five-second info toast every other request gets, which
 * meant a chair looking at any other tool simply missed it. So it gets a persistent card, pinned
 * where the chair is already looking, modelled on `docs/EndorsementInbox` — the accept/reject
 * pattern this codebase already settled on for time-boxed consent.
 *
 * ONE CODE PATH, TWO SURFACES. Accept/Reject call `acceptYieldRequest` / `declineYieldRequest`,
 * the exact functions `RequestsPanel` calls. Nothing about the transfer is re-implemented here;
 * this component only decides what the chair SEES.
 *
 * NO SUBSCRIPTION OF ITS OWN — `requests` arrives as a prop from the console's existing listener.
 * On a 50k-reads/day tier an extra unbounded listener on a collection that grows all session is a
 * real cost, and `useCaucusAutoAdd` already set this precedent.
 *
 * Mounted OUTSIDE the console's `.dark` video stage (see ChairSessionConsole), so it is styled
 * from semantic tokens alone and reads correctly in both live themes — the same trap
 * `EndorsementInbox` documents after it dropped its hard-coded dark variant.
 */
import { useState } from "react";
import {
  acceptYieldRequest, declineYieldRequest, timerRemainingMs,
  type FloorRequest, type LiveSession, type SpeakerSlot,
} from "@/lib/services/sessionService";
import { holdsTheFloor, floorSpeechClock } from "@/lib/services/floorGate";
import { yieldGrantMs } from "@/lib/services/yieldClock";
import { useGateClock } from "./useGateClock";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { Check, X, Loader2, Clock, CornerUpRight } from "lucide-react";

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const T = {
  wrap: "space-y-2",
  head: "text-xs font-semibold uppercase tracking-wide text-muted-foreground/80",
  card: "rounded-xl border border-border/60 bg-secondary/40 p-3 space-y-2",
  title: "text-sm font-semibold text-foreground",
  sub: "text-xs text-muted-foreground",
  timer: "text-amber-600 dark:text-amber-400",
  timerLow: "text-red-600 dark:text-red-400",
  accept: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25",
  reject: "border border-border/60 text-muted-foreground hover:bg-secondary/60",
} as const;

export function YieldRequestInbox({
  eventId, sessionId, session, requests, canControl, userId, onAccepted, className,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  /** The console's live `requests` subscription — NOT re-subscribed here. */
  requests: FloorRequest[];
  canControl: boolean;
  userId: string;
  /** The outgoing speaker's slot, so the console can open its speech scorer as it does elsewhere. */
  onAccepted?: (finishing: SpeakerSlot) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  // The countdown is the SPEECH clock — a yield has no response window of its own. Whichever list
  // is speaking: a moderated caucus runs on `caucus.speakerTimer` / `perSpeakerSecs`, and quoting
  // the GSL's numbers there would make the card promise a grant the transfer does not write.
  const clock = floorSpeechClock(session);
  const now = useGateClock(clock.timer?.endsAt);

  // A yield whose speaker no longer holds the floor cannot happen, and an interrupt about something
  // that cannot happen is noise. It stays in the Requests queue, muted and dismiss-only, which is
  // the right home for cleanup. Deliberately NOT filtered on a spent clock: a speaker at 0:00 who
  // still holds the floor can hand over meaningfully — the recipient gets the full base allotment.
  const live = requests.filter(
    (r) => r.status === "pending" && r.kind === "yield" && holdsTheFloor(session, r.delegateId),
  );
  if (!canControl || live.length === 0) return null;

  const left = timerRemainingMs(clock.timer, now);
  const grant = yieldGrantMs(clock.baseSecs, left);

  const respond = async (r: FloorRequest, action: "accept" | "reject") => {
    if (!r.id || busy) return;
    setBusy(r.id);
    try {
      if (action === "reject") {
        await declineYieldRequest(eventId, sessionId, r, userId);
      } else {
        const res = await acceptYieldRequest(eventId, sessionId, session, r, userId);
        if (res.ok && res.finishing) onAccepted?.(res.finishing);
      }
    } catch (e) {
      console.error("yield request", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn(
      "fixed top-16 left-1/2 -translate-x-1/2 z-[80] w-[min(92vw,480px)] pointer-events-auto flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-4 duration-200",
      className
    )}>
      {live.map((r) => {
        const target = getCountryName(r.yieldTargetCountry || "") || r.yieldTargetCountry || "a delegation";
        return (
          <div key={r.id} className="rounded-2xl border border-primary/25 bg-background/95 backdrop-blur-md p-3.5 shadow-2xl shadow-primary/10 dark:shadow-black/60 space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <CornerUpRight className="w-3.5 h-3.5" /> Yield Request
              </span>
              <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold tabular-nums",
                left <= 15000 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
                <Clock className="w-3.5 h-3.5" /> {fmt(left)}
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0"><CountryFlag code={r.country} size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-snug">
                  {getCountryName(r.country) || r.country || "A delegate"} wants to yield the floor to{" "}
                  <span className="font-bold text-primary">{target}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  {fmt(left)} left → {target} speaks for {fmt(grant)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button type="button" disabled={busy === r.id} onClick={() => respond(r, "accept")}
                className="h-8.5 flex-1 rounded-lg text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50">
                {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                Accept — {target} gets {fmt(grant)}
              </button>
              <button type="button" disabled={busy === r.id} onClick={() => respond(r, "reject")}
                className="h-8.5 px-3 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors border border-border/80 bg-secondary/80 text-foreground hover:bg-secondary disabled:opacity-50">
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
