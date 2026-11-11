"use client";

/**
 * Chair's live queue of delegate floor requests — "raise hand for the floor", "request to
 * speak" (a slot on the Speakers List), and "change my vote". Subscribes to the session's
 * `requests` subcollection. Granting a floor request gives the delegate the camera/mic
 * (`setStage`); a speak request appends them to the GSL queue (`enqueueSpeaker`); a
 * vote_change deletes their ballot so THEY can cast again (`reopenBallot`) — the chair never
 * writes a ballot on a delegate's behalf.
 */
import { useEffect, useMemo, useState } from "react";
import {
  subscribeRequests, resolveHand, timerRemainingMs, FLOOR_REQUEST_META,
  type FloorRequest, type FloorRequestKind, type LiveSession,
} from "@/lib/services/sessionService";
import { holdsTheFloor, floorSpeechClock } from "@/lib/services/floorGate";
import { grantFloorRequest, REVOTE_GRACE_MS } from "@/lib/services/floorRequests";
import { yieldGrantMs } from "@/lib/services/yieldClock";
import { useGateClock } from "./useGateClock";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { PanelEmpty, QueueRow, ProxyChip, type PanelTone } from "./console/shared";
import { HandMetal, Check, X, Video, Mic, RefreshCw, Users2, CornerUpRight } from "lucide-react";


// caucus_signup is filtered out below and never renders here — the entries exist only
// because these are exhaustive Records over FloorRequestKind.
const KIND_ICON: Record<FloorRequestKind, React.ElementType> = {
  floor: Video, speak: Mic, vote_change: RefreshCw, caucus_signup: Users2, yield: CornerUpRight,
};
const KIND_TONE: Record<FloorRequestKind, PanelTone> = {
  floor: "primary",
  speak: "emerald",
  vote_change: "amber",
  caucus_signup: "primary",
  // Amber like a re-vote: a speech clock is running on it, so it is time-critical to answer.
  yield: "amber",
};

