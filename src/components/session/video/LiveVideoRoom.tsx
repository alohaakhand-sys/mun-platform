"use client";

/**
 * Live MUN video room — the camera/mic surface that bolts onto the existing session console.
 *
 * • Chairs/EB (amHost) broadcast camera+mic on join and see every other broadcaster.
 * • Delegates join as audience (ultra-low latency) and are auto-promoted to camera+mic when
 *   the chair puts them on the floor (their uid enters session.live.stage — handled by the
 *   useAgoraLive hook). All promotion authority is server-side, so nobody self-promotes.
 * • Chairs get an override bar (give the floor to any delegate / clear the floor) on top of
 *   the automatic mirroring from the Speakers List + moderated caucus.
 *
 * Two layouts: `inline` (delegate live page) and `floating` (a collapsible picture-in-picture
 * dock pinned bottom-right of the chair console, so it never disturbs the console's layout and
 * there is only ever ONE Agora join per user).
 *
 * Must be mounted via next/dynamic({ ssr: false }) — it drives the browser-only Agora SDK.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAgoraLive } from "@/lib/agora/useAgoraLive";
import { useSessionPresence, type PresenceEvent } from "@/components/session/useSessionPresence";
import {
  subscribeSession, makeSessionId, setStage, startLiveCall,
  type LiveSession,
} from "@/lib/services/sessionService";
import { roleLabel } from "@/lib/services/staffService";
import { ceremonySessionId, type CeremonyKind } from "@/lib/services/liveControlService";
import { VideoTile } from "./VideoTile";
import { RaisePointMenu } from "@/components/session/RaisePointMenu";
import { getCountryName, flagUrl, getCountry, isCountryCode } from "@/lib/data/countries";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CountryFlag } from "@/components/ui/CountryFlag";
import {
  Video, VideoOff, Mic, MicOff, Radio, Loader2, ChevronDown, ChevronUp, Hand, Square, PhoneOff, Monitor, Pin, PinOff, Star,
  CornerDownRight, ListPlus, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useElementSize } from "@/lib/hooks/useElementSize";
import { bestGrid, planMosaic, shouldMosaic, MAX_TILES } from "./tileLayout";
import { getInitials, avatarGradient } from "@/lib/avatarColor";
import { panelTone, type PanelTone } from "@/components/session/console/shared";

export interface VideoRosterEntry { uid: string; name: string; country?: string; role?: string }

/** Small status chip for a scored delegate's tile (top-right, always visible once scored today). */
export interface TileScoreChip { label: string; tone: "emerald" | "red" | "muted" }
/** Small status badge for a delegate with a pending raised point (top-right, tinted by point type). */
export interface TilePointBadge { icon: React.ElementType; tone: PanelTone }

/** `role` is a staff role label ("Vice Chair"); delegates carry a `country` instead. */
interface Identity { name: string; country?: string; role?: string }

/**
 * The mic/cam/screen state + toggles the `stage` variant hands to the console's external
 * control bar (so the Meet-style controls live in `ChairSessionConsole`, not here, while the
 * single Agora join still lives inside this component).
 */
export interface StageControlApi {
  configured: boolean;
  connecting: boolean;
  joined: boolean;
  publishing: boolean;
  /** The token server's answer: false = this account watches only, so mic/cam stay off. */
  hostGranted: boolean | null;
  sessionEnded: boolean;
  active: boolean;
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  screenSupported: boolean;
  error: string | null;
  /** Whether the spotlight subject (on-floor delegate) currently has their mic muted. */
  spotlightMicMuted: boolean;
  /** Per-viewer video layout (not synced). May be the string "auto" — see `effectiveLayout`. */
  layoutMode: StageLayoutMode;
  setLayoutMode: (m: StageLayoutMode) => void;
  /**
   * What "auto" actually RESOLVED to. Consoles that place chrome differently per layout need this
   * and cannot compute it: `layoutMode` can be the literal "auto", and `floorSubjectSpotlighted`
   * below is not a substitute — it is false when auto resolves to spotlight because of a PIN
   * rather than a floor holder, which is indistinguishable from grid.
   */
  effectiveLayout: "grid" | "spotlight";
  /**
   * Whether the viewer has a tile of their own on screen right now — i.e. whether anything passed
   * as `chairBar` will actually render.
   *
   * FALSE more often than you would guess: the local participant is only added to the stage when
   * `publishing`, and the attendance-flag pass explicitly skips `myUid`. A chair who has not
   * published yet therefore has no tile at all. Consoles that dock chrome into their own tile MUST
   * check this and fall back, or the control silently disappears with no error.
   */
  ownTileRendered: boolean;
  /** True only when the big spotlight subject IS the on-floor speaker (drives the floor pill/caption). */
  floorSubjectSpotlighted: boolean;
  /**
   * Whether `floorBar` actually mounted anywhere this frame. It docks INSIDE the floor-holder's
   * tile, so it renders nowhere at all when that delegate has no tile — grid layout with them
   * off-camera, or Agora down entirely. Consoles whose only clock is the floor bar MUST check this
   * and float a fallback, or the timer silently vanishes mid-speech.
   */
  floorBarMounted: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleScreenShare: () => void;
  leave: () => void;
  rejoin: () => void;
}

/** Per-viewer video layout: auto-switch, forced tiled grid, or forced spotlight. */
export type StageLayoutMode = "auto" | "grid" | "spotlight";

/** The on-floor subject the `stage` variant spotlights (resolved to a live camera or a flag). */
export interface StageSpotlight { uid?: string; flagCode?: string; hasFloor: boolean }

/** One rendered tile — a live broadcaster (camera/avatar) or a present audience delegate (flag). */
interface StageParticipant {
  uid: string;
  name: string;
  country?: string;
  /** Staff role label ("Chair", "Vice Chair") — rendered as a badge where delegates get a flag. */
  role?: string;
  track?: any;
  camOff: boolean;
  micMuted: boolean;
  isLocal: boolean;
  isScreen: boolean;
  hasFloor: boolean;
}

