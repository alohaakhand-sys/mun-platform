"use client";

/**
 * A vote in progress — BLIND, and drawn as a chamber, not a progress bar.
 *
 * SEAT PIPS: one square per eligible delegation, filling as ballots land. A bar says "70%"; the
 * pips say "eleven delegations have not voted", which is the number a chair and a room actually
 * act on. They are ANONYMOUS AND UNORDERED — a pip is never bound to a delegate, because a stable
 * pip order plus a filling animation would let the room read off who just voted.
 *
 * The split stays hidden until the chair publishes: a running For/Against on the wall tells whoever
 * votes last where the room already stands. (A UI blind, not a security boundary — `activeVote` is
 * still a readable map on the session doc. It defeats a glance at a screen, not devtools.)
 */
import {
  castCount, eligibleVoterCount,
  type ActiveVote, type LiveSession,
} from "@/lib/services/sessionService";
import { cn } from "@/lib/utils";
import { Eyebrow, BoardClock, Well } from "../board";

export function VoteBoard({ session, vote }: { session: LiveSession; vote: ActiveVote }) {
  const cast = castCount(vote);
  const eligible = Math.max(vote.eligibleCount || eligibleVoterCount(session.attendance), cast);
  const outstanding = Math.max(0, eligible - cast);

  // A roughly 2.4:1 block of pips — wide enough to sit under the motion, tall enough to be a mass.
  const cols = Math.max(1, Math.min(28, Math.ceil(Math.sqrt(Math.max(1, eligible) * 2.4))));

  return (
    <div className="h-full flex flex-col items-center animate-proj-rise" style={{ fontSize: "var(--t-body)" }}>
      <div className="shrink-0 w-full text-center">
        <Eyebrow tone="amber" dim={false}>Voting in progress</Eyebrow>
        <p
          className="font-semibold mt-[0.4em] mx-auto [text-wrap:balance]"
          style={{ fontSize: "var(--t-lead)", lineHeight: 1.05, maxWidth: "26ch" }}
        >
          {vote.motion}
        </p>
      </div>

      <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-[0.9em]">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: "calc(clamp(4px, 0.45vw, 11px) * var(--proj-scale))",
            width: `min(100%, calc(${cols} * clamp(18px, 2vw, 46px) * var(--proj-scale)))`,
          }}
        >
          {Array.from({ length: eligible }, (_, i) => {
            const filled = i < cast;
            return (
              <span
                key={i}
                className={cn(
                  "aspect-square rounded-[0.18em]",
                  filled ? "bg-amber-500 animate-proj-pip" : "bg-proj-sunk",
                )}
                // Staggered on mount; a pip that flips to filled later animates when the class lands.
                style={filled ? { animationDelay: `${Math.min(i, 60) * 12}ms` } : undefined}
              />
            );
          })}
        </div>

        <div className="text-center">
          <p className="font-mono font-bold tabular-nums leading-none"
            style={{ fontSize: "var(--t-figure)", letterSpacing: "-0.03em" }}>
            {cast} <span className="text-proj-dim">/</span> {eligible}
          </p>
          <Eyebrow className="mt-[0.5em]">
            {outstanding > 0 ? `Ballots in · ${outstanding} still to vote` : "All ballots in"}
          </Eyebrow>
        </div>
      </div>

      <div className="shrink-0 w-full flex items-end gap-[1.2em]">
        <Well className="flex-1 min-w-0" style={{ padding: "0.7em 1em" }}>
          <p className="font-heading font-extrabold uppercase text-proj-dim leading-none [text-wrap:balance]"
            style={{ fontSize: "var(--t-eyebrow)", letterSpacing: "0.14em" }}>
            {vote.voteType} · {vote.threshold.replace(/_/g, " ")}
            {vote.divisionOfQuestion && " · division of the question"}
            {vote.scMode && " · SC — P5 veto in force"}
            {vote.round === 2 && " · second round"}
          </p>
          <p className="text-proj-dim mt-[0.5em]" style={{ fontSize: "var(--t-eyebrow)" }}>
            The result is revealed when the chair closes the vote.
          </p>
        </Well>
        {vote.timer && (
          <div className="shrink-0" style={{ width: "min(38%, 26ch)" }}>
            <BoardClock timer={vote.timer} tone="amber" size="sub" label="Time to vote" />
          </div>
        )}
      </div>
    </div>
  );
}
