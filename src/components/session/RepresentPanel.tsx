"use client";

/**
 * Vice-Chair "Delegate Power" tool — proxy delegate console.
 *
 * A vice-chair granted delegate power (organizer sets StaffMember.delegatePower) picks a
 * delegation from the committee roster and acts ON BEHALF of it. Every artifact is written with
 * the CHOSEN delegation's identity (so the chair's queue shows the country) plus a
 * `proxyBy`/`proxyByName` stamp (so the chair also sees it was a vice-chair proxy).
 *
 * THE PANEL MIRRORS THE DELEGATE CONSOLE, NOT A SUBSET OF IT. Everything a delegate can do on the
 * floor is reachable here — motion, point, speaking slot, floor request, caucus signup, ballot,
 * vote-change, both kinds of yield, withdrawals and committee documents — and each one reuses the
 * delegate-side control with a `proxy` prop rather than a second implementation. What is NOT here
 * is deliberate: private chat (a vice-chair IS the dais, so proxying it would forge a private
 * channel), camera/mic and presence (both bound to a uid by the Agora token and the RTDB rule),
 * and self-declared attendance (the vice-chair has the chair's own Roll Call for that).
 *
 * THREE LEVELS, NOT ONE SCROLL. The panel used to render all nine of those affordances as a flat
 * column at equal weight, in a 404px rail, whatever the session was doing — so a vice-chair looking
 * for the ballot during a roll-call vote scrolled past a motion form, a point menu, two request
 * buttons and a caucus prompt to reach it, and read "No roll-call vote is open right now" the rest
 * of the day. It is now shaped the way the delegate's own console is shaped:
 *
 *   1. PICK  — a searchable roster that says WHY a delegation wants you (holds the floor, hasn't
 *              voted, N standing raises) instead of an alphabetical dropdown of 190 countries.
 *   2. NOW   — the asks that expire: an open ballot, a caucus signup, a held floor, a signup
 *              window, an endorsement countdown. Renders nothing when nothing is live.
 *   3. TABS  — Floor / Papers / Standing for the acts that keep, so each is one screen instead of
 *              one ninth of a scroll.
 *
 * The acting-as bar is sticky over all of it: a proxy must never be able to scroll away from whose
 * name they are writing under.
 *
 * A PROXY GETS THE DELEGATION'S GATE, NOT THE VICE-CHAIR'S. `capabilitiesFor(session, selectedId)`
 * resolves the represented delegation's floor gate and every control here is shut by it. The rules
 * would let a chair-tier writer through regardless — this is a product decision: a proxy raise the
 * delegate could not have made themselves is a chair action wearing a country's name, and belongs
 * in the chair's own tools where it is attributed to staff.
 *
 * READ BUDGET: takes `points` / `requests` / `motions` / `docs` as PROPS from the console's
 * existing listeners. Do not resubscribe here — see the console's prop docblock.
 */

import { Children, useEffect, useMemo, useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  raiseHand, joinSignup, castBallotAsProxy, answerCaucusSignup, requestVoteChange,
  cancelPoint, cancelMotion, cancelHand,
  POINT_META, FLOOR_REQUEST_META, MOTION_META,
  type LiveSession, type ParticipationIdentity, type ProxyAttribution,
  type Ballot, type AttendanceStatus, type FloorRequest, type RaisedPoint, type Motion,
} from "@/lib/services/sessionService";
import { signupIdFor } from "@/lib/services/caucusList";
import { capabilitiesFor, floorHolder } from "@/lib/services/floorGate";
import {
  subscribeEndorsementsForDocs, type CommitteeDoc, type DocEndorsement,
} from "@/lib/services/committeeDocService";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import {
  PanelEmpty, GroupLabel, SubCard, Segmented, panelTone, type PanelTone,
} from "./console/shared";
import { RaisePointMenu } from "./RaisePointMenu";
import { ProposeMotionForm } from "./ProposeMotionMenu";
import { YieldMenu } from "./YieldMenu";
import { DelegateDocsTool } from "./docs/DelegateDocsTool";
import { EndorsementInbox } from "./docs/EndorsementInbox";
import type { CommitteeDocType } from "@/lib/services/committeeDocService";
import {
  UserSquare2, Mic, Video, Vote, Check, AlertTriangle, Lock, X, CornerUpRight, RefreshCw,
  Search, ChevronRight, ChevronsUpDown, Clock, Megaphone, FileStack, Layers, Users2, Hand,
} from "lucide-react";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  present_and_voting: "Present & voting",
  absent: "Absent",
  late: "Late",
};
const canVoteStatus = (s?: AttendanceStatus) => s === "present" || s === "present_and_voting";

