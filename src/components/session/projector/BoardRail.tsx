"use client";

/**
 * The rail: the four facts that stay true whatever the stage is showing — which committee, what
 * topic, how long we have been sitting, and whether the room is quorate.
 *
 * The quorum strip is here because the room has never been able to see it. `session.quorumThreshold`
 * and `eligibleVoterCount` are already on the subscribed snapshot and were drawn only in the chair's
 * private rail — so a delegate wondering why the chair will not put a substantive vote had no way to
 * know the room was three short.
 */
import { useEffect, useState } from "react";
import type { LiveSession } from "@/lib/services/sessionService";
import { eligibleVoterCount } from "@/lib/services/sessionService";
import { sessionClockState, formatClock } from "@/lib/services/sessionClock";
import { getAgenda, activeAgendaTitle } from "../flow/flowModel";
import { PHASE_META } from "../phaseMeta";
import { cn } from "@/lib/utils";
import { Eyebrow, BOARD_TONE, type BoardTone } from "./board";
import { MotionInviteBand } from "./MotionInviteBand";

/** Phase → the colour the room reads it in. Voting is the only one that must interrupt. */
const PHASE_TONE: Record<string, BoardTone> = {
  lobby: "ink",
  roll_call: "accent",
  gsl: "emerald",
  mod_caucus: "accent",
  unmod_caucus: "accent",
  voting: "amber",
  suspended: "amber",
  closed: "ink",
};

export function BoardRail({ session, committeeId }: { session: LiveSession; committeeId: string }) {
  const clock = useSittingClock(session);
  const agenda = getAgenda(session);
  const topic = activeAgendaTitle(agenda);
  const total = agenda.items.length;

  const meta = PHASE_META[session.phase];
  const tone = BOARD_TONE[PHASE_TONE[session.phase] || "ink"];
  const PhaseGlyph = meta.icon;

  const present = eligibleVoterCount(session.attendance);
  const quorum = session.quorumThreshold || 0;
  const quorumMet = quorum > 0 && present >= quorum;
  const quorumPct = quorum > 0 ? Math.min(100, (present / quorum) * 100) : 0;

  const liveNow = session.phase !== "closed" && session.phase !== "suspended";

  return (
    <header className="border-b-2 border-proj-rule">
      <div
        className="flex items-center gap-[1.2em]"
        style={{ padding: "calc(var(--proj-pad) * 0.5) var(--proj-pad)", fontSize: "var(--t-rail)" }}
      >
        {/* Committee */}
        <div className="flex items-center gap-[0.5em] min-w-0 shrink-0">
          <span className={cn("relative flex rounded-full shrink-0", liveNow ? tone.fill : "bg-proj-dim")}
            style={{ width: "0.55em", height: "0.55em" }}>
            {liveNow && <span className={cn("absolute inset-0 rounded-full animate-ping opacity-70", tone.fill)} />}
          </span>
          <p
            className="font-display font-black uppercase leading-none truncate"
            style={{ fontSize: "calc(var(--t-rail) * 1.5)", letterSpacing: "0.01em" }}
          >
            {committeeId}
          </p>
        </div>

        {/* Topic — the first thing to give up space. */}
        <div className="flex-1 min-w-0 flex items-center gap-[0.6em]">
          {total > 1 && topic && (
            <span
              className="shrink-0 rounded-full bg-proj-sunk font-heading font-extrabold uppercase text-proj-dim leading-none"
              style={{ fontSize: "var(--t-eyebrow)", letterSpacing: "0.12em", padding: "0.5em 0.8em" }}
            >
              Topic {agenda.activeIndex + 1}/{total}
            </span>
          )}
          <p className={cn("truncate font-semibold", topic ? "text-proj-ink" : "text-proj-dim")}>
            {topic || "No agenda adopted"}
          </p>
        </div>

        {/* Phase + sitting clock */}
        <div className="flex items-center gap-[0.7em] shrink-0">
          <span
            className={cn("inline-flex items-center gap-[0.4em] rounded-full font-heading font-extrabold uppercase leading-none", tone.fill, tone.on)}
            style={{ fontSize: "var(--t-eyebrow)", letterSpacing: "0.14em", padding: "0.6em 0.9em" }}
          >
            <PhaseGlyph style={{ width: "1.2em", height: "1.2em" }} />
            {meta.long}
          </span>
          <span
            className={cn("font-mono font-bold tabular-nums leading-none", clock.paused ? "text-amber-600" : "text-proj-ink")}
            style={{ fontSize: "calc(var(--t-rail) * 1.15)", letterSpacing: "-0.02em" }}
            title={clock.paused ? "Held while suspended" : "Time in session, breaks excluded"}
          >
            {formatClock(clock.elapsedMs)}
          </span>
        </div>
      </div>

      {/* Quorum strip — full bleed, and thick enough to survive a projector. */}
      <div className="flex items-center gap-[0.8em]" style={{ padding: "0 var(--proj-pad) calc(var(--proj-pad) * 0.34)" }}>
        <div className="flex-1 rounded-full bg-proj-sunk overflow-hidden"
          style={{ height: "calc(clamp(4px, 0.35vw, 9px) * var(--proj-scale))" }}>
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", quorumMet ? "bg-emerald-500" : "bg-amber-500")}
            style={{ width: `${quorumPct}%` }}
          />
        </div>
        <Eyebrow tone={quorum > 0 ? (quorumMet ? "emerald" : "amber") : "ink"} dim={quorum === 0} className="shrink-0">
          <span className="font-mono">{present}</span> present
          {quorum > 0 && <> · quorum <span className="font-mono">{quorum}</span> {quorumMet ? "met" : `— ${quorum - present} short`}</>}
        </Eyebrow>
      </div>

      <MotionInviteBand invite={session.motionInvite} />
    </header>
  );
}

/** 1Hz, and only while the clock is actually moving — a suspended sitting re-renders nothing. */
function useSittingClock(session: LiveSession) {
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
