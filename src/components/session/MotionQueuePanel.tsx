"use client";

/**
 * Chair's live queue of delegate-proposed motions — the visible half of the
 * "motion-first" pipeline. Subscribes to the session's `motionQueue` subcollection,
 * sorts pending motions by MUN precedence (`compareMotionPrecedence`), and lets the
 * chair drive each one: Recognize → Put to vote (procedural) OR Adopt without vote →
 * Execute. Execution funnels into the same transition fns the direct chair panels use
 * (startModCaucus / openVote / …), so there is one source of truth.
 *
 * Modeled on `PointsQueuePanel`. Chair actions are gated by `canControl`.
 */
import { useEffect, useMemo, useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  subscribeMotionQueue, recognizeMotion, putMotionToVote, executeMotion, dismissMotion,
  compareMotionPrecedence, motionSummary, MOTION_META,
  openMotionFloor, closeMotionFloor, MOTION_INVITE_DEFAULT_SECS,
  type Motion, type ParticipationIdentity, type LiveSession,
} from "@/lib/services/sessionService";
import { motionsInOrder, motionInviteState } from "@/lib/services/motionFloor";
import {
  readFloorFacts, mootByState, motionOutcomeWord, type MootRuling,
} from "@/lib/services/motionMootness";
import { getAgenda } from "./flow/flowModel";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { PanelEmpty, QueueRow, StatusPill, ProxyChip, DismissWithReason, SubCard, UnitField, type PanelTone } from "./console/shared";
import { openDocReader } from "./docs/openDocReader";
import {
  Megaphone, Check, X, Play, MessagesSquare, Users, TimerReset,
  List, ListChecks, Vote, FileText, LogOut, PauseCircle, BookOpen, Ban,
} from "lucide-react";
import type { MotionType, MotionStatus } from "@/lib/services/sessionService";

const TYPE_ICON: Record<MotionType, React.ElementType> = {
  mod_caucus: MessagesSquare,
  unmod_caucus: Users,
  extend_caucus: TimerReset,
  open_gsl: List,
  set_agenda: ListChecks,
  move_to_voting: Vote,
  introduce_document: FileText,
  adjourn: LogOut,
  suspend: PauseCircle,
  custom: Megaphone,
};

// non-terminal statuses that still want the chair's attention, in display order
const ACTIVE_ORDER: MotionStatus[] = ["passed", "recognized", "pending", "voting"];

// The display-label table that used to live here moved to `motionOutcomeWord` in motionMootness.ts:
// "dropped" now has TWO readings — a chair's own dismissal reads "dismissed", a motion the floor
// overtook reads "out of order" — and BOTH consoles have to say the same word, so the mapping
// belongs beside the model that produces it rather than in one panel.

// left-accent tone per active status
const STATUS_TONE: Partial<Record<MotionStatus, PanelTone>> = {
  passed: "emerald",
  voting: "amber",
  recognized: "primary",
  pending: "primary",
};

const fmtWindow = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * "The floor is open to motions" — the chair's half of the invitation, plus the single most
 * valuable affordance in the whole feature: when motions are CLOSED it says so, in the exact words
 * the delegates are reading. That closes the loop between the two consoles and answers the
 * question a chair would otherwise ask out loud — "why is nobody moving anything?"
 */
