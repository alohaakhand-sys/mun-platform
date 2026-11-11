"use client";

/**
 * The general speakers list, on the wall.
 *
 * Broadcast composition rather than a centered card stack: the delegation sits in the optical
 * centre and the clock anchors the bottom edge with its track running the full width of the stage,
 * the way a time bar does on a scoreboard. The room is watching two things and they are the two
 * largest objects on the screen.
 */
import type { LiveSession, SpeakerSlot } from "@/lib/services/sessionService";
import { getCountryName } from "@/lib/data/countries";
import { Eyebrow, Placard, BoardClock } from "../board";

export function SpeakerBoard({ session, speaker }: { session: LiveSession; speaker: SpeakerSlot }) {
  const name = getCountryName(speaker.country) || speaker.country || "Delegate";
  const yielding = speaker.yieldTo && speaker.yieldTo !== "none";

  return (
    <div className="h-full flex flex-col animate-proj-rise">
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-[0.5em]"
        style={{ fontSize: "var(--t-body)" }}>
        <Eyebrow tone="emerald" dim={false}>Now speaking</Eyebrow>
        <Placard code={speaker.country} name={name} />
        {speaker.viaYield && (
          <p className="text-proj-dim font-semibold">Holding the floor by yield</p>
        )}
        {yielding && (
          <p className="text-proj-dim font-semibold">
            Yielding to{" "}
            <span className="text-proj-ink">
              {speaker.yieldTo === "delegate"
                ? (getCountryName(speaker.yieldTargetCountry || "") || speaker.yieldTargetCountry || "a delegate")
                : speaker.yieldTo}
            </span>
          </p>
        )}
      </div>

      <div className="shrink-0 w-full">
        <BoardClock timer={session.gsl.timer} tone="emerald" />
      </div>
    </div>
  );
}
