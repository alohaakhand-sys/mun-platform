"use client";

/**
 * Delegate live-session console — the same Google-Meet-style, video-first layout as the
 * chair console, but with delegate-appropriate controls only.
 *
 * It renders entirely from the synced session doc (no committee roster — a delegate can only
 * read their own application), exactly like `SessionProjector`. What the delegate gets:
 *   • TopBar     — read-only identity, phase pill, present count. No host buttons.
 *   • VideoStage — the shared `LiveVideoRoom variant="stage"` as the primary surface; the
 *                  delegate joins as audience and only publishes camera/mic once the chair
 *                  gives them the floor (`session.live.stage`).
 *   • ControlBar — mic / cam / present (enabled only while they hold the floor), reactions,
 *                  layout, a Hand button (raise hand for the floor / request to speak / raise a
 *                  point) and Leave-just-me. No give-floor, no end-for-everyone.
 *   • LiveStrip  — a read-only "what's live now" bar (label + timer). No transport, no actions.
 *   • ToolPanel  — Now / Speakers / Voting / Points / My status (read-only + the delegate's own
 *                  raise-a-point and cast-a-vote actions).
 *
 * Appearance follows the chair console exactly: its own light/dark preference (light by default,
 * see `useLiveTheme.ts`), `consoleShellClass()` on the root, and a video stage that stays `.dark`
 * in both themes.
 */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  subscribeSession, subscribeMyPoints, subscribeMyHands, makeSessionId, eligibleVoterCount,
  timerRemainingMs, raiseHand, cancelHand, castBallot, requestVoteChange, FLOOR_REQUEST_META,
  type LiveSession, type ParticipationIdentity, type RaisedPoint,
  type FloorRequest, type FloorRequestKind, type Ballot, type MotionType,
} from "@/lib/services/sessionService";
import {
  RoundBtn, LauncherBtn, LayoutSwitcher, CloseBtn, ConsoleModal, ConsoleScaffold, EmptyState,
  PanelCard, PanelEmpty, FloorPill, FloorRing, PHASE_META, fmt, useIsWide,
} from "./console/shared";
import { ControlBarRow } from "./console/barMenu";
import {
  PhaseIcon, SpeakerHero, CaucusHero, VoteHero, VoteResultHero, CalmState,
} from "./projector/SessionHeroes";
import { DocumentHero } from "./projector/DocumentHero";
import { resolveFocal } from "./projector/focalState";
import { DelegatePointBar } from "./DelegatePointBar";
import { SessionHeadline } from "./SessionHeadline";
import { CaucusSignupBar } from "./CaucusSignupBar";
import { MotionFloorBar } from "./MotionFloorBar";
import { FloorCard } from "./FloorCard";
import { YieldMenuButton } from "./YieldMenu";
import { DisclosureGroup } from "./useExclusiveDisclosure";
import { useLiveTheme, consoleShellClass, type LiveTheme } from "./useLiveTheme";
import { LiveThemeToggle } from "./LiveThemeToggle";
import { DelegateChatDock } from "./chat/DelegateChatDock";
import { useChatDock } from "./chat/useChatDock";
import { useSessionChat } from "./chat/useSessionChat";
import { capabilitiesFor, floorHolder, type DelegateCapabilities } from "@/lib/services/floorGate";
import { MOTION_META } from "@/lib/services/motionMeta";
import { useGateClock } from "./useGateClock";
import { useMotionFloor } from "./useMotionFloor";
import type { MotionFloorStatus } from "@/lib/services/motionFloor";
import { ProposeMotionMenu, ProposeMotionForm } from "./ProposeMotionMenu";
import { DelegateDocsTool, DocComposer } from "./docs/DelegateDocsTool";
import type { CommitteeDocType } from "@/lib/services/committeeDocService";
import { EndorsementInbox } from "./docs/EndorsementInbox";
import { RecognizedPointCard } from "./RecognizedPointCard";
import { openDocReader } from "./docs/openDocReader";
import type { ProjectorViewer } from "./SessionProjector";
import type { StageControlApi } from "./video/LiveVideoRoom";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Radio, Mic, MicOff, Vote, Hand, ListChecks, LayoutGrid,
  Video, VideoOff, MonitorUp, PhoneOff, Loader2, ChevronRight,
  Check, X, Minus, CheckCircle2, HandMetal, Megaphone, RefreshCw,
  FileStack, BookOpen, MessageSquare,
} from "lucide-react";

// Browser-only (Agora SDK) — never prerender. The delegate's one Agora join backs the stage.
const LiveVideoRoom = dynamic(
  () => import("./video/LiveVideoRoom").then((m) => m.LiveVideoRoom),
  { ssr: false },
);

type SubTab = "now" | "speakers" | "voting" | "points" | "docs" | "status";
const TOOL_ORDER: SubTab[] = ["now", "speakers", "voting", "points", "docs", "status"];
const PANEL_META: Record<SubTab, { title: string; icon: React.ElementType; sub: string }> = {
  now: { title: "Now", icon: Radio, sub: "What's happening" },
  speakers: { title: "Speakers", icon: Mic, sub: "General Speakers List" },
  voting: { title: "Voting", icon: Vote, sub: "Live vote" },
  points: { title: "Points & Motions", icon: Hand, sub: "Raise a point or propose a motion" },
  docs: { title: "Documents", icon: FileStack, sub: "Draft resolutions & working papers" },
  status: { title: "My status", icon: ListChecks, sub: "Attendance" },
};