export function LiveVideoRoom({
  eventId, committeeId, dateStr, myUid, myName, myCountry, myRole, amHost,
  canControl = false, observer = false, onSession, roster = [], variant = "inline", title = "Live video",
  spotlight, stageOverlay, floorBar, chairBar, applicationId, onQuickMark,
  onGiveFloor, onToggleQueue, onYield, stageUids, activeSpeakerUid, canYieldActive,
  queuedUids, pointByUid, scoreByUid, ceremony, presencePublishSelf,
}: {
  eventId: string;
  /** Ignored when `ceremony` is set — a ceremony belongs to no committee. */
  committeeId: string;
  dateStr: string;
  myUid: string;
  myName: string;
  myCountry?: string;
  /** Staff viewers only — own role label, badged on the self tile (delegates show a country). */
  myRole?: string;
  amHost: boolean;
  /** Delegate's application id — enables the inline "Raise a point" control. */
  applicationId?: string;
  /** Chair — show the give-the-floor / clear-floor override controls. */
  canControl?: boolean;
  /**
   * GHOST OBSERVER (App Admin, /dashboard/admin/live-sessions/observe). Watches the room
   * without ever being in it: pins the Agora client to audience for life (so no `user-joined`
   * ever fires on a participant's client) and skips the RTDB presence write (so no "joined"
   * toast). Nobody in the session can tell an observer is present.
   */
  observer?: boolean;
  /**
   * Surfaces the session doc this component ALREADY subscribes to (the `stage` and `canControl`
   * variants keep a listener for the stage array + attendance). A consumer that needs phase or
   * attendance for its own chrome should take it from here rather than opening a SECOND
   * onSnapshot on the same doc — a three-hour sitting doubles its read cost otherwise, against
   * a 50k/day Spark cap. Safe to pass an inline arrow; it is held in a ref.
   */
  onSession?: (s: LiveSession | null) => void;
  /** uid → name/country for labelling remote tiles + the give-floor picker. */
  roster?: VideoRosterEntry[];
  variant?: "inline" | "floating" | "stage";
  title?: string;
  /** `stage` only — who to spotlight large + centre. */
  spotlight?: StageSpotlight;
  /** `stage` only — overlays (control bar, launchers, caption) drawn over the video; gets the mic/cam api. */
  stageOverlay?: (api: StageControlApi) => React.ReactNode;
  /**
   * `stage` only — the live clock/title strip, rendered INSIDE the floor-holder's tile (not the
   * stage overlay).
   *
   * Callback form exists because the OFFSET PARENT differs by layout: in grid this lands in the
   * floor-holder's `StageTile` (`relative overflow-hidden`), in spotlight it lands directly on the
   * stage root, where other chrome — notably the floating `GateBar` at `bottom-[76px] z-[6]` —
   * already owns real estate the tile version has free. Consumers that need to place children
   * differently per layout take the callback; a plain node is used as-is for both.
   */
  floorBar?: React.ReactNode | ((ctx: { layout: "grid" | "spotlight" }) => React.ReactNode);
  /**
   * `stage` only — chrome rendered INSIDE the viewer's OWN tile (`myUid`), GRID LAYOUT ONLY.
   *
   * For the chair's procedure bar: floating it over the stage paints across other delegates'
   * tiles, so in grid it lives in the chair's own square instead. Not rendered in spotlight —
   * there the local user is a ~190×107 `SelfPiP` and nothing useful fits; the console keeps its
   * floating bar for that case (branch on `api.effectiveLayout`).
   *
   * Same positioning contract as `floorBar`: the tile root is `relative overflow-hidden` with the
   * video at `absolute inset-0`, so children MUST be absolutely positioned or they render beneath
   * the video and are invisible.
   */
  chairBar?: React.ReactNode;
  /** `stage` + chair only — tap a delegate tile to quick-mark them. Absent = no mark button. */
  onQuickMark?: (uid: string) => void;
  /** `stage` + chair only — per-tile "Give/Clear the floor" (video-stage override, same as `setStage`). */
  onGiveFloor?: (uid: string) => void;
  /** `stage` + chair only — per-tile add/remove from the GSL speakers list. */
  onToggleQueue?: (uid: string) => void;
  /** `stage` + chair only — opens the yield popover for the active speaker's tile. */
  onYield?: (uid: string) => void;
  /** Raw `session.live.stage` uids — drives the per-tile give/clear-floor button state. */
  stageUids?: string[];
  /** `session.gsl.activeSpeaker.delegateId` — the tile that gets the Yield button instead of the queue toggle. */
  activeSpeakerUid?: string;
  /** False when the active speaker already received the floor by yield (can't yield again). */
  canYieldActive?: boolean;
  /** uids currently in `session.gsl.queue` — drives the per-tile speakers-list toggle state. */
  queuedUids?: string[];
  /** uid → pending-point badge (tinted by point type). */
  pointByUid?: Record<string, TilePointBadge>;
  /** uid → today's score chip, once the delegate has been marked. */
  scoreByUid?: Record<string, TileScoreChip>;
  /**
   * Event-wide CEREMONY room (opening / closing) instead of a committee sitting. Swaps the room
   * identity — session doc, Agora channel and presence key all derive from `eventId + kind`.
   */
  ceremony?: CeremonyKind;
  /**
   * Whether this viewer writes an RTDB presence node. Defaults to true (minus observers).
   *
   * A ceremony holds the WHOLE conference, and the Spark plan caps Realtime Database at 100
   * simultaneous connections — so ceremony participants pass false and only the people who
   * could actually be handed the floor publish. See [[spark-plan-read-budget]].
   */
  presencePublishSelf?: boolean;
}) {
  // A ceremony room is one doc per event, not per committee-day — its identity replaces
  // committeeId/dateStr everywhere below (session id, Agora channel, presence key).
  const sessionId = useMemo(
    () => (ceremony ? ceremonySessionId(ceremony) : makeSessionId(committeeId, dateStr)),
    [ceremony, committeeId, dateStr],
  );
  const enabled = !!(eventId && myUid && (ceremony || (committeeId && dateStr)));
  const [active, setActive] = useState(true); // user can leave the video and rejoin

  const {
    configured, connecting, joined, publishing, hostGranted, onStage, sessionEnded, remoteUsers,
    localCameraTrack, micOn, camOn, error, toggleMic, toggleCam,
    screenSharing, localScreenTrack, screenSupported, toggleScreenShare,
  } = useAgoraLive({
    eventId, committeeId, dateStr, myUid, amHost, observer, ceremony,
    enabled: enabled && active,
  });

  // Chairs subscribe to the session (stage array + attendance) to drive the override bar and to
  // label remote tiles. The `stage` variant ALSO needs it (even for non-chair viewers) to build the
  // audience flag tiles from attendance. Plain delegate `inline`/`floating` don't need it.
  const [session, setSession] = useState<LiveSession | null>(null);
  // Held in a ref so an inline arrow from the consumer never re-subscribes the listener.
  const onSessionRef = useRef(onSession);
  useEffect(() => { onSessionRef.current = onSession; });
  useEffect(() => {
    if ((!canControl && variant !== "stage") || !enabled) return;
    const unsub = subscribeSession(eventId, sessionId, (s) => {
      setSession(s);
      onSessionRef.current?.(s);
    });
    return () => unsub();
  }, [canControl, variant, enabled, eventId, sessionId]);

  const [collapsed, setCollapsed] = useState(false);

  // Stage layout is a per-viewer preference (never synced): each chair/co-chair chooses their view.
  const [stageRef, stageSize] = useElementSize<HTMLDivElement>();
  const [layoutMode, setLayoutMode] = useState<StageLayoutMode>("auto");
  const [pinnedUid, setPinnedUid] = useState<string | null>(null);

  // uid → identity, from the passed roster + the session's staff map + attendance (country by uid).
  // The staff pass is what stops chairs, vice-chairs and directors from all rendering as the
  // generic "Speaker" fallback — attendance only ever holds delegates, and a delegate viewer is
  // handed an empty roster, so without it EVERY staff tile on their screen would be unlabelled.
  const identityFor = useMemo(() => {
    const map = new Map<string, Identity>();
    for (const r of roster) map.set(r.uid, { name: r.name, country: r.country, role: r.role });
    for (const [uid, st] of Object.entries(session?.staff || {})) {
      if (!map.has(uid)) map.set(uid, { name: st.name || "Staff", role: roleLabel(st.role) });
    }
    const att = session?.attendance || {};
    for (const [uid, a] of Object.entries(att)) {
      if (!map.has(uid)) map.set(uid, { name: getCountryName(a.country) || a.country || "Delegate", country: a.country });
    }
    return (uid: string): Identity => map.get(uid) || { name: "Speaker" };
  }, [roster, session]);

  const stage = session?.live?.stage || [];
  const onStageDelegate = stage[0];

  // Join/leave presence toasts — "console open" presence (NOT gated by the `active` video
  // flag), stage variant only so legacy inline/floating mounts never double-write.
  // Delegates broadcast their delegation name (their console passes myName="You").
  const presenceEvents = useSessionPresence({
    eventId, sessionId, uid: myUid,
    name: myCountry ? (getCountryName(myCountry) || myCountry) : (myName || "Participant"),
    country: myCountry, role: myCountry ? undefined : myRole,
    enabled: enabled && variant === "stage",
    // An observer reads the room's join/leave traffic but writes no node of their own —
    // this is the difference between watching the room and being in it. A ceremony audience
    // passes false for a different reason entirely (the RTDB connection cap).
    publishSelf: !observer && presencePublishSelf !== false,
  });

  // ── Stage variant: Google Meet–style grid / spotlight, controls handed to the console ──
  if (variant === "stage") {
    // Unified participant model: live broadcasters (camera/avatar) + present audience (flag tiles).
    // Built into a Map so the first writer wins (a live camera always beats an attendance flag).
    const byUid = new Map<string, StageParticipant>();
    if (publishing) {
      byUid.set(myUid, {
        uid: myUid,
        name: myCountry ? (getCountryName(myCountry) || myCountry) : (myName || "You"),
        country: myCountry,
        role: myCountry ? undefined : myRole,   // staff badge their role; delegates show a flag
        track: screenSharing ? localScreenTrack : localCameraTrack,
        camOff: screenSharing ? !localScreenTrack : !camOn,
        micMuted: !micOn, isLocal: true, isScreen: screenSharing, hasFloor: false,
      });
    }
    for (const u of remoteUsers) {
      const uid = String(u.uid);
      if (byUid.has(uid)) continue;
      const id = identityFor(uid);
      byUid.set(uid, {
        uid, name: id.name, country: id.country, role: id.role,
        track: u.videoTrack, camOff: !u.videoTrack, micMuted: !u.hasAudio,
        isLocal: false, isScreen: false, hasFloor: false,
      });
    }
    for (const [uid, a] of Object.entries(session?.attendance || {})) {
      if (a.status === "absent" || uid === myUid || byUid.has(uid)) continue;
      const id = identityFor(uid);
      byUid.set(uid, {
        uid, name: id.name, country: id.country || a.country,
        track: undefined, camOff: true, micMuted: true,
        isLocal: false, isScreen: false, hasFloor: false,
      });
    }
    const floorUid = spotlight?.hasFloor ? spotlight.uid : undefined;
    if (floorUid && byUid.has(floorUid)) byUid.get(floorUid)!.hasFloor = true;

    // Stable, low-churn order: floor subject → local → other live cameras → audience flags.
    const rank = (p: StageParticipant) => (p.hasFloor ? 0 : p.isLocal ? 1 : !p.camOff ? 2 : 3);
    const participants = [...byUid.values()].sort((a, b) => rank(a) - rank(b) || a.uid.localeCompare(b.uid));

    const effectiveLayout: "grid" | "spotlight" =
      layoutMode === "grid" ? "grid"
      : layoutMode === "spotlight" ? "spotlight"
      : (pinnedUid || spotlight?.hasFloor) ? "spotlight"
      : "grid";
    // Resolved once, here rather than at each mount site, so the two branches below stay identical
    // and the consumer never has to reach for `api` to learn the layout.
    const resolvedFloorBar = typeof floorBar === "function" ? floorBar({ layout: effectiveLayout }) : floorBar;
    const subjectUid = pinnedUid ?? spotlight?.uid;
    const subject = subjectUid ? byUid.get(subjectUid) : undefined;
    const floorSubjectSpotlighted =
      effectiveLayout === "spotlight" && !!spotlight?.hasFloor && subjectUid === spotlight?.uid;
    const spotlightMicMuted = subject ? subject.micMuted : !!spotlight?.hasFloor;

    const api: StageControlApi = {
      configured, connecting, joined, publishing, hostGranted, sessionEnded, active,
      micOn, camOn, screenSharing, screenSupported, error, spotlightMicMuted,
      layoutMode, setLayoutMode, effectiveLayout, floorSubjectSpotlighted,
      // `planMosaic` pins the local user into a slot and PackedGrid ranks them 1 of MAX_TILES, so
      // presence in `participants` is sufficient — they cannot be tiered into "+N more".
      ownTileRendered: effectiveLayout === "grid" && participants.some((p) => p.uid === myUid),
      // Spotlight mounts `floorBar` free-standing; grid mounts it into the floor-holder's tile, and
      // that tile only exists if they are in `participants`. `rank()` puts hasFloor first, so they
      // can never be tiered into the overflow cell — presence is again sufficient.
      floorBarMounted: floorSubjectSpotlighted
        || (effectiveLayout === "grid" && !!floorUid && participants.some((p) => p.uid === floorUid)),
      toggleMic, toggleCam, toggleScreenShare,
      leave: () => setActive(false),
      rejoin: () => setActive(true),
    };

    const gate = !configured ? (
      <StageMessage icon={VideoOff} title="Live video isn’t configured"
        body="Add NEXT_PUBLIC_AGORA_APP_ID and AGORA_APP_CERTIFICATE to enable camera & mic." />
    ) : sessionEnded ? (
      session?.live?.callEnded && session.phase !== "closed" && !session.finalized ? (
        <div className="flex flex-col items-center gap-3.5 text-center px-6 max-w-sm text-white/70">
          <PhoneOff className="w-9 h-9 text-white/40" />
          <p className="text-[15px] font-semibold text-white/90">The live call has ended</p>
          <p className="text-[13px] text-white/55">The host ended the call for everyone.</p>
          {canControl && (
            <button type="button" onClick={() => startLiveCall(eventId, sessionId)}
              className="mt-1 inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              <Video className="w-4 h-4" /> Restart call
            </button>
          )}
        </div>
      ) : (
        <StageMessage icon={Radio} title="Session ended" body="The chair has closed this session — video is off." />
      )
    ) : !active ? (
      <button type="button" onClick={() => setActive(true)}
        className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Video className="w-4 h-4" /> Join live video
      </button>
    ) : null;

    return (
      // The stage is always dark (see useLiveTheme.ts), so on a light console it is a dark rectangle
      // sitting in a light room. Rounded corners plus a soft drop shadow make it read as a monitor
      // inset in the desk rather than a hole punched through the page. Literal rgba, not a token:
      // this element is INSIDE the `.dark` subtree, so `--border`/`--foreground` here resolve to the
      // dark palette and would draw a shadow the light desk cannot show.
      <div ref={stageRef}
        className="relative flex-1 min-h-0 overflow-hidden rounded-2xl bg-[radial-gradient(120%_120%_at_50%_35%,#26323a_0%,#1a2126_55%,#12161a_100%)] shadow-[0_1px_3px_rgba(0,0,0,0.10),0_8px_24px_rgba(0,0,0,0.12)]">
        {gate ? (
          <div className="absolute inset-0 flex items-center justify-center">{gate}</div>
        ) : effectiveLayout === "spotlight" ? (
          <SpotlightView
            subject={subject} spotlight={spotlight} connecting={connecting} publishing={publishing}
            isLocalSubject={subject?.isLocal ?? false}
            local={{
              track: screenSharing ? localScreenTrack : localCameraTrack,
              camOff: screenSharing ? !localScreenTrack : !camOn,
              micMuted: !micOn, name: myName, country: myCountry,
            }}
            others={participants.filter((p) => p.uid !== subjectUid && p.uid !== myUid && !p.camOff)}
            onQuickMark={onQuickMark}
            onGiveFloor={onGiveFloor} onToggleQueue={onToggleQueue} onYield={onYield}
            stageUids={stageUids} activeSpeakerUid={activeSpeakerUid} canYieldActive={canYieldActive}
            queuedUids={queuedUids} pointByUid={pointByUid} scoreByUid={scoreByUid}
            floorBar={floorSubjectSpotlighted ? resolvedFloorBar : undefined}
          />
        ) : participants.length === 0 ? (
          <IdleCenter connecting={connecting} />
        ) : (
          <TileGrid participants={participants} width={stageSize.width} height={stageSize.height}
            pinnedUid={pinnedUid} onPin={setPinnedUid} onStageUid={floorUid} onQuickMark={onQuickMark}
            onGiveFloor={onGiveFloor} onToggleQueue={onToggleQueue} onYield={onYield}
            stageUids={stageUids} activeSpeakerUid={activeSpeakerUid} canYieldActive={canYieldActive}
            queuedUids={queuedUids} pointByUid={pointByUid} scoreByUid={scoreByUid}
            floorUid={floorUid} floorBar={resolvedFloorBar}
            chairUid={myUid} chairBar={chairBar}
          />
        )}

        {/* Join/leave notifications — bottom-left, opposite the global toast stack */}
        <PresenceToasts events={presenceEvents} />

        {/* Console-drawn overlays: caption, control bar, launchers */}
        {stageOverlay?.(api)}
      </div>
    );
  }

  // ── Not configured — a quiet nudge for chairs, nothing for delegates ────────────
  if (!configured) {
    if (!canControl) return null;
    return (
      <Shell variant={variant} collapsed={collapsed} setCollapsed={setCollapsed} title={title} tag="Off">
        <p className="text-xs text-muted-foreground p-3">
          Live video isn’t configured. Add <code className="text-[11px]">NEXT_PUBLIC_AGORA_APP_ID</code> and{" "}
          <code className="text-[11px]">AGORA_APP_CERTIFICATE</code> to enable camera/mic.
        </p>
      </Shell>
    );
  }

  // Host ended the call / closed / finalized — video is off for everyone; no rejoin (auto-rejoins
  // if the host restarts the call while the session is still open).
  if (sessionEnded) {
    return (
      <Shell variant={variant} collapsed={collapsed} setCollapsed={setCollapsed} title={title} tag="Ended">
        <div className="p-4 flex flex-col items-center justify-center gap-1.5 text-center">
          <Radio className="w-6 h-6 text-muted-foreground/40" />
          <p className="text-xs font-semibold text-foreground">Live video ended</p>
          <p className="text-[11px] text-muted-foreground">The host ended the live video for this session.</p>
        </div>
      </Shell>
    );
  }

  // User left the room — offer a rejoin.
  if (!active) {
    return (
      <Shell variant={variant} collapsed={collapsed} setCollapsed={setCollapsed} title={title} tag="Off">
        <div className="p-3">
          <button type="button" onClick={() => setActive(true)}
            className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
            <Video className="w-4 h-4" /> Join live video
          </button>
        </div>
      </Shell>
    );
  }

  const remoteTiles = remoteUsers.map((u) => {
    const id = identityFor(String(u.uid));
    return (
      <VideoTile
        key={String(u.uid)}
        track={u.videoTrack}
        name={id.name}
        flagCode={id.country}
        micMuted={!u.hasAudio}
        camOff={!u.videoTrack}
        highlight={String(u.uid) === onStageDelegate}
        compact={variant === "floating"}
      />
    );
  });

  const body = (
    <div className="p-3 space-y-3">
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5">
          <VideoOff className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
        </p>
      )}

      {/* Chair override — give the floor to any delegate / clear it */}
      {canControl && (
        <div className="flex items-center gap-2">
          <Select
            value={onStageDelegate || ""}
            onValueChange={(v) => setStage(eventId, sessionId, v ? [v] : [])}
          >
            <SelectTrigger className="h-9 flex-1 text-xs">
              <SelectValue placeholder="Give the floor to…">
                {(val) => {
                  if (!val) return "Give the floor to…";
                  const id = identityFor(val as string);
                  return id.country
                    ? <CountryFlag code={id.country} size={15} showName />
                    : id.name;
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
          <button
            type="button"
            onClick={() => setStage(eventId, sessionId, [])}
            disabled={stage.length === 0}
            title="Clear the floor"
            className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border/60 text-xs font-semibold text-muted-foreground hover:bg-secondary/50 disabled:opacity-40 transition-colors"
          >
            <Square className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {/* Tiles */}
      <div className={cn(
        "grid gap-2",
        variant === "floating" ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3",
      )}>
        {publishing && (
          <VideoTile
            track={screenSharing ? localScreenTrack : localCameraTrack}
            name={myCountry ? (getCountryName(myCountry) || myCountry) : myName}
            flagCode={myCountry}
            micMuted={!micOn}
            camOff={screenSharing ? !localScreenTrack : !camOn}
            isLocal
            contain={screenSharing}
            badge={screenSharing ? "Screen" : undefined}
            compact={variant === "floating"}
          />
        )}
        {remoteTiles}
        {joined && !publishing && remoteTiles.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
            <Radio className="w-6 h-6 opacity-40" />
            <p className="text-xs">Waiting for the chair to go live…</p>
          </div>
        )}
        {connecting && (
          <div className="col-span-full flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-xs">Connecting…</span>
          </div>
        )}
      </div>

      {/* Delegate "you're on the floor" hint */}
      {!amHost && onStage && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <Hand className="w-3.5 h-3.5" /> You have the floor — your camera & mic are live.
        </p>
      )}

      {/* Delegate "raise a point" — reachable whether or not they hold the floor */}
      {!amHost && applicationId && eventId && committeeId && dateStr && myUid && (
        <RaisePointMenu
          eventId={eventId}
          sessionId={sessionId}
          identity={{ delegateId: myUid, country: myCountry || "", applicationId, eventId, committeeId, dateStr }}
        />
      )}

      {/* Self mic / cam / screen controls (only while broadcasting) */}
      {publishing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={toggleMic}
              className={cn("h-9 flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors",
                micOn ? "border-border/60 hover:bg-secondary/50" : "border-red-500/40 bg-red-500/10 text-red-600")}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />} {micOn ? "Mute" : "Unmute"}
            </button>
            <button
              type="button" onClick={toggleCam} disabled={screenSharing}
              className={cn("h-9 flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors",
                camOn ? "border-border/60 hover:bg-secondary/50" : "border-red-500/40 bg-red-500/10 text-red-600",
                screenSharing && "opacity-40 pointer-events-none")}
            >
              {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />} {camOn ? "Stop video" : "Start video"}
            </button>
          </div>
          {screenSupported && (
            <button
              type="button" onClick={toggleScreenShare}
              className={cn("w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors",
                screenSharing ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 hover:bg-secondary/50")}
            >
              <Monitor className="w-4 h-4" /> {screenSharing ? "Stop sharing" : "Share screen"}
            </button>
          )}
        </div>
      )}

      {/* Leave / hang up (rejoin anytime) */}
      {joined && (
        <button
          type="button" onClick={() => setActive(false)}
          className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 text-xs font-semibold text-muted-foreground hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30 transition-colors"
        >
          <PhoneOff className="w-4 h-4" /> Leave video
        </button>
      )}
    </div>
  );

  const liveCount = remoteUsers.length + (publishing ? 1 : 0);
  return (
    <Shell variant={variant} collapsed={collapsed} setCollapsed={setCollapsed} title={title}
      tag={connecting ? "…" : joined ? `${liveCount} live` : "Off"} live={joined}>
      {body}
    </Shell>
  );
}

