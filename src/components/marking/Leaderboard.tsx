"use client";

/**
 * Ranked standings for a committee.
 *
 * Until now nothing in the product ever ordered delegates by score — the Final Scoring
 * table rendered in roster order, and "who is winning" was a question a chair answered by
 * reading a column. This is the one component that answers it, and it is shared by the
 * chair (live, from marks in memory), the organizer (cross-committee, from published
 * standings) and the delegate (their own row highlighted in a published board).
 *
 * Ties SHARE a rank — two delegates on 84% are both 3rd, and the next is 5th. Anything
 * else invents a distinction the scores don't support.
 */

import type { MarkingMode } from "@/lib/services/eventService";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { criterionPct } from "@/lib/services/markingScore";
import { PctBar, pctTone } from "./markingUi";
import { cn } from "@/lib/utils";
import { Trophy, Medal } from "lucide-react";

export interface LeaderboardEntry {
  delegateId: string;
  country: string;
  name: string;
  finalScore: number;
  computedPct: number;
  chairOverall?: number | null;
  presentDays: number;
  dayCount: number;
}

export interface RankedEntry extends LeaderboardEntry {
  rank: number;
}

/** Sort desc by final (computed % breaks a tie only when finals are equal), then share ranks. */
export function rankEntries(entries: LeaderboardEntry[]): RankedEntry[] {
  const sorted = [...entries].sort(
    (a, b) => (b.finalScore - a.finalScore) || (b.computedPct - a.computedPct) || (a.country || "").localeCompare(b.country || ""),
  );
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((e, i) => {
    const rank = lastScore != null && e.finalScore === lastScore ? lastRank : i + 1;
    lastScore = e.finalScore;
    lastRank = rank;
    return { ...e, rank };
  });
}

const MEDAL_TONE = [
  "bg-amber-400/20 text-amber-600 dark:text-amber-300 border-amber-400/40",
  "bg-slate-300/25 text-slate-600 dark:text-slate-300 border-slate-400/40",
  "bg-orange-400/20 text-orange-700 dark:text-orange-300 border-orange-400/40",
];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded-full border font-mono text-[12px] font-bold tabular-nums", MEDAL_TONE[rank - 1])}>
        {rank}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-secondary/40 text-muted-foreground font-mono text-[12px] font-bold tabular-nums">
      {rank}
    </span>
  );
}

export function CommitteeLeaderboard({
  entries, markMode = "decimal", highlightUid, showOverall = true, emptyHint, className, maxRows,
}: {
  entries: LeaderboardEntry[];
  markMode?: MarkingMode;
  /** Renders this delegate's row emphasised — the delegate's own view. */
  highlightUid?: string;
  /** Hide the chair's holistic column on delegate-facing boards. */
  showOverall?: boolean;
  emptyHint?: string;
  className?: string;
  maxRows?: number;
}) {
  const ranked = rankEntries(entries);
  const rows = maxRows ? ranked.slice(0, maxRows) : ranked;

  if (!ranked.length) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {emptyHint || "No scores yet — the board fills in as marks are recorded."}
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left border-collapse">
        <thead className="bg-secondary/5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border/50">
          <tr>
            <th className="px-3 py-3 w-12">#</th>
            <th className="px-3 py-3 min-w-[180px]">Delegate</th>
            <th className="px-3 py-3 text-center w-20">Days</th>
            <th className="px-3 py-3 text-right w-24">Computed</th>
            {showOverall && <th className="px-3 py-3 text-right w-20">Overall</th>}
            <th className="px-3 py-3 text-right w-28">Final</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((e) => {
            const mine = highlightUid && e.delegateId === highlightUid;
            return (
              <tr key={e.delegateId} className={cn("transition-colors", mine ? "bg-primary/5" : "hover:bg-secondary/5")}>
                <td className="px-3 py-2.5"><RankBadge rank={e.rank} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {e.country
                      ? <CountryFlag code={e.country} size={22} />
                      : <span className="w-[22px] h-[22px] rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">?</span>}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">
                        {getCountryName(e.country) || "Unassigned"}
                        {mine && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">you</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-tight truncate">{e.name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center font-mono text-[12px] tabular-nums text-muted-foreground">
                  {e.presentDays}/{e.dayCount || 0}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                  {e.computedPct}%
                </td>
                {showOverall && (
                  <td className="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                    {e.chairOverall == null ? "—" : `${Math.round(criterionPct(e.chairOverall, markMode))}%`}
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    {e.rank === 1 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    {e.rank === 2 && <Medal className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    {e.rank === 3 && <Medal className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                    <PctBar pct={e.finalScore} className="w-16" />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {maxRows && ranked.length > maxRows && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          Showing the top {maxRows} of {ranked.length}.
        </p>
      )}
    </div>
  );
}

/** Compact podium — the top three, for a dashboard card or a results header. */
export function LeaderboardPodium({ entries, className }: { entries: LeaderboardEntry[]; className?: string }) {
  const top = rankEntries(entries).slice(0, 3);
  if (!top.length) return null;
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {top.map((e) => (
        <div key={e.delegateId} className={cn("rounded-xl border p-3 text-center", MEDAL_TONE[e.rank - 1] || "border-border/60")}>
          <div className="flex justify-center mb-1.5">
            {e.country ? <CountryFlag code={e.country} size={26} /> : <span className="text-lg">🏳️</span>}
          </div>
          <p className="text-[11px] font-semibold truncate text-foreground">{getCountryName(e.country) || e.name}</p>
          <p className={cn("font-mono text-lg font-extrabold tabular-nums leading-none mt-1", pctTone(e.finalScore))}>{e.finalScore}%</p>
        </div>
      ))}
    </div>
  );
}