function mmss(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function ago(createdAt: any): string {
  const secs = createdAt?.seconds ? Math.max(0, Math.floor(Date.now() / 1000 - createdAt.seconds)) : 0;
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  return `${m}m`;
}

export function RequestsPanel({
  eventId, sessionId, session, canControl, userId,
}: {
  eventId: string;
  sessionId: string;
  /** Needed to match a vote_change request against the LIVE vote and read its clock. */
  session: LiveSession;
  canControl: boolean;
  userId: string;
}) {
  const [requests, setRequests] = useState<FloorRequest[]>([]);
  useEffect(() => subscribeRequests(eventId, sessionId, setRequests), [eventId, sessionId]);

  // A yield row shows the LIVE speech clock, which no write drives — the same pure-clock gap the
  // hook exists for. Costs one interval, and only while a speech is actually running. Whichever
  // list is speaking, so a caucus yield quotes the caucus's own clock and allotment.
  const clock = floorSpeechClock(session);
  const now = useGateClock(clock.timer?.endsAt);

  const vote = session.activeVote;
  /** A vote_change is only actionable while its own vote is still the live one. */
  const isLiveRevote = (r: FloorRequest) => r.kind === "vote_change" && !!vote && r.voteId === vote.voteId;

  const pending = useMemo(
    // caucus_signup belongs to the caucus panel's own speakers list, NOT here. Leaving it in
    // would drop it through grant()'s catch-all `else` into the GSL queue — the wrong list,
    // silently — and bury the real requests under a whole committee's worth of answers.
    () => requests.filter((r) => r.status === "pending" && r.kind !== "caucus_signup")
      // Re-votes first — a vote clock is running on them, unlike a raised hand.
      .sort((a, b) =>
        Number(b.kind === "vote_change") - Number(a.kind === "vote_change") ||
        (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)),
    [requests]
  );
  const resolved = useMemo(() => requests.filter((r) => r.status !== "pending").slice(0, 6), [requests]);

  // One dispatch, shared with the mobile chair console — see floorRequests.ts.
  const grant = async (r: FloorRequest) => {
    if (!canControl) return;
    try { await grantFloorRequest(eventId, sessionId, session, r, userId); }
    catch (e) { console.error("grant request", e); }
  };
  const dismiss = (r: FloorRequest) => canControl && resolveHand(eventId, sessionId, r, "dismissed", userId);
  const dismissAll = () => canControl && pending.forEach(dismiss);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="inline-flex items-center gap-2 font-heading text-[13px] font-bold">
          Pending
          <span className={cn("inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold",
            pending.length > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{pending.length}</span>
        </span>
        {canControl && pending.length > 0 && (
          <button type="button" onClick={dismissAll} className="text-[11.5px] font-semibold text-muted-foreground hover:text-foreground transition-colors">Dismiss all</button>
        )}
      </div>

      {pending.length === 0 ? (
        <PanelEmpty icon={HandMetal}>No hands raised right now.</PanelEmpty>
      ) : (
        pending.map((r) => {
          const meta = FLOOR_REQUEST_META[r.kind];
          // A re-vote whose vote has already closed can only be dismissed — reopening a ballot
          // on a vote that no longer exists is meaningless.
          // A yield whose speaker no longer holds the floor is stale for the same reason a closed
          // vote's re-vote is: there is nothing left to hand over.
          const stale =
            (r.kind === "vote_change" && !isLiveRevote(r)) ||
            (r.kind === "yield" && !holdsTheFloor(session, r.delegateId));
          return (
            <QueueRow
              key={r.id}
              tone={stale ? "muted" : KIND_TONE[r.kind]}
              icon={KIND_ICON[r.kind]}
              coloredTitle
              flag={r.country ? <CountryFlag code={r.country} size={26} /> : undefined}
              title={meta.label}
              time={`${ago(r.createdAt)} ago`}
              statusChip={r.proxyBy ? <ProxyChip name={r.proxyByName} /> : undefined}
              meta={(
                <>
                  {getCountryName(r.country) || r.country || "Delegate"}
                  {r.kind === "yield" && (() => {
                    // The live clock while the yield is still actionable, the snapshot once it is
                    // stale (the running clock no longer belongs to this request). Accepting grants
                    // the target their OWN allotment on top, so showing only "left" understates the
                    // decision by a whole speech — print both halves.
                    const left = stale
                      ? Math.max(0, r.yieldRemainingMs ?? 0)
                      : timerRemainingMs(clock.timer, now);
                    return (
                      <>
                        {" → "}
                        <b className="text-foreground">
                          {getCountryName(r.yieldTargetCountry || "") || r.yieldTargetCountry}
                        </b>
                        <span className="text-muted-foreground tabular-nums">
                          {" · "}{mmss(left)} left → {mmss(yieldGrantMs(clock.baseSecs, left))}
                        </span>
                      </>
                    );
                  })()}
                  {stale && (
                    <span className="text-muted-foreground">
                      {r.kind === "yield" ? " · they no longer hold the floor" : " · that vote has closed"}
                    </span>
                  )}
                </>
              )}
              note={r.note && <p className="text-xs text-muted-foreground mt-0.5 italic">“{r.note}”</p>}
              actions={canControl && (
                <div className="flex flex-wrap items-center gap-2 w-full @lg:w-auto">
                  {!stale && (
                    <Button size="sm" className="gap-1.5 h-8 flex-1 @lg:flex-none" onClick={() => grant(r)}>
                      <Check className="w-3.5 h-3.5" />
                      {r.kind === "floor" ? "Give floor"
                        : r.kind === "yield" ? "Accept yield"
                        : r.kind === "vote_change"
                          ? (vote?.timer?.running && timerRemainingMs(vote.timer) < REVOTE_GRACE_MS
                              ? "Reopen & add 30s" : "Reopen ballot")
                          : "Add to list"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost"
                    className={cn("gap-1.5 h-8 text-muted-foreground hover:text-foreground", stale && "flex-1 @lg:flex-none")}
                    onClick={() => dismiss(r)}>
                    <X className="w-3.5 h-3.5" /> Dismiss
                  </Button>
                </div>
              )}
            />
          );
        })
      )}

      {resolved.length > 0 && (
        <div className="pt-2 mt-1 border-t border-border/40 space-y-1">
          {resolved.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              {r.status === "granted"
                ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                : <X className="w-3 h-3 text-muted-foreground shrink-0" />}
              <span className="truncate">
                {FLOOR_REQUEST_META[r.kind].short} · {getCountryName(r.country) || r.country || "Delegate"}
              </span>
              <span className={cn("ml-auto text-[10px] font-semibold uppercase", r.status === "granted" ? "text-emerald-600 dark:text-emerald-400" : "")}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