function MotionFloorCard({
  eventId, sessionId, session, canControl, userId, pendingCount,
}: {
  eventId: string; sessionId: string; session: LiveSession;
  canControl: boolean; userId: string; pendingCount: number;
}) {
  const [windowSecs, setWindowSecs] = useState(MOTION_INVITE_DEFAULT_SECS);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const endsAt = session.motionInvite?.endsAt ?? null;
  // Local ticker — nothing writes when a window lapses, so without one the countdown would stall.
  const ticking = endsAt != null && endsAt > now;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking, endsAt]);

  const floor = motionsInOrder(session, now);
  const invite = motionInviteState(session, now);

  const act = async (fn: () => Promise<void>) => {
    if (!canControl || busy) return;
    setBusy(true);
    try { await fn(); }
    catch (e) { console.error("motion floor", e); }
    finally { setBusy(false); }
  };

  // Motions are closed — there is nothing to invite, so offer the reason instead of a dead button.
  if (!floor.inOrder) {
    return (
      <SubCard className="p-3">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Motions are closed right now</span>
          {" — "}{floor.title.replace(/^Motions are closed /, "").replace(/^The session is /, "the session is ")}.
          {" "}Delegates&apos; propose button is greyed out.
        </p>
      </SubCard>
    );
  }

  if (invite.active) {
    return (
      <SubCard className="p-3 border-amber-500/30 bg-amber-500/[0.06]">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill tone="amber">Floor open to motions</StatusPill>
          <span className="text-[12px] font-bold tabular-nums text-amber-600 dark:text-amber-400">{fmtWindow(invite.endsInMs)}</span>
          <span className="text-[11.5px] text-muted-foreground">
            {pendingCount > 0 ? `${pendingCount} motion${pendingCount === 1 ? "" : "s"} pending` : "nothing proposed yet"}
          </span>
          {canControl && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy}
                onClick={() => act(() => openMotionFloor(eventId, sessionId, userId, invite.windowSecs ?? MOTION_INVITE_DEFAULT_SECS))}>
                <TimerReset className="w-3.5 h-3.5" /> Ask again
              </Button>
              <Button size="sm" variant="outline" className="h-8" disabled={busy}
                onClick={() => act(() => closeMotionFloor(eventId, sessionId))}>
                Close
              </Button>
            </div>
          )}
        </div>
      </SubCard>
    );
  }

  if (!canControl) return null;

  return (
    <SubCard className="p-3">
      <div className="flex items-end gap-2">
        <div className="w-[120px] shrink-0">
          <UnitField label="Motion window" unit="sec" min={10} value={windowSecs} onChange={setWindowSecs} />
        </div>
        <Button size="sm" className="h-[38px] gap-1.5 flex-1" disabled={busy}
          onClick={() => act(() => openMotionFloor(eventId, sessionId, userId, windowSecs))}>
          <Megaphone className="w-3.5 h-3.5" /> Open the floor to motions
        </Button>
      </div>
      {/* Says the quiet part out loud: the window is an INVITATION, not a gate. Without this a
          chair reasonably assumes closing it stops motions — it doesn't. */}
      <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
        Prompts every delegate for this long. Motions are always allowed when nobody holds the floor —
        this just asks.
      </p>
    </SubCard>
  );
}