export function DelegateSessionConsole({
  eventId, committeeId, dateStr, viewer, committeeName, eventTitle = "", exitHref, agendas = [],
  userName = "",
}: {
  eventId: string;
  committeeId: string;
  dateStr: string;
  viewer: ProjectorViewer;
  committeeName: string;
  eventTitle?: string;
  exitHref: string;
  /** Display name stamped on the delegate's own chat messages, so the dais sees who wrote. */
  userName?: string;
  /**
   * The committee's agenda topics (`Committee.agendas[]`) — read-only here, purely the top bar's
   * fallback for sessions created before `session.agenda` shipped. Delegates never write an agenda.
   */
  agendas?: string[];
}) {
  const sessionId = useMemo(() => makeSessionId(committeeId, dateStr), [committeeId, dateStr]);
  const [session, setSession] = useState<LiveSession | null | undefined>(undefined);
  const [myPoints, setMyPoints] = useState<RaisedPoint[]>([]);
  const [myHands, setMyHands] = useState<FloorRequest[]>([]);
  const [panel, setPanel] = useState<null | "tools">(null);
  const [tool, setTool] = useState<SubTab | null>(null);
  // Focused quick-action modals launched from the video stage (independent of the right panel).
  const [modal, setModal] = useState<null | "point" | "motion" | "voting" | "doc">(null);
  const [docInitial, setDocInitial] = useState<{ type?: CommitteeDocType; title?: string; content?: string; sponsors?: string[]; signatories?: string[] } | undefined>(undefined);
  const onCompose = (initial?: { type?: CommitteeDocType; title?: string; content?: string; sponsors?: string[]; signatories?: string[] }) => {
    setDocInitial(initial);
    setModal("doc");
  };
  // Console appearance. Light by default; the video stage stays dark either way — see useLiveTheme.
  const [liveTheme, setLiveTheme] = useLiveTheme();

  const identity: ParticipationIdentity = useMemo(() => ({
    delegateId: viewer.delegateId, country: viewer.country, applicationId: viewer.applicationId,
    eventId, committeeId, dateStr,
  }), [viewer, eventId, committeeId, dateStr]);

  /**
   * Left chat dock — the delegate's private line to the dais. Mirrors the chair console exactly:
   * the desktop dock is persisted (default open), the mobile sheet is ephemeral and starts closed,
   * because below `lg` it replaces the video stage the way the tool panel already does.
   */
  const wide = useIsWide();
  const [chatDockOpen, setChatDockOpen] = useChatDock();
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const chatOpen = wide ? chatDockOpen : chatSheetOpen;
  const toggleChat = () => {
    if (wide) { setChatDockOpen(!chatDockOpen); return; }
    setChatSheetOpen((s) => { if (!s) { setPanel(null); setTool(null); } return !s; });
  };
  /**
   * Console-level so the unread badge counts while the dock is shut. One listener, filtered to this
   * delegate's own thread plus the announcement lane — the shape the `/chat` rule requires.
   */
  const chat = useSessionChat({
    eventId, sessionId, uid: viewer.delegateId, role: "delegate",
    enabled: !!viewer.delegateId && !!session,
  });

  const openTool = (id: SubTab) => { setPanel("tools"); setTool(id); setChatSheetOpen(false); };
  const closePanel = () => { setPanel(null); setTool(null); };
  const closeModal = () => setModal(null);

  useEffect(() => {
    if (!eventId || !committeeId || !dateStr) return;
    // Same clear-before-resubscribe as the chair console, for the same reason: until the new
    // snapshot lands `session` would still describe the previous (committee, date) while every
    // action below writes to the new `sessionId`. A delegate's committee rarely changes mid-mount,
    // but `capabilitiesFor` reads that stale doc — so a point or a ballot could be authorised by
    // one session's gate and written to another's.
    setSession(undefined);
    const unsub = subscribeSession(eventId, sessionId, setSession);
    return () => unsub();
  }, [eventId, committeeId, dateStr, sessionId]);

  useEffect(() => {
    if (!eventId || !sessionId || !viewer.delegateId || session === undefined || session === null) return;
    const a = subscribeMyPoints(eventId, sessionId, viewer.delegateId, setMyPoints);
    const b = subscribeMyHands(eventId, sessionId, viewer.delegateId, setMyHands);
    return () => { a(); b(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, sessionId, viewer.delegateId, session === undefined || session === null]);

  const pendingPoints = useMemo(() => myPoints.filter((p) => p.status === "pending").length, [myPoints]);
  // vote_change rides on the same `requests` collection but is NOT a raised hand — leaving it in
  // would inflate the Speakers badge and the on-video hand indicator.
  const pendingHands = useMemo(
    () => myHands.filter((h) => h.status === "pending" && h.kind !== "vote_change"),
    [myHands]
  );
  const myVoteChange = useMemo(
    () => myHands.find((h) => h.kind === "vote_change" && h.status === "pending"),
    [myHands]
  );
  // Is a motion in order right now? One derivation for the whole console — the propose buttons,
  // the chair's invite prompt, and (via its own `session` prop) the propose form all agree because
  // they all read the same pure function. Called above the early returns, as hooks must be.
  const motionFloor = useMotionFloor(session);

  /**
   * What this delegate may do right now — the ONE resolver, read once per snapshot and handed to
   * every surface that can act. The same function the chair's Gate Bar previews and the Floor Card
   * renders from, so all three agree by construction.
   *
   * It used to be called here only for `proposableMotionTypes`, with the rest of the result thrown
   * away — which is how the point tiles came to be raiseable through a locked floor while
   * `canRaisePoint` sat computed and unread beside them.
   *
   * Shares the FloorCard's ticker discipline: `useGateClock` only runs while a window is open, so
   * capabilities re-derive the moment the gate lapses rather than going stale until the next
   * snapshot. `null` before the session loads — the early returns below cover that.
   */
  const gateNow = useGateClock(session?.floorGate?.endsAt ?? null);
  const caps: DelegateCapabilities | null = useMemo(() => {
    if (!session) return null;
    return capabilitiesFor(session, viewer.delegateId, gateNow);
  }, [session, viewer.delegateId, gateNow]);

  /**
   * The motion types the chair's gate admits, or undefined on a pre-gate session (where the form
   * keeps its full list). Passed into every propose surface so the gate cannot leak — without it a
   * delegate under an "agenda motions only" gate would still be offered all ten types in the form.
   */
  const gateMotionTypes = session?.floorGate ? caps?.proposableMotionTypes : undefined;

  // ── Gate / loading states ──────────────────────────────────────────────────────
  if (!committeeId) {
    return (
      <ConsoleScaffold exitHref={exitHref} title={committeeName || "Live MUN"} subtitle={eventTitle}>
        <EmptyState icon={Radio} title="No committee assigned yet"
          body="You'll appear here once you're assigned to a committee." />
      </ConsoleScaffold>
    );
  }
  if (session === undefined) {
    return (
      <ConsoleScaffold exitHref={exitHref} title={committeeName} subtitle={eventTitle}>
        <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      </ConsoleScaffold>
    );
  }
  if (session === null) {
    return (
      <ConsoleScaffold exitHref={exitHref} title={committeeName} subtitle={eventTitle}>
        <div className="max-w-md mx-auto text-center py-16 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Radio className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-xl font-bold mb-1.5">No live session right now</h3>
          <p className="text-sm text-muted-foreground">
            Your committee is not in session yet. This opens the moment your chair starts one.
          </p>
        </div>
      </ConsoleScaffold>
    );
  }

  // Non-null past the early returns: `caps` is derived from `session`, which is narrowed by now.
  const gateCaps = caps as DelegateCapabilities;

  const present = eligibleVoterCount(session.attendance);
  // The same three conditions the `/chat` create rule enforces, so the composer is disabled with a
  // reason instead of firing a write that fails silently in the browser console.
  const onRoll = !!session.attendance?.[viewer.delegateId];
  const sittingOpen = !session.finalized && session.phase !== "closed";
  const chatDisabledReason = !onRoll
    ? "You're not on today's roll — ask the chair to mark you present."
    : !sittingOpen
      ? "This session is closed — the record is read-only."
      : undefined;
  const liveOn = {
    speakers: !!session.gsl?.activeSpeaker && !session.caucus && !session.activeVote,
    voting: !!session.activeVote,
  };

  return (
    <div className={cn(consoleShellClass(liveTheme), "flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden")}>
      <DelegateTopBar session={session} committeeName={committeeName} eventTitle={eventTitle}
        present={present} exitHref={exitHref} agendas={agendas}
        liveTheme={liveTheme} setLiveTheme={setLiveTheme}
        chatOpen={chatOpen} chatUnread={chat.unread} onToggleChat={toggleChat} />

      {/* ONE of two worlds, never both. A gated session gets the Floor Card (rendered as an
          overlay over the stage below — see the relative row), which answers "what can I do
          right now" in a single place. A session created before floorGate shipped keeps the
          pre-gate pair, so no committee mid-conference changes UI underneath its delegates. */}
      {!session.floorGate && (
        <>
          <CaucusSignupBar eventId={eventId} sessionId={sessionId} session={session}
            identity={identity} myHands={myHands} />

          {/* The chair's "any motions on the floor?" invitation. Mutually exclusive with the caucus
              placard above (it yields while that window is open), so the stack grows by at most one row. */}
          <MotionFloorBar eventId={eventId} sessionId={sessionId} session={session}
            identity={identity} status={motionFloor} onPropose={() => setModal("motion")} />
        </>
      )}

      {/* Time-critical: answer sponsor/signatory requests without backing out of the tool panel. */}
      <EndorsementInbox className="px-3 sm:px-4 pt-2 shrink-0 max-w-2xl w-full mx-auto" />

      {/* The other half of the point lifecycle: what the chair has recognized AGAINST the delegate
          currently speaking. Renders (and subscribes) only for the floor holder — see the file. */}
      <RecognizedPointCard
        eventId={eventId} sessionId={sessionId} session={session} delegateId={viewer.delegateId}
        className="px-3 sm:px-4 pt-2 shrink-0 max-w-2xl w-full mx-auto"
      />

      {/* Document on the floor — one-line banner so nobody has to dig for the text being debated. */}
      {session.publishedDoc && (
        <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2 bg-primary/10 border-b border-primary/20 shrink-0">
          <FileStack className="w-4 h-4 text-primary shrink-0" />
          <p className="text-[12.5px] min-w-0 truncate">
            <span className="font-bold uppercase tracking-wide text-[10.5px] text-primary mr-1.5">On the floor</span>
            <span className="font-semibold">{session.publishedDoc.title}</span>
          </p>
          <button type="button"
            onClick={() => session.publishedDoc && openDocReader(eventId, session.publishedDoc.docId)}
            className="ml-auto h-7 px-2.5 shrink-0 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Read
          </button>
        </div>
      )}

      {/* Outer row carries the chat dock; the INNER row keeps `relative`. The FloorCard overlay
          below clamps itself to its offset parent, so if the dock lived inside that same relative
          box the draggable card would gain the dock's width as travel and could park over the
          chat. */}
      <div className="flex flex-1 min-h-0">
        {/* Private line to the dais. Sibling BEFORE the stage, and outside `main.dark`, so it
            inherits the light `.live-console` palette rather than the stage's dark one. */}
        <DelegateChatDock
          eventId={eventId} sessionId={sessionId} chat={chat}
          viewer={{ delegateId: viewer.delegateId, country: viewer.country, name: userName }}
          canSend={onRoll && sittingOpen} disabledReason={chatDisabledReason}
          open={chatOpen} wide={wide} onToggle={toggleChat}
        />
      <div className="relative flex flex-1 min-h-0">
        {/* ALWAYS `dark` — the video stage stays dark in both themes. See useLiveTheme.ts. */}
        {/* `text-foreground` is NOT redundant next to `dark`. `.dark` re-declares the CSS variables,
            but `color` inherits as a COMPUTED value — in light theme the console root already
            resolved `var(--foreground)` to near-black ink, and everything in this subtree that does
            not set its own colour inherits that black onto a dark stage. Re-stating it here makes
            the token resolve against the dark palette at the top of the stage. */}
        {/* `py-3`, not `pt-3`: the live strip that used to sit under the video carried the bottom
            gap in its own `my-2.5`, and it now docks inside the speaker's tile. */}
        <main className={cn("dark text-foreground flex-1 flex-col min-w-0 px-3 py-3", (panel || chatSheetOpen) ? "hidden lg:flex" : "flex")}>
          <DelegateVideoStage
            session={session} eventId={eventId} committeeId={committeeId} dateStr={dateStr}
            viewer={viewer} identity={identity} pendingHands={pendingHands}
            pendingPoints={pendingPoints} sessionId={sessionId} panel={panel}
            voteActive={!!session.activeVote} motionFloor={motionFloor} caps={gateCaps}
            onOpenTools={() => (panel ? closePanel() : openTool("now"))}
            onOpenPoint={() => setModal("point")}
            onOpenMotion={() => setModal("motion")}
            onOpenVoting={() => setModal("voting")}
          />
        </main>

        {panel && (
          <DelegateToolPanel
            tool={tool} setTool={setTool} onClose={closePanel}
            liveOn={liveOn} pendingPoints={pendingPoints} pendingHands={pendingHands.length}
            session={session} eventId={eventId} sessionId={sessionId}
            viewer={viewer} identity={identity}
            myHands={myHands} myVoteChange={myVoteChange} present={present}
            agendas={agendas} gateMotionTypes={gateMotionTypes} caps={gateCaps}
            onCompose={() => setModal("doc")}
          />
        )}

        {/* Floats over the stage (or the tool panel, on mobile) instead of pushing it down — the
            row above stays full height so the video is never squeezed for this. Positioned at
            THIS level, not inside the stage's own `stageOverlay`, so it keeps showing when `main`
            is hidden for the mobile tool panel — the delegate must be able to act without first
            backing out of whatever they opened. `pointer-events-none` on the spacer keeps the
            empty margin beside the centred card from swallowing clicks meant for the video/panel
            underneath; the card opts back into `pointer-events-auto` for itself. It spans the WHOLE
            stage row (`bottom-0`), not just the strip the card occupies: the card is draggable and
            clamps itself to this element, so a content-height wrapper would pin it to its own top
            edge with nowhere to travel. */}
        {session.floorGate && (
          <div className="absolute top-2 inset-x-0 bottom-0 z-30 pointer-events-none">
            <DisclosureGroup>
              <FloorCard eventId={eventId} sessionId={sessionId} session={session}
                identity={identity} myHands={myHands}
                onProposeMotion={() => setModal("motion")}
                onRaisePoint={() => setModal("point")}
                onOpenVote={() => setModal("voting")} />
            </DisclosureGroup>
          </div>
        )}
      </div>
      </div>

      {modal === "point" && (
        <ConsoleModal title="Raise a Point" subtitle="Send the chair a point" icon={Hand} onClose={closeModal}>
          {/* `floorHolder`, not `gsl.activeSpeaker` — mid-caucus the latter is a stale leftover, so
              "direct a Point of Information to the current speaker" would name the wrong delegation
              (and target a country nobody is speaking for). */}
          <DelegatePointBar embedded eventId={eventId} sessionId={sessionId} identity={identity}
            session={session} caps={gateCaps}
            currentSpeakerCountry={floorHolder(session)?.country} />
        </ConsoleModal>
      )}
      {modal === "motion" && (
        <ConsoleModal title="Propose a Motion" subtitle="Move the committee to act" icon={Megaphone} onClose={closeModal}>
          <ProposeMotionForm eventId={eventId} sessionId={sessionId} identity={identity} session={session}
            committeeAgendas={agendas} allowedTypes={gateMotionTypes}
            onDone={closeModal} onWriteNew={() => setModal("doc")} />
        </ConsoleModal>
      )}
      {modal === "voting" && (
        <ConsoleModal title="Live Vote" subtitle="Cast your vote" icon={Vote} onClose={closeModal}>
          <VotingTool session={session} eventId={eventId} sessionId={sessionId} viewer={viewer}
            identity={identity} myVoteChange={myVoteChange} />
        </ConsoleModal>
      )}
      {modal === "doc" && (
        <ConsoleModal wide title="New Document" subtitle="Draft resolution / working paper" icon={FileStack} onClose={closeModal}>
          <DocComposer eventId={eventId} sessionId={sessionId} session={session}
            identity={identity} initialDoc={docInitial} onDone={closeModal} />
        </ConsoleModal>
      )}
    </div>
  );
}

// ── Read-only floor derivation (roster-free) ─────────────────────────────────────
interface ReadonlyFloor {
  spotlight: { uid?: string; flagCode?: string; hasFloor: boolean };
  hasTimer: boolean;
  running: boolean;
  timerText: string;
  timerPct: number;
  danger: boolean;
  liveLabel: string;
  onDeck: { code: string; country: string } | null;
  dotColor: string;
}

function useReadonlyFloor(session: LiveSession): ReadonlyFloor {
  const gsl = session.gsl;
  const caucus = session.caucus;
  const vote = session.activeVote;

  const activeTimer =
    vote ? null
    : caucus ? (caucus.kind === "moderated" ? caucus.speakerTimer : caucus.totalTimer)
    : gsl?.activeSpeaker ? gsl.timer
    : null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeTimer?.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [activeTimer?.running, activeTimer?.endsAt]);

  const remaining = activeTimer ? timerRemainingMs(activeTimer, now) : 0;
  const timerPct = activeTimer && activeTimer.durationMs > 0
    ? Math.max(0, Math.min(100, (remaining / activeTimer.durationMs) * 100)) : 0;
  const danger = !!activeTimer?.running && remaining < 10000;

  const stageUid = session.live?.stage?.[0];
  // `floorHolder`, not `gsl.activeSpeaker` — the chair console's spotlight has read it this way all
  // along, and reading the GSL slot directly named the last GSL speaker for a whole caucus.
  const activeSpeaker = floorHolder(session);
  const hasFloor = !!(activeSpeaker || stageUid);
  const spotDelegateId = activeSpeaker?.delegateId || stageUid;
  const spotCountry = activeSpeaker?.country
    || (stageUid ? session.attendance?.[stageUid]?.country : "") || "";
  const spotlight = { uid: spotDelegateId || undefined, flagCode: spotCountry || undefined, hasFloor };

  let tone: "emerald" | "primary" | "amber" | "muted" = "muted";
  let liveLabel = "Floor open";
  let onDeck: ReadonlyFloor["onDeck"] = null;
  if (vote) {
    tone = "amber";
    liveLabel = `Vote · ${vote.motion || "in progress"}`;
  } else if (caucus) {
    tone = "primary";
    liveLabel = (caucus.kind === "moderated" ? "Moderated caucus" : "Unmoderated caucus")
      + (caucus.topic ? ` · ${caucus.topic}` : "");
  } else if (activeSpeaker) {
    tone = "emerald";
    liveLabel = `Speaking · ${getCountryName(activeSpeaker.country) || activeSpeaker.country || "Delegate"}`;
    const nx = gsl?.queue?.[0];
    onDeck = nx ? { code: nx.country || "", country: getCountryName(nx.country) || nx.country || "Delegate" } : null;
  } else {
    // Chair gave the stage without opening a GSL speech — name the delegation anyway. The label is
    // the only identity the pill carries, and in spotlight the stage has no tile label to fall back
    // on (`SpotlightView` renders none), so dropping it left the floor holder anonymous.
    if (hasFloor && spotCountry) {
      tone = "emerald";
      liveLabel = `On the floor · ${getCountryName(spotCountry) || spotCountry}`;
    }
    const nx = gsl?.queue?.[0];
    if (nx) {
      if (!hasFloor) liveLabel = "Floor open — next up";
      onDeck = { code: nx.country || "", country: getCountryName(nx.country) || nx.country || "Delegate" };
    }
  }

  const dotColor = tone === "emerald" ? "bg-emerald-500"
    : tone === "amber" ? "bg-amber-500"
    : tone === "primary" ? "bg-primary" : "bg-muted-foreground/40";

  return {
    spotlight, hasTimer: !!activeTimer, running: !!activeTimer?.running,
    timerText: fmt(remaining), timerPct, danger, liveLabel, onDeck, dotColor,
  };
}

// ── Top bar (read-only) ──────────────────────────────────────────────────────────
function DelegateTopBar({
  session, committeeName, eventTitle, present, exitHref, agendas, liveTheme, setLiveTheme,
  chatOpen, chatUnread, onToggleChat,
}: {
  session: LiveSession; committeeName: string; eventTitle: string; present: number; exitHref: string;
  agendas: string[];
  liveTheme: LiveTheme; setLiveTheme: (t: LiveTheme) => void;
  chatOpen: boolean; chatUnread: number; onToggleChat: () => void;
}) {
  const phase = PHASE_META[session.phase];
  const PIcon = phase.icon;
  const suspended = session.phase === "suspended";
  const closed = session.phase === "closed";
  return (
    <header className="flex items-center gap-2.5 px-3 sm:px-4 h-[56px] bg-background border-b border-border/60 shrink-0 z-10">
      <a href={exitHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors shrink-0">
        <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Exit</span>
      </a>
      <div className="h-6 w-px bg-border/60 shrink-0" />
      {/* Chat toggle on the LEFT, the side the dock opens on. Below `lg` the collapsed dock renders
          nothing, so this is the only place the unread count can live. */}
      <button type="button" onClick={onToggleChat} aria-expanded={chatOpen}
        aria-label={chatOpen ? "Hide messages" : "Show messages"}
        className={cn(
          "relative h-9 px-2.5 shrink-0 rounded-lg inline-flex items-center gap-1.5 transition-colors",
          chatOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
        )}>
        <MessageSquare className="w-4 h-4" />
        <span className="hidden md:inline text-[13px] font-medium">Dais</span>
        {chatUnread > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums">
            {chatUnread > 99 ? "99+" : chatUnread}
          </span>
        )}
      </button>
      <div className="flex items-center gap-2.5 min-w-0 shrink">
        <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary/50 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
        </span>
        <div className="min-w-0">
          <p className="font-bold leading-tight truncate font-heading text-[15px] tracking-tight">{committeeName || "Committee"}</p>
          {eventTitle && <p className="text-[11px] text-muted-foreground leading-tight truncate">{eventTitle}</p>}
        </div>
      </div>
      <SessionHeadline session={session} agendas={agendas} className="flex-1 min-w-2" />
      <div className="flex items-center gap-2 shrink-0">
        <LiveThemeToggle theme={liveTheme} onChange={setLiveTheme} className="hidden sm:inline-flex" />
        <span className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider border",
          session.phase === "voting" ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
            : suspended ? "bg-orange-500/10 text-orange-600 border-orange-500/30"
            : closed ? "bg-muted text-muted-foreground border-border/60"
            : "bg-primary/10 text-primary border-primary/25"
        )}>
          <PIcon className="w-3 h-3" /> {phase.label}
        </span>
        <span className="hidden md:flex items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
          {present} present
        </span>
      </div>
    </header>
  );
}

