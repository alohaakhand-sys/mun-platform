"use client";

/**
 * The published outcome — the only place the room ever sees the split.
 *
 * One segmented bar, not three separate columns. At the back of a hall nobody compares "28" with
 * "11"; they read which colour owns the bar. The numbers stay underneath for everyone close enough
 * to want them, and for the photograph.
 *
 * Reads `publishedResult`, which is denormalized onto the session doc — so it survives `activeVote`
 * being nulled at close and needs no extra listener. `pendingPublish` is deliberately NOT read here:
 * a closed-but-unpublished result is the chair's alone.
 */
import type { PublishedVoteResult } from "@/lib/services/sessionService";
import { cn } from "@/lib/utils";
import { BOARD_TONE, Eyebrow, Figure, Well, type BoardTone } from "../board";

const RESULT_TONE: Record<string, BoardTone> = {
  passed: "emerald",
  failed: "red",
  tied: "amber",
  vetoed: "violet",
};

export function ResultBoard({ published }: { published: PublishedVoteResult }) {
  const p = published;
  const tone = RESULT_TONE[p.result] || "amber";
  const total = p.affirmative + p.negative + p.abstentions;
  const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div className="h-full flex flex-col items-center animate-proj-rise" style={{ fontSize: "var(--t-body)" }}>
      <div className="shrink-0 w-full text-center">
        <Eyebrow>Result · <span className="font-mono">{total}</span> of <span className="font-mono">{p.eligibleCount}</span> cast</Eyebrow>
        <p className="font-semibold mt-[0.4em] mx-auto [text-wrap:balance]"
          style={{ fontSize: "var(--t-lead)", lineHeight: 1.05, maxWidth: "26ch" }}>
          {p.motion}
        </p>
      </div>

      <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-[0.7em]">
        <p
          className={cn("font-display font-black uppercase leading-[0.85] animate-proj-stamp", BOARD_TONE[tone].text)}
          style={{ fontSize: "var(--t-outcome)", letterSpacing: "0.02em" }}
        >
          {p.result}
        </p>
        {p.result === "vetoed" && !!p.vetoedByCountries?.length && (
          <p className="text-proj-dim font-semibold">Vetoed by {p.vetoedByCountries.join(", ")}</p>
        )}

        {/* One bar, three segments. The room reads the proportion, not the arithmetic. */}
        <div
          className="w-full rounded-full overflow-hidden bg-proj-sunk flex animate-proj-wipe"
          style={{ height: "calc(clamp(14px, 1.5vw, 34px) * var(--proj-scale))" }}
        >
          <span className="bg-emerald-500 h-full" style={{ width: `${share(p.affirmative)}%` }} />
          <span className="bg-red-500 h-full" style={{ width: `${share(p.negative)}%` }} />
          <span className="bg-proj-dim h-full" style={{ width: `${share(p.abstentions)}%` }} />
        </div>

        <div className="w-full grid grid-cols-3" style={{ gap: "1em" }}>
          <Figure value={p.affirmative} label="For" tone="emerald" />
          <Figure value={p.negative} label="Against" tone="red" />
          <Figure value={p.abstentions} label="Abstain" />
        </div>
      </div>

      <Well className="shrink-0 w-full text-center" style={{ padding: "0.6em 1em" }}>
        <p className="font-heading font-extrabold uppercase text-proj-dim leading-none"
          style={{ fontSize: "var(--t-eyebrow)", letterSpacing: "0.14em" }}>
          {p.voteType} · {p.threshold.replace(/_/g, " ")}
          {p.scMode && " · SC — P5 veto in force"}
          {p.mode === "roll_call" && " · roll-call vote"}
        </p>
      </Well>
    </div>
  );
}