/** Layout chrome: an inline card, or a collapsible floating dock (bottom-right). */
function Shell({
  variant, collapsed, setCollapsed, title, tag, live, children,
}: {
  variant: "inline" | "floating";
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  title: string;
  tag: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  const header = (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
      <span className={cn("relative flex h-2 w-2", live && "text-primary")}>
        {live && <span className="absolute inline-flex h-full w-full rounded-full bg-primary/50 animate-ping" />}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", live ? "bg-primary" : "bg-muted-foreground/40")} />
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{title}</span>
      <span className="ml-auto text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-secondary/60 text-muted-foreground">{tag}</span>
      {variant === "floating" && (
        <button type="button" onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-md hover:bg-secondary/60 text-muted-foreground" title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      )}
    </div>
  );

  if (variant === "floating") {
    return (
      <div className="fixed bottom-4 right-4 z-40 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl bg-background border border-border/60 shadow-lg shadow-black/5 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
        {header}
        {!collapsed && children}
      </div>
    );
  }
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {header}
      {children}
    </div>
  );
}

// ── Stage-variant helpers ─────────────────────────────────────────────────────────
/** Plays one Agora track full-bleed into the stage (same play/stop surface as VideoTile). */
function StagePlayer({ track, mirror, contain }: { track: any; mirror?: boolean; contain?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    try { track.play(el, { fit: contain ? "contain" : "cover", mirror: !!mirror }); }
    catch (e) { console.error("[agora] stage play", e); }
    return () => { try { track.stop(); } catch { /* already closed */ } };
  }, [track, mirror, contain]);
  return <div ref={ref} className="absolute inset-0 [&>*]:!w-full [&>*]:!h-full" />;
}

/** Large circular country flag for the spotlight when the on-floor delegate has no live camera. */
function StageFlag({ code, size }: { code: string; size: number }) {
  const country = getCountry(code);
  if (!country || !isCountryCode(country.code)) {
    return (
      <div className="rounded-full bg-white/10 flex items-center justify-center shadow-[0_0_0_4px_rgba(255,255,255,.12),0_12px_40px_rgba(0,0,0,.4)]"
        style={{ width: size, height: size }}>
        <Radio className="w-10 h-10 text-white/50" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- circular flag; next/image can't crop a flag CDN sprite to a circle here
    <img src={flagUrl(country.code)} alt=""
      className="rounded-full object-cover shadow-[0_0_0_4px_rgba(255,255,255,.12),0_12px_40px_rgba(0,0,0,.4)]"
      style={{ width: size, height: size }} />
  );
}

function StageMessage({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center px-6 max-w-sm text-white/70">
      <Icon className="w-9 h-9 text-white/40" />
      <p className="text-[15px] font-semibold text-white/90">{title}</p>
      <p className="text-[13px] text-white/55">{body}</p>
    </div>
  );
}

/** Centred "no active speaker / connecting" state (spotlight big-subject fallback + empty grid). */
function IdleCenter({ connecting }: { connecting: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 text-white/55">
      {connecting ? <Loader2 className="w-12 h-12 animate-spin" /> : <Mic className="w-12 h-12" />}
      <span className="text-[15px] font-semibold">{connecting ? "Connecting…" : "Floor open — no active speaker"}</span>
    </div>
  );
}

/**
 * Bottom-left join/leave pills — small, transient, non-interactive. Sits opposite the
 * dashboard's global toast stack (fixed bottom-right) so the two never collide, and
 * clear of the centred Meet control bar + right-side launchers.
 */
function PresenceToasts({ events }: { events: PresenceEvent[] }) {
  return (
    <div className="absolute left-4 bottom-6 z-[3] space-y-1.5 pointer-events-none">
      <AnimatePresence>
        {events.map((ev) => (
          <motion.div
            key={ev.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2 rounded-lg bg-black/70 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 max-w-[240px]"
          >
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
              ev.kind === "join" ? "bg-emerald-400" : "bg-red-400/80")} />
            {ev.country && <CountryFlag code={ev.country} size={14} />}
            <span className="truncate">
              <span className="font-semibold">{ev.role ? `${ev.name} (${ev.role})` : ev.name}</span>
              <span className="text-white/60"> {ev.kind === "join" ? "joined" : "left"}</span>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Camera-off avatar: a circular country flag, else initials on the tile's gradient. */
function TileAvatar({ country, name, size }: { country?: string; name: string; size: number }) {
  if (country) return <StageFlag code={country} size={size} />;
  return (
    <div className="rounded-full bg-white/15 flex items-center justify-center text-white font-bold shadow-[0_0_0_4px_rgba(255,255,255,.1)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {getInitials(name)}
    </div>
  );
}

/** Everything a tile needs beyond its own participant — shared by the packed grid and the mosaic. */
interface TileZoneProps {
  pinnedUid: string | null;
  onPin: (uid: string | null) => void;
  onStageUid?: string;
  onQuickMark?: (uid: string) => void;
  onGiveFloor?: (uid: string) => void;
  onToggleQueue?: (uid: string) => void;
  onYield?: (uid: string) => void;
  stageUids?: string[];
  activeSpeakerUid?: string;
  canYieldActive?: boolean;
  queuedUids?: string[];
  pointByUid?: Record<string, TilePointBadge>;
  scoreByUid?: Record<string, TileScoreChip>;
  floorUid?: string;
  floorBar?: React.ReactNode;
  /** The viewer's own uid — `chairBar` renders into this tile and no other. */
  chairUid?: string;
  chairBar?: React.ReactNode;
}

/** A `StageTile` with the zone plumbing applied, so neither layout repeats the prop spread. */
function ZoneTile({ p, tier, w, h, z }: {
  p: StageParticipant; tier?: TileTier; w?: number; h?: number; z: TileZoneProps;
}) {
  return (
    <StageTile p={p} w={w} h={h} tier={tier}
      pinned={z.pinnedUid === p.uid} onPin={z.onPin} highlight={p.uid === z.onStageUid}
      onQuickMark={z.onQuickMark} onGiveFloor={z.onGiveFloor} onToggleQueue={z.onToggleQueue} onYield={z.onYield}
      stageGiven={!!z.stageUids?.includes(p.uid)} isActiveSpeaker={p.uid === z.activeSpeakerUid}
      canYield={z.canYieldActive} inQueue={!!z.queuedUids?.includes(p.uid)}
      point={z.pointByUid?.[p.uid]} scoreChip={z.scoreByUid?.[p.uid]}
      floorBar={p.uid === z.floorUid ? z.floorBar : undefined}
      chairBar={p.uid === z.chairUid ? z.chairBar : undefined}
    />
  );
}

/** Overflow cell — the tail the layout couldn't show. */
function MoreTile({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/70 text-sm font-semibold", className)}>
      +{count} more
    </div>
  );
}

/**
 * Tiled layout router: a priority mosaic once the stage is wide enough and the room is worth
 * tiering, else the equal Meet packing. Small calls (two people, everyone on camera) still get
 * two big halves — tiering a room that small only shrinks it.
 */
function TileGrid({ participants, width, height, ...z }: {
  participants: StageParticipant[]; width: number; height: number;
} & TileZoneProps) {
  if (width === 0 || height === 0) return <div className="absolute inset-0" />;
  return shouldMosaic(participants, width)
    ? <MosaicGrid participants={participants} {...z} />
    : <PackedGrid participants={participants} width={width} height={height} {...z} />;
}

/**
 * Priority mosaic: the floor-holder and the chair take the stage, the next few broadcasters
 * stack in a side column, and its last cell is a single "+N more" absorbing everyone else.
 * Zones are flex ratios — no pixel solver, so it reflows on its own.
 */
function MosaicGrid({ participants, ...z }: { participants: StageParticipant[] } & TileZoneProps) {
  const plan = planMosaic(participants);
  const hasMid = plan.mid.length > 0 || plan.overflow > 0;
  return (
    <div className="absolute inset-0 p-3 flex gap-2.5">
      <div className="flex-1 min-w-0 flex gap-2.5">
        {plan.heroes.map((p) => (
          <div key={p.uid} className="flex-1 min-w-0"><ZoneTile p={p} tier="hero" z={z} /></div>
        ))}
      </div>

      {hasMid && (
        <div className="w-[clamp(140px,20%,240px)] shrink-0 flex flex-col gap-2.5">
          {plan.mid.map((p) => (
            <div key={p.uid} className="flex-1 min-h-0"><ZoneTile p={p} tier="mid" z={z} /></div>
          ))}
          {plan.overflow > 0 && <MoreTile count={plan.overflow} className="flex-1 min-h-0" />}
        </div>
      )}
    </div>
  );
}

/** Google Meet–style tiled grid: equal tiles sized to fill the stage, centred via flex-wrap. */
function PackedGrid({ participants, width, height, ...z }: {
  participants: StageParticipant[]; width: number; height: number;
} & TileZoneProps) {
  const capped = participants.length > MAX_TILES;
  const visible = capped ? participants.slice(0, MAX_TILES - 1) : participants;
  const overflow = participants.length - visible.length;
  const n = visible.length + (overflow > 0 ? 1 : 0);
  // Subtract the container's p-3 (12px each side) so packed tiles fit inside the padding.
  const plan = useMemo(() => bestGrid(n, width - 24, height - 24, { gap: 10 }), [n, width, height]);

  if (plan.tileW === 0) return <div className="absolute inset-0" />;

  return (
    <div className="absolute inset-0 p-3 grid place-content-center gap-2.5"
      style={{ gridTemplateColumns: `repeat(${plan.cols}, ${plan.tileW}px)`, gridAutoRows: `${plan.tileH}px` }}>
      {visible.map((p) => (
        <ZoneTile key={p.uid} p={p} w={plan.tileW} h={plan.tileH} z={z} />
      ))}
      {overflow > 0 && <MoreTile count={overflow} />}
    </div>
  );
}

/** Small round tile-action button — the icon-only sibling of the amber "Mark" pill. */
function TileActionButton({
  title, icon: Icon, onClick, tone = "neutral", size = "sm", filled = false,
}: {
  title: string; icon: React.ElementType; onClick: (e: React.MouseEvent) => void;
  tone?: "neutral" | "primary" | "red" | "emerald" | "amber"; size?: "sm" | "md"; filled?: boolean;
}) {
  const toneClass = {
    neutral: "bg-black/50 text-white hover:bg-black/65",
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    red: "bg-red-500 text-white hover:bg-red-600",
    emerald: "bg-emerald-500 text-white hover:bg-emerald-500/90",
    amber: "bg-amber-400 text-black hover:bg-amber-300",
  }[tone];
  const dim = size === "md" ? "w-7 h-7" : "w-6 h-6";
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(e); }} title={title} aria-label={title}
      className={cn(dim, "rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95", toneClass)}>
      <Icon className={size === "md" ? "w-3.5 h-3.5" : "w-3 h-3"} fill={filled ? "currentColor" : "none"} />
    </button>
  );
}

/** Mosaic zone a tile sits in — drives avatar size and label density. */
type TileTier = "hero" | "mid";

/** One grid tile — a live camera, or an avatar/flag on a deterministic gradient when cam is off. */
function StageTile({
  p, w, h, tier = "hero", pinned, onPin, highlight, onQuickMark,
  onGiveFloor, onToggleQueue, onYield, stageGiven, isActiveSpeaker, canYield, inQueue,
  point, scoreChip, floorBar, chairBar,
}: {
  p: StageParticipant;
  /** Packed-grid cell size. Absent in the mosaic, where flex zones own the sizing. */
  w?: number; h?: number;
  tier?: TileTier;
  pinned: boolean;
  onPin: (uid: string | null) => void; highlight?: boolean;
  onQuickMark?: (uid: string) => void;
  onGiveFloor?: (uid: string) => void;
  onToggleQueue?: (uid: string) => void;
  onYield?: (uid: string) => void;
  stageGiven?: boolean;
  isActiveSpeaker?: boolean;
  canYield?: boolean;
  floorBar?: React.ReactNode;
  /** Only ever non-null on the viewer's own tile — see LiveVideoRoom's `chairBar` prop. */
  chairBar?: React.ReactNode;
  inQueue?: boolean;
  point?: TilePointBadge;
  scoreChip?: TileScoreChip;
}) {
  const showCam = !p.camOff && !!p.track;
  // Never on the chair's own tile, and never on another staff member's — these actions are for delegates.
  const canAct = !p.isLocal && !p.role;
  const canMark = !!onQuickMark && canAct;
  // Packed grid measures its cells; the mosaic doesn't, so each zone gets a fixed avatar.
  const avatarSize = w && h
    ? Math.max(28, Math.round(Math.min(w, h) * 0.34))
    : tier === "mid" ? 52 : 88;
  const PointIcon = point?.icon;
  return (
    <div className={cn("group relative w-full h-full rounded-2xl overflow-hidden bg-black/40", highlight && "ring-2 ring-emerald-400/80")}>
      {showCam ? (
        <StagePlayer track={p.track} mirror={p.isLocal && !p.isScreen} contain={p.isScreen} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: avatarGradient(p.uid) }}>
          <TileAvatar country={p.country} name={p.name} size={avatarSize} />
        </div>
      )}

      {/* Top-right identity badge & status cluster (glassmorphic pill) */}
      <div className="absolute top-2 right-2 z-[5] flex items-center gap-1.5 max-w-[calc(100%-1rem)] pointer-events-auto">
        <button type="button" onClick={() => onPin(pinned ? null : p.uid)}
          title={pinned ? "Unpin" : "Pin to spotlight"} aria-label={pinned ? "Unpin" : "Pin to spotlight"}
          className={cn("w-6 h-6 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center transition-all shrink-0 border border-white/10 shadow-sm",
            pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}>
          {pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        </button>

        {/* Identity Glass Pill: Flag/Point + Name + Role + Score + Mic Status */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-white shadow-lg max-w-full min-w-0">
          {point && PointIcon && (
            <span className={cn("shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px]", panelTone(point.tone).chip)}
              title="Has a point raised">
              <PointIcon className="w-2.5 h-2.5" />
            </span>
          )}
          {p.country && <CountryFlag code={p.country} size={14} className="shrink-0" />}
          <span className={cn("font-semibold text-white truncate drop-shadow-sm", tier === "mid" ? "text-[11px]" : "text-[12px]")}>
            {p.name}{p.isLocal ? " · You" : ""}
          </span>
          {p.role && (
            <span className={cn(
              "shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider shadow-sm",
              p.role.toUpperCase().includes("CHAIR")
                ? "bg-amber-400 text-black"
                : p.role.toUpperCase().includes("SECRETARIAT")
                ? "bg-purple-500 text-white"
                : "bg-white/20 text-white"
            )}>
              {p.role}
            </span>
          )}
          {scoreChip && (
            <span className={cn("h-4 px-1.5 rounded-full flex items-center gap-0.5 text-[9.5px] font-bold tabular-nums shrink-0",
              scoreChip.tone === "emerald" ? "bg-emerald-500/90 text-white"
                : scoreChip.tone === "red" ? "bg-red-500/90 text-white" : "bg-white/20 text-white")}>
              <Star className="w-2.5 h-2.5" fill="currentColor" /> {scoreChip.label}
            </span>
          )}
          {p.micMuted && (
            <span className="shrink-0 text-red-400 ml-0.5" title="Muted">
              <MicOff className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>

      {/* Hover actions — centered on the tile (clickable only on hover) so the bottom stays clean */}
      {(canAct || canMark) && (
        <div className="absolute inset-0 z-[3] flex items-center justify-center gap-2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-all">
          {canAct && onGiveFloor && (
            <TileActionButton size="md"
              title={stageGiven ? "Clear the floor" : "Give the floor"}
              icon={stageGiven ? Square : Mic} tone={stageGiven ? "red" : "neutral"}
              onClick={() => onGiveFloor(p.uid)} />
          )}
          {canAct && isActiveSpeaker && canYield && onYield && (
            <TileActionButton size="md" title="Yield the floor" icon={CornerDownRight} tone="amber"
              onClick={() => onYield(p.uid)} />
          )}
          {canAct && !isActiveSpeaker && onToggleQueue && (
            <TileActionButton size="md"
              title={inQueue ? "Remove from speakers list" : "Add to speakers list"}
              icon={inQueue ? ListChecks : ListPlus} tone={inQueue ? "emerald" : "neutral"}
              onClick={() => onToggleQueue(p.uid)} />
          )}
          {canMark && (
            <button type="button" onClick={() => onQuickMark!(p.uid)}
              title={`Mark ${p.name}`} aria-label={`Mark ${p.name}`}
              className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full bg-amber-400 text-black text-[12px] font-bold shadow-lg shadow-black/30 hover:bg-amber-300 active:scale-95 transition-all">
              <Star className="w-3.5 h-3.5" fill="currentColor" /> Mark
            </button>
          )}
        </div>
      )}

      {/* Live clock/title strip for the floor-holder — rendered inside this delegate's tile */}
      {floorBar}

      {/* The viewer's own procedure chrome (chair gate bar), grid layout only. Last so it wins
          paint order against the identity label it docks above. */}
      {chairBar}
    </div>
  );
}

/** Spotlight layout: one big subject + a self-PiP bottom-right + an optional filmstrip of the rest. */
function SpotlightView({
  subject, spotlight, connecting, publishing, isLocalSubject, local, others, onQuickMark,
  onGiveFloor, onToggleQueue, onYield, stageUids, activeSpeakerUid, canYieldActive,
  queuedUids, pointByUid, scoreByUid, floorBar,
}: {
  subject?: StageParticipant; spotlight?: StageSpotlight; connecting: boolean; publishing: boolean;
  isLocalSubject: boolean;
  local: { track?: any; camOff: boolean; micMuted: boolean; name: string; country?: string };
  others: StageParticipant[];
  onQuickMark?: (uid: string) => void;
  onGiveFloor?: (uid: string) => void;
  onToggleQueue?: (uid: string) => void;
  onYield?: (uid: string) => void;
  stageUids?: string[];
  activeSpeakerUid?: string;
  canYieldActive?: boolean;
  queuedUids?: string[];
  pointByUid?: Record<string, TilePointBadge>;
  scoreByUid?: Record<string, TileScoreChip>;
  floorBar?: React.ReactNode;
}) {
  const big = subject && !subject.camOff && subject.track ? (
    <StagePlayer track={subject.track} mirror={subject.isLocal && !subject.isScreen} contain={subject.isScreen} />
  ) : subject?.country ? (
    <StageFlag code={subject.country} size={118} />
  ) : spotlight?.flagCode ? (
    <StageFlag code={spotlight.flagCode} size={118} />
  ) : (
    <IdleCenter connecting={connecting} />
  );
  const subjectLabel = subject
    ? (subject.country
        ? (getCountryName(subject.country) || subject.country)
        : [subject.name, subject.role].filter(Boolean).join(" · "))
    : "";
  const canActSubject = !!subject && !subject.isLocal && !subject.role;
  const canMarkSubject = !!onQuickMark && canActSubject;
  const subjectStageGiven = !!subject && (stageUids || []).includes(subject.uid);
  const subjectIsActiveSpeaker = !!subject && subject.uid === activeSpeakerUid;
  const subjectInQueue = !!subject && (queuedUids || []).includes(subject.uid);
  const subjectScoreChip = subject ? scoreByUid?.[subject.uid] : undefined;
  const subjectPoint = subject ? pointByUid?.[subject.uid] : undefined;
  const SubjectPointIcon = subjectPoint?.icon;

  return (
    <>
      <div className="absolute inset-0 flex items-center justify-center">{big}</div>

      {/* Live clock/title strip for the on-floor speaker — rendered inside the spotlight subject's tile */}
      {floorBar}

      {/* Status chips for the big subject — score + raised point; pushed below the floor strip when present. */}
      {(subjectScoreChip || subjectPoint) && (
        <div className={cn("absolute left-4 z-[3] flex items-center gap-2", floorBar ? "top-[92px]" : "top-4")}>
          {subjectPoint && SubjectPointIcon && (
            <span className={cn("w-8 h-8 rounded-full flex items-center justify-center", panelTone(subjectPoint.tone).chip)}
              title="Has a point raised">
              <SubjectPointIcon className="w-4 h-4" />
            </span>
          )}
          {subjectScoreChip && (
            <span className={cn("h-8 px-2.5 rounded-full flex items-center gap-1.5 text-[12px] font-bold tabular-nums",
              subjectScoreChip.tone === "emerald" ? "bg-emerald-500/90 text-white"
                : subjectScoreChip.tone === "red" ? "bg-red-500/90 text-white" : "bg-white/20 text-white")}>
              <Star className="w-3.5 h-3.5" fill="currentColor" /> {subjectScoreChip.label}
            </span>
          )}
        </div>
      )}

      {/* Give floor / yield / speakers-list / Mark — prominent, top-right, clear of the filmstrip & self-PiP. */}
      {canActSubject && (
        <div className="absolute top-4 right-4 z-[3] flex items-center gap-2">
          {onGiveFloor && (
            <TileActionButton size="md"
              title={subjectStageGiven ? "Clear the floor" : "Give the floor"}
              icon={subjectStageGiven ? Square : Mic} tone={subjectStageGiven ? "red" : "neutral"}
              onClick={() => onGiveFloor(subject!.uid)} />
          )}
          {subjectIsActiveSpeaker && canYieldActive && onYield && (
            <TileActionButton size="md" title="Yield the floor" icon={CornerDownRight} tone="amber"
              onClick={() => onYield(subject!.uid)} />
          )}
          {!subjectIsActiveSpeaker && onToggleQueue && (
            <TileActionButton size="md"
              title={subjectInQueue ? "Remove from speakers list" : "Add to speakers list"}
              icon={subjectInQueue ? ListChecks : ListPlus} tone={subjectInQueue ? "emerald" : "neutral"}
              onClick={() => onToggleQueue(subject!.uid)} />
          )}
          {canMarkSubject && (
            <button type="button" onClick={() => onQuickMark!(subject!.uid)}
              title={`Mark ${subjectLabel}`}
              className="inline-flex items-center gap-2 h-10 pl-3 pr-4 rounded-full bg-amber-400 text-black text-[13px] font-bold shadow-lg shadow-black/30 hover:bg-amber-300 active:scale-95 transition-all">
              <Star className="w-4 h-4" fill="currentColor" /> Mark {subjectLabel}
            </button>
          )}
        </div>
      )}

      {others.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[2] flex gap-2 max-w-[64%] overflow-x-auto px-2 py-1">
          {others.map((p) => {
            const canActOther = !p.isLocal && !p.role;
            const otherInQueue = (queuedUids || []).includes(p.uid);
            const otherIsActiveSpeaker = p.uid === activeSpeakerUid;
            return (
              <div key={p.uid} className="group/ft relative w-32 shrink-0">
                <VideoTile track={p.track} name={p.name} flagCode={p.country} micMuted={p.micMuted} camOff={p.camOff} compact />
                <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover/ft:opacity-100 focus-within:opacity-100 transition-all">
                  {canActOther && onToggleQueue && !otherIsActiveSpeaker && (
                    <TileActionButton title={otherInQueue ? "Remove from speakers list" : "Add to speakers list"}
                      icon={otherInQueue ? ListChecks : ListPlus} tone={otherInQueue ? "emerald" : "neutral"}
                      onClick={() => onToggleQueue(p.uid)} />
                  )}
                  {onQuickMark && !p.isLocal && (
                    <TileActionButton title={`Mark ${p.name}`} icon={Star} tone="amber" filled
                      onClick={() => onQuickMark(p.uid)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {publishing && !isLocalSubject && (
        <SelfPiP track={local.camOff ? undefined : local.track} camOff={local.camOff}
          micMuted={local.micMuted} name={local.name} country={local.country} />
      )}
    </>
  );
}

/** The local user's own small picture-in-picture, bottom-right (Meet-style). */
function SelfPiP({
  track, camOff, micMuted, name, country,
}: { track?: any; camOff: boolean; micMuted: boolean; name: string; country?: string }) {
  return (
    <div className="absolute bottom-4 right-4 z-[2] w-[190px] max-w-[40vw] aspect-video rounded-xl overflow-hidden border border-white/15 shadow-xl shadow-black/40 bg-black/50">
      {!camOff && track ? (
        <StagePlayer track={track} mirror />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: avatarGradient("self") }}>
          <TileAvatar country={country} name={name} size={44} />
        </div>
      )}
      <div className="absolute bottom-1 left-2 flex items-center gap-1 text-white text-[11px] font-semibold drop-shadow">
        {micMuted && <MicOff className="w-3 h-3 text-red-300" />} You
      </div>
    </div>
  );
}
