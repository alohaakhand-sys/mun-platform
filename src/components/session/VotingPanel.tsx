"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  openVote, bumpTally, finalizeVote, cancelVote, computeVoteResult,
  subscribeFinishedVotes, eligibleVoterCount, extendVoteTimer,
  timerStart, timerPause, timerReset, VOTE_DEFAULT_SECS,
  publishVoteResult, clearPublishedResult, discardPendingPublish,
  type LiveSession, type ParticipationIdentity, type Ballot, type VoteType, type VoteThreshold,
  type OpenVoteConfig, type FinishedVote,
} from "@/lib/services/sessionService";
import { CountdownTimer } from "./CountdownTimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { SubCard, SubCardTitle, FieldLabel, Segmented, ToggleChip, PanelEmpty, ConsoleModal } from "./console/shared";
import { AiAssistBar } from "./ai/AiAssist";
import { Vote, Check, X, Minus, Gavel, ShieldAlert, History, Users, Megaphone, Plus } from "lucide-react";

const P5_NAMES = ["china", "france", "russia", "russian federation", "united kingdom", "united states", "united states of america", "usa", "uk"];
// assignedCountry is stored as an ISO code ("fr"); older docs may hold a name. Match both.
const P5_CODES = ["cn", "fr", "ru", "gb", "us"];
const isP5Country = (c?: string) => {
  const v = (c || "").trim().toLowerCase();
  return P5_CODES.includes(v) || P5_NAMES.includes(v);
};

const BALLOTS: { id: Ballot; label: string; icon: React.ElementType; cls: string }[] = [
  { id: "yes", label: "For", icon: Check, cls: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/50" },
  { id: "no", label: "Against", icon: X, cls: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/50" },
  { id: "abstain", label: "Abstain", icon: Minus, cls: "bg-muted text-muted-foreground border-border/50" },
];

function resultBadge(result: string) {
  const map: Record<string, string> = {
    passed: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    failed: "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10",
    tied: "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10",
    vetoed: "border-violet-500/40 text-violet-600 dark:text-violet-400 bg-violet-500/10",
  };
  return map[result] || "";
}

export function VotingPanel({
  eventId, sessionId, session, delegates, canControl, identityFor, userId,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  userId: string;
}) {
  const vote = session.activeVote;
  const countryOf = (id: string) => {
    const c = delegates.find((d) => d.userId === id)?.assignedCountry;
    return c ? (getCountryName(c) || c) : "Delegate";
  };

  return (
    <div className="flex flex-col gap-3.5">
      {canControl && <PublishResultCard {...{ eventId, sessionId, session, userId }} />}
      {vote
        ? <ActiveVoteCard {...{ eventId, sessionId, session, delegates, canControl, identityFor, countryOf, userId }} />
        : canControl
          ? <OpenVoteTrigger {...{ eventId, sessionId, session, delegates }} />
          : <PanelEmpty icon={Vote}>No vote in progress.</PanelEmpty>}
      <FinishedVotesList eventId={eventId} sessionId={sessionId} countryOf={countryOf} />
    </div>
  );
}

/**
 * The reveal gate. A closed vote's result is withheld from the room and from every delegate
 * until the chair taps Publish — live numbers on the projector bias whoever votes last.
 *
 * Driven entirely off `session.pendingPublish`, which `closeVoteAtomic` writes in the same
 * transaction that nulls `activeVote`. That's deliberate: if this were React state set at the
 * close call site, a vote that auto-closed on its timer while the chair had this panel shut
 * would never surface a Publish button at all.
 */
function PublishResultCard({
  eventId, sessionId, session, userId,
}: { eventId: string; sessionId: string; session: LiveSession; userId: string }) {
  const [busy, setBusy] = useState(false);
  const pending = session.pendingPublish;
  const shown = session.publishedResult;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e) { console.error("publish result", e); }
    finally { setBusy(false); }
  };

  if (pending) {
    return (
      <SubCard className="p-3.5 border-amber-500/40 bg-amber-500/[0.06]">
        <SubCardTitle icon={Megaphone}>Result ready to publish</SubCardTitle>
        <p className="text-[12.5px] text-muted-foreground mb-2.5">
          Only you can see this. Publishing shows it on the projector and to every delegate.
        </p>
        <div className="flex items-center gap-2 mb-3.5">
          <span className="font-heading text-[14px] font-bold truncate flex-1">{pending.motion}</span>
          <Badge variant="outline" className={cn("text-[10px] uppercase shrink-0", resultBadge(pending.result))}>
            {pending.result}
          </Badge>
          <span className="font-mono text-[13px] font-bold tabular-nums shrink-0">
            {pending.affirmative}–{pending.negative}–{pending.abstentions}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={busy} className="text-muted-foreground"
            onClick={() => run(() => discardPendingPublish(eventId, sessionId))}>
            Don&apos;t publish
          </Button>
          <Button size="sm" disabled={busy} className="gap-1.5"
            onClick={() => run(() => publishVoteResult(eventId, sessionId, userId))}>
            <Megaphone className="w-4 h-4" /> Publish to the room
          </Button>
        </div>
      </SubCard>
    );
  }

  if (shown) {
    return (
      <SubCard className="p-3 flex items-center gap-2.5">
        <Megaphone className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-[12.5px] text-muted-foreground min-w-0 flex-1 truncate">
          On screen — <b className="text-foreground font-semibold">{shown.motion}</b>: {shown.result.toUpperCase()}
        </span>
        <Button variant="outline" size="sm" disabled={busy} className="shrink-0"
          onClick={() => run(() => clearPublishedResult(eventId, sessionId))}>
          Clear
        </Button>
      </SubCard>
    );
  }

  return null;
}

