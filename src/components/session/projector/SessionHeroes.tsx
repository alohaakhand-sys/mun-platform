"use client";

/**
 * Read-only focal blocks for a live session — the "hero" that reads at a glance from across
 * a room or on a delegate's device: the active speaker, a caucus, a running vote, or a calm
 * phase state. Pure and session-doc-driven (country names are embedded), so they need no
 * roster and are shared by both the projector and the delegate console.
 *
 * Extracted verbatim from `SessionProjector.tsx` — no behaviour change.
 */
import {
  castCount, eligibleVoterCount,
  type LiveSession, type SessionPhase, type PublishedVoteResult,
} from "@/lib/services/sessionService";
import { CountdownTimer } from "../CountdownTimer";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { Mic, Users2, Coffee, Vote, Gavel } from "lucide-react";

const noop = () => {};

import { PhaseIcon } from "../phaseMeta";

/** Re-exported so existing imports from this module keep working. */
export { PHASE_LABEL, PhaseIcon } from "../phaseMeta";

/** GSL active speaker — hero flag + giant countdown. */
export function SpeakerHero({ session }: { session: LiveSession }) {
  const active = session.gsl!.activeSpeaker!;
  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border/50 bg-secondary/10">
        <Mic className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-primary">Now Speaking</span>
      </div>
      <div className="p-8 sm:p-10 flex flex-col items-center text-center gap-6">
        <div className="flex flex-col items-center gap-4">
          {active.country
            ? <div className="rounded-2xl overflow-hidden ring-1 ring-border/60 shadow-sm"><CountryFlag code={active.country} size={88} /></div>
            : <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary">?</div>}
          <div>
            <p className="text-4xl sm:text-5xl font-extrabold tracking-tight">{getCountryName(active.country) || active.country || "Delegate"}</p>
            {active.yieldTo && active.yieldTo !== "none" && (
              <p className="text-sm text-muted-foreground mt-2">
                Yielding to {active.yieldTo === "delegate"
                  ? (getCountryName(active.yieldTargetCountry || "") || active.yieldTargetCountry || "a delegate")
                  : active.yieldTo}
              </p>
            )}
          </div>
        </div>
        <div className="w-full max-w-md">
          <CountdownTimer timer={session.gsl.timer} canControl={false} size="xl" onStart={noop} onPause={noop} onReset={noop} />
        </div>
      </div>
    </div>
  );
}

