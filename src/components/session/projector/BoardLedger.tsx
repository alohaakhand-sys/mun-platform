"use client";

/**
 * The bottom band: who is next.
 *
 * Replaces the old wrapped chip cloud, which grew downward and pushed itself off a screen nobody
 * can scroll. A queue is an ORDER, so it is drawn as one — a single line, running left to right,
 * on-deck first and largest. Anything past the fold becomes a "+N" count rather than silently
 * disappearing.
 *
 * Whose queue it is comes from `focalQueue` — never `gsl.queue` directly. The GSL is suspended
 * during a caucus, and advertising its order under a caucus hero is the wrong list.
 */
import type { SpeakerSlot } from "@/lib/services/sessionService";
import { getCountryName } from "@/lib/data/countries";
import { BoardFlag, Eyebrow } from "./board";

const AFTER_ON_DECK = 5;

export function BoardLedger({
  source, queue,
}: {
  source: "gsl" | "caucus" | "none";
  queue: SpeakerSlot[];
}) {
  if (source === "none" || queue.length === 0) return null;

  const [onDeck, ...rest] = queue;
  const shown = rest.slice(0, AFTER_ON_DECK);
  const overflow = rest.length - shown.length;

  return (
    <footer
      className="border-t-2 border-proj-rule flex items-center gap-[0.9em] overflow-hidden"
      style={{ padding: "calc(var(--proj-pad) * 0.45) var(--proj-pad)", fontSize: "var(--t-ledger)" }}
    >
      <div className="shrink-0">
        <Eyebrow>{source === "caucus" ? "Caucus order" : "Speakers list"} · {queue.length}</Eyebrow>
      </div>

      {/* On deck — the only cell the room needs to read from the back row. */}
      <div
        className="shrink-0 inline-flex items-stretch overflow-hidden rounded-[0.3em] bg-proj-ink text-proj-field max-w-[38%]"
        style={{ fontSize: "calc(var(--t-ledger) * 1.35)" }}
      >
        <span className="shrink-0 aspect-[4/3] self-stretch overflow-hidden">
          <BoardFlag code={onDeck.country} className="w-full h-full" />
        </span>
        <span className="flex items-center gap-[0.5em] min-w-0" style={{ padding: "0.35em 0.7em" }}>
          <span className="font-heading font-extrabold uppercase opacity-60 leading-none shrink-0"
            style={{ fontSize: "0.5em", letterSpacing: "0.14em" }}>
            Next
          </span>
          <span className="font-display font-black uppercase leading-none truncate" style={{ letterSpacing: "0.01em" }}>
            {getCountryName(onDeck.country) || onDeck.country || "Delegate"}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-[0.5em] min-w-0 flex-1 overflow-hidden">
        {shown.map((s, i) => (
          <span
            key={`${s.delegateId}-${i}`}
            className="inline-flex items-center gap-[0.45em] rounded-[0.3em] bg-proj-sunk min-w-0 shrink"
            style={{ padding: "0.35em 0.6em" }}
          >
            <span className="font-mono tabular-nums text-proj-dim leading-none shrink-0" style={{ fontSize: "0.72em" }}>
              {i + 2}
            </span>
            <span className="shrink-0 overflow-hidden rounded-[0.15em]" style={{ width: "1.5em", height: "1.125em" }}>
              <BoardFlag code={s.country} className="w-full h-full" />
            </span>
            <span className="font-semibold truncate leading-none">
              {getCountryName(s.country) || s.country || "Delegate"}
            </span>
          </span>
        ))}
        {overflow > 0 && (
          <span className="shrink-0 font-heading font-extrabold text-proj-dim leading-none" style={{ fontSize: "0.8em" }}>
            +{overflow}
          </span>
        )}
      </div>
    </footer>
  );
}