export function PublishResultModal({
  eventId, sessionId, session, userId,
}: {
  eventId: string; sessionId: string; session: LiveSession; userId: string;
}) {
  const [busy, setBusy] = useState(false);
  const pending = session.pendingPublish;

  if (!pending) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e) { console.error("publish result modal", e); }
    finally { setBusy(false); }
  };

  return (
    <ConsoleModal
      icon={Megaphone}
      title="Result ready to publish"
      subtitle="Only you can see this. Publishing shows it on the projector and to every delegate."
      onClose={() => run(() => discardPendingPublish(eventId, sessionId))}
    >
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 my-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-heading text-base font-bold text-foreground line-clamp-2">
            {pending.motion}
          </span>
          <Badge variant="outline" className={cn("text-xs font-bold uppercase shrink-0 px-2.5 py-1", resultBadge(pending.result))}>
            {pending.result}
          </Badge>
        </div>

        <div className="flex items-center justify-between text-sm pt-2.5 border-t border-border/40">
          <span className="text-muted-foreground font-medium">Vote Tally (For – Against – Abstain)</span>
          <span className="font-mono text-base font-bold tabular-nums text-foreground">
            {pending.affirmative} – {pending.negative} – {pending.abstentions}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-border/60">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          className="text-muted-foreground hover:text-foreground text-xs font-medium"
          onClick={() => run(() => discardPendingPublish(eventId, sessionId))}
        >
          Don&apos;t publish
        </Button>
        <Button
          size="sm"
          disabled={busy}
          className="gap-2 px-5 font-bold shadow-md shadow-primary/20"
          onClick={() => run(() => publishVoteResult(eventId, sessionId, userId))}
        >
          <Megaphone className="w-4 h-4" /> Publish to the room
        </Button>
      </div>
    </ConsoleModal>
  );
}

/**
 * Collapsed by default — an open vote is rare next to how much floor space the full form
 * used to eat up permanently. Tap the + to open the form in a modal; it collapses back on
 * its own once the vote goes live (this component unmounts when `session.activeVote` flips).
 */
