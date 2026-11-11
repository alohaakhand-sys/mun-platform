"use client";

/**
 * Chair-only live session console — a Google Meet–style, video-first layout.
 *
 * Everything reads from ONE synced session doc (so chair, co-chair and the projector stay in
 * lockstep). Nothing from the old rail + main + dock layout was dropped — it moved:
 *   • TopBar     — identity, phase pill, quorum, date, suspend / close / reopen / finalize
 *   • VideoStage — the LiveVideoRoom promoted from a floating PiP to the primary surface:
 *                  a spotlight (the on-floor delegate's camera, else a large country flag),
 *                  on-video overlays (flag + timer pill, mic-muted chip, caption) and the other
 *                  broadcasters as a small tile strip
 *   • ControlBar — Meet-style mic / cam / present / layout / more
 *                  (chair give-/clear-floor override) / leave, over the video
 *   • LiveStrip  — the old Live dock's header + timer transport + single contextual primary
 *                  action (Next speaker / Start first speaker / End caucus / Close & record),
 *                  condensed into a slim always-visible bar under the video
 *   • ToolPanel  — a right-side drill-down: Level 0 is the committee-tools list (+ quorum widget
 *                  + projector launcher); Level 1 renders the EXISTING procedure panel unchanged
 *                  (roll call / voting / speakers / caucus / points & motions / marking / report).
 *                  Chat and Host-controls launchers open the same panel.
 *
 * APPEARANCE. The console carries its own light/dark preference, independent of the app theme and
 * light by default — see `useLiveTheme.ts`. Its root gets `consoleShellClass()`, which adds the
 * `live-console` scope `globals.css` uses to deepen the light palette so panels have a desk to sit
 * on. The video stage inside is `.dark` in BOTH themes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ApplicationData } from "@/lib/services/applicationService";
import type { MarkingMode, MarkingTemplate } from "@/lib/services/eventService";
import {
  subscribeSession, ensureSession, makeSessionId, setPhase, suspendSession, resumeSession,
  subscribePoints, subscribeRequests,
  subscribeMotionQueue, syncSessionStaff,
  finalizeSession, reopenSession, eligibleVoterCount, keepAlive, setStage, endLiveCall,
  timerStart, timerPause, timerReset, timerRemainingMs, extendVoteTimer,
  nextSpeaker, nextCaucusSpeaker, endCaucus, finalizeVote, executeMotion, startModCaucus, closeEarlierSittings,
  setGslQueue, setCaucusQueue, enqueueSpeaker, chairYieldFloorToDelegate, resolvePoint, POINT_META,
  type LiveSession, type ParticipationIdentity, type DelegateRosterEntry, type TimerPath,
  type RaisedPoint, type TimerState, type SpeakerSlot, type FloorRequest, type Motion,
  type SessionStaffEntry,
} from "@/lib/services/sessionService";
import { floorHolder, floorSpeechClock, floorOccupancy } from "@/lib/services/floorGate";
import { getEventStaff, roleLabel } from "@/lib/services/staffService";
import { useVoteAutoClose } from "./useVoteAutoClose";
import { useCaucusAutoAdd } from "./useCaucusAutoAdd";
import { useGateClock } from "./useGateClock";
import { caucusListState } from "@/lib/services/caucusList";
import { useMotionMootnessSweep } from "./useMotionMootnessSweep";
import { LIVE_MOTION_STATUSES } from "@/lib/services/motionMootness";
import { getDailyMarkings, subscribeDailyMarkings, appendScoreEntry, type DailyMarkingBase, type Marking } from "@/lib/services/markingService";
import { clamp, MARK_MIN, MARK_MAX, computeDailyScore } from "@/lib/services/markingScore";
import { YieldPopover } from "./YieldPopover";
import { PointRequestInbox } from "./PointRequestInbox";
import { TYPE_ICON, TYPE_TONE } from "./PointsQueuePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/DateTimePicker";
import { CountryFlag } from "@/components/ui/CountryFlag";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ListChecks, Vote, Mic, MicOff, Users2, Hand, ClipboardList, FileText,
  Radio, Lock, Flag, Pause, Play, RotateCcw, Plus, SkipForward, Square, Gavel,
  Loader2, PauseCircle, PlayCircle, CheckCircle2, X, AlarmClock,
  Video, VideoOff, MonitorUp, MoreVertical, LayoutGrid, MessageSquare,
  ChevronRight, PhoneOff, Cast, HandMetal, UserSquare2, FileStack,
} from "lucide-react";
import {
  subscribeCommitteeDocs, type CommitteeDoc, type CommitteeDocType,
} from "@/lib/services/committeeDocService";

/** A draft handed to the proxy composer — the shape `DelegateDocsTool.onCompose` emits. */
type ProxyDocDraft = {
  type?: CommitteeDocType; title?: string; content?: string; sponsors?: string[]; signatories?: string[];
};
import { SessionDocsPanel } from "./docs/SessionDocsPanel";
import { RollCallPanel } from "./RollCallPanel";
import { GslPanel } from "./GslPanel";
import { ConsoleSpeakersPanel } from "./ConsoleSpeakersPanel";
import { CaucusPanel } from "./CaucusPanel";
import { CaucusSeatModal } from "./CaucusSeatModal";
import { GslSeatModal } from "./GslSeatModal";
import { RollCallSummaryModal } from "./RollCallSummaryModal";
import { MotionDeckModal } from "./MotionDeckModal";
import { ModCaucusStartModal } from "./ModCaucusStartModal";
import { VotingPanel, PublishResultModal } from "./VotingPanel";
import { PointsMotionsPanel } from "./PointsMotionsPanel";
import { RequestsPanel } from "./RequestsPanel";
import { YieldRequestInbox } from "./YieldRequestInbox";
import { RepresentPanel } from "./RepresentPanel";
import { MarkingPanel } from "./MarkingPanel";
import { QuickScoreDialog } from "./QuickScoreDialog";
import { LiveMarkStrip } from "./LiveMarkStrip";
import { DisclosureGroup } from "./useExclusiveDisclosure";
import { useLiveTheme, consoleShellClass, type LiveTheme } from "./useLiveTheme";
import { LiveThemeToggle } from "./LiveThemeToggle";
import { ChairChatDock } from "./chat/ChairChatDock";
import { useChatDock } from "./chat/useChatDock";
import { useSessionChat } from "./chat/useSessionChat";
import type { ChatRosterEntry } from "./chat/ChatInbox";
import { BinaryScoreSelect } from "./BinaryScoreSelect";
import { SessionReport } from "./SessionReport";
import type { StageControlApi, VideoRosterEntry, TilePointBadge, TileScoreChip } from "./video/LiveVideoRoom";
import {
  RoundBtn, LauncherBtn, LayoutSwitcher, StripIcon, CloseBtn, ConsoleScaffold, EmptyState,
  FloorPill, FloorRing, PHASE_META, fmt, useIsWide, ConsoleModal,
} from "./console/shared";
import { DocComposer } from "./docs/DelegateDocsTool";
import { ControlBarRow, useBarMenu, BarMenuPopover } from "./console/barMenu";
import { SessionHeadline } from "./SessionHeadline";
import { GateBar } from "./flow/GateBar";
import { useFlowBar, type BoundFlowState } from "./flow/useFlowBar";
import { useActionLatch } from "./flow/useActionLatch";
import type { FlowPanelId } from "./flow/flowModel";
import dynamic from "next/dynamic";

// Browser-only (Agora SDK) — never prerender. The one Agora join for the chair now backs the
// primary video stage instead of a floating dock.
const LiveVideoRoom = dynamic(
  () => import("./video/LiveVideoRoom").then((m) => m.LiveVideoRoom),
  { ssr: false },
);

// Defined in flow/flowModel so the pure Flow Bar model can name panels without importing this file.
type SubTab = FlowPanelId;

// Level-0 order in the Committee tools list (mirrors the reference mock).
const TOOL_ORDER: SubTab[] = ["rollcall", "voting", "gsl", "requests", "caucus", "motions", "docs", "marking", "report"];

const PANEL_META: Record<SubTab, { title: string; icon: React.ElementType; sub: string }> = {
  rollcall: { title: "Roll Call", icon: ListChecks, sub: "Establish quorum" },
  voting: { title: "Voting", icon: Vote, sub: "Motions & resolutions" },
  gsl: { title: "Speakers List", icon: Mic, sub: "General Speakers List" },
  requests: { title: "Requests", icon: HandMetal, sub: "Raised hands & speak requests" },
  caucus: { title: "Caucus", icon: Users2, sub: "Moderated & unmoderated" },
  motions: { title: "Points & Motions", icon: Hand, sub: "Live raises & motion log" },
  docs: { title: "Documents", icon: FileStack, sub: "Working papers & draft resolutions" },
  marking: { title: "Marking", icon: ClipboardList, sub: "Daily rubric scoring" },
  report: { title: "Report", icon: FileText, sub: "Participation summary" },
  represent: { title: "Represent", icon: UserSquare2, sub: "Act for a delegation (proxy)" },
};