// ── Video stage + overlays ───────────────────────────────────────────────────────
function DelegateVideoStage({
  session, eventId, committeeId, dateStr, viewer, identity, pendingHands,
  pendingPoints, sessionId, panel, voteActive, motionFloor, caps,
  onOpenTools, onOpenPoint, onOpenMotion, onOpenVoting,
}: {
  session: LiveSession; eventId: string; committeeId: string; dateStr: string;
  viewer: ProjectorViewer; identity: ParticipationIdentity;
  pendingHands: FloorRequest[]; pendingPoints: number; sessionId: string;
  panel: null | "tools"; voteActive: boolean; motionFloor: MotionFloorStatus;
  caps: DelegateCapabilities;
  onOpenTools: () => void;
  onOpenPoint: () => void; onOpenMotion: () => void; onOpenVoting: () => void;
}) {
  const floor = useReadonlyFloor(session);
  return (
    <LiveVideoRoom
      variant="stage"
      eventId={eventId}
      committeeId={committeeId}
      dateStr={dateStr}
      myUid={viewer.delegateId}
      myName="You"
      myCountry={viewer.country}
      amHost={false}
      canControl={false}
      roster={[]}
      spotlight={floor.spotlight}
      /* Docks into the floor-holder's own tile — `spotlight` above is what picks that tile, so no
         extra plumbing. `StageOverlays` floats the same component when that tile doesn't exist. */
      floorBar={<DelegateFloorStrip floor={floor} />}
      stageOverlay={(api) => (
        <DelegateStageOverlays
          api={api} floor={floor} motionFloor={motionFloor} caps={caps}
          eventId={eventId} sessionId={sessionId}
          session={session} identity={identity} pendingHands={pendingHands}
          pendingPoints={pendingPoints} panel={panel} voteActive={voteActive}
          onOpenTools={onOpenTools} onOpenPoint={onOpenPoint}
          onOpenMotion={onOpenMotion} onOpenVoting={onOpenVoting}
        />
      )}
    />
  );
}