export function CaucusHero({ caucus }: { caucus: NonNullable<LiveSession["caucus"]> }) {
  const moderated = caucus.kind === "moderated";
  const heroTimer = moderated && caucus.speakerTimer.durationMs ? caucus.speakerTimer : caucus.totalTimer;
  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border/50 bg-secondary/10">
        {moderated ? <Users2 className="w-4 h-4 text-primary" /> : <Coffee className="w-4 h-4 text-primary" />}
        <span className="text-xs font-bold uppercase tracking-widest text-primary">{moderated ? "Moderated Caucus" : "Unmoderated Caucus"}</span>
      </div>
      <div className="p-8 sm:p-10 flex flex-col items-center text-center gap-6">
        {caucus.topic && <p className="text-2xl sm:text-3xl font-bold tracking-tight">{caucus.topic}</p>}
        {moderated && caucus.currentCountry && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl overflow-hidden ring-1 ring-border/60 shadow-sm"><CountryFlag code={caucus.currentCountry} size={64} /></div>
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight">{getCountryName(caucus.currentCountry) || caucus.currentCountry}</p>
          </div>
        )}
        <div className="w-full max-w-md">
          <CountdownTimer timer={heroTimer} canControl={false} size="xl" onStart={noop} onPause={noop} onReset={noop} />
          {moderated && heroTimer !== caucus.totalTimer && (
            // The big clock is the SPEAKER's. The room also needs the caucus's own clock, and
            // this is the only surface that shows it — the chair's wide layout doesn't.
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Caucus time</p>
              <CountdownTimer timer={caucus.totalTimer} canControl={false} size="sm" onStart={noop} onPause={noop} onReset={noop} />
            </div>
          )}
        </div>

        {moderated && !!caucus.queue?.length && (
          <div className="w-full">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Up Next</p>
            <div className="flex flex-wrap justify-center gap-2">
              {caucus.queue.slice(0, 8).map((s, i) => (
                <span key={`${s.delegateId}-${i}`}
                  className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium",
                    i === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary/20 border-border/40")}>
                  <span className="tabular-nums opacity-60">{i + 1}.</span>
                  {s.country && <CountryFlag code={s.country} size={16} />}
                  {getCountryName(s.country) || s.country || "Delegate"}
                </span>
              ))}
              {caucus.queue.length > 8 && (
                <span className="inline-flex items-center px-3 py-1.5 text-sm text-muted-foreground">
                  +{caucus.queue.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Shared by both vote heroes — voteType · threshold · SC. */
function VoteMeta({ voteType, threshold, scMode }: { voteType: string; threshold: string; scMode: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <span className="capitalize">{voteType}</span>
      <span>·</span>
      <span>{threshold.replace("_", " ")}</span>
      {scMode && <><span>·</span><span className="text-purple-600 font-medium">SC · P5 veto</span></>}
    </div>
  );
}

/**
 * A vote in progress — BLIND. Shows how many ballots are in, never which way they went:
 * a running For/Against count on the projector or on a delegate's phone tells whoever votes
 * last where the room already stands. The numbers are revealed by `VoteResultHero` once the
 * chair publishes.
 *
 * NOTE this is a UI blind, not a security boundary — `activeVote.ballots` is still a plain map
 * on a session doc any signed-in user may read. It defeats a glance at a screen, not devtools.
 */
export function VoteHero({
  session, vote,
}: {
  session: LiveSession;
  vote: NonNullable<LiveSession["activeVote"]>;
}) {
  const cast = castCount(vote);
  const eligible = vote.eligibleCount || eligibleVoterCount(session.attendance);
  const pct = eligible > 0 ? Math.min(100, (cast / eligible) * 100) : 0;
  return (
    <div className="glass-card rounded-3xl overflow-hidden border-amber-500/30">
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-amber-500/20 bg-amber-500/5">
        <div className="flex items-center gap-2 min-w-0">
          <Vote className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-widest text-amber-600 truncate">Voting in Progress</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{cast}/{eligible} cast</span>
      </div>
      <div className="p-8 sm:p-10 space-y-7">
        <p className="text-2xl sm:text-3xl font-bold text-center tracking-tight">{vote.motion}</p>
        {/* Read-only here — the room and the delegates watch the same clock the chair controls. */}
        {vote.timer && (
          <div className="max-w-xs mx-auto">
            <CountdownTimer timer={vote.timer} canControl={false} size="lg"
              onStart={noop} onPause={noop} onReset={noop} />
          </div>
        )}
        <div className="rounded-2xl bg-secondary/15 border border-border/40 p-6 sm:p-8 text-center">
          <p className="text-5xl sm:text-6xl font-extrabold tabular-nums leading-none">
            {cast} <span className="text-muted-foreground/60 font-bold">of</span> {eligible}
          </p>
          <p className="text-xs text-muted-foreground mt-2 mb-3.5 uppercase tracking-wider">Ballots cast</p>
          <div className="h-1.5 w-full bg-secondary/40 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[12px] text-muted-foreground mt-4">
            Results are revealed when the chair closes the vote.
          </p>
        </div>
        <VoteMeta voteType={vote.voteType} threshold={vote.threshold} scMode={vote.scMode} />
      </div>
    </div>
  );
}

const RESULT_TONE: Record<string, { border: string; bar: string; text: string; bg: string }> = {
  passed:  { border: "border-emerald-500/30", bar: "border-emerald-500/20 bg-emerald-500/5", text: "text-emerald-600", bg: "bg-emerald-500" },
  failed:  { border: "border-red-500/30",     bar: "border-red-500/20 bg-red-500/5",         text: "text-red-600",     bg: "bg-red-500" },
  tied:    { border: "border-amber-500/30",   bar: "border-amber-500/20 bg-amber-500/5",     text: "text-amber-600",   bg: "bg-amber-500" },
  vetoed:  { border: "border-violet-500/30",  bar: "border-violet-500/20 bg-violet-500/5",   text: "text-violet-600",  bg: "bg-violet-500" },
};

/**
 * The chair-published outcome — the ONLY place a delegate or the projector ever sees the
 * For/Against/Abstain split. Reads from the `publishedResult` snapshot denormalized onto the
 * session doc, so it survives `activeVote` being nulled at close and needs no extra listener.
 */
export function VoteResultHero({ published }: { published: PublishedVoteResult }) {
  const p = published;
  const tone = RESULT_TONE[p.result] || RESULT_TONE.tied;
  const total = p.affirmative + p.negative + p.abstentions;
  const cols: [string, number, string, string][] = [
    ["For", p.affirmative, "text-emerald-600", "bg-emerald-500"],
    ["Against", p.negative, "text-red-600", "bg-red-500"],
    ["Abstain", p.abstentions, "text-muted-foreground", "bg-muted-foreground/50"],
  ];
  return (
    <div className={cn("glass-card rounded-3xl overflow-hidden", tone.border)}>
      <div className={cn("flex items-center justify-between gap-3 px-6 py-3 border-b", tone.bar)}>
        <div className="flex items-center gap-2 min-w-0">
          <Gavel className={cn("w-4 h-4 shrink-0", tone.text)} />
          <span className={cn("text-xs font-bold uppercase tracking-widest truncate", tone.text)}>Result</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{total}/{p.eligibleCount} cast</span>
      </div>
      <div className="p-8 sm:p-10 space-y-7">
        <div className="text-center space-y-3">
          <p className="text-xl sm:text-2xl font-bold tracking-tight">{p.motion}</p>
          <p className={cn("text-4xl sm:text-5xl font-extrabold uppercase tracking-tight", tone.text)}>{p.result}</p>
          {p.result === "vetoed" && !!p.vetoedByCountries?.length && (
            <p className="text-sm text-muted-foreground">vetoed by {p.vetoedByCountries.join(", ")}</p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-5">
          {cols.map(([label, n, textCls, barCls]) => {
            const pct = total > 0 ? (n / total) * 100 : 0;
            return (
              <div key={label} className="rounded-2xl bg-secondary/15 border border-border/40 p-4 sm:p-5 text-center">
                <p className={cn("text-5xl sm:text-6xl font-extrabold tabular-nums leading-none", textCls)}>{n}</p>
                <p className="text-xs text-muted-foreground mt-2 mb-2.5 uppercase tracking-wider">{label}</p>
                <div className="h-1.5 w-full bg-secondary/40 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", barCls)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <VoteMeta voteType={p.voteType} threshold={p.threshold} scMode={p.scMode} />
      </div>
    </div>
  );
}

/** lobby / roll_call / suspended / closed — calm, centered state. */
export function CalmState({ phase }: { phase: SessionPhase }) {
  const map: Record<string, { title: string; sub: string }> = {
    lobby: { title: "Session in Lobby", sub: "The chair is preparing to begin. Stand by." },
    roll_call: { title: "Roll Call in Progress", sub: "The chair is taking attendance." },
    gsl: { title: "Speakers List Open", sub: "Waiting for the next speaker to take the floor." },
    suspended: { title: "Session Suspended", sub: "Proceedings are paused. They will resume shortly." },
    closed: { title: "Session Closed", sub: "This committee has adjourned for the day." },
  };
  const s = map[phase] || map.gsl;
  return (
    <div className="glass-card rounded-3xl py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
        <PhaseIcon phase={phase} className="w-7 h-7 text-primary" />
      </div>
      <p className="text-2xl font-bold tracking-tight">{s.title}</p>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">{s.sub}</p>
    </div>
  );
}