function ago(createdAt: any): string {
  const secs = createdAt?.seconds ? Math.max(0, Math.floor(Date.now() / 1000 - createdAt.seconds)) : 0;
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m`;
}

/**
 * Past this, a motion has been waiting long enough that the age is the story.
 *
 * The time was ALWAYS rendered — a motion sat on a reported screenshot reading "343m ago" and read
 * as ordinary grey fine print. It is not moot (nothing overtook it; the chair is simply behind), so
 * it must not auto-fall — a delegate's paper cannot be deleted because their chair was busy. The
 * honest fix is to make the number carry weight instead of hiding among the metadata.
 */
const STALE_AFTER_SECS = 30 * 60;

const isStale = (createdAt: any): boolean =>
  !!createdAt?.seconds && Date.now() / 1000 - createdAt.seconds > STALE_AFTER_SECS;

export function MotionQueuePanel({
  eventId, sessionId, session, delegates, canControl, identityFor, userId, agendas = [],
  hideFloorCard = false, hideHistoryLogs = false, onStartModCaucus,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  userId: string;
  /** Committee topics — `getAgenda`'s fallback when a session predates `session.agenda`. */
  agendas?: string[];
  hideFloorCard?: boolean;
  hideHistoryLogs?: boolean;
  onStartModCaucus?: (m: Motion) => void;
}) {
  const [motions, setMotions] = useState<Motion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Per-row failure text. The old bare `console.error` meant an `openVote` throw ("A vote is
  // already open.") was invisible to a chair standing in front of a committee — and per AGENTS.md
  // live-MUN errors surface ONLY in the browser console, so nobody was ever going to see it.
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => subscribeMotionQueue(eventId, sessionId, setMotions), [eventId, sessionId]);

  const nameOf = (id: string) => delegates.find((d) => d.userId === id)?.applicantName || "";

  const ordered = useMemo(
    () => motions
      .filter((m) => (ACTIVE_ORDER as string[]).includes(m.status))
      .sort((a, b) => {
        const sa = ACTIVE_ORDER.indexOf(a.status), sb = ACTIVE_ORDER.indexOf(b.status);
        if (sa !== sb) return sa - sb;
        return compareMotionPrecedence(a, b);
      }),
    [motions]
  );

  /**
   * The floor as it stands, so a motion the committee has already answered can be told apart from
   * one still worth ruling on — WITHOUT waiting for a write.
   *
   * This mirrors what `useMotionMootnessSweep` is about to persist; it is not a second source of
   * truth. It exists for two cases the write cannot cover: a chair-tier viewer with `canControl`
   * false never writes at all (an observing vice-chair would otherwise stare at stale rows all
   * session), and the sweep's own jitter window leaves ~1s where the row would still look live.
   *
   * `docs` is deliberately NOT threaded here — the rejected-paper rule needs a subscription this
   * panel does not own, and the hook applies it durably a moment later. The derivation erring
   * conservative (a row lingers one beat longer) is the right way for it to be wrong.
   */
  const falling = useMemo(() => {
    const facts = readFloorFacts(session, getAgenda(session, agendas), motions, []);
    const out = new Map<string, MootRuling>();
    for (const m of ordered) {
      const ruling = mootByState(m, facts);
      if (ruling && m.id) out.set(m.id, ruling);
    }
    return out;
  }, [session, agendas, motions, ordered]);

  const active = useMemo(() => ordered.filter((m) => !falling.has(m.id!)), [ordered, falling]);
  const fallingRows = useMemo(() => ordered.filter((m) => falling.has(m.id!)), [ordered, falling]);

  const resolved = useMemo(
    () => motions
      .filter((m) => ["executed", "failed", "dropped"].includes(m.status))
      // Sort by when they RESOLVED, not when they were proposed: the subscription is createdAt-desc,
      // so a burst of auto-falls on old motions would otherwise push the real outcomes the chair
      // just produced off the bottom of a 6-row strip.
      .sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0))
      .slice(0, 8),
    [motions]
  );

  const run = async (id: string, fn: () => Promise<void>) => {
    if (!canControl || busy) return;
    setBusy(id);
    setErr((e) => (e[id] ? { ...e, [id]: "" } : e));
    try { await fn(); }
    catch (e: any) {
      console.error("motion action", e);
      setErr((prev) => ({ ...prev, [id]: e?.message || "That didn't go through. Try again." }));
    }
    finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {!hideFloorCard && (
        <MotionFloorCard
          eventId={eventId} sessionId={sessionId} session={session}
          canControl={canControl} userId={userId} pendingCount={active.length}
        />
      )}

      <div className="flex items-center gap-2 px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">On the floor</span>
        <span className="inline-flex items-center justify-center min-w-4 h-4 px-1.5 rounded-full bg-muted text-muted-foreground text-[9.5px] font-bold">{active.length}</span>
        <span className="flex-1" />
        {active.length > 0 && <span className="text-[9.5px] text-muted-foreground/70">by precedence</span>}
      </div>
      {active.length === 0 ? (
        <PanelEmpty icon={Megaphone}>No motions on the floor right now.</PanelEmpty>
      ) : (
        active.map((m) => {
          const meta = MOTION_META[m.type];
          const summary = motionSummary(m);
          const isBusy = busy === m.id;
          // `motions` is passed so the execution can fell, in its OWN batch, every motion it just
          // answered for the room. The queue is already in memory — re-querying it would buy nothing.
          const execute = () => {
            if (m.type === "mod_caucus" && onStartModCaucus) {
              onStartModCaucus(m);
              return Promise.resolve();
            }
            return executeMotion(eventId, sessionId, m, userId, identityFor(m.byDelegateId), motions);
          };

          // ONE decisive action per state, promoted to a full-width primary; everything else is
          // secondary. Four same-weight buttons gave the chair nothing to aim at under time
          // pressure, and they could not fit the panel side by side anyway.
          const primary = m.status === "passed" || !meta.needsVote
            ? { label: m.status === "passed" ? "Execute" : "Execute now", icon: Play, run: execute }
            : { label: "Put to vote", icon: Vote, run: () => putMotionToVote(eventId, sessionId, m, userId) };
          const PrimaryIcon = primary.icon;

          const secondary = m.status === "passed" ? [] : [
            ...(m.status === "pending"
              ? [{ key: "recognize", label: "Recognize", icon: Check, run: () => recognizeMotion(eventId, sessionId, m, userId) }]
              : []),
            // Adopting skips the vote the motion would otherwise take — only meaningful when
            // `needsVote`, otherwise it IS the primary above.
            ...(meta.needsVote
              ? [{ key: "adopt", label: "Adopt", icon: Play, run: execute }]
              : []),
          ];

          return (
            <QueueRow
              key={m.id}
              tone={STATUS_TONE[m.status] || "primary"}
              icon={TYPE_ICON[m.type]}
              flag={m.byCountry ? <CountryFlag code={m.byCountry} size={26} /> : undefined}
              title={meta.label}
              time={`${ago(m.createdAt)} ago`}
              statusChip={(
                <>
                  {m.status === "passed" && <StatusPill tone="emerald">passed · ready</StatusPill>}
                  {m.status === "voting" && <StatusPill tone="amber">voting…</StatusPill>}
                  {m.status === "recognized" && <StatusPill tone="primary">recognized</StatusPill>}
                  {/* Not moot — nothing overtook it. The chair is behind, and saying so is the only
                      honest fix: age must never auto-resolve a delegate's motion. */}
                  {isStale(m.createdAt) && <StatusPill tone="amber">waiting {ago(m.createdAt)}</StatusPill>}
                  {m.proxyBy && <ProxyChip name={m.proxyByName} />}
                </>
              )}
              meta={(
                <>
                  {getCountryName(m.byCountry) || m.byCountry || "Delegate"}
                  {nameOf(m.byDelegateId) ? ` · ${nameOf(m.byDelegateId)}` : ""}
                </>
              )}
              note={(
                <>
                  {/* The motion's substance ("combating maritime piracy…") — the thing the chair
                      is actually ruling on, so it reads at body weight, not as fine print. */}
                  {summary && <p className="text-[12.5px] text-foreground/85 leading-snug mt-1">{summary}</p>}
                  {m.note && <p className="text-[11.5px] text-muted-foreground leading-snug italic mt-1">“{m.note}”</p>}
                  {/* Introduce-document motions link the actual paper — let the chair read it
                      before ruling (opens the standalone reader popup). */}
                  {m.type === "introduce_document" && m.params?.documentId && (
                    <button type="button"
                      onClick={() => openDocReader(eventId, m.params.documentId!)}
                      className="inline-flex items-center gap-1.5 mt-1.5 text-[11.5px] font-semibold text-primary hover:underline">
                      <BookOpen className="w-3.5 h-3.5" /> View document
                    </button>
                  )}
                </>
              )}
              actions={canControl && (
                m.status === "voting" ? (
                  <span className="text-xs text-muted-foreground px-1">In vote — waiting on the result</span>
                ) : (
                  <div className="flex flex-col gap-2 w-full @lg:w-auto @lg:flex-row @lg:items-center">
                    <Button size="sm" disabled={isBusy} className="h-8 gap-1.5 w-full @lg:w-auto"
                      onClick={() => run(m.id!, primary.run)}>
                      <PrimaryIcon className="w-3.5 h-3.5" /> {primary.label}
                    </Button>
                    {/* flex-wrap so DismissWithReason can take a full line for its reason input. */}
                    <div className="flex flex-wrap items-center gap-2">
                      {secondary.map((s) => {
                        const Icon = s.icon;
                        return (
                          <Button key={s.key} size="sm" variant="outline" disabled={isBusy}
                            className="h-8 gap-1.5 flex-1 @lg:flex-none" onClick={() => run(m.id!, s.run)}>
                            <Icon className="w-3.5 h-3.5" /> {s.label}
                          </Button>
                        );
                      })}
                      <DismissWithReason disabled={isBusy}
                        onConfirm={(reason) => run(m.id!, () => dismissMotion(eventId, sessionId, m, userId, reason))} />
                    </div>
                    {/* The reason the action failed, said out loud. `openVote` throws "A vote is
                        already open." and that used to vanish into the console. */}
                    {err[m.id!] && (
                      <p className="text-[11.5px] text-destructive leading-snug">{err[m.id!]}</p>
                    )}
                  </div>
                )
              )}
            />
          );
        })
      )}

      {/* ── Overtaken, on their way out ──────────────────────────────────────────────
          Motions the floor has already answered. They sit here for the second or two before the
          sweep's write lands, and permanently for a chair-tier viewer who cannot write at all.

          NOT HIDDEN OUTRIGHT, deliberately. If the sweep never runs — no chair-tier client awake,
          a rejected write — a hidden row is an unrecoverable row, which is the exact failure this
          whole change exists to end. Dismiss stays reachable, so the derivation can never leave the
          chair worse off than before it existed. Normally this list is empty within ~2s. */}
      {!hideHistoryLogs && fallingRows.length > 0 && (
        <div className="space-y-1.5 opacity-70">
          {fallingRows.map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/25 px-3 py-2">
              <Ban className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-muted-foreground truncate">
                  {MOTION_META[m.type].label} · {getCountryName(m.byCountry) || m.byCountry || "Delegate"}
                </p>
                <p className="text-[11px] text-muted-foreground/80 leading-snug">
                  Out of order — {falling.get(m.id!)?.reason}
                </p>
              </div>
              {canControl && (
                <DismissWithReason disabled={busy === m.id}
                  onConfirm={(reason) => run(m.id!, () => dismissMotion(eventId, sessionId, m, userId, reason))} />
              )}
            </div>
          ))}
        </div>
      )}

      {!hideHistoryLogs && resolved.length > 0 && (
        <div className="pt-2 mt-1 border-t border-border/40 space-y-1">
          {resolved.map((m) => {
            const ruledOut = m.status === "dropped" && m.autoResolved;
            return (
              <div key={m.id} className="px-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  {/* Three outcomes, three marks: done, ruled out, voted down. A motion the floor
                      overtook was never judged, so it must not wear the same X as one that lost. */}
                  {m.status === "executed"
                    ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    : ruledOut
                      ? <Ban className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                      : <X className="w-3 h-3 text-muted-foreground shrink-0" />}
                  <span className="truncate">
                    {MOTION_META[m.type].short} · {getCountryName(m.byCountry) || m.byCountry || "Delegate"}
                  </span>
                  <span className={cn("ml-auto text-[10px] font-semibold uppercase shrink-0",
                    m.status === "executed" ? "text-emerald-600 dark:text-emerald-400" : "")}>
                    {motionOutcomeWord(m)}
                  </span>
                </div>
                {m.chairNote && <p className="pl-5 text-[11px] italic truncate">“{m.chairNote}”</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