function DelegateStageOverlays({
  api, floor, motionFloor, caps, eventId, sessionId, session, identity, pendingHands, pendingPoints, panel, voteActive,
  onOpenTools, onOpenPoint, onOpenMotion, onOpenVoting,
}: {
  api: StageControlApi; floor: ReadonlyFloor; motionFloor: MotionFloorStatus;
  caps: DelegateCapabilities;
  eventId: string; sessionId: string;
  /** Only for the yield button — it needs to know whether THIS delegate holds the floor. */
  session: LiveSession;
  identity: ParticipationIdentity; pendingHands: FloorRequest[];
  pendingPoints: number; panel: null | "tools"; voteActive: boolean; onOpenTools: () => void;
  onOpenPoint: () => void; onOpenMotion: () => void; onOpenVoting: () => void;
}) {
  const showControls = api.configured && api.active && !api.sessionEnded;
  return (
    <>
      {/* Speaker flag + country + timer folded into DelegateFloorStrip, which docks in the floor
          holder's own tile (was a separate top-left pill repeating the tile's identity label).

          THE FALLBACK, not a nicety: `floorBar` renders INSIDE that tile, so it renders nowhere at
          all when the speaker has no tile — grid layout with their camera off, or Agora down. The
          clock is the one thing a delegate cannot do without, so float the same pill on the stage
          root instead. Same coordinates; the two can never both be on screen. */}
      {floor.spotlight.hasFloor && !api.floorBarMounted && <DelegateFloorStrip floor={floor} />}

      {/* Top-right: spotlight subject mic-muted chip */}
      {floor.spotlight.hasFloor && api.floorSubjectSpotlighted && api.spotlightMicMuted && (
        <div className="absolute top-4 right-4 z-[2] w-8 h-8 rounded-full bg-black/50 flex items-center justify-center" title="Speaker muted">
          <MicOff className="w-4 h-4 text-red-300" />
        </div>
      )}

      {/* Speaker caption folded into DelegateFloorStrip's status label (was a separate bottom-left
          card naming the same country the pill above already named). */}

      {/* Camera/mic error toast */}
      {api.error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[3] flex items-center gap-1.5 rounded-lg bg-amber-500/90 text-black text-[11.5px] font-medium px-3 py-1.5 max-w-[80%]">
          <VideoOff className="w-3.5 h-3.5 shrink-0" /> {api.error}
        </div>
      )}

      {showControls ? (
        <DelegateControlBar api={api} eventId={eventId} sessionId={sessionId} session={session} identity={identity}
          pendingHands={pendingHands} pendingPoints={pendingPoints}
          voteActive={voteActive} motionFloor={motionFloor} caps={caps}
          onOpenPoint={onOpenPoint} onOpenMotion={onOpenMotion} onOpenVoting={onOpenVoting} />
      ) : !api.sessionEnded ? (
        // Video off / not joined / unconfigured — raising a hand, proposing, voting and yielding are
        // pure Firestore actions and must never depend on Agora being up. Surface them standalone.
        // The yield especially: the delegate holding the floor is the one most likely to be
        // fighting a dead camera, and it renders nothing unless they actually hold it.
        <ControlBarRow>
          {voteActive && (
            <RoundBtn title="Live vote — cast your vote" icon={Vote} onClick={onOpenVoting} blink />
          )}
          <ProposeMotionBtn floor={motionFloor} caps={caps} gated={!!session.floorGate}
            voteActive={voteActive} onClick={onOpenMotion} />
          <YieldMenuButton eventId={eventId} sessionId={sessionId} session={session}
            identity={identity} myHands={pendingHands} />
          <HandBtn pendingPoints={pendingPoints} caps={caps} onOpenPoint={onOpenPoint} />
        </ControlBarRow>
      ) : null}

      {/* Bottom-right corner launcher */}
      <div className="absolute right-4 bottom-6 z-[3] flex items-center gap-1">
        <LauncherBtn title="Committee tools" icon={LayoutGrid} onClick={onOpenTools}
          active={panel === "tools"} badge={pendingPoints} />
      </div>
    </>
  );
}

