"use client";

/**
 * Caucus, both kinds — two different screens under one state.
 *
 * MODERATED behaves like the speakers list: a placard and a speaker clock, with the caucus's own
 * remaining time parked top-right. That second clock only exists on this surface — the chair's wide
 * layout never draws it — and the room needs it more than the chair does, because it is the number
 * that says how many speakers are left.
 *
 * UNMODERATED is a break. Nobody has the floor, so the screen becomes one thing: the clock that
 * says when to be back in your seat.
 */
import type { CaucusState } from "@/lib/services/sessionService";
import { getCountryName } from "@/lib/data/countries";
import { Eyebrow, Placard, BoardClock, Well } from "../board";

export function CaucusBoard({ caucus }: { caucus: CaucusState }) {
  const moderated = caucus.kind === "moderated";

  if (!moderated) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-[0.6em] animate-proj-rise"
        style={{ fontSize: "var(--t-body)" }}>
        <Eyebrow tone="accent" dim={false}>Unmoderated caucus</Eyebrow>
        {caucus.topic && (
          <p className="font-display font-black uppercase leading-[0.9] max-w-[16ch] [text-wrap:balance]"
            style={{ fontSize: "var(--t-display)", letterSpacing: "0.01em" }}>
            {caucus.topic}
          </p>
        )}
        <div className="w-full" style={{ maxWidth: "min(100%, 60ch)" }}>
          <BoardClock timer={caucus.totalTimer} label="Back in seats when this hits zero" />
        </div>
      </div>
    );
  }

  const speakerTimerLive = !!caucus.speakerTimer?.durationMs;
  const country = caucus.currentCountry || caucus.currentSpeaker?.country;

  return (
    <div className="h-full flex flex-col animate-proj-rise">
      <div className="shrink-0 flex items-start justify-between gap-[1em]" style={{ fontSize: "var(--t-body)" }}>
        <div className="min-w-0">
          <Eyebrow tone="accent" dim={false}>Moderated caucus</Eyebrow>
          {caucus.topic && (
            <p className="font-semibold mt-[0.35em] [text-wrap:balance]" style={{ fontSize: "var(--t-lead)", lineHeight: 1.05 }}>
              {caucus.topic}
            </p>
          )}
        </div>
        {/* The caucus's own remaining time — how much room is left for more speakers. */}
        <Well className="shrink-0" style={{ padding: "0.6em 0.9em", minWidth: "10ch" }}>
          <BoardClock timer={caucus.totalTimer} label="Caucus time" size="sub" />
        </Well>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-[0.5em]">
        {country ? (
          <Placard code={country} name={getCountryName(country) || country} />
        ) : (
          <p className="text-proj-dim font-semibold" style={{ fontSize: "var(--t-lead)" }}>
            Waiting for the first speaker
          </p>
        )}
      </div>

      <div className="shrink-0 w-full">
        <BoardClock timer={speakerTimerLive ? caucus.speakerTimer : caucus.totalTimer} />
      </div>
    </div>
  );
}
