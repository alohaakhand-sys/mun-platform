"use client";

/**
 * Nothing is on the floor: lobby, a suspension, an empty speakers list, adjournment.
 *
 * A blank screen in a full room reads as "the system is broken", so the calm states still say
 * exactly where the sitting is and put the sitting clock front and centre — during a suspension
 * that clock is the single most-asked question in the room.
 */
import type { LiveSession, SessionPhase } from "@/lib/services/sessionService";
import { sessionClockState, formatClock } from "@/lib/services/sessionClock";
import { useEffect, useState } from "react";
import { PHASE_META } from "../../phaseMeta";
import { Eyebrow } from "../board";

const COPY: Record<string, { title: string; sub: string }> = {
  lobby:     { title: "Committee not yet in session", sub: "The chair is preparing to gavel in." },
  roll_call: { title: "Roll call", sub: "The chair is taking attendance." },
  gsl:       { title: "Speakers list open", sub: "The floor is open — add yourself to the list." },
  suspended: { title: "Session suspended", sub: "Proceedings are paused and will resume shortly." },
  closed:    { title: "Committee adjourned", sub: "This sitting has closed for the day." },
};

export function CalmBoard({ session }: { session: LiveSession }) {
  const phase: SessionPhase = session.phase;
  const copy = COPY[phase] || COPY.gsl;
  const Glyph = PHASE_META[phase].icon;
  const clock = useSittingClock(session);

  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-[0.6em] animate-proj-rise"
      style={{ fontSize: "var(--t-body)" }}>
      <Glyph className="text-proj-dim" style={{ width: "2.6em", height: "2.6em" }} />
      <p className="font-display font-black uppercase leading-[0.88] [text-wrap:balance]"
        style={{ fontSize: "var(--t-display)", letterSpacing: "0.01em", maxWidth: "18ch" }}>
        {copy.title}
      </p>
      <p className="text-proj-dim font-semibold" style={{ maxWidth: "40ch" }}>{copy.sub}</p>

      <div className="mt-[0.8em]">
        <p className="font-mono font-bold tabular-nums leading-none"
          style={{ fontSize: "var(--t-figure)", letterSpacing: "-0.03em" }}>
          {formatClock(clock.elapsedMs)}
        </p>
        <Eyebrow className="mt-[0.5em]">
          {clock.frozen ? "Final sitting time" : clock.paused ? "Held while suspended" : "Time in session"}
        </Eyebrow>
      </div>
    </div>
  );
}

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