const BALLOTS: { id: Ballot; label: string; cls: string }[] = [
  { id: "yes", label: "For", cls: "hover:border-emerald-500/50 hover:bg-emerald-500/10 data-[on=true]:border-emerald-500 data-[on=true]:bg-emerald-500/15 data-[on=true]:text-emerald-600 dark:text-emerald-400" },
  { id: "no", label: "Against", cls: "hover:border-red-500/50 hover:bg-red-500/10 data-[on=true]:border-red-500 data-[on=true]:bg-red-500/15 data-[on=true]:text-red-600 dark:text-red-400" },
  { id: "abstain", label: "Abstain", cls: "hover:border-muted-foreground/40 hover:bg-secondary/60 data-[on=true]:border-muted-foreground data-[on=true]:bg-secondary" },
];

/** Level-2 tabs. Everything time-boxed is hoisted out of these into the "Right now" stack. */
type RepTab = "floor" | "papers" | "standing";

/** One roster line, with the reasons this delegation might need the vice-chair right now. */
type RosterEntry = {
  uid: string;
  name: string;
  country: string;
  /** Country name when the delegation has one, else the delegate's own name. */
  label: string;
  status?: AttendanceStatus;
  holdsFloor: boolean;
  /** 1-based place in each queue, 0 when not on it. */
  gslPos: number;
  caucusPos: number;
  /** Pending points + motions + floor requests. */
  standing: number;
  /** A roll-call vote is open, this delegation is seated, and it has not spent its ballot. */
  needsBallot: boolean;
  /** A moderated caucus is collecting and this delegation has not answered. */
  needsSignup: boolean;
};

