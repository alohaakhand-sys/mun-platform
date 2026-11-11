"use client";

/**
 * The centre of the session top bar: what we're debating, and how long we've been sitting.
 *
 * One component for all three surfaces (chair, delegate, projector) — the chair and delegate bars
 * contained the identical `<div className="flex-1 min-w-2" />` spacer, so this drops into the same
 * flex slot and nothing around it moves.
 *
 * Two rules it exists to keep:
 *
 *  1. ONE AGENDA READER. It goes through `getAgenda` / `activeAgendaTitle`, the same normalizer the
 *     Flow Bar uses, so a session created before `session.agenda` shipped still shows its committee
 *     topics and there is still no dual-read branch anywhere.
 *
 *  2. THE TICKER IS GATED ON "RUNNING". A suspended or finalized session does no work at all — the
 *     total is already frozen, so re-rendering it 60 times a minute over a live video stage would
 *     buy nothing. See `sessionClock.ts`; elapsed is derived, never stored.
 *
 * No `onOpenAgenda` affordance: there is no agenda *panel* in this codebase (adopting a topic is a
 * Flow Bar action or a `set_agenda` motion, never a tool tab), so a clickable chip would have
 * nowhere to go. The empty state names where the control actually is instead.
 */
import { useEffect, useState } from "react";
import { Clock3, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveSession } from "@/lib/services/sessionService";
import { sessionClockState, formatClock } from "@/lib/services/sessionClock";
import { getAgenda, activeAgendaTitle } from "./flow/flowModel";

const NO_AGENDA_HINT =
  "No agenda adopted yet — the chair's flow bar adopts the committee's first topic, "
  + "or a delegate can move to set the agenda.";

export function SessionHeadline({
  session, agendas = [], size = "sm", className,
}: {
  session: LiveSession;
  /** `Committee.agendas[]` — the fallback for sessions that predate `session.agenda`. */
  agendas?: string[];
  /** `lg` is the projector scale. */
  size?: "sm" | "lg";
  className?: string;
}) {
  const agenda = getAgenda(session, agendas);
  const topic = activeAgendaTitle(agenda);
  const total = agenda.items.length;
  const clock = useSessionClock(session);

  const big = size === "lg";
  const topicText = topic
    ? (total > 1 ? `Topic ${agenda.activeIndex + 1}/${total} — ${topic}` : topic)
    : "";

  return (
    <div className={cn("flex items-center justify-center gap-2 min-w-0", className)}>
      {/* Agenda — the first thing to give up horizontal space, and the first to hide on mobile. */}
      <div className="hidden sm:flex items-center gap-1.5 min-w-0" title={topic ? topicText : NO_AGENDA_HINT}>
        {topic ? (
          <>
            {total > 1 && (
              <span className={cn(
                "shrink-0 rounded-md border border-border/60 bg-secondary/40 px-1.5 py-0.5",
                "font-bold uppercase tracking-wide text-muted-foreground",
                big ? "text-[11px]" : "text-[9.5px]",
              )}>
                Topic {agenda.activeIndex + 1}/{total}
              </span>
            )}
            <span className={cn("truncate font-medium", big ? "text-base" : "text-[12.5px]")}>{topic}</span>
          </>
        ) : (
          <span className={cn("truncate text-muted-foreground", big ? "text-base" : "text-[12.5px]")}>
            No agenda set
          </span>
        )}
      </div>

      {/* Clock — never truncates, never wraps. */}
      <span
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-bold tabular-nums",
          big ? "text-[15px]" : "text-[11.5px]",
          clock.paused ? "border-orange-500/30 bg-orange-500/10 text-orange-600"
            : clock.frozen ? "border-border/60 bg-muted text-muted-foreground"
            : "border-border/60 bg-secondary/40 text-foreground",
        )}
        title={clock.paused ? "Session clock — held while suspended"
          : clock.frozen ? "Final sitting time"
          : "Time in session, breaks excluded"}
      >
        {clock.paused
          ? <PauseCircle className={big ? "w-4 h-4" : "w-3 h-3"} />
          : <Clock3 className={big ? "w-4 h-4" : "w-3 h-3"} />}
        {formatClock(clock.elapsedMs)}
        {clock.paused && <span className="font-semibold uppercase tracking-wide text-[9.5px]">Paused</span>}
      </span>
    </div>
  );
}

/**
 * 1Hz only while the clock is actually moving. `Date.now()` in the initializer is safe because
 * every consumer renders below a `session` snapshot, so this never runs on the server.
 */
function useSessionClock(session: LiveSession) {
  const [now, setNow] = useState(() => Date.now());
  const state = sessionClockState(session, now);
  const running = state.running;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  return state;
}