export function ChairSessionConsole({
  eventId, committeeId, dateStr, onDateChange, delegates, canControl, canDais = false, userId,
  markingTemplates = [], markMode = "decimal", eventTitle = "", committeeName, exitHref,
  projectorHref, canActAsDelegate = false, userName = "", userRole = "", agendas = [],
}: {
  eventId: string;
  committeeId: string;
  dateStr: string;
  onDateChange: (d: string) => void;
  delegates: ApplicationData[];
  canControl: boolean;
  /**
   * May read and answer delegates' private chat. NARROWER than `canControl`, which also admits EB
   * directors/USGs: the `/chat` rule accepts exactly `canWriteMarking` (chair, vice-chair,
   * organizer, co-organizer, canMarkDelegates). Anyone outside that set would get a composer whose
   * every send is denied and an inbox listener that fails outright — rules do not filter queries.
   */
  canDais?: boolean;
  userId: string;
  markingTemplates?: MarkingTemplate[];
  markMode?: MarkingMode;
  eventTitle?: string;
  committeeName: string;
  exitHref: string;
  /** URL of the standalone projector route; opened in a popup window by "Open projector view". */
  projectorHref?: string;
  /** Vice-chair with delegate power — surfaces the "Represent" proxy tool. */
  canActAsDelegate?: boolean;
  /** Current user's display name — stamped as the proxy attribution on proxied artifacts. */
  userName?: string;
  /** Current user's staff role, already run through `roleLabel` (e.g. "Vice Chair"). */
  userRole?: string;
  /**
   * The committee's agenda topics (`Committee.agendas[]`). Seeds `session.agenda` on the first
   * `ensureSession` and is the Flow Bar's fallback on sessions created before agendas existed.
   */
  agendas?: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const sessionId = useMemo(() => makeSessionId(committeeId, dateStr), [committeeId, dateStr]);
  const [session, setSession] = useState<LiveSession | null | undefined>(undefined);
  const [points, setPoints] = useState<RaisedPoint[]>([]);
  const [requests, setRequests] = useState<FloorRequest[]>([]);
  const [motions, setMotions] = useState<Motion[]>([]);
  const [docs, setDocs] = useState<CommitteeDoc[]>([]);
  const [starting, setStarting] = useState(false);
  // Meet-style drill-down state (replaces the old `tab` + left rail). "chat" is gone — the dead
  // stub it named was replaced by the real left dock, which is its own surface.
  const [panel, setPanel] = useState<null | "tools" | "host">(null);
  const [tool, setTool] = useState<SubTab | null>(null);
  const [popupHint, setPopupHint] = useState(false);
  const [speechToScore, setSpeechToScore] = useState<SpeakerSlot | null>(null);
  const [quickMarkUid, setQuickMarkUid] = useState<string | null>(null);
  /** Vice-chair proxy composer — which delegation's paper is being written, and from what draft. */
  const [proxyDoc, setProxyDoc] = useState<{ delegateId: string; initialDoc?: ProxyDocDraft } | null>(null);
  const [yieldUid, setYieldUid] = useState<string | null>(null);
  // Seat dialog. BOTH latches hold the CAUCUS ID they apply to, never a bare boolean. `seatDismissed`
  // because "Ask again" mints a fresh caucusId and a boolean would swallow the re-raise;
  // `seatForced` (the chair closing the window early) because a boolean left standing would pop the
  // dialog open the instant the NEXT caucus starts collecting.
  const [seatDismissed, setSeatDismissed] = useState<string | null>(null);
  const [seatForced, setSeatForced] = useState<string | null>(null);
  const [gslSeatDismissed, setGslSeatDismissed] = useState<string | null>(null);
  const [gslSeatForced, setGslSeatForced] = useState<string | null>(null);
  // Roll-call summary. Holds the `completedAt` it dismissed, never a boolean — for the same reason
  // the seat latches hold a caucusId: retaking the roll mints a fresh timestamp and must re-raise.
  const [rollCallSeen, setRollCallSeen] = useState<number | null>(null);
  // Motion deck. Holds the WINDOW it dismissed (the gate's `endsAt`), same reasoning again: the
  // chair reopening the floor mints a new deadline, and that window's motions must raise afresh.
  const [motionDeckSeen, setMotionDeckSeen] = useState<number | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  // Console appearance. Light by default; the video stage stays dark either way — see useLiveTheme.
  const [liveTheme, setLiveTheme] = useLiveTheme();
  // Today's marking docs, for the on-tile score chips + the quick-mark dialog's full-rubric
  // seed values. A LIVE listener, like the matrix in MarkingPanel and the chair page — a
  // one-shot read left the chips showing the pre-mark value: the refetch was kicked off from
  // LiveMarkStrip BEFORE its append had even been issued, so it raced its own write and won.
  // Marks written from another tab or by a co-chair never reached the chips at all.
  const [dailyMarkings, setDailyMarkings] = useState<Marking[]>([]);
  const [liveMarks, setLiveMarks] = useState<Record<string, Record<string, number>>>({});
  // Right rail is revealed by default on wide screens; the chair can hide it. Auto-open runs once so
  // closing it isn't undone on the next render, and never fires on mobile (it would hide the stage).
  const wideForPanel = useIsWide();
  const didAutoOpenPanel = useRef(false);
  useEffect(() => {
    if (wideForPanel && !didAutoOpenPanel.current) {
      didAutoOpenPanel.current = true;
      setPanel((cur) => cur ?? "tools");
    }
  }, [wideForPanel]);
  /**
   * Left chat dock. TWO open-states, one toggle: the desktop dock is persisted (default open — it
   * is meant to be present, not discovered), the mobile sheet is ephemeral and starts closed.
   * Persisting the mobile value would hide the video stage on every phone load, which is the same
   * trap `didAutoOpenPanel` above guards against for the right rail.
   */
  const [chatDockOpen, setChatDockOpen] = useChatDock();
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const chatOpen = wideForPanel ? chatDockOpen : chatSheetOpen;
  const toggleChat = () => {
    if (wideForPanel) { setChatDockOpen(!chatDockOpen); return; }
    // Below lg the dock, the tool panel and the stage all want the full width — only one may win.
    setChatSheetOpen((s) => { if (!s) { setPanel(null); setTool(null); } return !s; });
  };
  /**
   * Mounted at the console level, NOT inside the dock: a badge that only counts while the panel is
   * open is not a badge. Gated on `canDais` (not `canControl`) because the inbox listen is
   * unfiltered and rules do not filter queries — for anyone else it would fail outright.
   */
  const chat = useSessionChat({
    eventId, sessionId, uid: userId, role: "dais", enabled: canDais && !!session,
  });
  const chatRoster: ChatRosterEntry[] = useMemo(
    () => delegates
      .filter((d) => d.userId)
      .map((d) => ({ uid: d.userId, country: d.assignedCountry || "", name: d.applicantName || "" })),
    [delegates]
  );
  const pendingPoints = useMemo(() => points.filter((p) => p.status === "pending").length, [points]);
  // caucus_signup answers live in the Caucus tool's speakers list, so they must not inflate
  // the Requests badge — a whole committee answering would read as 30 unhandled requests.
  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending" && r.kind !== "caucus_signup").length,
    [requests]
  );
  // Yes-answers awaiting the chair on the CURRENT caucus — badges the Caucus tool instead.
  const caucusId = session?.caucus?.kind === "moderated" ? session.caucus.caucusId : null;
  // The signup window's own clock. `useGateClock` freezes once the deadline passes, so the rising
  // edge is captured and no interval outlives it.
  const signupEndsAt = session?.caucus?.signupEndsAt ?? null;
  const signupNow = useGateClock(signupEndsAt);
  const collectingSignups = caucusListState(session?.caucus) === "collecting";
  // Derived, NOT a useEffect edge: a chair who reloads after the window lapsed — or a co-chair who
  // opens the console late — still gets the dialog, because it is a function of the document rather
  // than of having witnessed the transition.
  const showSeatModal = !!session && canControl && collectingSignups
    && (seatForced === caucusId || (signupEndsAt != null && signupNow >= signupEndsAt))
    && seatDismissed !== caucusId;

  const gslGate = session?.floorGate?.kind === "signup" && session?.floorGate?.signupFor === "gsl"
    ? session.floorGate
    : null;
  const gslSignupId = gslGate?.signupId ?? null;
  const gslSignupEndsAt = gslGate?.endsAt ?? null;
  const gslSignupNow = useGateClock(gslSignupEndsAt);
  const showGslSeatModal = !!session && canControl && gslGate != null
    && gslSignupId != null
    && (gslSeatForced === gslSignupId || (gslSignupEndsAt != null && gslSignupNow >= gslSignupEndsAt))
    && gslSeatDismissed !== gslSignupId;
  // Same shape, same reasoning: `completeRollCall` stamps the timestamp, the snapshot delivers it,
  // and this raises off the document. So it lands after the write actually committed, it reaches
  // the co-chair, and it survives a reload mid-ruling.
  const rollCallCompletedAt = session?.rollCall?.completedAt ?? null;
  const showRollCallSummary = !!session && canControl
    && rollCallCompletedAt != null && rollCallSeen !== rollCallCompletedAt;

  /**
   * The motions window running out — the beat where the chair has to rule on what came in.
   *
   * KEYED ON THE GATE'S `endsAt`, which is both the trigger and the window's identity: one deadline,
   * one deck, one dismissal. The gate object keeps `kind: "motions"` after it lapses (expiry is
   * derived by `capabilitiesFor`, never written), so this survives a reload.
   *
   * `useGateClock` supplies the only edge nothing writes: the deadline passing. It stops its
   * interval the moment it does. The `pendingMotions` half of the condition is derived further
   * down, where the count is in scope.
   */
  const motionGateEndsAt = session?.floorGate?.kind === "motions"
    ? session.floorGate.endsAt ?? null
    : null;
  const motionGateNow = useGateClock(motionGateEndsAt);
  /**
   * Lapsed AND nothing else owns the floor.
   *
   * The occupancy half is not belt-and-braces. `openVote` does not rewrite `floorGate` — it sets
   * `activeVote` and lets `capabilitiesFor` override the effective kind — so the stored gate still
   * reads `kind: "motions"` with a dead deadline all the way through the vote it started. Without
   * this the deck would sit on top of the ballot the chair is running. The precedence list is the
   * same one `adviseGate` rows 0–4 walk: closed, suspended, a vote, its unpublished result, a
   * caucus, somebody on the mic.
   */
  const motionWindowLapsed = !!session
    && motionGateEndsAt != null && motionGateNow >= motionGateEndsAt
    && !session.finalized && session.phase !== "closed" && session.phase !== "suspended"
    && !session.activeVote && !session.pendingPublish && !session.caucus
    && !floorOccupancy(session);
  const pendingCaucusSignups = useMemo(
    () => !caucusId ? 0 : requests.filter(
      (r) => r.status === "pending" && r.kind === "caucus_signup"
        && r.caucusId === caucusId && r.answer === "yes"
    ).length,
    [requests, caucusId]
  );
  // Motions still on the floor. Uses the SHARED live set, not a hand-rolled pair: this badge used
  // to count only `pending || passed`, so a `recognized` motion — the exact state the reported
  // stuck-motion bug left them in — was invisible from the tab while the panel's own header counted
  // it. Two numbers for one list is how a stale motion goes unnoticed for six hours.
  const pendingMotions = useMemo(
    () => motions.filter((m) => LIVE_MOTION_STATUSES.has(m.status)).length,
    [motions]
  );
  const motionsGate = session?.floorGate?.kind === "motions" ? session.floorGate : null;
  const motionsGateId = motionsGate ? `${motionsGate.signupId || motionsGate.endsAt || "open"}` : null;
  const [motionDeckClosedGateId, setMotionDeckClosedGateId] = useState<string | null>(null);
  const [motionDeckDismissed, setMotionDeckDismissed] = useState<string | null>(null);
  const [modCaucusMotionToStart, setModCaucusMotionToStart] = useState<Motion | null>(null);
  const prevMotionsGateIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevMotionsGateIdRef.current;
    prevMotionsGateIdRef.current = motionsGateId;
    if (prev && !motionsGateId && pendingMotions > 0) {
      setMotionDeckClosedGateId(prev);
    }
  }, [motionsGateId, pendingMotions]);

  const motionGateExpired = !!motionsGate && motionGateEndsAt != null && motionGateNow >= motionGateEndsAt;

  // The other half of the motion-deck condition (see `motionWindowLapsed` above). An empty deck is
  // not a moment — the window closed and nobody moved anything — and the deck stops on its own once
  // the chair has ruled on the last one, because this goes to zero.
  const showMotionDeck = !!session && canControl && pendingMotions > 0
    && !session.finalized && session.phase !== "closed" && session.phase !== "suspended"
    && !session.activeVote && !session.pendingPublish && !session.caucus
    && !floorOccupancy(session)
    && (
      motionGateExpired ||
      (motionWindowLapsed && motionDeckSeen !== motionGateEndsAt) ||
      (motionDeckClosedGateId != null && motionDeckDismissed !== motionDeckClosedGateId)
    );
  // Committee docs (working papers / draft resolutions) awaiting the chair's review. A paper still
  // `collecting-endorsements` is deliberately NOT counted — its sponsor list is not settled, so
  // there is nothing to rule on yet. Same predicate as SessionDocsPanel's `awaiting` group.
  const pendingDocs = useMemo(() => docs.filter((d) => d.status === "submitted").length, [docs]);

  const openTool = (id: SubTab) => { setPanel("tools"); setTool(id); };
  // Projector now opens in a real popup window (falls back to a hint if the browser blocks it).
  const openProjector = () => {
    const w = projectorHref
      ? window.open(projectorHref, "mun-projector", "popup,width=1440,height=900")
      : null;
    if (!w) {
      setPopupHint(true);
      setTimeout(() => setPopupHint(false), 6000);
    }
  };
  const togglePanel = (p: "tools" | "host") => { setPanel((cur) => (cur === p ? null : p)); setTool(null); setChatSheetOpen(false); };
  const closePanel = () => { setPanel(null); setTool(null); };

  const roster: DelegateRosterEntry[] = useMemo(
    () => delegates.map((d) => ({
      delegateId: d.userId, country: d.assignedCountry || "", applicationId: d.id || "",
    })).filter((r) => r.delegateId),
    [delegates]
  );
  const identityFor = useMemo(() => {
    return (delegateId: string): ParticipationIdentity => {
      const d = delegates.find((x) => x.userId === delegateId);
      return {
        delegateId, country: d?.assignedCountry || "", applicationId: d?.id || "",
        eventId, committeeId, dateStr,
      };
    };
  }, [delegates, eventId, committeeId, dateStr]);

  // The delegation the proxy composer is writing for. Its NAME matters: `submittedByName` is what
  // every downstream surface shows as the author, and the signed-in profile is the vice-chair's.
  const proxyDocApp = proxyDoc ? delegates.find((d) => d.userId === proxyDoc.delegateId) : undefined;
  const proxyDocCountry = proxyDocApp?.assignedCountry || "";
  const proxyDocName = proxyDocApp?.applicantName || "Delegate";

  // A GSL speech just ended — prompt the chair to score it (only if there are criteria).
  const onSpeechComplete = (slot: SpeakerSlot | null | undefined) => {
    if (!canControl || !slot?.delegateId || markingTemplates.length === 0) return;
    setSpeechToScore(slot);
  };

  // Roster for the live-video tiles + the chair's "give the floor" picker.
  const videoRoster: VideoRosterEntry[] = useMemo(
    () => delegates
      .filter((d) => d.userId)
      .map((d) => ({ uid: d.userId, name: d.applicantName || "Delegate", country: d.assignedCountry || undefined })),
    [delegates]
  );

  useEffect(() => {
    if (!eventId || !committeeId || !dateStr) return;
    /**
     * CLEAR BEFORE RESUBSCRIBING. `sessionId` changes whenever the chair switches committee
     * (`?committee=`) or the date moves, and until the new snapshot lands `session` still holds the
     * PREVIOUS session's document — while every consumer below pairs it with the NEW `sessionId`.
     * That window is not cosmetic: it is a doc-id mismatch, so a write derived from the old session
     * lands on the new one. It surfaced as `syncSessionStaff` failing "No document to update" (the
     * old doc existed, the new one had not been started yet), and the same window is reachable by
     * `useVoteAutoClose`, `useCaucusAutoAdd` and the mootness sweep — which would have closed a
     * vote, seated speakers or dropped motions against the wrong committee. `undefined` is the
     * console's loading state, so the UI simply waits instead of showing another room's session.
     */
    setSession(undefined);
    const unsub = subscribeSession(eventId, sessionId, setSession);
    return () => unsub();
  }, [eventId, committeeId, dateStr, sessionId]);

  useEffect(
    () => subscribeDailyMarkings(eventId, committeeId, dateStr, setDailyMarkings),
    [eventId, committeeId, dateStr],
  );

  useEffect(() => {
    if (!eventId || !sessionId || session === undefined || session === null) return;
    const a = subscribePoints(eventId, sessionId, setPoints);
    const b = subscribeRequests(eventId, sessionId, setRequests);
    const c = subscribeMotionQueue(eventId, sessionId, setMotions);
    const d = subscribeCommitteeDocs(eventId, committeeId, setDocs);
    return () => { a(); b(); c(); d(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, sessionId, session === undefined || session === null]);

  // A vote closes itself when its countdown expires. Mounted HERE, at the console's top level,
  // rather than inside useFloorController — that hook only runs inside VideoStage, so the vote
  // would never auto-close while a tool panel was open on a narrow screen.
  useVoteAutoClose({ session, eventId, sessionId, canControl, identityFor });

  // A delegate's "yes" to the caucus prompt flows straight into the speaking order — same
  // top-level mount rationale as the vote auto-close, and it reuses this console's live
  // `requests` subscription rather than opening its own. Only once the list has been SEATED,
  // though: while the window is collecting, the order belongs to the seat dialog below.
  useCaucusAutoAdd({ session, requests, eventId, sessionId, canControl, userId });

  // Motions the committee has already answered take themselves off the floor. Same top-level mount
  // rationale, and it reuses the subscriptions above rather than opening its own. `executeMotion`
  // already fells what its OWN execution superseded; this is the half that catches mootness created
  // by direct chair actions (adopting the agenda, starting a caucus, rejecting a paper).
  useMotionMootnessSweep({
    session, motions, docs, eventId, committeeId, dateStr,
    committeeAgendas: agendas, canControl, userId,
  });

  // Mirror the committee's staff onto the session doc so DELEGATES can name the staff tiles in
  // the video room — they can't read the staff collection itself. Chair-tier clients only.
  useEffect(() => {
    // `session.id === sessionId` — identity, not mere existence. `!session?.id` passed for ANY
    // loaded session, including the one belonging to the committee the chair just navigated away
    // from, and this effect writes to `sessionId`. Belt to the clear-on-resubscribe braces above:
    // a stale read must never be able to author a write to a different document.
    if (!canControl || !eventId || !sessionId || session?.id !== sessionId) return;
    let cancelled = false;
    getEventStaff(eventId).then((all) => {
      if (cancelled) return;
      const next: Record<string, SessionStaffEntry> = {};
      for (const s of all) {
        // committeeId == null = event-wide oversight (USG, co-organizer) — they join any room.
        if (!s.uid || s.inviteStatus !== "accepted") continue;
        if (s.committeeId && s.committeeId !== committeeId) continue;
        next[s.uid] = { uid: s.uid, name: s.name || "", role: s.role };
      }
      // Skip a no-op write — otherwise every chair mount touches the hot session doc.
      if (JSON.stringify(next) === JSON.stringify(session.staff || {})) return;
      syncSessionStaff(eventId, sessionId, Object.values(next)).catch((e) => console.error("syncSessionStaff", e));
    }).catch((e) => console.error("getEventStaff", e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canControl, eventId, committeeId, sessionId, session?.id]);

  // Deep-link from a clickable toast: ?focus=<tool> jumps straight to that panel, then the
  // param is stripped so a later identical toast (same tool) re-navigates and re-fires.
  useEffect(() => {
    const f = searchParams.get("focus");
    if (f && TOOL_ORDER.includes(f as SubTab)) {
      openTool(f as SubTab);
      const committee = searchParams.get("committee");
      router.replace(committee ? `${pathname}?committee=${encodeURIComponent(committee)}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleStart = async () => {
    if (!canControl) return;
    setStarting(true);
    try {
      await ensureSession(eventId, committeeId, dateStr, userId, roster, 90, agendas);
      await setPhase(eventId, sessionId, "roll_call");
      // Yesterday's sitting the chair never closed would otherwise sit in Live Control as
      // "running" (and keep its stage) until the nightly sweep.
      void closeEarlierSittings(eventId, committeeId, dateStr);
    } catch (e) {
      console.error("start session", e);
    } finally {
      setStarting(false);
    }
  };

  // Finalize is shared by the top bar and the Host-controls panel.
  const handleFinalize = async () => {
    if (!canControl || !session) return;
    if (!confirm("Finalize today's session? This writes a marking record for every delegate so they can see their result. Your scores are preserved.")) return;
    setFinalizing(true);
    try {
      const existing = await getDailyMarkings(eventId, session.committeeId, dateStr);
      const rows = delegates.filter((d) => d.userId).map((d) => {
        const m = existing.find((x) => x.delegateId === d.userId);
        return {
          delegateId: d.userId, applicationId: d.id || "",
          scores: m?.scores || {}, feedback: m?.feedback || "",
          // The day's roll call, carried onto the marking record — the scoring math
          // needs it to tell an absence apart from a delegate the chair never scored.
          attendanceStatus: session.attendance?.[d.userId]?.status,
        };
      });
      await finalizeSession(eventId, session.committeeId, dateStr, userId, rows, markMode);
    } catch (e) {
      console.error("finalize", e);
    } finally {
      setFinalizing(false);
    }
  };

  // ── Gate / loading states ──────────────────────────────────────────────────────
  if (!committeeId) {
    return (
      <ConsoleScaffold exitHref={exitHref} title={committeeName} subtitle={eventTitle}>
        <EmptyState icon={Radio} title="No committee assigned"
          body="You need an assigned committee to run a live session." />
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
          <h3 className="text-xl font-bold mb-1.5">No live session for this day</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Start a session to run roll call, the speakers list, caucuses and voting — synced live to
            your co-chairs and the projector.
          </p>
          <div className="flex items-center justify-center gap-3">
            <DateField value={dateStr} onChange={onDateChange} displayFormat="dd/MM/yyyy" className="w-auto" />
            {canControl ? (
              <Button onClick={handleStart} disabled={starting} className="gap-2">
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                Start session
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">Waiting for the chair to start…</span>
            )}
          </div>
        </div>
      </ConsoleScaffold>
    );
  }

  const present = eligibleVoterCount(session.attendance);
  const quorum = session.quorumThreshold || 0;
  const quorumMet = present >= quorum;
  const quorumPct = quorum > 0 ? Math.min(100, (present / quorum) * 100) : 0;
  const liveOn = {
    gsl: !!session.gsl?.activeSpeaker && !session.caucus && !session.activeVote,
    caucus: !!session.caucus,
    voting: !!session.activeVote,
  };

  // ── On-stage tile affordances: derived from the SAME state the tool panels already read ──
  //
  // `floorHolder`, NOT `gsl.activeSpeaker`. A moderated caucus speaks from `caucus.currentSpeaker`
  // while the GSL slot sits stale on the document, so reading the GSL directly meant the in-tile
  // marking strip and every yield affordance went dark for the whole caucus (or worse, scored the
  // previous GSL speaker). `useFloorController` below spotlights the same slot — one derivation,
  // read by both, so they cannot drift apart again.
  const gsl = session.gsl;
  const holder = floorHolder(session);
  const inModCaucus = session.caucus?.kind === "moderated";
  const stageUids = session.live?.stage || [];
  const activeSpeakerUid = holder?.delegateId;
  const canYieldActive = !!holder && !holder.viaYield;
  // The tile's "add to speakers list" toggle must edit the list that is actually running —
  // otherwise a chair mid-caucus silently reorders the GSL they cannot see.
  const activeQueue = (inModCaucus ? session.caucus?.queue : gsl?.queue) || [];
  const queuedUids = activeQueue.map((q) => q.delegateId);

  const scoreByUid: Record<string, TileScoreChip> = {};
  for (const row of dailyMarkings) {
    if (!row.delegateId) continue;
    const daily = computeDailyScore(row, markingTemplates, markMode);
    if (!daily.present || daily.pct == null) continue;
    // ROUNDED. `computeDailyScore` returns the raw mean, and the live strip's append-only
    // model makes that mean fractional almost every time — an unrounded chip read
    // "30.555555555555557%" on the speaker's tile.
    const pct = Math.round(daily.pct);
    scoreByUid[row.delegateId] = { label: `${pct}%`, tone: pct >= 60 ? "emerald" : pct < 30 ? "red" : "muted" };
  }

  const pendingPointsSorted = [...points].filter((p) => p.status === "pending").sort((a, b) => {
    const pa = POINT_META[a.type].priority, pb = POINT_META[b.type].priority;
    if (pa !== pb) return pa - pb;
    return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  });
  const pointByUid: Record<string, TilePointBadge> = {};
  for (const p of pendingPointsSorted) {
    if (!pointByUid[p.delegateId]) pointByUid[p.delegateId] = { icon: TYPE_ICON[p.type], tone: TYPE_TONE[p.type] };
  }

  const yieldTargets = holder
    ? delegates.filter((d) => d.userId && d.userId !== holder.delegateId)
        .map((d) => ({ uid: d.userId as string, country: d.assignedCountry || "", name: d.applicantName }))
    : [];

  const quickMarkRow = quickMarkUid ? dailyMarkings.find((m) => m.delegateId === quickMarkUid) || null : null;

  // Give / clear the floor from any tile — the exact same `setStage` the "More ▸ Give the
  // floor" picker already calls; independent of the GSL queue/timer below.
  const handleGiveFloor = (uid: string) => {
    setStage(eventId, sessionId, stageUids.includes(uid) ? [] : [uid]);
  };
  // Add/remove a tile from whichever speakers list is running — same calls `ConsoleSpeakersPanel`
  // and `CaucusSpeakersList` make. `activeQueue` above picks the list; both writers take the whole
  // array, like `setGslQueue`/`setCaucusQueue` everywhere else.
  const handleToggleQueue = (uid: string) => {
    if (!inModCaucus && !gsl) return;
    const setQueue = inModCaucus ? setCaucusQueue : setGslQueue;
    if (activeQueue.some((q) => q.delegateId === uid)) {
      setQueue(eventId, sessionId, activeQueue.filter((q) => q.delegateId !== uid));
    } else {
      const d = delegates.find((x) => x.userId === uid);
      if (!d || !d.userId) return;
      enqueueSpeaker(
        eventId, sessionId,
        [{ delegateId: d.userId, country: d.assignedCountry || "", applicationId: d.id || "", yieldTo: "none" }],
        inModCaucus ? "caucus" : "gsl",
      );
    }
  };
  // Yield to a specific delegate. The credit / log / transfer trio lives in
  // `chairYieldFloorToDelegate` — it used to be re-typed here and in `ConsoleSpeakersPanel`, and
  // the two copies had already drifted. That function also picks the GSL vs caucus transaction.
  const handleYieldToDelegate = async (targetUid: string) => {
    if (!holder) return;
    const t = delegates.find((d) => d.userId === targetUid);
    if (!t || !t.userId) return;
    const slot: SpeakerSlot = { delegateId: t.userId, country: t.assignedCountry || "", applicationId: t.id || "" };
    const res = await chairYieldFloorToDelegate(
      eventId, sessionId, session, slot, identityFor(holder.delegateId),
    );
    if (res.ok && res.finishing) onSpeechComplete(res.finishing);
  };
  return (
    <div className={cn(consoleShellClass(liveTheme), "flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden")}>
      <TopBar
        session={session} eventId={eventId} sessionId={sessionId} committeeName={committeeName}
        eventTitle={eventTitle} dateStr={dateStr} onDateChange={onDateChange} canControl={canControl}
        present={present} quorum={quorum} quorumMet={quorumMet} exitHref={exitHref}
        onFinalize={handleFinalize} finalizing={finalizing} agendas={agendas}
        liveTheme={liveTheme} setLiveTheme={setLiveTheme}
        showChat={canDais} chatOpen={chatOpen} chatUnread={chat.unread} onToggleChat={toggleChat}
      />

      {/* Time-critical: a yield has the speech clock running on it, so the chair must be able to
          answer without backing out of whatever tool they are in. Sits in the shell — inside the
          console's token scope, OUTSIDE `main.dark` — so it reads in both live themes, and it
          costs zero height until a yield is actually pending. Mirrors the delegate console's
          EndorsementInbox row. */}
      <YieldRequestInbox
        eventId={eventId} sessionId={sessionId} session={session}
        requests={requests} canControl={canControl} userId={userId}
        onAccepted={onSpeechComplete}
      />

      <PointRequestInbox
        eventId={eventId} sessionId={sessionId}
        points={pendingPointsSorted} canControl={canControl} userId={userId}
        identityFor={identityFor}
        nameFor={(uid) => delegates.find((d) => d.userId === uid)?.applicantName}
      />

      <div className="flex flex-1 min-h-0">
        {/* Private delegate notes. Sibling BEFORE <main>, and that placement is load-bearing:
            `main` carries `.dark` in BOTH themes, so anything inside it inherits the dark palette.
            Out here the dock picks up the light `.live-console` tokens the console root declared. */}
        {canDais && (
          <ChairChatDock
            eventId={eventId} sessionId={sessionId} chat={chat} roster={chatRoster}
            userId={userId} userName={userName}
            open={chatOpen} wide={wideForPanel} onToggle={toggleChat}
          />
        )}
        {/* Stage column (hidden under lg while the panel is a full-width sheet).
            ALWAYS `dark`, in both themes — video reads against dark, and the stage chrome is built
            from literal white/black rather than tokens. See useLiveTheme.ts. */}
        {/* `text-foreground` alongside `dark` on purpose — see the same line in
            DelegateSessionConsole: `color` inherits computed, so the light root's black ink would
            otherwise leak into this dark subtree and land on anything without its own colour. */}
        <main className={cn("dark text-foreground flex-1 flex-col min-w-0 px-3 pt-3", (panel || chatSheetOpen) ? "hidden lg:flex" : "flex")}>
          <VideoStage
            session={session} eventId={eventId} sessionId={sessionId} committeeId={committeeId}
            dateStr={dateStr} userId={userId} canControl={canControl} delegates={delegates}
            identityFor={identityFor} videoRoster={videoRoster} pendingPoints={pendingPoints + pendingRequests + pendingMotions}
            panel={panel} onOpenTools={() => togglePanel("tools")}
            onOpenHost={() => togglePanel("host")} onGoSpeakers={() => openTool("gsl")}
            onSpeechComplete={onSpeechComplete}
            onQuickMark={canControl && markingTemplates.length > 0 ? setQuickMarkUid : undefined}
            onGiveFloor={canControl ? handleGiveFloor : undefined}
            onToggleQueue={canControl ? handleToggleQueue : undefined}
            onYield={canControl ? setYieldUid : undefined}
            stageUids={stageUids} activeSpeakerUid={activeSpeakerUid} canYieldActive={canYieldActive}
            queuedUids={queuedUids} pointByUid={pointByUid} scoreByUid={scoreByUid}
            myName={userName} myRole={userRole}
            motions={motions} requests={requests} agendas={agendas} onOpenTool={openTool}
            markingTemplates={markingTemplates} markMode={markMode}
            onReviewGslSignups={() => { setGslSeatDismissed(null); setGslSeatForced(gslSignupId); }}
            onReviewCaucusSignups={() => { setSeatDismissed(null); setSeatForced(caucusId); }}
            onLiveMark={(tId, val) => {
              if (activeSpeakerUid) {
                setLiveMarks((prev) => ({
                  ...prev,
                  [activeSpeakerUid]: {
                    ...(prev[activeSpeakerUid] || {}),
                    [tId]: val,
                  },
                }));
              }
            }}
          />
        </main>

        {panel && (
          <ToolPanel
            panel={panel} tool={tool} setTool={setTool} onClose={closePanel}
            liveOn={liveOn} pendingPoints={pendingPoints} pendingRequests={pendingRequests} pendingMotions={pendingMotions}
            pendingDocs={pendingDocs} docs={docs}
            present={present} quorum={quorum} quorumPct={quorumPct} quorumMet={quorumMet}
            onOpenProjector={openProjector}
            session={session} eventId={eventId} sessionId={sessionId} committeeId={committeeId}
            dateStr={dateStr} delegates={delegates} canControl={canControl} identityFor={identityFor}
            userId={userId} markingTemplates={markingTemplates} markMode={markMode} eventTitle={eventTitle}
            onSpeechComplete={onSpeechComplete} onFinalize={handleFinalize} finalizing={finalizing}
            canActAsDelegate={canActAsDelegate} userName={userName} agendas={agendas}
            points={points} requests={requests} motions={motions}
            onProxyCompose={(delegateId, initialDoc) => setProxyDoc({ delegateId, initialDoc })}
            onReviewSignups={() => { setSeatDismissed(null); setSeatForced(caucusId); }}
          />
        )}
      </div>

      {popupHint && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-background border border-border/60 px-4 py-2.5 shadow-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          <Cast className="w-4 h-4 text-primary shrink-0" />
          Allow pop-ups for this site to open the projector window.
          <button type="button" onClick={() => setPopupHint(false)} className="ml-1 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {speechToScore && (
        <SpeechScorer
          slot={speechToScore}
          templates={markingTemplates}
          markMode={markMode}
          base={{ ...identityFor(speechToScore.delegateId), gradedBy: userId, markMode }}
          existingMarking={dailyMarkings.find((m) => m.delegateId === speechToScore.delegateId)}
          liveMarks={liveMarks[speechToScore.delegateId]}
          onClose={() => setSpeechToScore(null)}
        />
      )}

      {quickMarkUid && (
        <QuickScoreDialog
          base={{ ...identityFor(quickMarkUid), gradedBy: userId, markMode }}
          templates={markingTemplates}
          markMode={markMode}
          country={identityFor(quickMarkUid).country}
          name={delegates.find((d) => d.userId === quickMarkUid)?.applicantName}
          initial={quickMarkRow}
          onClose={() => setQuickMarkUid(null)}
        />
      )}

      {yieldUid && (
        <YieldPopover
          eventId={eventId} sessionId={sessionId} session={session}
          activeCountry={holder ? (getCountryName(holder.country) || holder.country) : undefined}
          timerText={fmt(timerRemainingMs(floorSpeechClock(session).timer))}
          targets={yieldTargets}
          onYieldToDelegate={handleYieldToDelegate}
          onClose={() => setYieldUid(null)}
        />
      )}

      {/* The placard moment. Raises itself when the signup window lapses — DERIVED from state, not
          fired on an edge, so a chair who reloads (or arrives late) still gets it on mount. */}
      {showSeatModal && (
        <CaucusSeatModal
          eventId={eventId} sessionId={sessionId} session={session}
          requests={requests} userId={userId}
          onClose={() => {
            setSeatDismissed(caucusId);
            setSeatForced(null);
          }}
        />
      )}

      {showGslSeatModal && (
        <GslSeatModal
          eventId={eventId} sessionId={sessionId} session={session}
          requests={requests} userId={userId}
          onClose={() => {
            setGslSeatDismissed(gslSignupId);
            setGslSeatForced(null);
          }}
        />
      )}

      {/* The motion window is up. Same derived-not-edge-fired shape again — the rail's Motions tool
          keeps everything this shows, so dismissing it loses nothing. */}
      {showMotionDeck && (
        <MotionDeckModal
          eventId={eventId} sessionId={sessionId} session={session}
          delegates={delegates} canControl={canControl} identityFor={identityFor}
          userId={userId} agendas={agendas} count={pendingMotions}
          onStartModCaucus={(m) => setModCaucusMotionToStart(m)}
          onClose={() => {
            if (motionGateEndsAt) setMotionDeckSeen(motionGateEndsAt);
            if (motionDeckClosedGateId) setMotionDeckDismissed(motionDeckClosedGateId);
          }}
        />
      )}

      {/* Moderated Caucus execute modal */}
      {modCaucusMotionToStart && (
        <ModCaucusStartModal
          eventId={eventId}
          sessionId={sessionId}
          session={session}
          userId={userId}
          motion={modCaucusMotionToStart}
          onClose={() => setModCaucusMotionToStart(null)}
          onStarted={async (windowSecs) => {
            if (modCaucusMotionToStart) {
              const p = modCaucusMotionToStart.params || {};
              await startModCaucus(
                eventId,
                sessionId,
                p.topic || "Moderated Caucus",
                p.totalDurationSecs || 600,
                p.perSpeakerSecs || 45,
                windowSecs,
                userId
              );
              if (modCaucusMotionToStart.id) {
                await updateDoc(doc(db, "events", eventId, "sessions", sessionId, "motionQueue", modCaucusMotionToStart.id), {
                  status: "executed",
                  resolvedAt: serverTimestamp(),
                  resolvedBy: userId,
                });
              }
            }
          }}
        />
      )}

      {/* The roll is taken. Same derived-not-edge-fired shape as the seat modal above. */}
      {showRollCallSummary && (
        <RollCallSummaryModal
          session={session}
          motions={motions}
          onClose={() => setRollCallSeen(rollCallCompletedAt)}
        />
      )}

      {/* Voting result ready to publish modal */}
      {canControl && !!session?.pendingPublish && (
        <PublishResultModal
          eventId={eventId}
          sessionId={sessionId}
          session={session}
          userId={userId}
        />
      )}

      {/* Proxy document composer. Mounted HERE rather than inside the Represent panel: the tool
          rail animates in with a transform, and a transformed ancestor becomes the containing block
          for ConsoleModal's `fixed` root — the dialog would be trapped in a 404px column. */}
      {proxyDoc && session && (
        <ConsoleModal wide title="New Document" icon={FileStack} onClose={() => setProxyDoc(null)}
          subtitle={`On behalf of ${getCountryName(proxyDocCountry) || proxyDocCountry || "a delegation"}`}>
          <DocComposer
            eventId={eventId} sessionId={sessionId} session={session}
            identity={identityFor(proxyDoc.delegateId)}
            initialDoc={proxyDoc.initialDoc}
            proxy={{ by: userId, byName: userName }}
            authorName={proxyDocName}
            onDone={() => setProxyDoc(null)}
          />
        </ConsoleModal>
      )}

      {/* Idle auto-shutdown: warns after 2 min with no floor activity, ends the session if the
          chair doesn't respond within 15s. Chair consoles only. */}
      {canControl && (
        <IdleGuard
          session={session}
          onExtend={() => keepAlive(eventId, sessionId)}
          onAutoClose={() => setPhase(eventId, sessionId, "closed")}
        />
      )}
    </div>
  );
}

// ── Floor controller ───────────────────────────────────────────────────────────────
// The single source of "what's live now": the active timer, the contextual primary action,
// the spotlight subject + caption, and the guard()-wrapped handlers (lifted verbatim from the
// old Live dock so a double-click can't race two transactions on the session doc).
type FloorTone = "emerald" | "primary" | "amber" | "muted";

interface FloorState {
  busy: boolean;
  tone: FloorTone;
  dotColor: string;
  liveLabel: string;
  spotlight: { uid?: string; flagCode?: string; hasFloor: boolean };
  caption: { country: string; org: string } | null;
  hasTimer: boolean;
  running: boolean;
  timerText: string;
  timerPct: number;
  danger: boolean;
  onDeck: { code: string; country: string } | null;
  primary: {
    label: string; shortLabel: string; icon: React.ElementType;
    onClick: () => void; variant: "primary" | "outline"; disabled?: boolean;
  } | null;
  timerCtl: { start: () => void; pause: () => void; reset: () => void; adjust: (delta: number) => void } | null;
}

function useFloorController({
  session, eventId, sessionId, canControl, identityFor, delegates, onSpeechComplete, onGoSpeakers, onReviewSignups,
}: {
  session: LiveSession; eventId: string; sessionId: string; canControl: boolean;
  identityFor: (id: string) => ParticipationIdentity; delegates: ApplicationData[];
  onSpeechComplete: (slot: SpeakerSlot) => void; onGoSpeakers: () => void;
  onReviewSignups?: () => void;
}): FloorState {
  const gsl = session.gsl;
  const caucus = session.caucus;
  const vote = session.activeVote;

  // In-flight latch — one primary action at a time (a lost race self-heals via the snapshot).
  // Lives in flow/useActionLatch so the Flow Bar's non-delegated actions use the same discipline.
  const { busy, guard } = useActionLatch("floor action");

  // NO participation bump here. `nextSpeaker` / `nextCaucusSpeaker` / `endCaucus` /
  // `clearActiveSpeaker` credit the outgoing speaker inside their own transaction, so credit
  // no longer depends on which button the chair happened to press. Bumping here too would
  // double-count every speech.
  const handleNext = guard(async () => {
    const finishing = gsl?.activeSpeaker || null;
    await nextSpeaker(eventId, sessionId);
    if (finishing) onSpeechComplete(finishing);
  });
  const handleEndCaucus = guard(async () => {
    // Read the speaker before ending — the service credits them, this just opens the scorer.
    const speaking = caucus?.kind === "moderated" ? caucus.currentSpeaker : null;
    await endCaucus(eventId, sessionId);
    if (speaking) onSpeechComplete(speaking);
  });

  const handleNextCaucus = guard(async () => {
    const speaking = caucus?.kind === "moderated" ? caucus.currentSpeaker : null;
    await nextCaucusSpeaker(eventId, sessionId);
    // A caucus speech is a speech: open the same post-speech scorer `handleNext` opens. Its
    // absence here was the other half of the caucus marking gap — the chair could neither score
    // during the speech nor be prompted after it.
    if (speaking) onSpeechComplete(speaking);
  });
  // finalizeVote also credits participation and reconciles the motion behind the vote (manual
  // gate — the chair still taps Execute on a passed motion from the Motions panel).
  const handleCloseVote = guard(async () => {
    if (!vote) return;
    await finalizeVote(eventId, sessionId, vote.voteId, identityFor);
  });

  // Active timer resolution mirrors the projector / panels: the GSL timer only exists once a
  // speaker holds the floor. A vote carries its own countdown (absent on "No limit" votes).
  const activeTimer: { path: TimerPath; timer: TimerState; resetMs: number } | null =
    vote?.timer ? { path: "activeVote.timer", timer: vote.timer, resetMs: vote.timer.durationMs }
    : vote ? null
    : caucus ? (caucus.kind === "moderated"
        ? { path: "caucus.speakerTimer", timer: caucus.speakerTimer, resetMs: caucus.perSpeakerSecs * 1000 }
        : { path: "caucus.totalTimer", timer: caucus.totalTimer, resetMs: caucus.totalDurationSecs * 1000 })
    : gsl?.activeSpeaker
      ? { path: "gsl.timer", timer: gsl.timer,
          // A yield recipient's clock is base + what was handed over, and that total lives on
          // `durationMs`. Resetting to the plain default would confiscate the transferred time
          // with no way to give it back. Ordinary speakers keep reading the default, so a chair
          // who edits the speech length mid-speech still sees Reset pick up the new value.
          resetMs: gsl.activeSpeaker.viaYield
            ? (gsl.timer?.durationMs || (gsl.defaultSpeakerSecs || 90) * 1000)
            : (gsl.defaultSpeakerSecs || 90) * 1000 }
      : null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeTimer?.timer.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [activeTimer?.timer.running, activeTimer?.timer.endsAt]);

  const remaining = activeTimer ? timerRemainingMs(activeTimer.timer, now) : 0;
  const timerPct = activeTimer && activeTimer.timer.durationMs > 0
    ? Math.max(0, Math.min(100, (remaining / activeTimer.timer.durationMs) * 100)) : 0;
  const danger = !!activeTimer?.timer.running && remaining < 10000;

  const timerCtl = activeTimer && canControl ? {
    start: () => timerStart(eventId, sessionId, activeTimer.path, remaining > 0 ? remaining : activeTimer.timer.durationMs),
    pause: () => timerPause(eventId, sessionId, activeTimer.path, remaining),
    reset: () => timerReset(eventId, sessionId, activeTimer.path, activeTimer.resetMs),
    adjust: (delta: number) => {
      // A vote's clock uses extendVoteTimer so durationMs moves with the deadline — otherwise
      // adding time would push the progress bar past 100%.
      if (activeTimer.path === "activeVote.timer") { extendVoteTimer(eventId, sessionId, delta); return; }
      const rem = Math.max(0, remaining + delta);
      if (activeTimer.timer.running) timerStart(eventId, sessionId, activeTimer.path, rem);
      else timerPause(eventId, sessionId, activeTimer.path, rem);
    },
  } : null;

  // Spotlight subject: the chair-granted stage, else whoever actually holds the floor.
  const stageUid = session.live?.stage?.[0];
  const activeSpeaker = gsl?.activeSpeaker || null;
  // A caucus SUSPENDS the GSL but leaves gsl.activeSpeaker standing, so the caption has to
  // prefer the caucus speaker — otherwise it names whoever last held the GSL floor, for the
  // whole caucus. Unmoderated has no recognized speaker at all. `floorHolder` is that rule, shared
  // with the console's tile affordances above and with firestore.rules' yield branches.
  const floorSlot = floorHolder(session);
  const hasFloor = !!(floorSlot || stageUid);
  const spotDelegateId = floorSlot?.delegateId || stageUid;
  const spotCountry = floorSlot?.country || (stageUid ? identityFor(stageUid).country : "") || "";
  const spotDelegate = spotDelegateId ? delegates.find((d) => d.userId === spotDelegateId) : undefined;
  const spotlight = { uid: spotDelegateId || undefined, flagCode: spotCountry || undefined, hasFloor };
  const caption = hasFloor ? {
    country: getCountryName(spotCountry) || spotCountry || "Delegate",
    org: spotDelegate?.applicantName || "",
  } : null;

  // Context descriptor + single primary action.
  let tone: FloorTone = "muted";
  let liveLabel = "Floor open — add speakers";
  let onDeck: FloorState["onDeck"] = null;
  let primary: FloorState["primary"] = null;

  if (vote) {
    tone = "amber";
    liveLabel = `Vote · ${vote.motion || "in progress"}`;
    primary = canControl ? { label: "Close & record", shortLabel: "Close", icon: Gavel, onClick: handleCloseVote, variant: "primary", disabled: busy } : null;
  } else if (caucus) {
    const mod = caucus.kind === "moderated";
    const cq = (mod && caucus.queue) || [];
    const collecting = mod && caucusListState(caucus) === "collecting";
    tone = "primary";
    liveLabel = collecting
      ? "Caucus speakers list open"
      : (mod ? "Moderated caucus" : "Unmoderated caucus") + (caucus.topic ? ` · ${caucus.topic}` : "");
    // Running the speakers list is the chair's constant action during a mod caucus, so it takes
    // the strip whenever anyone is queued. Ending then lives in the Caucus tool, which is also
    // the only place that warns before discarding the list.
    primary = !canControl ? null
      : collecting
        ? { label: "Complete signups", shortLabel: "Complete", icon: Hand, onClick: () => onReviewSignups?.(), variant: "primary", disabled: busy }
        : cq.length
          ? { label: "Next speaker", shortLabel: "Next", icon: SkipForward, onClick: handleNextCaucus, variant: "primary", disabled: busy }
          : { label: "End caucus", shortLabel: "End", icon: Square, onClick: handleEndCaucus, variant: "outline", disabled: busy };
    const cn0 = cq[0];
    onDeck = cn0 ? { code: cn0.country || "", country: getCountryName(cn0.country) || cn0.country || "Delegate" } : null;
  } else if (activeSpeaker) {
    tone = "emerald";
    liveLabel = `Speaking · ${getCountryName(activeSpeaker.country) || activeSpeaker.country || "Delegate"}`;
    primary = canControl ? { label: "Next speaker", shortLabel: "Next", icon: SkipForward, onClick: handleNext, variant: "primary", disabled: busy } : null;
    const nx = gsl?.queue?.[0];
    onDeck = nx ? { code: nx.country || "", country: getCountryName(nx.country) || nx.country || "Delegate" } : null;
  } else {
    const queue = gsl?.queue || [];
    if (queue.length) {
      liveLabel = "Floor open — start first speaker";
      primary = canControl ? { label: "Start first speaker", shortLabel: "Start", icon: SkipForward, onClick: handleNext, variant: "primary", disabled: busy } : null;
      const nx = queue[0];
      onDeck = { code: nx.country || "", country: getCountryName(nx.country) || nx.country || "Delegate" };
    } else {
      liveLabel = "Floor open — add speakers";
      primary = canControl ? { label: "Add speakers", shortLabel: "Speakers", icon: ListChecks, onClick: onGoSpeakers, variant: "outline" } : null;
    }
  }

  const dotColor = tone === "emerald" ? "bg-emerald-500"
    : tone === "amber" ? "bg-amber-500"
    : tone === "primary" ? "bg-primary" : "bg-muted-foreground/40";

  return {
    busy, tone, dotColor, liveLabel, spotlight, caption,
    hasTimer: !!activeTimer, running: !!activeTimer?.timer.running,
    timerText: fmt(remaining), timerPct, danger, onDeck, primary, timerCtl,
  };
}

// ── Video stage (+ overlays + live strip) ────────────────────────────────────────────
function VideoStage({
  session, eventId, sessionId, committeeId, dateStr, userId, canControl, delegates,
  identityFor, videoRoster, pendingPoints, panel, onOpenTools, onOpenHost,
  onGoSpeakers, onSpeechComplete, onQuickMark,
  onGiveFloor, onToggleQueue, onYield, stageUids, activeSpeakerUid, canYieldActive,
  queuedUids, pointByUid, scoreByUid,
  myName, myRole, motions, requests, agendas, onOpenTool, markingTemplates, markMode, onReviewGslSignups, onReviewCaucusSignups,
  onLiveMark,
}: {
  session: LiveSession; eventId: string; sessionId: string; committeeId: string; dateStr: string;
  userId: string; canControl: boolean; delegates: ApplicationData[];
  identityFor: (id: string) => ParticipationIdentity; videoRoster: VideoRosterEntry[];
  pendingPoints: number; panel: null | "tools" | "host";
  onOpenTools: () => void; onOpenHost: () => void;
  onGoSpeakers: () => void; onSpeechComplete: (slot: SpeakerSlot) => void;
  onQuickMark?: (uid: string) => void;
  onGiveFloor?: (uid: string) => void;
  onToggleQueue?: (uid: string) => void;
  onYield?: (uid: string) => void;
  stageUids: string[]; activeSpeakerUid?: string; canYieldActive: boolean; queuedUids: string[];
  pointByUid: Record<string, TilePointBadge>; scoreByUid: Record<string, TileScoreChip>;
  myName?: string; myRole?: string;
  motions: Motion[]; requests: FloorRequest[]; agendas: string[];
  onOpenTool: (t: SubTab) => void;
  /** For the in-tile LiveMarkStrip on whoever holds the floor. */
  markingTemplates: MarkingTemplate[]; markMode: MarkingMode;
  onReviewGslSignups?: () => void;
  onReviewCaucusSignups?: () => void;
  onLiveMark?: (templateId: string, val: number) => void;
}) {
  const floor = useFloorController({
    session, eventId, sessionId, canControl, identityFor, delegates, onSpeechComplete, onGoSpeakers,
    onReviewSignups: onReviewCaucusSignups,
  });

  // Sits BESIDE useFloorController and consumes it — see flow/useFlowBar.ts for why the four
  // overlapping actions are bound to `floor.primary.onClick` instead of re-calling the services.
  const flow = useFlowBar({
    session, motions, requests, committeeAgendas: agendas, floor,
    eventId, sessionId, userId, identityFor, delegates, canControl, onOpenTool,
    onReviewGslSignups, onReviewCaucusSignups,
  });

  return (
    // One expanded panel at a time across the stage. `chairBar` and `floorBar` are created here but
    // RENDERED inside LiveVideoRoom, and context follows the render tree, so wrapping here reaches
    // both. Starts with the marking rubric open — that is the one a chair wants without hunting.
    <DisclosureGroup initialOpenId="live-marks">
    <LiveVideoRoom
      variant="stage"
      eventId={eventId}
      committeeId={committeeId}
      dateStr={dateStr}
      myUid={userId}
      myName={myName || "Chair"}
      myRole={myRole}
      amHost={canControl}
      canControl={canControl}
      roster={videoRoster}
      spotlight={floor.spotlight}
      onQuickMark={onQuickMark}
      onGiveFloor={onGiveFloor} onToggleQueue={onToggleQueue} onYield={onYield}
      stageUids={stageUids} activeSpeakerUid={activeSpeakerUid} canYieldActive={canYieldActive}
      queuedUids={queuedUids} pointByUid={pointByUid} scoreByUid={scoreByUid}
      /* Grid layout only — LiveVideoRoom drops this in spotlight, where the chair is a tiny PiP.
         The floating twin above covers that case. */
      chairBar={canControl ? (
        <GateBar
          compact
          flow={flow}
          session={session}
          motions={motions}
          eventId={eventId}
          sessionId={sessionId}
          userId={userId}
        />
      ) : undefined}
      floorBar={({ layout }) => (
        <>
          <LiveStrip floor={floor} canControl={canControl} />
          {/* Mark the speaker without leaving the speech. Rides in the floor-holder's own tile, so
              it only ever appears against the delegate it scores — never on the other tiles.

              Positioned ABSOLUTELY and z-[5]: LiveStrip above is `absolute left-4 top-4 z-[4]`, so
              anything left in normal flow here lands underneath the video player (which is
              `absolute inset-0`) and is invisible.

              WHICH CORNER depends on the layout, because the two mounts have different neighbours —
              see the per-branch notes below. */}
          {canControl && activeSpeakerUid && markingTemplates.length > 0 && (
            <div
              className={cn(
                "absolute left-4 z-[5]",
                layout === "spotlight"
                  // Under the timer. The spotlight stage's bottom-left is NOT free: the floating
                  // GateBar sits there at `bottom-[76px] z-[6]`, up to 46rem wide, and outranks this
                  // on z. `top-[76px]` clears the strip's 44px dial plus its padding. Capped rather
                  // than full-span here: the spotlight stage is the whole viewport, and a rubric
                  // stretched across all of it would sit over the speaker's face.
                  ? "top-[76px] w-[min(94%,34rem)]"
                  // Grid: bottom-left of the SPEAKER's tile, rubric growing upward off the chip, so
                  // the timer/Next cluster keeps the top-left to itself. Free of the chair's compact
                  // GateBar — that rides the CHAIR's own tile via `chairBar`, never this one.
                  // Bounded column: `top-[76px]` stops the rubric reaching the strip, `bottom-10`
                  // clears the tile's identity label (`bottom-0`, ~30px), `justify-end` pins the chip
                  // to the floor of the column. `pointer-events-none` because the column is now tile
                  // -tall and would otherwise swallow the tile's hover actions — LiveMarkStrip's own
                  // root re-enables them for the strip itself.
                  // SPANS the tile (`left-4 right-4`) rather than sitting in a fixed 24rem column:
                  // a wide speaker tile left most of its width empty while the criteria squeezed
                  // into a corner. Full span = definite width (auto-fit needs that, or its columns
                  // collapse to one) that also tracks the tile, so a narrow tile still wraps.
                  : "top-[76px] bottom-10 right-4 flex flex-col justify-end pointer-events-none",
              )}
            >
              <LiveMarkStrip
                key={activeSpeakerUid}
                openUp={layout === "grid"}
                base={{ ...identityFor(activeSpeakerUid), gradedBy: userId, markMode }}
                templates={markingTemplates}
                // The floor holder's country, NOT `gsl.activeSpeaker`'s — mid-caucus the latter is
                // a stale leftover and would label the strip with the previous speaker.
                country={floorHolder(session)?.country}
                markMode={markMode}
                onMarkAppended={onLiveMark}
              />
            </div>
          )}
        </>
      )}
      stageOverlay={(api) => (
        <StageOverlays
          api={api} floor={floor} flow={flow} canControl={canControl} roster={videoRoster} stage={stageUids}
          eventId={eventId} sessionId={sessionId} session={session} motions={motions} userId={userId}
          pendingPoints={pendingPoints} panel={panel}
          onOpenTools={onOpenTools} onOpenHost={onOpenHost}
        />
      )}
    />
    </DisclosureGroup>
  );
}

/** On-video overlays: flag+timer pill, mic-muted chip, caption, control bar, corner launchers, floating clock. */
function StageOverlays({
  api, floor, flow, canControl, roster, stage, eventId, sessionId, session, motions, userId,
  pendingPoints, panel,
  onOpenTools, onOpenHost,
}: {
  api: StageControlApi; floor: FloorState; flow: BoundFlowState;
  canControl: boolean; roster: VideoRosterEntry[];
  stage: string[]; eventId: string; sessionId: string;
  session: LiveSession; motions: Motion[]; userId: string;
  pendingPoints: number;
  panel: null | "tools" | "host";
  onOpenTools: () => void; onOpenHost: () => void;
}) {
  const showControls = api.configured && api.active && !api.sessionEnded;
  // Lifted so the Flow Bar can collapse itself while a ControlBar popover is open — those open
  // upward from bottom-[58px] straight through the bar's band, and the bar outranks them on z.
  const [barMenuOpen, setBarMenuOpen] = useState(false);
  return (
    <>
      {/* Speaker title + timer now live in the docked LiveStrip bar below (was a separate top-left pill) */}

      {/* Top-right: spotlight subject mic-muted chip */}
      {floor.spotlight.hasFloor && api.floorSubjectSpotlighted && api.spotlightMicMuted && (
        <div className="absolute top-4 right-4 z-[2] w-8 h-8 rounded-full bg-black/50 flex items-center justify-center" title="Speaker muted">
          <MicOff className="w-4 h-4 text-red-300" />
        </div>
      )}

      {/* Speaker caption folded into the docked LiveStrip bar (was a separate bottom-left card) */}

      {/* Point raised — now a PointRequestInbox card in the console shell, above the stage. It was
          an ambient banner here, but it only ever showed the single highest-priority point and had
          to hard-code the dark palette to survive inside this subtree. */}

      {/* Camera/mic error toast */}
      {api.error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[3] flex items-center gap-1.5 rounded-lg bg-amber-500/90 text-black text-[11.5px] font-medium px-3 py-1.5 max-w-[80%]">
          <VideoOff className="w-3.5 h-3.5 shrink-0" /> {api.error}
        </div>
      )}

      {/* Meet-style control bar */}
      {showControls && (
        <ControlBar api={api} canControl={canControl} roster={roster} stage={stage} eventId={eventId} sessionId={sessionId}
          onMenuOpenChange={setBarMenuOpen} />
      )}

      {/* The live clock/title strip now renders INSIDE the floor-holder's tile (passed as `floorBar`) */}

      {/* Bottom-right corner launchers (always reachable). Chat is deliberately NOT here — it docks
          on the left and is toggled from the TopBar, on the side it actually opens. */}
      <div className="absolute right-4 bottom-6 z-[3] flex items-center gap-1">
        <LauncherBtn title="Committee tools" icon={LayoutGrid} onClick={onOpenTools} active={panel === "tools"} badge={pendingPoints} />
        <LauncherBtn title="Host controls" icon={Lock} onClick={onOpenHost} active={panel === "host"} />
      </div>

      {/* Gate Bar — LAST child on purpose: z-[6] beats every overlay above, and screen readers
          reach the procedure console after the video chrome rather than before it.

          SPOTLIGHT ONLY — in grid the same bar floats across every other delegate's tile, so it is
          rendered into the chair's own tile instead via LiveVideoRoom's `chairBar` slot. `api`
          carries the RESOLVED layout because `layoutMode` may still read "auto".

          `!ownTileRendered` is the safety net, not a nicety: a chair who has not published has NO
          tile, so the in-tile bar would render nowhere and they would lose their only procedure
          control with nothing on screen to explain why. */}
      {canControl && showControls && (api.effectiveLayout === "spotlight" || !api.ownTileRendered) && (
        <GateBar
          flow={flow}
          session={session}
          motions={motions}
          eventId={eventId}
          sessionId={sessionId}
          userId={userId}
          suppressed={barMenuOpen}
        />
      )}
    </>
  );
}

function ControlBar({
  api, canControl, roster, stage, eventId, sessionId, onMenuOpenChange,
}: {
  api: StageControlApi; canControl: boolean; roster: VideoRosterEntry[]; stage: string[];
  eventId: string; sessionId: string;
  /**
   * Fires when this bar goes from "no popover open" to "one open" and back. The Flow Bar sits
   * directly above at z-[6] and would paint over them, so it collapses while one is open.
   * Driven by the `BarMenuGroup` below, which is also what keeps the popovers exclusive.
   */
  onMenuOpenChange?: (open: boolean) => void;
}) {
  return (
    <ControlBarRow onOpenChange={onMenuOpenChange}>
      <ChairBarButtons api={api} canControl={canControl} roster={roster}
        stage={stage} eventId={eventId} sessionId={sessionId} />
    </ControlBarRow>
  );
}

/**
 * The buttons themselves — a separate component only because `useBarMenu` must run BELOW the
 * provider `ControlBarRow` mounts, not beside it.
 */
function ChairBarButtons({
  api, canControl, roster, stage, eventId, sessionId,
}: {
  api: StageControlApi; canControl: boolean; roster: VideoRosterEntry[];
  stage: string[]; eventId: string; sessionId: string;
}) {
  const [moreOpen, setMoreOpen] = useBarMenu("more");
  const [endMenuOpen, setEndMenuOpen] = useBarMenu("end");
  const onStage = stage[0] || "";

  return (
    <>
      {/* The token server decides who broadcasts. A marking-only staffer runs the console but
          watches the video, so they get no mic/cam/present buttons at all, not three dead ones. */}
      {api.hostGranted !== false && (
        <>
          <RoundBtn title={api.micOn ? "Mute" : "Unmute"} icon={api.micOn ? Mic : MicOff}
            onClick={api.toggleMic} danger={!api.micOn} disabled={!api.publishing} />
          <RoundBtn title={api.camOn ? "Turn off camera" : "Turn on camera"} icon={api.camOn ? Video : VideoOff}
            onClick={api.toggleCam} danger={!api.camOn} disabled={!api.publishing || api.screenSharing} />
          {api.screenSupported && (
            <RoundBtn title={api.screenSharing ? "Stop presenting" : "Present now"} icon={MonitorUp}
              onClick={api.toggleScreenShare} active={api.screenSharing} disabled={!api.publishing} />
          )}
        </>
      )}
      <LayoutSwitcher mode={api.layoutMode} onChange={api.setLayoutMode} />

      {/* More (⋮) — chair give-/clear-floor override lives here. Gated on `canControl`, TRIGGER
          INCLUDED: the menu holds nothing else, so an observer got a button that toggled an
          invisible popover — which still counted as "a menu is open" and left the Gate Bar faded
          out with no way to see what was suppressing it. */}
      {canControl && (
        <div className="relative">
          <RoundBtn title="More options" icon={MoreVertical} onClick={() => setMoreOpen(!moreOpen)} active={moreOpen}
            haspopup expanded={moreOpen} />
          <BarMenuPopover open={moreOpen} onClose={() => setMoreOpen(false)} align="right" className="w-[260px] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground mb-2">Give the floor</div>
            <div className="flex items-center gap-2">
              <Select value={onStage} onValueChange={(v) => setStage(eventId, sessionId, v ? [v] : [])}>
                <SelectTrigger className="h-9 flex-1 text-xs">
                  <SelectValue placeholder="Give the floor to…">
                    {(val) => {
                      if (!val) return "Give the floor to…";
                      const r = roster.find((x) => x.uid === val);
                      return r?.country ? <CountryFlag code={r.country} size={15} showName /> : (r?.name || "Delegate");
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roster.length === 0
                    ? <div className="px-3 py-2 text-xs text-muted-foreground">No delegates</div>
                    : roster.map((r) => (
                        <SelectItem key={r.uid} value={r.uid}>
                          {r.country ? <CountryFlag code={r.country} size={15} showName /> : r.name}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => setStage(eventId, sessionId, [])} disabled={stage.length === 0}
                title="Clear the floor"
                className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border/60 text-xs font-semibold text-muted-foreground hover:bg-secondary/60 disabled:opacity-40 transition-colors">
                <Square className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </BarMenuPopover>
        </div>
      )}

      {/* Leave / end call (Meet-style menu) */}
      <div className="relative ml-1">
        <button type="button" onClick={() => setEndMenuOpen(!endMenuOpen)} title="Leave or end call" aria-label="Leave or end call"
          aria-haspopup="menu" aria-expanded={endMenuOpen}
          className="w-[62px] h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors">
          <PhoneOff className="w-5 h-5" />
        </button>
        <BarMenuPopover open={endMenuOpen} onClose={() => setEndMenuOpen(false)} align="right" className="w-[224px] p-1.5">
          <button type="button" role="menuitem" onClick={() => { setEndMenuOpen(false); api.leave(); }}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-[13px] font-medium text-foreground hover:bg-secondary/60 transition-colors">
            <PhoneOff className="w-4 h-4" /> Leave call
            <span className="ml-auto text-[10.5px] text-muted-foreground">just me</span>
          </button>
          {canControl && (
            <button type="button" role="menuitem"
              onClick={() => {
                setEndMenuOpen(false);
                if (confirm("End the call for everyone? All participants will be removed from the video. The session stays open — you can restart the call.")) {
                  endLiveCall(eventId, sessionId);
                }
              }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors">
              <PhoneOff className="w-4 h-4" /> End call for everyone
            </button>
          )}
        </BarMenuPopover>
      </div>
    </>
  );
}

/**
 * Floating clock overlay for the floor-holder's tile — a SINGLE row: countdown ring, transport
 * (reset / play / +15s), and the one contextual primary action.
 *
 * Deliberately identity-free. It is rendered INSIDE the speaking delegate's tile, whose own
 * bottom label already carries their flag and name, so repeating the country here (and stacking
 * an "Up next" line under it) buried a third of the video it was labelling. The up-next
 * delegation now rides on the Next button itself, which is the only place it's actionable.
 * Calling a vote moved out to the Voting tool panel.
 */
function LiveStrip({ floor, canControl }: { floor: FloorState; canControl: boolean }) {
  const P = floor.primary;
  const PIcon = P?.icon;
  return (
    <FloorPill>
      <FloorRing pct={floor.hasTimer ? floor.timerPct : 0}
        text={floor.hasTimer ? floor.timerText : "0:00"} danger={floor.danger} />

      {canControl && floor.timerCtl && (
        <div className="flex items-center gap-1 shrink-0">
          <StripIcon title="Reset" icon={RotateCcw} onClick={() => floor.timerCtl!.reset()} />
          <StripIcon title={floor.running ? "Pause" : "Start"} icon={floor.running ? Pause : Play}
            onClick={() => (floor.running ? floor.timerCtl!.pause() : floor.timerCtl!.start())} primary />
          <StripIcon title="+15s" icon={Plus} onClick={() => floor.timerCtl!.adjust(15000)} />
        </div>
      )}

      {P && (
        // The button names WHO is next, not what the tap does — "Next" is already the icon.
        // `onDeck` is null for End / Close / Speakers, which fall back to the plain label.
        <Button onClick={P.onClick} disabled={P.disabled} size="sm"
          variant={P.variant === "outline" ? "outline" : "default"}
          title={floor.onDeck ? `${P.label} · ${floor.onDeck.country}` : P.label}
          className="h-8 gap-1.5 rounded-full pl-2.5 pr-3 min-w-0">
          {PIcon && <PIcon className="w-3.5 h-3.5 shrink-0" />}
          {floor.onDeck ? (
            <>
              {floor.onDeck.code && <CountryFlag code={floor.onDeck.code} size={14} />}
              <span className="text-[12.5px] truncate max-w-[110px]">{floor.onDeck.country}</span>
            </>
          ) : (
            <span className="text-[12.5px]">{P.shortLabel}</span>
          )}
        </Button>
      )}
    </FloorPill>
  );
}

// ── Right-side tool panel (drill-down) ───────────────────────────────────────────────
function ToolPanel({
  panel, tool, setTool, onClose, liveOn, pendingPoints, pendingRequests, pendingMotions, pendingDocs, docs,
  present, quorum, quorumPct, quorumMet,
  onOpenProjector, session, eventId, sessionId, committeeId, dateStr, delegates, canControl,
  identityFor, userId, markingTemplates, markMode, eventTitle, onSpeechComplete, onFinalize, finalizing,
  canActAsDelegate, userName, agendas, points, requests, motions, onProxyCompose, onReviewSignups,
}: {
  panel: "tools" | "chat" | "host"; tool: SubTab | null; setTool: (t: SubTab | null) => void;
  onClose: () => void; liveOn: { gsl: boolean; caucus: boolean; voting: boolean }; pendingPoints: number;
  pendingRequests: number; pendingMotions: number; pendingDocs: number; docs: CommitteeDoc[];
  present: number; quorum: number; quorumPct: number; quorumMet: boolean; onOpenProjector: () => void;
  session: LiveSession; eventId: string; sessionId: string; committeeId: string; dateStr: string;
  delegates: ApplicationData[]; canControl: boolean; identityFor: (id: string) => ParticipationIdentity;
  userId: string; markingTemplates: MarkingTemplate[]; markMode: MarkingMode; eventTitle: string;
  onSpeechComplete: (slot: SpeakerSlot) => void; onFinalize: () => void; finalizing: boolean;
  canActAsDelegate: boolean; userName: string;
  /** Committee topics — the motions queue needs them to tell an answered motion from a live one. */
  agendas: string[];
  /**
   * The console's own live arrays, passed down rather than re-subscribed. The Represent panel needs
   * to show a vice-chair what is already in flight for the delegation they are proxying; a second
   * set of listeners for the same three collections would double this console's read bill on a
   * plan with a 50k/day ceiling.
   */
  points: RaisedPoint[]; requests: FloorRequest[]; motions: Motion[];
  /** Open the proxy document composer. Owned by the console root — see RepresentPanel's prop doc. */
  onProxyCompose: (delegateId: string, initialDoc?: ProxyDocDraft) => void;
  /** Raise the caucus seat dialog. Owned by the console — the dialog outlives this panel. */
  onReviewSignups: () => void;
}) {
  // At lg the strip stays visible beside the panel and hosts the timer (panels embed); below lg
  // the panel covers the strip, so the floor panels host their own timer instead.
  const isWide = useIsWide();

  // Escape closes the panel (steps back to Level 0 first if a tool is drilled).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (panel === "tools" && tool) setTool(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, tool, setTool, onClose]);

  const meta = tool ? PANEL_META[tool] : null;
  const MetaIcon = meta?.icon;
  const headerTitle = panel === "host" ? "Host controls" : tool ? meta!.title : "Committee tools";
  // Marking & Report are tables — give them a wider rail (mock's 492px "wide mode").
  const wideRail = panel === "tools" && (tool === "marking" || tool === "report");

  return (
    <aside role="dialog" aria-label={headerTitle}
      className={cn("flex flex-col w-full shrink-0 bg-card border-l border-border/60 min-h-0 animate-in slide-in-from-right-2 duration-200",
        wideRail ? "lg:w-[520px]" : "lg:w-[404px]")}>
      {/* Header */}
      {panel === "tools" && tool ? (
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

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-3.5">
        {panel === "tools" && !tool && (
          <ToolList liveOn={liveOn} pendingPoints={pendingPoints} pendingRequests={pendingRequests} pendingMotions={pendingMotions}
            pendingDocs={pendingDocs} onOpen={setTool}
            present={present} quorum={quorum} quorumPct={quorumPct} quorumMet={quorumMet} onOpenProjector={onOpenProjector}
            canActAsDelegate={canActAsDelegate} awaitingPublish={!!session.pendingPublish} />
        )}
        {panel === "tools" && tool && (
          <div key={tool} className="animate-in fade-in duration-200">
            {tool === "rollcall" && (
              <RollCallPanel eventId={eventId} sessionId={sessionId} session={session}
                delegates={delegates} canControl={canControl} identityFor={identityFor} />
            )}
            {tool === "voting" && (
              <VotingPanel eventId={eventId} sessionId={sessionId} session={session}
                delegates={delegates} canControl={canControl} identityFor={identityFor} userId={userId} />
            )}
            {tool === "gsl" && (isWide ? (
              <ConsoleSpeakersPanel eventId={eventId} sessionId={sessionId} session={session}
                delegates={delegates} canControl={canControl} identityFor={identityFor} onSpeechComplete={onSpeechComplete} />
            ) : (
              <GslPanel embedded={false} eventId={eventId} sessionId={sessionId} session={session}
                delegates={delegates} canControl={canControl} identityFor={identityFor} onSpeechComplete={onSpeechComplete} />
            ))}
            {tool === "requests" && (
              <RequestsPanel eventId={eventId} sessionId={sessionId} session={session}
                canControl={canControl} userId={userId} />
            )}
            {tool === "caucus" && (
              <CaucusPanel embedded={isWide} eventId={eventId} sessionId={sessionId} session={session}
                delegates={delegates} canControl={canControl} userId={userId}
                identityFor={identityFor} onSpeechComplete={onSpeechComplete}
                onReviewSignups={onReviewSignups} />
            )}
            {tool === "motions" && (
              <PointsMotionsPanel eventId={eventId} sessionId={sessionId} session={session}
                delegates={delegates} canControl={canControl} identityFor={identityFor} userId={userId}
                pendingMotions={pendingMotions} pendingPoints={pendingPoints} agendas={agendas} />
            )}
            {tool === "docs" && (
              <SessionDocsPanel eventId={eventId} sessionId={sessionId} session={session}
                canControl={canControl} userId={userId} docs={docs} />
            )}
            {tool === "marking" && (
              <MarkingPanel eventId={eventId} committeeId={committeeId} dateStr={dateStr}
                delegates={delegates} canControl={canControl} markingTemplates={markingTemplates} userId={userId} markMode={markMode} />
            )}
            {tool === "report" && (
              <SessionReport mode="full" eventId={eventId} committeeId={committeeId} dateStr={dateStr}
                eventTitle={eventTitle} delegates={delegates} />
            )}
            {tool === "represent" && canActAsDelegate && (
              <RepresentPanel eventId={eventId} sessionId={sessionId} session={session}
                delegates={delegates} identityFor={identityFor} viceChairUid={userId} viceChairName={userName}
                points={points} requests={requests} motions={motions} docs={docs} agendas={agendas}
                onCompose={onProxyCompose} />
            )}
          </div>
        )}
        {panel === "host" && (
          <HostPanel session={session} eventId={eventId} sessionId={sessionId} canControl={canControl}
            onFinalize={onFinalize} finalizing={finalizing} onOpenProjector={onOpenProjector} />
        )}
      </div>
    </aside>
  );
}

/** Level 0 — the committee-tools list + quorum widget + projector launcher. */
function ToolList({
  liveOn, pendingPoints, pendingRequests, pendingMotions, pendingDocs, onOpen, present, quorum, quorumPct, quorumMet, onOpenProjector,
  canActAsDelegate, awaitingPublish,
}: {
  liveOn: { gsl: boolean; caucus: boolean; voting: boolean }; pendingPoints: number; pendingRequests: number;
  pendingMotions: number; pendingDocs: number;
  onOpen: (id: SubTab) => void; present: number; quorum: number; quorumPct: number; quorumMet: boolean;
  onOpenProjector: () => void;
  canActAsDelegate: boolean;
  /** A vote closed and its result is still withheld from the room — nudge the chair to publish. */
  awaitingPublish: boolean;
}) {
  const order: SubTab[] = canActAsDelegate ? [...TOOL_ORDER, "represent"] : TOOL_ORDER;
  return (
    <div className="flex flex-col gap-2">
      {order.map((id) => {
        const m = PANEL_META[id];
        const Icon = m.icon;
        const live = (id === "gsl" && liveOn.gsl) || (id === "caucus" && liveOn.caucus) || (id === "voting" && liveOn.voting);
        const badge = id === "motions" && (pendingPoints + pendingMotions) > 0 ? pendingPoints + pendingMotions
          : id === "requests" && pendingRequests > 0 ? pendingRequests
          : id === "docs" && pendingDocs > 0 ? pendingDocs : 0;
        return (
          <button key={id} type="button" onClick={() => onOpen(id)}
            className="flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl bg-secondary/40 border border-border/60 hover:bg-secondary/70 transition-colors">
            <span className="w-9 h-9 rounded-[10px] bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-[19px] h-[19px]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold leading-tight">{m.title}</span>
              <span className="block text-[11.5px] text-muted-foreground leading-tight">{m.sub}</span>
            </span>
            {live && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-blip shrink-0" />}
            {id === "voting" && !live && awaitingPublish && (
              <span className="w-2 h-2 rounded-full bg-amber-500 text-amber-600 dark:text-amber-400 animate-vote-pulse shrink-0" />
            )}
            {badge > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{badge}</span>
            )}
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </button>
        );
      })}

      <div className="mt-1.5 p-3.5 rounded-xl bg-secondary/30 border border-border/60">
        <div className="flex items-center justify-between text-[11.5px] mb-2">
          <span className="font-semibold text-muted-foreground">Quorum</span>
          <span className="tabular-nums text-muted-foreground">{present} / {quorum}</span>
        </div>
        <div className="h-1.5 rounded-full bg-background overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-300", quorumMet ? "bg-emerald-500" : "bg-orange-500")}
            style={{ width: `${quorumPct}%` }} />
        </div>
        <button type="button" onClick={onOpenProjector}
          className="mt-3 w-full h-9 inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
          <Cast className="w-4 h-4" /> Open projector view
        </button>
      </div>
    </div>
  );
}

/** Host controls launcher — the real session-management actions. */
function HostPanel({
  session, eventId, sessionId, canControl, onFinalize, finalizing, onOpenProjector,
}: {
  session: LiveSession; eventId: string; sessionId: string; canControl: boolean;
  onFinalize: () => void; finalizing: boolean; onOpenProjector: () => void;
}) {
  const suspended = session.phase === "suspended";
  const closed = session.phase === "closed";
  const finalized = !!session.finalized;
  const stopped = closed || finalized;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-muted-foreground mb-1">Keep control of your session — only the chair sees these.</p>
      <HostRow label={suspended ? "Resume session" : "Suspend session"} icon={suspended ? PlayCircle : PauseCircle}
        disabled={!canControl || stopped}
        onClick={() => (suspended ? resumeSession(eventId, sessionId) : suspendSession(eventId, sessionId))} />
      <HostRow label={stopped ? "Reopen session" : "Close session"} icon={stopped ? PlayCircle : Lock}
        disabled={!canControl}
        onClick={() => {
          // Reopen goes through reopenSession for BOTH stops, not just the finalized one: it banks
          // the break the way resumeSession does (a session closed while suspended would otherwise
          // come back with suspendedAt still standing and lose the whole break), clears
          // `live.callEnded` so the video rejoins, and puts the session back in the live registry
          // that close/finalize dropped it from.
          if (stopped) { if (!finalized || confirm(REOPEN_CONFIRM)) reopenSession(eventId, sessionId); }
          else if (confirm("Close this session? Controls will be locked.")) setPhase(eventId, sessionId, "closed");
        }} />
      <HostRow label="Open projector view" icon={Cast} onClick={onOpenProjector} />
      <div className="h-px bg-border/60 my-1" />
      <HostRow label="Finalize & publish results" icon={Flag} tone="primary"
        disabled={!canControl || finalizing || finalized} busy={finalizing} onClick={onFinalize} />
      {finalized && (
        <p className="flex items-start gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
          <span>Results have been finalized. Reopen the session to keep running today — the marks stay saved.</span>
        </p>
      )}
    </div>
  );
}

/** Finalize is reversible, but the chair should know what they get back. Shared by both reopen affordances. */
const REOPEN_CONFIRM =
  "Reopen this session? The day's marks stay exactly as they are — you can finalize again when you're done.";

function HostRow({
  label, icon: Icon, onClick, disabled, busy, tone = "default",
}: { label: string; icon: React.ElementType; onClick: () => void; disabled?: boolean; busy?: boolean; tone?: "default" | "primary" }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        tone === "primary" ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/15" : "bg-secondary/40 border-border/60 hover:bg-secondary/70")}>
      <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", tone === "primary" ? "bg-primary/15 text-primary" : "bg-background text-muted-foreground")}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      </span>
      <span className="text-[13.5px] font-semibold">{label}</span>
    </button>
  );
}

// ── Idle auto-shutdown guard ─────────────────────────────────────────────────────
const IDLE_LIMIT_MS = 2 * 60 * 1000; // no activity for 2 min → warn
const IDLE_GRACE_SEC = 15;           // seconds to respond before auto-close

function IdleGuard({
  session, onExtend, onAutoClose,
}: {
  session: LiveSession; onExtend: () => void; onAutoClose: () => void;
}) {
  const [warning, setWarning] = useState(false);
  const [countdown, setCountdown] = useState(IDLE_GRACE_SEC);

  const running = session.phase !== "closed" && session.phase !== "suspended";
  const floorActive =
    !!session.gsl?.activeSpeaker || !!session.caucus || !!session.activeVote ||
    (session.gsl?.queue?.length || 0) > 0;
  const lastActivityMs = Math.max(
    (session.updatedAt as any)?.toMillis?.() || 0,
    session.live?.keepAliveAt || 0,
  );

  useEffect(() => {
    if (!running || floorActive) { setWarning(false); return; }
    const check = () => setWarning(Date.now() - lastActivityMs >= IDLE_LIMIT_MS);
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [running, floorActive, lastActivityMs]);

  useEffect(() => {
    if (!warning) { setCountdown(IDLE_GRACE_SEC); return; }
    setCountdown(IDLE_GRACE_SEC);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(id); onAutoClose(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warning]);

  if (!warning) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[min(92vw,420px)] rounded-2xl bg-background border border-border/60 shadow-lg shadow-primary/10 dark:shadow-xl p-6 text-center animate-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <AlarmClock className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold font-heading">Still in session?</h3>
        <p className="text-sm text-muted-foreground mt-1.5">
          No activity for 2 minutes. This session ends automatically in{" "}
          <span className="font-bold text-foreground tabular-nums">{countdown}s</span>.
        </p>
        <div className="flex items-center gap-2 mt-5">
          <Button variant="outline" className="flex-1" onClick={onAutoClose}>End now</Button>
          <Button className="flex-1" onClick={() => { setWarning(false); onExtend(); }}>Continue meeting</Button>
        </div>
      </div>
    </div>
  );
}

// ── Top bar ──────────────────────────────────────────────────────────────────────
function TopBar({
  session, eventId, sessionId, committeeName, eventTitle, dateStr, onDateChange,
  canControl, present, quorum, quorumMet, exitHref, onFinalize, finalizing, agendas,
  liveTheme, setLiveTheme, showChat, chatOpen, chatUnread, onToggleChat,
}: {
  session: LiveSession; eventId: string; sessionId: string; committeeName: string;
  eventTitle: string; dateStr: string; onDateChange: (d: string) => void; canControl: boolean;
  present: number; quorum: number; quorumMet: boolean; exitHref: string;
  onFinalize: () => void; finalizing: boolean; agendas: string[];
  liveTheme: LiveTheme; setLiveTheme: (t: LiveTheme) => void;
  showChat: boolean; chatOpen: boolean; chatUnread: number; onToggleChat: () => void;
}) {
  const phase = PHASE_META[session.phase];
  const PhaseIcon = phase.icon;
  const suspended = session.phase === "suspended";
  const closed = session.phase === "closed";
  const finalized = !!session.finalized;
  const stopped = closed || finalized;

  return (
    <header className="flex items-center gap-2.5 px-3 sm:px-4 h-[56px] bg-background border-b border-border/60 shrink-0 z-10">
      <Link href={exitHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors shrink-0">
        <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Exit</span>
      </Link>
      <div className="h-6 w-px bg-border/60 shrink-0" />

      {/* Chat toggle sits on the LEFT, the side the dock opens on. It carries the unread count at
          every breakpoint — below lg the collapsed dock renders nothing at all, so this is the only
          place the badge can live. */}
      {showChat && (
        <button type="button" onClick={onToggleChat} aria-expanded={chatOpen}
          aria-label={chatOpen ? "Hide messages" : "Show messages"}
          className={cn(
            "relative h-9 px-2.5 shrink-0 rounded-lg inline-flex items-center gap-1.5 transition-colors",
            chatOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
          )}>
          <MessageSquare className="w-4 h-4" />
          <span className="hidden md:inline text-[13px] font-medium">Messages</span>
          {chatUnread > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums">
              {chatUnread > 99 ? "99+" : chatUnread}
            </span>
          )}
        </button>
      )}

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
          "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider border",
          session.phase === "voting" ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
            : suspended ? "bg-orange-500/10 text-orange-600 border-orange-500/30"
            : closed ? "bg-muted text-muted-foreground border-border/60"
            : "bg-primary/10 text-primary border-primary/25"
        )}>
          <PhaseIcon className="w-3 h-3" /> {phase.label}
        </span>

        <span className="hidden md:flex items-center gap-1.5 text-[13px]">
          <span className={cn("font-bold tabular-nums", quorumMet ? "text-emerald-600" : "text-orange-600")}>{present}</span>
          <span className="text-muted-foreground">/{quorum}</span>
          <span className={cn("text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border",
            quorumMet ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-orange-500/10 text-orange-600 border-orange-500/30")}>
            {quorumMet ? "Quorum" : "No quorum"}
          </span>
        </span>

        {session.finalized && (
          <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Final
          </span>
        )}

        <DateField value={dateStr} onChange={onDateChange} displayFormat="dd/MM/yyyy" className="w-auto h-9 hidden sm:flex" />

        {canControl && !stopped && (
          <Button variant="outline" size="icon" className="h-9 w-9" title={suspended ? "Resume" : "Suspend"}
            onClick={() => (suspended ? resumeSession(eventId, sessionId) : suspendSession(eventId, sessionId))}>
            {suspended ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
          </Button>
        )}
        {canControl && !stopped && (
          <Button variant="outline" size="icon" className="h-9 w-9 text-muted-foreground" title="Close session"
            onClick={() => { if (confirm("Close this session? Controls will be locked.")) setPhase(eventId, sessionId, "closed"); }}>
            <Lock className="w-4 h-4" />
          </Button>
        )}
        {/* One Reopen for both stops. A finalized session ignores the phase entirely (every reader
            outranks it with `finalized`), so without this the day is unrecoverable — `ensureSession`
            returns the existing doc, leaving no "start" to press either. */}
        {canControl && stopped && (
          <Button variant={finalized ? "default" : "outline"} size="sm" className="h-9 gap-1.5"
            title={finalized ? "Reopen the finalized session" : "Reopen the session"}
            onClick={() => { if (!finalized || confirm(REOPEN_CONFIRM)) reopenSession(eventId, sessionId); }}>
            <PlayCircle className="w-4 h-4" /> Reopen
          </Button>
        )}
        {canControl && !finalized && (
          <Button size="sm" className="h-9 gap-1.5" onClick={onFinalize} disabled={finalizing}>
            {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
            <span className="hidden sm:inline">Finalize</span>
          </Button>
        )}
      </div>
    </header>
  );
}

/** Prompt shown after a GSL speech ends — one ±100 mark per criterion for that speech,
 *  appended to the delegate's daily marking (the day's value = average of the list). */
function SpeechScorer({
  slot, templates, base, onClose, markMode = "decimal", existingMarking, liveMarks,
}: {
  slot: SpeakerSlot;
  templates: MarkingTemplate[];
  base: DailyMarkingBase;
  onClose: () => void;
  markMode?: MarkingMode;
  existingMarking?: Marking | null;
  liveMarks?: Record<string, number>;
}) {
  const [latestMarking, setLatestMarking] = useState<Marking | null | undefined>(existingMarking);
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (existingMarking) {
      for (const t of templates) {
        const entries = existingMarking.scoreEntries?.[t.id];
        const score = entries && entries.length > 0
          ? entries[entries.length - 1]
          : existingMarking.scores?.[t.id];
        if (typeof score === "number") {
          initial[t.id] = String(score);
        }
      }
    }
    if (liveMarks) {
      for (const t of templates) {
        if (typeof liveMarks[t.id] === "number") {
          initial[t.id] = String(liveMarks[t.id]);
        }
      }
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const binary = markMode === "binary";

  // Fetch the up-to-date marking doc directly from Firestore on mount so live marks written right before speech end are guaranteed to show
  useEffect(() => {
    if (!base.committeeId || !base.delegateId || !base.dateStr) return;
    const markingId = `${base.committeeId}_${base.delegateId}_${base.dateStr}`;
    getDoc(doc(db, "markings", markingId)).then((snap) => {
      if (!snap.exists()) return;
      const m = snap.data() as Marking;
      setLatestMarking(m);
      const fresh: Record<string, string> = {};
      for (const t of templates) {
        const entries = m.scoreEntries?.[t.id];
        const score = entries && entries.length > 0
          ? entries[entries.length - 1]
          : m.scores?.[t.id];
        if (typeof score === "number") {
          fresh[t.id] = String(score);
        }
      }
      setVals((cur) => ({ ...cur, ...fresh }));
    }).catch((e) => console.error("fetch fresh marking in SpeechScorer", e));
  }, [base.committeeId, base.delegateId, base.dateStr, templates]);

  const parsed = (id: string) => {
    const s = (vals[id] ?? "").trim();
    if (s === "" || s === "-") return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? clamp(n, binary ? -1 : MARK_MIN, binary ? 1 : MARK_MAX) : null;
  };
  const anyFilled = templates.some((t) => parsed(t.id) != null);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    for (const t of templates) {
      const v = parsed(t.id);
      if (v == null) continue;
      const m = latestMarking || existingMarking;
      const entries = m?.scoreEntries?.[t.id];
      const lastEntry = entries && entries.length > 0
        ? entries[entries.length - 1]
        : m?.scores?.[t.id];
      if (lastEntry === undefined || v !== lastEntry) {
        await appendScoreEntry(base, t.id, v);
      }
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div className="w-[min(92vw,440px)] rounded-2xl bg-background border border-border/60 shadow-lg shadow-primary/10 dark:shadow-xl p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 mb-1">
          {slot.country
            ? <CountryFlag code={slot.country} size={24} />
            : <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">?</span>}
          <div className="min-w-0">
            <h3 className="font-semibold leading-tight">Score this speech</h3>
            <p className="text-xs text-muted-foreground truncate">{getCountryName(slot.country) || slot.country || "Delegate"}</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">Each mark {binary ? "−1 / 0 / +1" : "−100…+100"} · appended to today&apos;s list · the day&apos;s value is the average.</p>
        <div className="space-y-2 max-h-[46vh] overflow-y-auto">
          {templates.map((t, i) => (
            <div key={t.id} className="flex items-center justify-between gap-2">
              <span className="text-sm truncate">{t.name}</span>
              {binary ? (
                <BinaryScoreSelect
                  value={(() => { const s = (vals[t.id] ?? "").trim(); if (s === "") return null; const n = parseFloat(s); return Number.isFinite(n) ? n : null; })()}
                  onChange={(v) => setVals((cur) => ({ ...cur, [t.id]: v == null ? "" : String(v) }))}
                  className="shrink-0"
                />
              ) : (
                <Input
                  type="number" min={MARK_MIN} max={MARK_MAX} autoFocus={i === 0}
                  value={vals[t.id] ?? ""} placeholder="—"
                  onChange={(e) => setVals((v) => ({ ...v, [t.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  className="w-24 h-8 text-center shrink-0"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Skip</Button>
          <Button size="sm" onClick={save} disabled={saving || !anyFilled}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