export function RepresentPanel({
  eventId, sessionId, session, delegates, identityFor, viceChairUid, viceChairName,
  points, requests, motions, docs, agendas = [], onCompose,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession | null | undefined;
  delegates: ApplicationData[];
  identityFor: (delegateId: string) => ParticipationIdentity;
  viceChairUid: string;
  viceChairName: string;
  /** The console's live arrays — see the class docblock; do NOT resubscribe. */
  points: RaisedPoint[];
  requests: FloorRequest[];
  motions: Motion[];
  docs: CommitteeDoc[];
  /**
   * Committee.agendas[] — handed to the motion form so `set_agenda` offers the committee's real
   * topics instead of falling back to free text on a session that predates `session.agenda`.
   */
  agendas?: string[];
  /**
   * Open the document composer for a delegation. Hosted by the console root, not here: the tool
   * rail animates in with a transform, which would become the containing block for `ConsoleModal`'s
   * `fixed` positioning and trap the dialog inside a 404px column.
   */
  onCompose: (delegateId: string, initialDoc?: {
    type?: CommitteeDocType; title?: string; content?: string; sponsors?: string[]; signatories?: string[];
  }) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [tab, setTab] = useState<RepTab>("floor");
  const [busyBallot, setBusyBallot] = useState(false);
  const [busyHand, setBusyHand] = useState<string | null>(null);
  const [busySignup, setBusySignup] = useState(false);
  const [busyCancel, setBusyCancel] = useState<string | null>(null);
  const [endorsements, setEndorsements] = useState<DocEndorsement[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const proxy: ProxyAttribution = { by: viceChairUid, byName: viceChairName };
  const identity = selectedId ? identityFor(selectedId) : null;

  const vote = session?.activeVote;
  const voteOpen = !!vote && vote.mode === "roll_call" && session?.phase === "voting";
  const modCaucus = session?.caucus?.kind === "moderated" ? session.caucus : null;
  const holder = session ? floorHolder(session) : null;

  // ── Roster, annotated with what each delegation has in flight ──────────────────
  //
  // ONE pass over the console's three arrays, not a filter per row: this list is the whole
  // committee and the naive shape is O(roster × raises) on every snapshot of a busy floor.
  const standingBy = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (id?: string) => { if (id) m.set(id, (m.get(id) || 0) + 1); };
    points.forEach((p) => { if (p.status === "pending") bump(p.delegateId); });
    motions.forEach((mo) => { if (mo.status === "pending") bump(mo.byDelegateId); });
    // `caucus_signup` is excluded for the same reason the withdraw list below excludes it — the
    // caucus prompt owns that answer.
    requests.forEach((r) => {
      if (r.status === "pending" && r.kind !== "caucus_signup") bump(r.delegateId);
    });
    return m;
  }, [points, motions, requests]);

  const answeredSignup = useMemo(() => {
    if (!modCaucus) return new Set<string>();
    return new Set(
      requests
        .filter((r) => r.kind === "caucus_signup" && r.caucusId === modCaucus.caucusId)
        .map((r) => r.delegateId),
    );
  }, [requests, modCaucus]);

  const roster: RosterEntry[] = useMemo(() => {
    const gsl = session?.gsl?.queue || [];
    const cau = session?.caucus?.queue || [];
    return delegates
      .filter((d) => d.userId)
      .map((d) => {
        const uid = d.userId as string;
        const country = d.assignedCountry || "";
        const status = session?.attendance?.[uid]?.status;
        const seated = canVoteStatus(status);
        return {
          uid,
          name: d.applicantName || "Delegate",
          country,
          label: getCountryName(country) || country || d.applicantName || "Delegate",
          status,
          holdsFloor: !!holder && holder.delegateId === uid,
          gslPos: gsl.findIndex((s) => s.delegateId === uid) + 1,
          caucusPos: cau.findIndex((s) => s.delegateId === uid) + 1,
          standing: standingBy.get(uid) || 0,
          needsBallot: voteOpen && seated && !vote?.ballots?.[uid],
          needsSignup: !!modCaucus && seated && !answeredSignup.has(uid),
        };
      })
      .sort((a, b) => attentionRank(a) - attentionRank(b) || a.label.localeCompare(b.label));
  }, [delegates, session, holder, standingBy, voteOpen, vote, modCaucus, answeredSignup]);

  const selected = roster.find((r) => r.uid === selectedId);

  // The chosen delegation's OWN permissions, not the vice-chair's — see the class docblock.
  const proxyCaps = useMemo(
    () => (session && selectedId ? capabilitiesFor(session, selectedId) : undefined),
    [session, selectedId],
  );

  const attendance = selected?.status;
  const seated = canVoteStatus(attendance);
  const currentBallot = vote?.ballots?.[selectedId];
  const holdsFloor = !!selected?.holdsFloor;

  // ── What is already in flight for THIS delegation ─────────────────────────────
  const myPoints = useMemo(
    () => points.filter((p) => p.delegateId === selectedId && p.status === "pending"),
    [points, selectedId],
  );
  const myMotions = useMemo(
    () => motions.filter((m) => m.byDelegateId === selectedId && m.status === "pending"),
    [motions, selectedId],
  );
  // `caucus_signup` is excluded for the same reason `RequestsPanel.pending` excludes it: the caucus
  // prompt below owns that answer, and it is the only surface that knows whether the chair has
  // already seated the list. Withdrawing one from here would race `useCaucusAutoAdd`.
  const myRequests = useMemo(
    () => requests.filter((r) =>
      r.delegateId === selectedId && r.status === "pending" && r.kind !== "caucus_signup"),
    [requests, selectedId],
  );
  /** Everything the yield menu needs to tell "already asked" from "not yet". */
  const myHands = useMemo(
    () => requests.filter((r) => r.delegateId === selectedId),
    [requests, selectedId],
  );
  const pendingYield = myHands.some((h) => h.kind === "yield" && h.status === "pending");

  // ── Papers still collecting — the delegation's consent inbox is derived from these ──
  const collectingIds = useMemo(
    () => docs.filter((d) => d.status === "collecting-endorsements" && d.id).map((d) => d.id!).sort(),
    [docs],
  );
  // Joined so the dependency is a stable string, not a new array identity every render.
  const collectingKey = collectingIds.join(",");
  useEffect(() => {
    if (!selectedId) { setEndorsements([]); return; }
    return subscribeEndorsementsForDocs(
      eventId, collectingKey ? collectingKey.split(",") : [], selectedId, setEndorsements,
    );
  }, [eventId, collectingKey, selectedId]);

  // Rows stay `pending` in Firestore after their window lapses, so the tab badge has to count the
  // LIVE ones or a dead request would flag Papers forever. Ticks only while any exist — the same
  // 1s cadence `EndorsementInbox` runs for its own countdown.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endorsements.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endorsements.length]);
  const liveEndorsements = endorsements.filter((r) => r.endsAt - now > 0).length;

  const run = async (key: string, fn: () => Promise<void>, msg: string) => {
    if (busyHand) return;
    setBusyHand(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      console.error("represent", key, e);
      setErr(msg);
    } finally {
      setBusyHand(null);
    }
  };

  // ONE BUTTON, TWO ASKS — the same pair the delegate has, and the distinction is the `signupId`.
  //
  // While the chair is COLLECTING for the General Speakers List, this is a signup and has to carry
  // the window's id, or `GslSeatModal` sorts it as an off-gate straggler instead of part of the
  // batch. At every other moment it is the ad-hoc "put me on the list" ask that the delegate's own
  // Speakers tool writes at any time, off-gate.
  //
  // NOT gated on `caps.canJoinSignup`: that flag means "a signup window is open", so keying the
  // button off it would take away, mid-caucus or during debate, an ask the delegate themselves can
  // still make. The real constraint — the one the `requests` rule enforces — is attendance.
  //
  // The gate is passed only when it is a GSL window. Handing `joinSignup` a caucus gate would make
  // this write a `caucus_signup` doc, duplicating the caucus prompt above, which owns that answer
  // and is the surface that knows whether the delegation has already given one.
  const gslSignupGate = session?.floorGate?.kind === "signup" && session.floorGate.signupFor !== "caucus"
    ? session.floorGate
    : null;
  const askToSpeak = () => {
    if (!identity) return;
    return run("speak", async () => {
      await joinSignup(eventId, sessionId, identity, gslSignupGate, undefined, proxy);
    }, "Couldn't join the speakers list. Make sure this delegation belongs to your committee.");
  };

  const askForFloor = () => {
    if (!identity) return;
    return run("floor", async () => {
      await raiseHand(eventId, sessionId, identity, "floor", "", proxy);
    }, "Couldn't send that request. Make sure this delegation belongs to your committee.");
  };

  // A delegation votes once. The vice-chair may cast for one that hasn't voted yet, but not
  // overwrite a ballot the delegate already spent — that correction is the chair's call, and the
  // "change my vote" ask below is the in-procedure route to it.
  const proxyLocked = !!currentBallot;

  // Same rule for the moderated-caucus speakers prompt.
  const theirSignup = modCaucus && selectedId
    ? requests.find((r) => r.kind === "caucus_signup"
        && r.caucusId === modCaucus.caucusId && r.delegateId === selectedId)
    : undefined;
  const pendingVoteChange = myRequests.find((r) => r.kind === "vote_change" && r.voteId === vote?.voteId);

  const signup = async (a: "yes" | "no") => {
    if (!identity || !modCaucus || busySignup || theirSignup) return;
    setBusySignup(true);
    setErr(null);
    try {
      // Carry the same signupId the delegate's own card would have written, so a proxied answer is
      // indistinguishable from a first-hand one to every consumer — including `signedUp` on the
      // delegate's console, which is how they see that their vice-chair answered for them.
      await answerCaucusSignup(
        eventId, sessionId, identity, modCaucus.caucusId, a, proxy,
        signupIdFor(modCaucus.caucusId),
      );
    } catch (e) {
      console.error("proxy answerCaucusSignup", e);
      setErr("Couldn't answer for this delegation. Make sure it is marked present.");
    } finally {
      setBusySignup(false);
    }
  };

  const cast = async (ballot: Ballot) => {
    if (!selectedId || busyBallot || proxyLocked) return;
    setBusyBallot(true);
    setErr(null);
    try {
      await castBallotAsProxy(eventId, sessionId, selectedId, ballot, proxy);
    } catch (e) {
      console.error("proxy castBallot", e);
      setErr("Couldn't cast that ballot. Make sure the delegation is marked present.");
    } finally {
      setBusyBallot(false);
    }
  };

  const askVoteChange = async () => {
    if (!identity || !vote?.voteId || busyBallot) return;
    setBusyBallot(true);
    setErr(null);
    try {
      await requestVoteChange(eventId, sessionId, identity, vote.voteId, "", proxy);
    } catch (e) {
      console.error("proxy requestVoteChange", e);
      setErr("Couldn't ask the chair to reopen that ballot.");
    } finally {
      setBusyBallot(false);
    }
  };

  const withdraw = async (key: string, fn: () => Promise<void>) => {
    if (busyCancel) return;
    setBusyCancel(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      console.error("proxy withdraw", key, e);
      setErr("Couldn't withdraw that. It may already have been ruled on.");
    } finally {
      setBusyCancel(null);
    }
  };

  /** Land on Floor on every switch — the tab a vice-chair wanted for the LAST delegation is not
   *  evidence about this one, and Papers/Standing can be empty for it. */
  const pick = (uid: string) => { setSelectedId(uid); setErr(null); setTab("floor"); };

  // ── Level 1 — pick a delegation ───────────────────────────────────────────────
  if (!session) {
    return <PanelEmpty icon={UserSquare2}>The session hasn&apos;t started yet.</PanelEmpty>;
  }
  if (!identity || !selected) {
    return <RosterPicker roster={roster} onPick={pick} />;
  }

  const standingCount = myPoints.length + myMotions.length + myRequests.length;

  return (
    <div className="flex flex-col gap-3">
      {/* Acting-as bar. STICKY, and the negative margins are load-bearing: the host rail body is
          `p-3.5 overflow-y-auto`, so without them the bar would pin inside the padding and scrolled
          content would show through the 14px gutters above and beside it. */}
      <div className="sticky -top-3.5 z-20 -mx-3.5 -mt-3.5 px-3.5 pt-3.5 pb-2 bg-card">
        <button type="button" onClick={() => setSelectedId("")}
          title="Represent a different delegation"
          className="w-full flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.07] p-2.5 text-left hover:bg-primary/10 transition-colors">
          {selected.country
            ? <CountryFlag code={selected.country} size={28} />
            : <span className="w-7 h-7 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0"><UserSquare2 className="w-4 h-4" /></span>}
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-tight truncate">
              Acting as {selected.label}
            </span>
            <span className="block text-[11px] text-muted-foreground leading-tight truncate">
              Proxy by {viceChairName || "Vice Chair"}
              {attendance ? ` · ${STATUS_LABEL[attendance]}` : ""}
              {holdsFloor ? " · Holds the floor"
                : selected.caucusPos ? ` · #${selected.caucusPos} in caucus`
                : selected.gslPos ? ` · #${selected.gslPos} on the list` : ""}
            </span>
          </span>
          <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </div>

      {err && (
        <p className="inline-flex items-start gap-1.5 text-[11.5px] text-red-600 dark:text-red-400 px-0.5 -mt-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {err}
        </p>
      )}

      {/* ── Level 2a — Right now. Only the asks that expire; renders nothing when none do. ──
          Ordered by how little time is left to answer: a lapsed ballot or signup window cannot be
          reopened by anyone but the chair, a held floor lasts one speech, a paper 90 seconds. */}
      <NowStack>
        {voteOpen && (
          <NowCard tone="amber" icon={Vote} title="Roll-call vote open" hint={vote?.motion || undefined}>
            {!seated ? (
              <NotSeated>Not marked present — mark it in Roll Call before its vote counts.</NotSeated>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {BALLOTS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      data-on={currentBallot === b.id}
                      disabled={busyBallot || proxyLocked}
                      onClick={() => cast(b.id)}
                      className={cn(
                        "h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card text-xs font-semibold transition-colors disabled:opacity-50",
                        b.cls,
                      )}
                    >
                      {currentBallot === b.id && <Check className="w-3.5 h-3.5" />}
                      {b.label}
                    </button>
                  ))}
                </div>
                {currentBallot && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      Already voted (<span className="font-semibold uppercase">{currentBallot}</span>) — one
                      ballot each, so only the chair can reopen it.
                    </p>
                    {pendingVoteChange ? (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Waiting for the chair to reopen the ballot.
                      </p>
                    ) : (
                      <button type="button" disabled={busyBallot} onClick={askVoteChange}
                        className="h-8 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card text-[12px] font-semibold hover:bg-secondary/50 transition-colors disabled:opacity-50">
                        <RefreshCw className="w-3.5 h-3.5" /> Ask the chair to change it
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </NowCard>
        )}

        {modCaucus && (
          theirSignup ? (
            <NowCard tone="muted" icon={Users2} title="Caucus speakers list">
              <p className="text-[11.5px] text-muted-foreground">
                Answered <span className="font-semibold text-foreground">{theirSignup.answer}</span>
                {theirSignup.proxyBy ? "" : " by the delegate"} — only the chair can change it now.
              </p>
            </NowCard>
          ) : (
            <NowCard tone="primary" icon={Users2} title="Speak in this caucus?">
              {!seated ? (
                <NotSeated>Mark this delegation present before it can join the speakers list.</NotSeated>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busySignup} onClick={() => signup("yes")}
                    className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card text-xs font-semibold hover:bg-secondary/50 transition-colors disabled:opacity-50">
                    <Check className="w-4 h-4" /> Wants to speak
                  </button>
                  <button type="button" disabled={busySignup} onClick={() => signup("no")}
                    className="h-9 inline-flex items-center justify-center rounded-lg border border-border/60 bg-card text-xs font-semibold hover:bg-secondary/50 transition-colors disabled:opacity-50">
                    Passes
                  </button>
                </div>
              )}
            </NowCard>
          )
        )}

        {(holdsFloor || pendingYield) && (
          <NowCard tone="primary" icon={CornerUpRight}
            title={holdsFloor ? "Holds the floor" : "Yield pending"}>
            <YieldMenu eventId={eventId} sessionId={sessionId} session={session}
              identity={identity} myHands={myHands} proxy={proxy} />
          </NowCard>
        )}

        {gslSignupGate && !selected.gslPos && (
          <NowCard tone="emerald" icon={Mic} title="Speakers list is open"
            hint="The chair is collecting names — the window shuts when they seat the list.">
            {!seated ? (
              <NotSeated>Mark this delegation present before it can ask to speak.</NotSeated>
            ) : (
              <button type="button" disabled={busyHand !== null} onClick={askToSpeak}
                className="h-9 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card text-xs font-semibold hover:bg-secondary/50 transition-colors disabled:opacity-50">
                <Mic className="w-4 h-4" /> Join the list
              </button>
            )}
          </NowCard>
        )}

        {liveEndorsements > 0 && tab !== "papers" && (
          <NowCard tone="violet" icon={Clock}
            title={`${liveEndorsements} endorsement ${liveEndorsements === 1 ? "request" : "requests"}`}
            hint="Each one expires on its own countdown.">
            <button type="button" onClick={() => setTab("papers")}
              className="h-9 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card text-xs font-semibold hover:bg-secondary/50 transition-colors">
              <FileStack className="w-4 h-4" /> Review in Papers
            </button>
          </NowCard>
        )}
      </NowStack>

      {/* ── Level 2b — the acts that keep ────────────────────────────────────────── */}
      <Segmented<RepTab>
        value={tab}
        onChange={setTab}
        options={[
          { id: "floor", label: "Floor", icon: Megaphone },
          { id: "papers", label: <TabLabel count={liveEndorsements}>Papers</TabLabel>, icon: FileStack },
          { id: "standing", label: <TabLabel count={standingCount}>Standing</TabLabel>, icon: Layers },
        ]}
      />

      {tab === "floor" && (
        <div className="flex flex-col gap-3">
          <div>
            <GroupLabel>Ask the chair</GroupLabel>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <GateBtn
                icon={Mic}
                label={gslSignupGate ? "Join the list" : "Request to speak"}
                busy={busyHand === "speak"}
                disabled={busyHand !== null}
                lock={seated ? null : "Mark this delegation present before it can ask to speak."}
                onClick={askToSpeak}
              />
              <GateBtn
                icon={Video}
                label="Raise for floor"
                busy={busyHand === "floor"}
                disabled={busyHand !== null}
                lock={proxyCaps && !proxyCaps.canRequestFloor
                  ? proxyCaps.lockReason.canRequestFloor || "The chair has closed the floor."
                  : null}
                onClick={askForFloor}
              />
            </div>
          </div>

          <div>
            <GroupLabel>Raise a point</GroupLabel>
            <RaisePointMenu eventId={eventId} sessionId={sessionId} identity={identity} proxy={proxy}
              caps={proxyCaps} className="mt-1.5" />
          </div>

          <div>
            <GroupLabel>Propose a motion</GroupLabel>
            {/* A proxy gets the SAME floor gate as the delegation it speaks for — like the
                spent-ballot and answered-signup guards above, a correction here is the chair's
                call, made from the Motions tool and attributed to staff. `allowedTypes` is what
                keeps that gate from leaking: without it an "agenda motions only" floor would still
                offer all ten types in this form. */}
            <SubCard className="mt-1.5 p-2">
              <ProposeMotionForm eventId={eventId} sessionId={sessionId} identity={identity}
                proxy={proxy} session={session} committeeAgendas={agendas}
                allowedTypes={session.floorGate ? proxyCaps?.proposableMotionTypes : undefined} />
            </SubCard>
          </div>
        </div>
      )}

      {tab === "papers" && (
        <div className="flex flex-col gap-3">
          {liveEndorsements > 0 && <EndorsementInbox rows={endorsements} proxy={proxy} />}
          <DelegateDocsTool
            eventId={eventId} sessionId={sessionId} session={session}
            identity={identity} proxy={proxy}
            onCompose={(initial) => onCompose(selectedId, initial)}
          />
        </div>
      )}

      {tab === "standing" && (
        <InFlight
          holdsFloor={holdsFloor}
          gslPos={selected.gslPos}
          caucusPos={selected.caucusPos}
          points={myPoints}
          motions={myMotions}
          requests={myRequests}
          busy={busyCancel}
          onWithdrawPoint={(id) => withdraw(`p${id}`, () => cancelPoint(eventId, sessionId, id))}
          onWithdrawMotion={(id) => withdraw(`m${id}`, () => cancelMotion(eventId, sessionId, id))}
          onWithdrawRequest={(id) => withdraw(`r${id}`, () => cancelHand(eventId, sessionId, id))}
        />
      )}
    </div>
  );
}

// ── Level 1 — the roster ────────────────────────────────────────────────────────

/** Lower sorts first. Drives both the order and the "Needs you" split. */
function attentionRank(e: RosterEntry): number {
  if (e.holdsFloor) return 0;
  if (e.needsBallot) return 1;
  if (e.needsSignup) return 2;
  if (e.standing > 0) return 3;
  return 9;
}

/**
 * Delegation chooser.
 *
 * IT IS A LIST, NOT A `<Select>`. The dropdown it replaced was alphabetical and carried nothing but
 * the country and (sometimes) its attendance — so a vice-chair whose whole job in that moment is
 * "France raised a point and cannot reach its laptop" had to already know which country to look
 * for. Every reason to open this tool is a floor event, so floor events are what the rows carry,
 * and the delegations that have one sort to the top under their own heading.
 */
function RosterPicker({
  roster, onPick,
}: { roster: RosterEntry[]; onPick: (uid: string) => void }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const matches = term
    ? roster.filter((r) =>
        r.label.toLowerCase().includes(term)
        || r.name.toLowerCase().includes(term)
        || r.country.toLowerCase().includes(term))
    : roster;
  // While searching the two groups collapse into one flat result list — a search already IS the
  // filter, and splitting six hits across two headings just costs rows.
  const needs = term ? [] : matches.filter((r) => attentionRank(r) < 9);
  const rest = term ? matches : matches.filter((r) => attentionRank(r) === 9);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] text-muted-foreground px-0.5 leading-snug">
        Act on behalf of a delegation that cannot reach the floor itself. The chair sees every raise
        under that country, tagged as your proxy.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search delegations…"
          className="w-full h-9 pl-9 pr-3 rounded-[10px] bg-background border border-border text-xs outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {matches.length === 0 && (
        <PanelEmpty icon={UserSquare2}>
          {roster.length === 0 ? "No delegates in this committee." : "No delegation matches that."}
        </PanelEmpty>
      )}

      {needs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <GroupLabel count={needs.length}>Needs you</GroupLabel>
          {needs.map((r) => <RosterRow key={r.uid} entry={r} onPick={onPick} />)}
        </div>
      )}
      {rest.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {!term && needs.length > 0 && <GroupLabel count={rest.length}>Everyone else</GroupLabel>}
          {rest.map((r) => <RosterRow key={r.uid} entry={r} onPick={onPick} />)}
        </div>
      )}
    </div>
  );
}