function OpenVoteTrigger({
  eventId, sessionId, session, delegates,
}: {
  eventId: string; sessionId: string; session: LiveSession; delegates: ApplicationData[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SubCard className="p-3 flex items-center justify-between gap-2.5">
        <SubCardTitle icon={Gavel} className="mb-0">Open a vote</SubCardTitle>
        <button type="button" onClick={() => setOpen(true)} title="Open a vote" aria-label="Open a vote"
          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </SubCard>
      {open && (
        <ConsoleModal title="Open a vote" subtitle="Put a motion to the floor" icon={Gavel} onClose={() => setOpen(false)}>
          <OpenVoteForm eventId={eventId} sessionId={sessionId} session={session} delegates={delegates} onDone={() => setOpen(false)} />
        </ConsoleModal>
      )}
    </>
  );
}

function OpenVoteForm({
  eventId, sessionId, session, delegates, onDone,
}: {
  eventId: string; sessionId: string; session: LiveSession; delegates: ApplicationData[]; onDone?: () => void;
}) {
  const [motion, setMotion] = useState("");
  const [voteType, setVoteType] = useState<VoteType>("substantive");
  const [threshold, setThreshold] = useState<VoteThreshold>("simple_majority");
  const [mode, setMode] = useState<"tally" | "roll_call">("roll_call");
  const [durSecs, setDurSecs] = useState<number>(VOTE_DEFAULT_SECS);
  const [scMode, setScMode] = useState(false);
  const [division, setDivision] = useState(false);
  const [p5, setP5] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const present = delegates.filter((d) => {
    const a = session.attendance[d.userId];
    return a && (a.status === "present" || a.status === "present_and_voting");
  });

  const toggleSc = () => {
    setScMode((v) => {
      const next = !v;
      if (next && p5.length === 0) {
        const guess = present.filter((d) => isP5Country(d.assignedCountry)).map((d) => d.userId);
        if (guess.length) setP5(guess);
      }
      return next;
    });
  };

  const toggleP5 = (id: string) => setP5((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

  const submit = async () => {
    if (!motion.trim()) return;
    setBusy(true);
    try {
      const cfg: OpenVoteConfig = {
        motion: motion.trim(), voteType, threshold, mode, durationSecs: durSecs,
        scMode, p5: scMode ? p5 : [], divisionOfQuestion: division, round: 1,
      };
      await openVote(eventId, sessionId, cfg, session.createdBy);
      onDone?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not open the vote.");
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="space-y-1.5 mb-3.5">
        <FieldLabel>Motion / question</FieldLabel>
        <Input value={motion} onChange={(e) => setMotion(e.target.value)} placeholder="e.g. Draft Resolution 1.1" className="bg-background" />
        <AiAssistBar
          value={motion}
          onPick={setMotion}
          field="vote_label"
          context={{ committee: session.committeeId, phase: session.phase, subject: session.caucus?.topic || "" }}
          suggestLabel="Label ideas"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        <div className="space-y-1.5">
          <FieldLabel>Type</FieldLabel>
          <Select value={voteType} onValueChange={(v) => setVoteType(v as VoteType)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="substantive">Substantive</SelectItem>
              <SelectItem value="procedural">Procedural</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Threshold</FieldLabel>
          <Select value={threshold} onValueChange={(v) => setThreshold(v as VoteThreshold)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="simple_majority">Simple majority</SelectItem>
              <SelectItem value="two_thirds">Two-thirds</SelectItem>
              <SelectItem value="consensus">Consensus</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5 mb-3.5">
        <FieldLabel>Mode</FieldLabel>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { id: "roll_call", label: "Roll call" },
            { id: "tally", label: "Show of hands" },
          ]}
        />
      </div>

      {/* The clock closes the vote on its own when it runs out — you can still close early,
          pause it, or add time once the vote is open. */}
      <div className="space-y-1.5 mb-3.5">
        <FieldLabel>Time to vote</FieldLabel>
        <Segmented
          value={durSecs}
          onChange={setDurSecs}
          options={[
            { id: 60, label: "1 min" },
            { id: VOTE_DEFAULT_SECS, label: "2 min" },
            { id: 300, label: "5 min" },
            { id: 0, label: "No limit" },
          ]}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <ToggleChip on={division} onClick={() => setDivision((v) => !v)}>Division of question</ToggleChip>
        <ToggleChip on={scMode} tone="violet" onClick={toggleSc}>Security Council (P5 veto)</ToggleChip>
      </div>

      {scMode && (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.07] p-3 mb-4">
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-2 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> Permanent members (veto) — roll call required for veto detection</p>
          <div className="flex flex-wrap gap-1.5">
            {present.map((d) => (
              <button key={d.userId} type="button" onClick={() => toggleP5(d.userId)}
                className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                  p5.includes(d.userId) ? "bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/50" : "border-border/50 text-muted-foreground hover:bg-secondary/50")}>
                {d.assignedCountry && <CountryFlag code={d.assignedCountry} size={14} />}
                {getCountryName(d.assignedCountry || "") || d.applicantName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" /> <b className="font-mono font-bold text-foreground">{eligibleVoterCount(session.attendance)}</b> eligible voters
        </span>
        <Button onClick={submit} disabled={busy || !motion.trim()} className="gap-2">
          <Vote className="w-4 h-4" /> Open vote
        </Button>
      </div>
    </div>
  );
}

function ActiveVoteCard({
  eventId, sessionId, session, delegates, canControl, identityFor, countryOf, userId,
}: {
  eventId: string; sessionId: string; session: LiveSession; delegates: ApplicationData[];
  canControl: boolean; identityFor: (id: string) => ParticipationIdentity; countryOf: (id: string) => string;
  /** Chair uid — stamped on the motion `cancelVote` hands back to the floor. */
  userId: string;
}) {
  const vote = session.activeVote!;
  const res = useMemo(() => computeVoteResult(vote), [vote]);
  const [closing, setClosing] = useState(false);

  const eligible = delegates.filter((d) => {
    const a = session.attendance[d.userId];
    return a && (a.status === "present" || a.status === "present_and_voting");
  });

  // Goes through finalizeVote so participation credit AND motion reconciliation happen here
  // too — this panel used to close the vote without resolving the motion behind it.
  const handleClose = async () => {
    setClosing(true);
    try { await finalizeVote(eventId, sessionId, vote.voteId, identityFor); }
    catch (e) { console.error("closeVote", e); }
    finally { setClosing(false); }
  };

  return (
    <SubCard className="p-3.5 border-amber-500/40 bg-amber-500/[0.04]">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-600 dark:text-amber-400 shrink-0">
            <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-75" /><span className="relative w-2 h-2 rounded-full bg-amber-400" /></span>
            Voting
          </span>
          <span className="font-heading text-[14px] font-bold truncate">{vote.motion}</span>
        </div>
        <Badge variant="outline" className={cn("text-[10px] uppercase shrink-0", resultBadge(res.result))}>
          {res.result}{res.result === "vetoed" && res.vetoedBy.length ? ` · ${res.vetoedBy.map(countryOf).join(", ")}` : ""}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
        <Badge variant="outline" className="text-[10px] capitalize">{vote.voteType}</Badge>
        <Badge variant="outline" className="text-[10px]">{vote.threshold.replace("_", " ")}</Badge>
        {vote.scMode && <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-600 dark:text-violet-400">SC · P5</Badge>}
        {vote.divisionOfQuestion && <Badge variant="outline" className="text-[10px]">division</Badge>}
        <Badge variant="outline" className="text-[10px]">round {vote.round}</Badge>
      </div>

      {vote.timer && (
        <div className="mb-3.5">
          <CountdownTimer
            timer={vote.timer}
            canControl={canControl}
            size="lg"
            onStart={(ms) => timerStart(eventId, sessionId, "activeVote.timer", ms)}
            onPause={(ms) => timerPause(eventId, sessionId, "activeVote.timer", ms)}
            onReset={() => timerReset(eventId, sessionId, "activeVote.timer", vote.timer!.durationMs)}
            // extendVoteTimer, not timerStart: it bumps durationMs alongside the deadline so
            // the progress bar can't overshoot 100%.
            onAdjust={canControl ? (delta) => extendVoteTimer(eventId, sessionId, delta) : undefined}
          />
          <p className="text-[11px] text-muted-foreground text-center mt-1.5">
            The vote closes itself when the clock runs out.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5 text-center mb-3.5">
        {[["For", res.affirmative, "text-emerald-600 dark:text-emerald-400"], ["Against", res.negative, "text-red-600 dark:text-red-400"], ["Abstain", res.abstentions, "text-muted-foreground"]].map(([l, n, c]) => (
          <div key={l as string} className="rounded-xl bg-background border border-border py-3">
            <p className={cn("font-mono text-3xl font-bold tabular-nums", c as string)}>{n as number}</p>
            <p className="text-xs text-muted-foreground">{l as string}</p>
          </div>
        ))}
      </div>

      {vote.mode === "tally" ? (
        canControl && (
          <div className="grid grid-cols-3 gap-3 mb-1">
            {BALLOTS.map((b) => (
              <div key={b.id} className="flex items-center justify-center gap-2">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => bumpTally(eventId, sessionId, b.id, -1)}>−</Button>
                <span className="text-sm font-medium w-14 text-center">{b.label}</span>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => bumpTally(eventId, sessionId, b.id, 1)}>+</Button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {eligible.map((d) => {
            const b = vote.ballots?.[d.userId];
            const isP5 = vote.p5?.includes(d.userId);
            const proxiedBy = vote.ballotProxies?.[d.userId];
            return (
              <div key={d.userId} className={cn("flex items-center justify-between gap-2 p-2 rounded-lg border",
                isP5 ? "border-violet-500/30 bg-violet-500/[0.07]" : "border-border bg-background")}>
                <span className="text-sm font-medium truncate flex items-center gap-1.5">
                  {isP5 && <ShieldAlert className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />}
                  {d.assignedCountry && <CountryFlag code={d.assignedCountry} size={16} />}
                  {getCountryName(d.assignedCountry || "") || d.applicantName}
                  {proxiedBy && (
                    <Badge variant="outline" className="text-[9px] uppercase shrink-0 text-muted-foreground">
                      proxy{proxiedBy.byName ? ` · ${proxiedBy.byName}` : ""}
                    </Badge>
                  )}
                </span>
                {/* READ-ONLY. A chair silently overwriting a delegate's ballot is not a
                    legitimate act — a change now goes: delegate requests → chair approves in
                    the Requests panel → that one ballot reopens and the DELEGATE re-casts. */}
                <span className={cn("px-2 py-1 rounded-md text-[11px] font-semibold border shrink-0",
                  b ? BALLOTS.find((x) => x.id === b)!.cls : "border-transparent text-muted-foreground/60")}>
                  {b ? BALLOTS.find((x) => x.id === b)!.label : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {canControl && (
        <div className="flex items-center justify-between pt-3 mt-3.5 border-t border-border/60">
          {/* `vote` is handed over so the motion behind it comes back to the floor instead of being
              stranded at status "voting", where the chair's panel renders it with no buttons at all
              and nothing can recover it. It also scopes the cancel to THIS vote. */}
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={closing}
            onClick={() => cancelVote(eventId, sessionId, vote, userId).catch((e) => console.error("cancelVote", e))}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleClose} disabled={closing}>
            <Gavel className="w-4 h-4" /> Close &amp; record
          </Button>
        </div>
      )}
    </SubCard>
  );
}

function FinishedVotesList({
  eventId, sessionId, countryOf,
}: { eventId: string; sessionId: string; countryOf: (id: string) => string }) {
  const [votes, setVotes] = useState<FinishedVote[]>([]);
  useEffect(() => subscribeFinishedVotes(eventId, sessionId, setVotes), [eventId, sessionId]);
  if (votes.length === 0) return null;
  return (
    <SubCard className="p-3.5">
      <SubCardTitle icon={History} badge={votes.length}>Vote record</SubCardTitle>
      <div className="space-y-2">
        {votes.map((v) => {
          const passed = v.result === "passed";
          return (
            <div key={v.voteId} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-background border border-border">
              <span className={cn("w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0",
                passed ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                {passed ? <Check className="w-4 h-4" /> : <Gavel className="w-4 h-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold leading-tight truncate">{v.motion}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-[13px] font-bold tabular-nums">{v.affirmative}–{v.negative}–{v.abstentions}</p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  {v.published && (
                    <Badge variant="outline" className="text-[9px] uppercase text-muted-foreground">published</Badge>
                  )}
                  <Badge variant="outline" className={cn("text-[9px] uppercase", resultBadge(v.result))}>
                    {v.result}{v.result === "vetoed" && v.vetoedBy?.length ? ` · ${v.vetoedBy.map(countryOf).join(", ")}` : ""}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SubCard>
  );
}
