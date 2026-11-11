"use client";

/**
 * Ceremony room — the opening / closing ceremony of a conference, hosted by the ORGANIZER.
 *
 * Not a committee sitting and deliberately not shaped like one. There is no roll call, no
 * speakers list, no voting and no chat: one host on camera, whoever they hand the microphone
 * to, and everybody else watching. It reuses the committee video stack wholesale
 * (`LiveVideoRoom variant="stage"` + the Agora token route's ceremony branch) — what makes it a
 * ceremony is the reserved session doc it points at, not a second video system.
 *
 * WHY THERE IS NO CHAT HERE. The `/chat` rule requires `uid in session.attendance`, and a
 * ceremony doc's attendance map is empty by construction — so "no chat in a ceremony" is
 * enforced at the rules layer, and this file simply never mounts the dock.
 *
 * PRESENCE IS ASYMMETRIC ON PURPOSE. Only people who could plausibly be given the floor (event
 * staff and the host) publish an RTDB presence node; a ceremony can hold the whole conference
 * and the Spark plan caps Realtime Database at 100 simultaneous connections. Delegates watch
 * silently and are still promotable — `live.stage` is the authority, never presence.
 * See [[spark-plan-read-budget]].
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Users, Sparkles,
  Loader2, StopCircle, Sun, Moon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { roleLabel } from "@/lib/services/staffService";
import type { LiveSession } from "@/lib/services/sessionService";
import {
  ceremonyLabel, ceremonySessionId, endCeremony, setCeremonyStage,
  type CeremonyKind, type EventLiveControl,
} from "@/lib/services/liveControlService";
import { usePresenceRoster } from "@/components/session/useSessionPresence";
import { useLiveTheme, consoleShellClass } from "@/components/session/useLiveTheme";
import { RoundBtn, LauncherBtn, LayoutSwitcher } from "@/components/session/console/shared";
import { ControlBarRow } from "@/components/session/console/barMenu";
import type { StageControlApi } from "@/components/session/video/LiveVideoRoom";
import { CeremonyFloorPanel } from "./CeremonyFloorPanel";
import { cn } from "@/lib/utils";

// Agora only exists in the browser (same contract as every other live surface).
const LiveVideoRoom = dynamic(
  () => import("@/components/session/video/LiveVideoRoom").then((m) => m.LiveVideoRoom),
  { ssr: false },
);

export function CeremonyConsole({
  eventId, kind, control, eventTitle, exitHref,
}: {
  eventId: string;
  kind: CeremonyKind;
  control: EventLiveControl;
  eventTitle: string;
  exitHref: string;
}) {
  const { user } = useAuth();
  const staffRole = useEventStaffRole(eventId);
  const [liveTheme, setLiveTheme] = useLiveTheme();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [floorOpen, setFloorOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  const sessionId = useMemo(() => ceremonySessionId(kind), [kind]);
  const isHost = staffRole.isOrganizerLevel;
  // Everyone who could be handed the microphone announces themselves; the audience does not.
  const publishPresence = isHost || !!staffRole.role;

  const roster = usePresenceRoster({
    eventId, sessionId,
    // Only the host reads the room — nobody else has a picker to fill.
    enabled: isHost && !!eventId,
  });

  const stage = session?.live?.stage || [];
  const title = control[kind]?.title || ceremonyLabel(kind);
  const ended = control[kind]?.status !== "live" || session?.phase === "closed";

  // The host's own tile should never appear in their own floor picker.
  const myUid = user?.uid || "";

  useEffect(() => {
    if (!floorOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFloorOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [floorOpen]);

  const handleEnd = async () => {
    if (!isHost || ending) return;
    if (!window.confirm(`End ${title} for everyone? Video stops for all participants.`)) return;
    setEnding(true);
    try { await endCeremony(eventId, kind); }
    catch (e) { console.error("[ceremony] end", e); }
    finally { setEnding(false); }
  };

  return (
    <div className={cn(consoleShellClass(liveTheme), "flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden")}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-3 sm:px-4 h-[56px] bg-background border-b border-border/60 shrink-0">
        <Link href={exitHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
          <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Exit</span>
        </Link>
        <div className="h-6 w-px bg-border/60" />
        <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Sparkles className="w-[17px] h-[17px]" />
        </span>
        <div className="min-w-0">
          <p className="font-bold leading-tight truncate font-heading">{title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{eventTitle}</p>
        </div>

        <div className="flex-1" />

        {!ended && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/12 text-red-600 text-[11px] font-bold uppercase tracking-wide">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500/70" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
            </span>
            Live
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground px-2">
          <Mic className="w-3.5 h-3.5" /> {stage.length + (isHost ? 1 : 0)} on the floor
        </span>
        <button type="button" onClick={() => setLiveTheme(liveTheme === "dark" ? "light" : "dark")}
          title="Toggle appearance"
          className="w-8 h-8 rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground flex items-center justify-center shrink-0">
          {liveTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {isHost && !ended && (
          <button type="button" onClick={handleEnd} disabled={ending}
            className="h-8 px-3 rounded-lg bg-red-500/15 text-red-600 hover:bg-red-500/25 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors">
            {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">End ceremony</span>
          </button>
        )}
      </header>

      {/* ── Stage ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Always `.dark` — the video stage stays dark under both console themes, and
            `text-foreground` must ride with it (color inherits as a computed value). */}
        <main className={cn(
          "dark text-foreground flex-1 flex-col min-w-0 px-3 py-3",
          floorOpen ? "hidden lg:flex" : "flex",
        )}>
          {ended ? (
            <div className="flex-1 rounded-2xl border border-border/60 bg-card flex items-center justify-center">
              <div className="text-center max-w-sm px-6">
                <Sparkles className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="font-semibold">{title} has ended</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The organizer closed the room. Committee sessions carry on separately.
                </p>
                <Link href={exitHref}
                  className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Link>
              </div>
            </div>
          ) : (
            <LiveVideoRoom
              variant="stage"
              ceremony={kind}
              eventId={eventId}
              committeeId=""
              dateStr=""
              myUid={myUid}
              myName={user?.displayName || (isHost ? "Organizer" : "Participant")}
              myRole={isHost ? "Organizer" : (staffRole.role ? roleLabel(staffRole.role) : undefined)}
              amHost={isHost}
              canControl={false}
              roster={[]}
              presencePublishSelf={publishPresence}
              onSession={setSession}
              spotlight={{ uid: stage[0], hasFloor: stage.length > 0 }}
              stageOverlay={(api) => (
                <CeremonyControlBar
                  api={api}
                  isHost={isHost}
                  floorOpen={floorOpen}
                  onToggleFloor={() => setFloorOpen((v) => !v)}
                />
              )}
            />
          )}
        </main>

        {isHost && floorOpen && !ended && (
          <CeremonyFloorPanel
            eventId={eventId}
            roster={roster}
            stage={stage}
            hostUid={myUid}
            onSetStage={(uids, labels) => { void setCeremonyStage(eventId, kind, uids, labels); }}
            onClose={() => setFloorOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Meet-style control bar over the video. A participant gets mic/cam only so the buttons are
 * there the moment the organizer hands them the floor (Agora refuses to publish until the
 * token says so, so these are inert until then, not misleading).
 */
function CeremonyControlBar({
  api, isHost, floorOpen, onToggleFloor,
}: {
  api: StageControlApi;
  isHost: boolean;
  floorOpen: boolean;
  onToggleFloor: () => void;
}) {
  if (!api.configured) {
    return (
      <div className="absolute left-1/2 bottom-5 -translate-x-1/2 z-[3] px-3 py-2 rounded-xl bg-black/70 text-white/90 text-xs">
        Live video isn&apos;t configured for this deployment.
      </div>
    );
  }
  if (!api.active || api.sessionEnded) {
    return (
      <ControlBarRow>
        <RoundBtn title="Rejoin" icon={Video} onClick={api.rejoin} />
      </ControlBarRow>
    );
  }
  return (
    <>
      {api.error && (
        <div className="absolute left-1/2 bottom-[76px] -translate-x-1/2 z-[3] px-3 py-1.5 rounded-lg bg-amber-500/90 text-black text-xs font-medium max-w-[90%] truncate">
          {api.error}
        </div>
      )}
      <ControlBarRow>
        <RoundBtn title={api.micOn ? "Mute" : "Unmute"} icon={api.micOn ? Mic : MicOff}
          onClick={api.toggleMic} danger={!api.micOn} />
        <RoundBtn title={api.camOn ? "Turn camera off" : "Turn camera on"}
          icon={api.camOn ? Video : VideoOff} onClick={api.toggleCam} danger={!api.camOn} />
        {isHost && api.screenSupported && (
          <RoundBtn title={api.screenSharing ? "Stop presenting" : "Present"} icon={MonitorUp}
            onClick={api.toggleScreenShare} active={api.screenSharing} />
        )}
        <LayoutSwitcher mode={api.layoutMode} onChange={api.setLayoutMode} />
        {isHost && (
          <LauncherBtn title="The floor" icon={Users} onClick={onToggleFloor} active={floorOpen} />
        )}
        <RoundBtn title="Leave" icon={PhoneOff} onClick={api.leave} danger />
      </ControlBarRow>
    </>
  );
}