function DelegateControlBar({
  api, eventId, sessionId, session, identity, pendingHands, pendingPoints,
  voteActive, motionFloor, caps,
  onOpenPoint, onOpenMotion, onOpenVoting,
}: {
  api: StageControlApi; eventId: string; sessionId: string; session: LiveSession;
  identity: ParticipationIdentity;
  /** Still needed by the yield button — it reads this delegate's own pending `yield` request. */
  pendingHands: FloorRequest[];
  pendingPoints: number;
  voteActive: boolean; motionFloor: MotionFloorStatus;
  caps: DelegateCapabilities;
  onOpenPoint: () => void; onOpenMotion: () => void; onOpenVoting: () => void;
}) {
  return (
    // One menu at a time: Layout and Yield both open upward into the same band above the bar, and
    // each owning its own boolean is what let them stack on top of each other.
    <ControlBarRow>
      <RoundBtn title={api.micOn ? "Mute" : "Unmute"} icon={api.micOn ? Mic : MicOff}
        onClick={api.toggleMic} danger={!api.micOn} disabled={!api.publishing} />
      <RoundBtn title={api.camOn ? "Turn off camera" : "Turn on camera"} icon={api.camOn ? Video : VideoOff}
        onClick={api.toggleCam} danger={!api.camOn} disabled={!api.publishing || api.screenSharing} />
      {api.screenSupported && (
        <RoundBtn title={api.screenSharing ? "Stop presenting" : "Present now"} icon={MonitorUp}
          onClick={api.toggleScreenShare} active={api.screenSharing} disabled={!api.publishing} />
      )}

      {/* Voting quick-access — only while a vote is live; blinks to pull the eye. */}
      {voteActive && (
        <RoundBtn title="Live vote — cast your vote" icon={Vote} onClick={onOpenVoting} blink />
      )}
      {/* Propose a motion (replaces the old presentational Reactions button). */}
      <ProposeMotionBtn floor={motionFloor} caps={caps} gated={!!session.floorGate}
        voteActive={voteActive} onClick={onOpenMotion} />

      <LayoutSwitcher mode={api.layoutMode} onChange={api.setLayoutMode} />

      {/* Yield sits next to the hand: the two "my voice on the floor" controls together. Renders
          nothing unless this delegate actually holds the floor — see YieldMenuButton. */}
      <YieldMenuButton eventId={eventId} sessionId={sessionId} session={session}
        identity={identity} myHands={pendingHands} />

      <HandBtn pendingPoints={pendingPoints} caps={caps} onOpenPoint={onOpenPoint} />

      {/* Leave (just me — no end-for-everyone) */}
      <button type="button" onClick={api.leave} title="Leave call" aria-label="Leave call"
        className="ml-1 w-[62px] h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors">
        <PhoneOff className="w-5 h-5" />
      </button>
    </ControlBarRow>
  );
}

/** Human message for a failed floor/speak request — the common case is not being checked in yet. */
function requestErrorMessage(e: any): string {
  const s = `${e?.code || ""} ${e?.message || ""}`;
  if (s.includes("permission-denied") || s.includes("insufficient permissions"))
    return "Couldn't send — you may not be checked in yet. Ask the chair to start roll call.";
  return "Couldn't send your request. Check your connection and try again.";
}

/**
 * The propose-a-motion button, used by BOTH the control bar and the no-Agora fallback strip.
 *
 * WHY IT READS THE GATE AND NOT JUST `motionsInOrder`. That function is deliberately gate-blind
 * (see its header) — it answers "is the floor clear", which is only half the question on a gated
 * session. The half it cannot answer is "has the chair opened the floor for motions", and reading
 * only the clear-floor half got both directions wrong: a chair opening a caucus-motions gate
 * produced no signal at all, while a `locked` or `signup` gate left the button live, leading to a
 * form that then said "the chair has not opened the floor for any motion". `capabilitiesFor` is the
 * resolver that knows both, and it is the same one the Floor Card and firestore.rules mirror.
 *
 * THE ATTENTION LADDER, and it is one rung per state:
 *   `blink` — a ballot. Act now, there is a deadline. Owned by the vote button, never this one.
 *   `glow`  — the chair has opened the floor and this delegate may move. Advisory, soft.
 *   flat amber — a live legacy `motionInvite` on a pre-gate session. Unchanged.
 *   plain  — the floor is clear but nobody asked. Available, unremarkable.
 * Two pulses in one six-button bar cancel out, so the glow suppresses itself while a vote is open;
 * `motionsInOrder` already blocks motions during a vote, but the suppression is explicit because
 * the reason is about attention, not admissibility.
 *
 * `RoundBtn` spreads `title` onto both the native tooltip and `aria-label`, so the reason a motion
 * is out of order reaches sighted and screen-reader users with no extra markup. The button is only
 * ever disabled, never hidden — a delegate should be able to see WHY they can't move, and the full
 * sentence is one tap away in the Points & Motions tool.
 */