function RosterRow({ entry, onPick }: { entry: RosterEntry; onPick: (uid: string) => void }) {
  const signal = rowSignal(entry);
  return (
    <button type="button" onClick={() => onPick(entry.uid)}
      className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-xl bg-secondary/40 border border-border/60 hover:bg-secondary/70 transition-colors">
      {entry.country
        ? <CountryFlag code={entry.country} size={20} />
        : <span className="w-5 h-5 rounded bg-muted shrink-0" />}
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold leading-tight truncate">{entry.label}</span>
        <span className="block text-[11px] text-muted-foreground leading-tight truncate">{entry.name}</span>
      </span>
      {signal && (
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", panelTone(signal.tone).chip)}>
          {signal.text}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

/** ONE chip per row — the most urgent fact, not a badge cloud in a 404px rail. */
function rowSignal(e: RosterEntry): { text: string; tone: PanelTone } | null {
  if (e.holdsFloor) return { text: "Has the floor", tone: "primary" };
  if (e.needsBallot) return { text: "Not voted", tone: "amber" };
  if (e.needsSignup) return { text: "Caucus ask", tone: "primary" };
  if (e.standing > 0) return { text: `${e.standing} standing`, tone: "violet" };
  if (e.caucusPos) return { text: `#${e.caucusPos} caucus`, tone: "muted" };
  if (e.gslPos) return { text: `#${e.gslPos} on list`, tone: "muted" };
  if (e.status && !canVoteStatus(e.status)) return { text: STATUS_LABEL[e.status], tone: "amber" };
  return null;
}

// ── Bits ────────────────────────────────────────────────────────────────────────

/** The "Right now" group — its label and spacing only exist when a child actually rendered. */
function NowStack({ children }: { children: React.ReactNode }) {
  // `Children.toArray` and not a raw filter: it drops the `false` branches AND keys what survives,
  // which a bare array of conditional children would not carry.
  const live = Children.toArray(children);
  if (live.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <GroupLabel>Right now</GroupLabel>
      {live}
    </div>
  );
}

/** A tinted, accent-barred card for one time-boxed ask. Same anatomy as `QueueRow`. */
function NowCard({
  tone = "primary", icon: Icon, title, hint, children,
}: {
  tone?: PanelTone;
  icon: React.ElementType;
  title: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  const t = panelTone(tone);
  return (
    <div className={cn("relative rounded-[14px] border overflow-hidden", t.tint)}>
      <span aria-hidden className={cn("absolute left-0 inset-y-0 w-1", t.accent)} />
      <div className="p-3 pl-3.5 space-y-2">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("w-3.5 h-3.5 shrink-0", t.title)} />
          <span className={cn("text-[12px] font-bold leading-tight", t.title)}>{title}</span>
        </div>
        {hint && <p className="text-[11px] text-muted-foreground leading-snug -mt-1">{hint}</p>}
        {children}
      </div>
    </div>
  );
}

/** Tab label with a count that only appears when there is something to count. */
function TabLabel({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      {count > 0 && (
        <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9.5px] font-bold">
          {count}
        </span>
      )}
    </span>
  );
}

/** Amber "not seated" note — the same sentence shape every attendance-blocked control uses. */
function NotSeated({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-start gap-1.5 text-[11.5px] text-amber-600 dark:text-amber-400">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
      {children}
    </p>
  );
}

/** A floor-request button that states WHY it is shut, rather than silently doing nothing. */
function GateBtn({
  icon: Icon, label, lock, busy, disabled, onClick,
}: {
  icon: React.ElementType;
  label: string;
  /** Non-null ⇒ the delegation's gate is closed; the string is shown on the disabled control. */
  lock: string | null;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || !!lock || busy}
      title={lock || undefined}
      onClick={onClick}
      className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 text-xs font-semibold hover:bg-secondary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {lock ? <Lock className="w-3.5 h-3.5" /> : <Icon className="w-4 h-4" />} {label}
    </button>
  );
}

/**
 * Everything this delegation already has standing on the floor, with a way to take each one back.
 *
 * Chair-tier delete is permitted by the `points` / `motionQueue` / `requests` rules, so withdrawing
 * needs no proxy-specific service call — the same `cancel*` functions the delegate's own console
 * uses do the work.
 */
function InFlight({
  holdsFloor, gslPos, caucusPos, points, motions, requests, busy,
  onWithdrawPoint, onWithdrawMotion, onWithdrawRequest,
}: {
  holdsFloor: boolean;
  /** 1-based, 0 when not queued. */
  gslPos: number;
  caucusPos: number;
  points: RaisedPoint[];
  motions: Motion[];
  requests: FloorRequest[];
  busy: string | null;
  onWithdrawPoint: (id: string) => void;
  onWithdrawMotion: (id: string) => void;
  onWithdrawRequest: (id: string) => void;
}) {
  const place = holdsFloor
    ? "Holds the floor"
    : caucusPos ? `#${caucusPos} in the caucus list`
    : gslPos ? `#${gslPos} on the Speakers List`
    : null;
  const nothing = !place && !points.length && !motions.length && !requests.length;
  if (nothing) {
    return <PanelEmpty icon={Hand}>Nothing standing on the floor for this delegation.</PanelEmpty>;
  }

  return (
    <SubCard className="p-2.5 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">On the floor</p>
      {place && (
        <p className={cn("text-[12px] font-semibold", holdsFloor ? "text-primary" : "text-foreground")}>{place}</p>
      )}
      {points.map((p) => (
        <Row key={p.id} label={POINT_META[p.type]?.label || "Point"} kind="Point"
          busy={busy === `p${p.id}`} onWithdraw={() => p.id && onWithdrawPoint(p.id)} />
      ))}
      {motions.map((m) => (
        <Row key={m.id} label={MOTION_META[m.type]?.label || "Motion"} kind="Motion"
          busy={busy === `m${m.id}`} onWithdraw={() => m.id && onWithdrawMotion(m.id)} />
      ))}
      {requests.map((r) => (
        <Row key={r.id} label={FLOOR_REQUEST_META[r.kind]?.label || r.kind} kind="Request"
          busy={busy === `r${r.id}`} onWithdraw={() => r.id && onWithdrawRequest(r.id)} />
      ))}
    </SubCard>
  );
}

function Row({
  label, kind, busy, onWithdraw,
}: { label: string; kind: string; busy: boolean; onWithdraw: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground/70 w-[52px] shrink-0">{kind}</span>
      <span className="flex-1 min-w-0 truncate text-[12px]">{label}</span>
      <button type="button" disabled={busy} onClick={onWithdraw} title="Withdraw"
        className="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-40">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
