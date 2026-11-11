"use client";

/**
 * A committee sitting, WATCH-ONLY: the video stage everyone sees plus the projector board, and
 * no control of any kind. Two kinds of viewer use it:
 *
 *   • mode "ghost": the App Admin observer (dashboard/admin/live-sessions/observe). Labelled as
 *     hidden from the room. The join is audit-logged by the token route.
 *   • mode "watch": accounts that belong to the committee but don't debate in it. These are a
 *     non-delegate application (observer, press, faculty advisor applying as such) on the
 *     delegate route, and staff observers / faculty advisors on the chair route. They used to
 *     get a console whose every action the rules denied.
 *
 * Both join the video as `observer`: audience for life, never setClientRole("host"), no RTDB
 * presence write. In Agora `mode: "live"` an audience member is never reported to the room, so
 * "watch" viewers are as invisible as the ghost; the difference is only that nobody hides it.
 *
 * Read-only by OMISSION: every action prop LiveVideoRoom accepts is left out, and each renders
 * nothing when absent. Do not add one "just to look complete".
 */
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { SessionProjector } from "@/components/session/SessionProjector";
import { useLiveTheme, consoleShellClass } from "@/components/session/useLiveTheme";
import type { StageControlApi } from "@/components/session/video/LiveVideoRoom";
import type { LiveSession } from "@/lib/services/sessionService";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Eye, EyeOff, Loader2, LayoutGrid, Presentation, Radio, VideoOff, Users,
} from "lucide-react";

// Browser-only (Agora SDK) — never prerender. Same contract as both consoles.
const LiveVideoRoom = dynamic(
  () => import("@/components/session/video/LiveVideoRoom").then((m) => m.LiveVideoRoom),
  { ssr: false },
);

export type WatchMode = "ghost" | "watch";

export function WatchConsole({
  mode, eventId, committeeId, dateStr, eventTitle, exitHref, myUid,
}: {
  mode: WatchMode;
  eventId: string;
  committeeId: string;
  dateStr: string;
  eventTitle: string;
  exitHref: string;
  myUid: string;
}) {
  const [liveTheme] = useLiveTheme();
  const [view, setView] = useState<"video" | "board">("video");
  // Fed by LiveVideoRoom's existing listener (see its `onSession` prop) — no second onSnapshot.
  const [session, setSession] = useState<LiveSession | null>(null);
  const handleSession = useCallback((s: LiveSession | null) => setSession(s), []);

  const present = useMemo(() => {
    const att = session?.attendance || {};
    return Object.values(att).filter(
      (a) => a?.status === "present" || a?.status === "present_and_voting",
    ).length;
  }, [session]);

  return (
    <div className={cn(consoleShellClass(liveTheme), "flex flex-col h-[100dvh] bg-background text-foreground")}>
      <WatchTopBar
        mode={mode} exitHref={exitHref}
        committeeId={committeeId} eventTitle={eventTitle} dateStr={dateStr}
        phase={session?.phase} present={present} hasSession={!!session}
        view={view} onView={setView}
      />

      {/* ALWAYS `dark` — the video stage stays dark in both console themes. See useLiveTheme.ts. */}
      {/* `text-foreground` with `dark` — see DelegateSessionConsole: `color` inherits computed, so
          without it the light root's ink follows into this dark stage. */}
      <main className="dark text-foreground flex-1 min-h-0 flex flex-col px-3 pt-3">
        <LiveVideoRoom
          variant="stage"
          observer                      /* ← audience for life, no presence: the read-only contract */
          eventId={eventId}
          committeeId={committeeId}
          dateStr={dateStr}
          myUid={myUid}
          myName="Observer"
          amHost={false}
          canControl={false}
          roster={[]}
          onSession={handleSession}
          stageOverlay={(api) => <WatchStageOverlay mode={mode} api={api} />}
          /* DELIBERATELY OMITTED — each renders nothing when absent, which IS the read-only
             guarantee: applicationId (raise-a-point), onQuickMark, onGiveFloor, onToggleQueue,
             onYield, stageUids, activeSpeakerUid, canYieldActive, queuedUids, pointByUid,
             scoreByUid, floorBar, chairBar, spotlight. Do not add one "just to look complete". */
        />
      </main>

      {/* The board is `fixed inset-0` and opaque, so mounting it simply COVERS the stage — the
          video stays mounted, joined and audible behind it. Never render the stage conditionally:
          unmounting calls client.leave(), and coming back costs a token round-trip, an Agora
          handshake and a few seconds of black. `display:none` on a video ancestor is no better
          (some browsers pause playback), which is why this is an overlay rather than a swap. */}
      {view === "board" && (
        <>
          <SessionProjector
            eventId={eventId} committeeId={committeeId} dateStr={dateStr} exitHref={exitHref}
          />
          {/* ProjectorShell's own operator cluster owns bottom-3 right-3 z-50 — stay clear of it. */}
          <button
            type="button"
            onClick={() => setView("video")}
            className="fixed top-3 right-3 z-[60] inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-black/75 text-white text-[13px] font-semibold backdrop-blur hover:bg-black/85 transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Video
          </button>
        </>
      )}
    </div>
  );
}