function ProposeMotionBtn({
  floor, caps, gated, voteActive, onClick,
}: {
  floor: MotionFloorStatus;
  caps: DelegateCapabilities;
  /** Pre-gate sessions keep the `motionsInOrder`-only behaviour, byte for byte. */
  gated: boolean;
  voteActive: boolean;
  onClick: () => void;
}) {
  if (!gated) {
    return (
      <RoundBtn
        title={floor.inOrder ? "Propose a motion" : floor.title}
        icon={Megaphone}
        onClick={onClick}
        disabled={!floor.inOrder}
        active={floor.inOrder && floor.code === "invited"}
        activeTone="amber"
      />
    );
  }

  const types = caps.proposableMotionTypes;
  const title = caps.canProposeMotion
    ? types.length === 1
      ? `Move to ${MOTION_META[types[0]].short.toLowerCase()}`
      : `Floor open for motions — ${types.map((t) => MOTION_META[t].short).join(" · ")}`
    // `floor.title` is the fallback only on the blocked variant of the union — an in-order floor
    // has no title, and reaching for one is what the type error caught.
    : caps.lockReason.canProposeMotion
      || (floor.inOrder ? "Motions are closed" : floor.title);

  return (
    <RoundBtn
      title={title}
      icon={Megaphone}
      onClick={onClick}
      disabled={!caps.canProposeMotion}
      glow={caps.canProposeMotion && !voteActive}
      activeTone="amber"
    />
  );
}

/**
 * The control-bar hand: ONE tap, straight to the point modal.
 *
 * WHY IT IS NOT A MENU ANY MORE. It used to open a three-item popover — "raise hand for the floor",
 * "request to speak", "raise a point…" — and the first two did not belong on it. Both are Speakers-
 * List business and both already live in the Speakers tool, where the delegate can see the list they
 * are asking to join and whether they are already on it; asking blind from a floating menu over the
 * video was the worse of the two placements. Raising a point is the opposite: it is the one delegate
 * act that is genuinely urgent, often mid-speech, and it was buried two taps deep behind the two
 * requests that were not. So the hand does the urgent thing directly, and the requests moved to the
 * panel that owns them.
 *
 * `pendingPoints`, not `pendingHands`, drives the amber state now — the button means one thing, so
 * its lit state has to mean that same thing. Disabled with the reason when the floor is shut to
 * points, matching every other point surface.
 */
function HandBtn({
  pendingPoints, caps, onOpenPoint,
}: {
  pendingPoints: number;
  caps: DelegateCapabilities;
  onOpenPoint: () => void;
}) {
  return (
    <RoundBtn
      title={caps.canRaisePoint
        ? pendingPoints > 0
          ? `Raise a point — ${pendingPoints} awaiting the chair`
          : "Raise a point"
        : caps.lockReason.canRaisePoint || "The chair has closed the floor to points."}
      icon={Hand}
      onClick={onOpenPoint}
      disabled={!caps.canRaisePoint}
      active={pendingPoints > 0}
      activeTone="amber"
    />
  );
}

/**
 * Floating floor clock for the floor-holder's tile — the delegate twin of the chair's `LiveStrip`,
 * on the same `FloorPill` + `FloorRing` atoms so the two consoles cannot drift apart.
 *
 * IT REPLACED A DOCKED BAR UNDER THE VIDEO. That bar was a `h-[52px]` row plus margins in a shell
 * that never scrolls, so it cost ~72px of stage on every screen to repeat three things the stage
 * already painted — the speaker's flag, their country, and the clock.
 *
 * READ-ONLY: no transport, no Next. A delegate cannot drive the clock, so the space the chair
 * spends on controls carries the two things the tile's own identity label cannot say — WHAT is
 * live (a GSL speech vs a moderated caucus vs a vote) and WHO is up next.
 */
function DelegateFloorStrip({ floor }: { floor: ReadonlyFloor }) {
  return (
    <FloorPill>
      <FloorRing pct={floor.hasTimer ? floor.timerPct : 0}
        text={floor.hasTimer ? floor.timerText : "0:00"} danger={floor.danger} />
      <span className={cn("w-2 h-2 rounded-full shrink-0 animate-blip", floor.dotColor)} />
      {/* `text-white`, not `text-foreground`: this rides on video, never on a console surface. */}
      <span className="text-[12.5px] font-semibold text-white truncate">{floor.liveLabel}</span>
      {floor.onDeck && (
        <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0 pl-2 ml-0.5 border-l border-white/15 text-[11.5px] text-white/70"
          title={`Up next · ${floor.onDeck.country}`}>
          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          {floor.onDeck.code && <CountryFlag code={floor.onDeck.code} size={14} />}
          <span className="font-medium text-white/90 truncate max-w-[92px]">{floor.onDeck.country}</span>
        </span>
      )}
    </FloorPill>
  );
}