// ── Top bar — identity and state only, no session controls ───────────────────────
function WatchTopBar({
  mode, exitHref, committeeId, eventTitle, dateStr, phase, present, hasSession, view, onView,
}: {
  mode: WatchMode; exitHref: string;
  committeeId: string; eventTitle: string; dateStr: string;
  phase?: string; present: number; hasSession: boolean;
  view: "video" | "board"; onView: (v: "video" | "board") => void;
}) {
  const ghost = mode === "ghost";
  const Badge = ghost ? EyeOff : Eye;
  return (
    <header className="flex items-center gap-2.5 px-3 sm:px-4 h-[56px] bg-background border-b border-border/60 shrink-0 z-10">
      <a
        href={exitHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors shrink-0"
      >
        <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Exit</span>
      </a>
      <div className="h-6 w-px bg-border/60 shrink-0" />

      <div className="flex items-center gap-2.5 min-w-0 shrink">
        <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", ghost ? "bg-amber-500/10" : "bg-primary/10")}>
          <Badge className={cn("w-4 h-4", ghost ? "text-amber-500" : "text-primary")} />
        </span>
        <div className="min-w-0">
          <p className="font-bold leading-tight truncate font-heading text-[15px] tracking-tight">
            {committeeId || "Committee"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight truncate">
            {eventTitle ? `${eventTitle} · ` : ""}{dateStr}
          </p>
        </div>
      </div>

      <div className="flex-1 min-w-2 hidden md:flex justify-center">
        {ghost ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/25 text-[11px] font-semibold">
            <EyeOff className="w-3.5 h-3.5" /> Observing — hidden from the chair and delegates
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/25 text-[11px] font-semibold">
            <Eye className="w-3.5 h-3.5" /> Watching — your role follows the sitting without taking part
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {hasSession && phase && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider border bg-primary/10 text-primary border-primary/25">
            <Radio className="w-3 h-3" /> {phase.replace(/_/g, " ")}
          </span>
        )}
        <span className="hidden md:inline-flex items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
          <Users className="w-3.5 h-3.5" /> {present} present
        </span>
        <div className="inline-flex items-center rounded-lg border border-border/60 p-0.5 bg-secondary">
          <ViewTab active={view === "video"} onClick={() => onView("video")} icon={LayoutGrid} label="Video" />
          <ViewTab active={view === "board"} onClick={() => onView("board")} icon={Presentation} label="Board" />
        </div>
      </div>
    </header>
  );
}

function ViewTab({
  active, onClick, icon: Icon, label,
}: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px] font-semibold transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── Stage overlay — informational ONLY. Not one button. ──────────────────────────
// `api` carries leave/rejoin/toggleMic/toggleCam/toggleScreenShare; they exist and are simply
// never wired to anything. That is the point of this component.
function WatchStageOverlay({ mode, api }: { mode: WatchMode; api: StageControlApi }) {
  const ghost = mode === "ghost";
  return (
    <>
      <div className="absolute top-4 left-4 z-[3] flex items-center gap-2 rounded-full bg-black/55 backdrop-blur px-3.5 py-2">
        {ghost ? <EyeOff className="w-4 h-4 text-amber-300 shrink-0" /> : <Eye className="w-4 h-4 text-emerald-300 shrink-0" />}
        <span className="text-[12.5px] font-semibold text-white">{ghost ? "Observing · view only" : "Watching · view only"}</span>
      </div>

      {!api.configured && (
        <div className="absolute inset-0 z-[4] grid place-items-center bg-black/70">
          <div className="text-center px-6">
            <VideoOff className="w-9 h-9 mx-auto mb-2.5 text-white/60" />
            <p className="text-white font-semibold text-sm">Live video isn’t configured</p>
            <p className="text-white/60 text-xs mt-1 max-w-[42ch]">
              {ghost
                ? "NEXT_PUBLIC_AGORA_APP_ID is inlined at build time — set it and redeploy. The Board view still works."
                : "Video is off for this conference. The Board view still follows the sitting."}
            </p>
          </div>
        </div>
      )}

      {api.configured && api.error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[3] flex items-center gap-1.5 rounded-lg bg-amber-500/90 text-black text-[11.5px] font-medium px-3 py-1.5 max-w-[80%]">
          <VideoOff className="w-3.5 h-3.5 shrink-0" /> {api.error}
        </div>
      )}

      {api.configured && api.connecting && !api.joined && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[3] flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-[12px] font-medium text-white/85">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…
        </div>
      )}

      {api.sessionEnded && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[3] flex items-center gap-2 rounded-full bg-black/70 px-3.5 py-1.5 text-[12px] font-semibold text-white/90">
          <Radio className="w-3.5 h-3.5" /> Session ended
        </div>
      )}
    </>
  );
}