// ── Right-side tool panel (drill-down) ───────────────────────────────────────────
function DelegateToolPanel({
  tool, setTool, onClose, liveOn, pendingPoints, pendingHands, session, eventId, sessionId,
  viewer, identity, myHands, myVoteChange, present, agendas, gateMotionTypes, caps, onCompose,
}: {
  tool: SubTab | null; setTool: (t: SubTab | null) => void; onClose: () => void;
  liveOn: { speakers: boolean; voting: boolean }; pendingPoints: number; pendingHands: number;
  session: LiveSession; eventId: string; sessionId: string;
  viewer: ProjectorViewer; identity: ParticipationIdentity;
  myHands: FloorRequest[]; myVoteChange?: FloorRequest; present: number;
  /** Committee agenda topics + the gate's admitted motion types, both forwarded to the propose form. */
  agendas: string[];
  gateMotionTypes?: MotionType[];
  caps: DelegateCapabilities;
  /** Open the document composer modal (owned by the console root). */
  onCompose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (tool) setTool(null); else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tool, setTool, onClose]);

  const meta = tool ? PANEL_META[tool] : null;
  const MetaIcon = meta?.icon;
  const headerTitle = tool ? meta!.title : "Committee tools";

  return (
    <aside role="dialog" aria-label={headerTitle}
      className="flex flex-col w-full lg:w-[404px] shrink-0 bg-card border-l border-border/60 min-h-0 animate-in slide-in-from-right-2 duration-200">
      {tool ? (
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border/60 shrink-0">
          <button type="button" onClick={() => setTool(null)} title="Back" aria-label="Back"
            className="w-9 h-9 rounded-lg bg-secondary/60 hover:bg-secondary text-foreground flex items-center justify-center shrink-0 transition-colors">
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>
          {MetaIcon && (
            <span className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <MetaIcon className="w-[18px] h-[18px]" />
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight truncate">{meta!.title}</div>
            <div className="text-[11.5px] text-muted-foreground leading-tight truncate">{meta!.sub}</div>
          </div>
          <div className="flex-1" />
          <CloseBtn onClick={onClose} />
        </div>
      ) : (
        <div className="flex items-center px-4 py-3.5 border-b border-border/60 shrink-0">
          <span className="text-[17px] font-bold">{headerTitle}</span>
          <div className="flex-1" />
          <CloseBtn onClick={onClose} />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-3.5">
        {!tool && (
          <DelegateToolList liveOn={liveOn} pendingPoints={pendingPoints} pendingHands={pendingHands}
            caps={caps} onOpen={setTool} />
        )}
        {tool && (
          <div key={tool} className="animate-in fade-in duration-200">
            {tool === "now" && <NowTool session={session} eventId={eventId} />}
            {tool === "speakers" && (
              <SpeakersTool session={session} eventId={eventId} sessionId={sessionId}
                identity={identity} myHands={myHands} />
            )}
            {tool === "voting" && (
              <VotingTool session={session} eventId={eventId} sessionId={sessionId} viewer={viewer}
                identity={identity} myVoteChange={myVoteChange} />
            )}
            {tool === "points" && (
              <div className="space-y-3">
                <DelegatePointBar eventId={eventId} sessionId={sessionId} identity={identity}
                  session={session} caps={caps}
                  currentSpeakerCountry={floorHolder(session)?.country} />
                {/* No `phase !== "closed"` wrapper any more — the form handles every out-of-order
                    state itself, and showing the reason (plus the delegate's own motion history
                    with the chair's notes) beats rendering nothing. */}
                <ProposeMotionMenu eventId={eventId} sessionId={sessionId} identity={identity} session={session}
                  committeeAgendas={agendas} allowedTypes={gateMotionTypes}
                  onWriteNew={onCompose} />
              </div>
            )}
            {tool === "docs" && (
              <DelegateDocsTool eventId={eventId} sessionId={sessionId} session={session}
                identity={identity} onCompose={onCompose} />
            )}
            {tool === "status" && <StatusTool session={session} viewer={viewer} present={present} />}
          </div>
        )}
      </div>
    </aside>
  );
}

function DelegateToolList({
  liveOn, pendingPoints, pendingHands, caps, onOpen,
}: {
  liveOn: { speakers: boolean; voting: boolean }; pendingPoints: number; pendingHands: number;
  /**
   * Only re-words the "Points & Motions" row's subtitle when the floor is shut to points.
   *
   * The row is NOT disabled, and that is on purpose: the panel behind it also hosts the propose-a-
   * motion form and the delegate's own history of points and motions with the chair's notes on them.
   * A closed floor to points is not a reason to lock a delegate out of reading why their last point
   * was dismissed. The tiles inside carry the block; this only stops the row promising an action it
   * cannot currently deliver.
   */
  caps: DelegateCapabilities;
  onOpen: (id: SubTab) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {TOOL_ORDER.map((id) => {
        const m = PANEL_META[id];
        const Icon = m.icon;
        const sub = id === "points" && !caps.canRaisePoint
          ? caps.lockReason.canRaisePoint || m.sub
          : m.sub;
        const live = (id === "speakers" && liveOn.speakers) || (id === "voting" && liveOn.voting);
        const badge = id === "points" && pendingPoints > 0 ? pendingPoints
          : id === "speakers" && pendingHands > 0 ? pendingHands : 0;
        return (
          <button key={id} type="button" onClick={() => onOpen(id)}
            className="flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl bg-secondary/40 border border-border/60 hover:bg-secondary/70 transition-colors">
            <span className="w-9 h-9 rounded-[10px] bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-[19px] h-[19px]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold leading-tight">{m.title}</span>
              <span className="block text-[11.5px] text-muted-foreground leading-tight">{sub}</span>
            </span>
            {/* A live vote gets the louder amber pulse — it needs an action, not just attention. */}
            {live && <span className={cn("w-2 h-2 rounded-full shrink-0",
              id === "voting" ? "bg-amber-500 text-amber-600 dark:text-amber-400 animate-vote-pulse" : "bg-emerald-500 animate-blip")} />}
            {badge > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{badge}</span>
            )}
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

// ── Delegate tools ───────────────────────────────────────────────────────────────
/** Speakers-list chips (shared by Now + Speakers tools). */
function SpeakersList({ session }: { session: LiveSession }) {
  const queue = session.gsl?.queue || [];
  if (queue.length === 0) return null;
  return (
    <PanelCard icon={ListChecks} title={<>Speakers List <span className="text-xs font-normal text-muted-foreground">· {queue.length}</span></>} bodyClassName="p-4 flex flex-wrap gap-2">
      {queue.map((s, i) => (
        <span key={`${s.delegateId}-${i}`}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium",
            i === 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary/20 border-border/40")}>
          <span className="tabular-nums opacity-60">{i + 1}.</span>
          {s.country && <CountryFlag code={s.country} size={16} />}
          {getCountryName(s.country) || s.country || "Delegate"}
        </span>
      ))}
    </PanelCard>
  );
}

/**
 * Phone-scale heroes, projector-scale precedence. The ladder lives in `resolveFocal` so this
 * screen and the room's screen can never disagree about what is happening; the components below
 * stay card-sized because a delegate is holding a 390px device, not sitting in front of a wall.
 */
function Focal({ session, eventId }: { session: LiveSession; eventId: string }) {
  const focal = resolveFocal(session);
  switch (focal.kind) {
    case "vote": return <VoteHero session={session} vote={focal.vote} />;
    case "result": return <VoteResultHero published={focal.published} />;
    case "doc": return <DocumentHero eventId={eventId} published={focal.published} />;
    case "caucus": return <CaucusHero caucus={focal.caucus} />;
    case "speaker": return <SpeakerHero session={session} />;
    // No attendance board on a phone — the delegate marks themself, they don't watch the room.
    default: return <CalmState phase={session.phase} />;
  }
}

function NowTool({ session, eventId }: { session: LiveSession; eventId: string }) {
  const queue = session.gsl?.queue || [];
  const onDeck = queue[0];
  const active = session.gsl?.activeSpeaker;
  return (
    <div className="space-y-4">
      <Focal session={session} eventId={eventId} />
      {!session.activeVote && !session.caucus && active && onDeck && (
        <div className="console-panel rounded-2xl px-5 py-3.5 flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Up Next</span>
          <div className="flex items-center gap-2 min-w-0">
            {onDeck.country && <CountryFlag code={onDeck.country} size={22} />}
            <span className="font-semibold truncate">{getCountryName(onDeck.country) || onDeck.country || "Delegate"}</span>
          </div>
        </div>
      )}
      <SpeakersList session={session} />
    </div>
  );
}

function SpeakersTool({
  session, eventId, sessionId, identity, myHands,
}: {
  session: LiveSession; eventId: string; sessionId: string;
  identity: ParticipationIdentity; myHands: FloorRequest[];
}) {
  const [busy, setBusy] = useState<FloorRequestKind | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pendingSpeak = myHands.find((h) => h.kind === "speak" && h.status === "pending");
  // "floor" = asking the chair for the camera and mic, which used to be the first row of the
  // control-bar hand menu. It belongs here beside the list it is about — see HandBtn.
  const pendingFloor = myHands.find((h) => h.kind === "floor" && h.status === "pending");
  const inQueue = (session.gsl?.queue || []).some((q) => q.delegateId === identity.delegateId)
    || session.gsl?.activeSpeaker?.delegateId === identity.delegateId;

  /** Toggle: raising twice withdraws, which is what the old menu's rows did. */
  const request = async (kind: FloorRequestKind, existing?: FloorRequest) => {
    if (busy) return;
    setBusy(kind);
    setErr(null);
    try {
      if (existing?.id) await cancelHand(eventId, sessionId, existing.id);
      else await raiseHand(eventId, sessionId, identity, kind);
    } catch (e) { console.error("floorRequest", e); setErr(requestErrorMessage(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      {session.gsl?.activeSpeaker && <SpeakerHero session={session} />}
      <SpeakersList session={session} />
      {(session.gsl?.queue?.length || 0) === 0 && !session.gsl?.activeSpeaker && (
        <p className="text-sm text-muted-foreground text-center py-4">The speakers list is empty.</p>
      )}
      {session.phase !== "closed" && (
        <div className="space-y-2">
          {inQueue ? (
            <p className="flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> You&apos;re on the speakers list.
            </p>
          ) : (
            <button type="button" onClick={() => request("speak", pendingSpeak)} disabled={!!busy}
              className={cn("w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50",
                pendingSpeak ? "border-amber-500/40 bg-amber-500/10 text-amber-600" : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15")}>
              {busy === "speak" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hand className="w-4 h-4" />}
              {pendingSpeak ? "Requested — tap to withdraw" : "Request to speak"}
            </button>
          )}
          {/* Secondary weight: a slot on the list is the request a delegate wants nine times out of
              ten, and asking for the camera without one is the exception (a granted floor with no
              GSL slot behind it — see motionFloor's `floor_granted`). */}
          <button type="button" onClick={() => request("floor", pendingFloor)} disabled={!!busy}
            className={cn("w-full h-9 inline-flex items-center justify-center gap-2 rounded-xl border text-[12.5px] font-semibold transition-colors disabled:opacity-50",
              pendingFloor ? "border-amber-500/40 bg-amber-500/10 text-amber-600" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/50")}>
            {busy === "floor" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HandMetal className="w-3.5 h-3.5" />}
            {pendingFloor ? "Asked for the floor — tap to withdraw" : FLOOR_REQUEST_META.floor.label}
          </button>
        </div>
      )}
      {err && <p className="text-[12px] font-medium text-red-600 dark:text-red-400 text-center">{err}</p>}
    </div>
  );
}

function VotingTool({
  session, eventId, sessionId, viewer, identity, myVoteChange,
}: {
  session: LiveSession; eventId: string; sessionId: string; viewer: ProjectorViewer;
  identity: ParticipationIdentity;
  /** This delegate's still-pending "change my vote" request, if any. */
  myVoteChange?: FloorRequest;
}) {
  const vote = session.activeVote;
  const [busy, setBusy] = useState<Ballot | null>(null);
  // Two-step commit: tapping a ballot arms it, a second tap confirms. A vote is final on the
  // first cast, so a mistap must not be able to spend it.
  const [pending, setPending] = useState<Ballot | null>(null);
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeErr, setChangeErr] = useState<string | null>(null);
  // Local tick so the buttons lock the instant the chair's deadline passes, without waiting
  // for the auto-close snapshot to land.
  const running = !!vote?.timer?.running;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running, vote?.timer?.endsAt]);

  if (!vote) {
    // Between votes the chair may be showing the room a published result — mirror it here.
    if (session.publishedResult) return <VoteResultHero published={session.publishedResult} />;
    return (
      <PanelCard icon={Vote} title="Voting">
        <PanelEmpty icon={Vote}>
          <span className="block font-semibold text-foreground">No vote in progress</span>
          When your chair opens a vote, it appears here.
        </PanelEmpty>
      </PanelCard>
    );
  }

  const att = session.attendance?.[viewer.delegateId];
  const eligible = att?.status === "present" || att?.status === "present_and_voting";
  const canCast = vote.mode === "roll_call" && session.phase === "voting" && eligible;
  const myBallot = vote.ballots?.[viewer.delegateId];
  const expired = running && timerRemainingMs(vote.timer, now) <= 0;
  // One delegate, one ballot — matched by the firestore rule, which refuses to overwrite a key
  // that already exists. To change it the delegate asks the chair to reopen their ballot.
  const locked = !!myBallot || expired;
  const changePending = myVoteChange?.voteId === vote.voteId;

  const toggleChangeRequest = async () => {
    if (changeBusy) return;
    setChangeBusy(true);
    setChangeErr(null);
    try {
      if (changePending && myVoteChange?.id) await cancelHand(eventId, sessionId, myVoteChange.id);
      else await requestVoteChange(eventId, sessionId, identity, vote.voteId);
    } catch (e) {
      console.error("vote change request", e);
      setChangeErr(requestErrorMessage(e));
    } finally { setChangeBusy(false); }
  };

  const cast = async (b: Ballot) => {
    if (busy || locked) return;
    setBusy(b);
    try { await castBallot(eventId, sessionId, viewer.delegateId, b); }
    catch (e) { console.error("castBallot", e); }
    finally { setBusy(null); setPending(null); }
  };

  const opts: { b: Ballot; label: string; icon: React.ElementType; cls: string; on: string }[] = [
    { b: "yes", label: "For", icon: Check, cls: "border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-600", on: "bg-emerald-500 text-white border-emerald-500" },
    { b: "no", label: "Against", icon: X, cls: "border-red-500/40 hover:bg-red-500/10 text-red-600", on: "bg-red-500 text-white border-red-500" },
    { b: "abstain", label: "Abstain", icon: Minus, cls: "border-border/60 hover:bg-secondary/60 text-muted-foreground", on: "bg-muted-foreground text-white border-muted-foreground" },
  ];
  const armed = pending ? opts.find((o) => o.b === pending) : null;

  return (
    <div className="space-y-4">
      <VoteHero session={session} vote={vote} />
      {canCast ? (
        <div className="console-panel rounded-2xl p-4">
          {armed && !locked ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600 mb-2">Confirm your vote</p>
              <p className="text-[13px] mb-3">
                Cast <b className="font-bold">{armed.label}</b> on “{vote.motion}”?
                <span className="block text-muted-foreground text-[12px] mt-0.5">This is final — you cannot change it afterwards.</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!!busy} onClick={() => setPending(null)}
                  className="h-12 rounded-xl border border-border/60 text-sm font-semibold text-muted-foreground hover:bg-secondary/60 transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button type="button" disabled={!!busy} onClick={() => cast(armed.b)}
                  className={cn("h-12 rounded-xl border text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50", armed.on)}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <armed.icon className="w-4 h-4" />}
                  Confirm {armed.label}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">Cast your vote</p>
              <div className="grid grid-cols-3 gap-2">
                {opts.map(({ b, label, icon: Icon, cls, on }) => {
                  const selected = myBallot === b;
                  return (
                    <button key={b} type="button" disabled={locked} onClick={() => setPending(b)}
                      className={cn("h-16 flex flex-col items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        selected ? on : cls)}>
                      <Icon className="w-5 h-5" />
                      {label}
                    </button>
                  );
                })}
              </div>
              {myBallot ? (
                <>
                  <p className="text-[11.5px] text-muted-foreground mt-2.5 text-center">
                    Your vote is recorded. To change it, ask the chair to reopen your ballot.
                  </p>
                  {/* Only while the vote is still open — once time is up the record is the record. */}
                  {!expired && (
                    <button type="button" disabled={changeBusy} onClick={toggleChangeRequest}
                      className={cn("mt-2.5 w-full h-11 rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
                        changePending
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-600"
                          : "border-border/60 text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}>
                      {changeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      {changePending ? "Requested — tap to withdraw" : "Request to change my vote"}
                    </button>
                  )}
                  {changeErr && <p className="text-[11.5px] text-red-600 dark:text-red-400 mt-1.5 text-center">{changeErr}</p>}
                </>
              ) : expired ? (
                <p className="text-[11.5px] text-amber-600 mt-2.5 text-center">
                  Time is up — voting has closed.
                </p>
              ) : changePending ? (
                <p className="text-[11.5px] text-emerald-600 mt-2.5 text-center">
                  The chair reopened your ballot — cast again.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : vote.mode !== "roll_call" ? (
        <p className="text-[12.5px] text-muted-foreground text-center">This is a placard vote — the chair records the count in the room.</p>
      ) : !eligible ? (
        <p className="text-[12.5px] text-muted-foreground text-center">You are not marked present to vote in this session.</p>
      ) : null}
    </div>
  );
}

function StatusTool({
  session, viewer, present,
}: {
  session: LiveSession; viewer: ProjectorViewer; present: number;
}) {
  const att = session.attendance?.[viewer.delegateId];
  const label: Record<string, string> = {
    present: "Present", present_and_voting: "Present & Voting", absent: "Absent", late: "Late",
  };
  const tone: Record<string, string> = {
    present: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    present_and_voting: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    late: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    absent: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30",
  };
  const status = att?.status || "absent";
  return (
    <div className="space-y-4">
      <div className="console-panel rounded-2xl p-5">
        <div className="flex items-center gap-3">
          {viewer.country
            ? <CountryFlag code={viewer.country} size={40} rounded />
            : <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">?</span>}
          <div className="min-w-0">
            <p className="font-bold leading-tight truncate">{getCountryName(viewer.country) || viewer.country || "Your delegation"}</p>
            <p className="text-[11.5px] text-muted-foreground">Your seat in {session.committeeId}</p>
          </div>
          <span className={cn("ml-auto px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border", tone[status])}>
            {label[status] || status}
          </span>
        </div>
      </div>
      <div className="console-panel rounded-2xl p-5 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Committee session</span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <PhaseIcon phase={session.phase} className="w-4 h-4 text-primary" /> {PHASE_META[session.phase].label}
        </span>
      </div>
      <div className="console-panel rounded-2xl p-5 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Delegates present</span>
        <span className="text-sm font-bold tabular-nums">{present}</span>
      </div>
    </div>
  );
}
