"use client";

/**
 * The room-facing board for a live committee sitting.
 *
 * Read-only and driven entirely by the synced session doc — country names are embedded, so this
 * needs no roster read and works for anyone who can read the session. ONE listener, as before; a
 * projector left open for a three-hour sitting must not be a read budget problem.
 *
 * WHAT CHANGED, AND WHY. This was a `max-w-6xl` scrolling stack of `glass-card`s — the dashboard's
 * own language pointed at a wall. A projector is a different medium: it crushes black level, blurs
 * hairlines, bands large blurred gradients, has no scrollbar the audience can reach, and is read
 * from ten metres rather than sixty centimetres. So the board is now three fixed zones on one
 * non-scrolling screen, with its own token scope (`.mun-projector`), its own type scale (`--t-*`
 * on `ProjectorShell`), and its own primitives. See `projector/board.tsx`.
 *
 * The precedence ladder deciding what the stage shows lives in `focalState.ts`, shared with the
 * delegate console so the room and every delegate's phone can never disagree.
 */
import { useEffect, useMemo, useState } from "react";
import {
  subscribeSession, makeSessionId,
  type LiveSession,
} from "@/lib/services/sessionService";
import { Loader2, Radio } from "lucide-react";
import { ProjectorShell } from "./projector/ProjectorShell";
import { BoardRail } from "./projector/BoardRail";
import { BoardLedger } from "./projector/BoardLedger";
import { resolveFocal, focalQueue } from "./projector/focalState";
import { SpeakerBoard } from "./projector/boards/SpeakerBoard";
import { CaucusBoard } from "./projector/boards/CaucusBoard";
import { VoteBoard } from "./projector/boards/VoteBoard";
import { ResultBoard } from "./projector/boards/ResultBoard";
import { RollCallBoard } from "./projector/boards/RollCallBoard";
import { DocumentBoard } from "./projector/boards/DocumentBoard";
import { CalmBoard } from "./projector/boards/CalmBoard";

/**
 * Identity of a delegate watching a session. Named for this file's original role as the shared
 * read-only view; it is now the delegate console's identity type (`DelegateSessionConsole`) and
 * the board itself takes no viewer — a wall has no controls.
 */
export interface ProjectorViewer {
  delegateId: string;
  country: string;
  applicationId: string;
}

export function SessionProjector({
  eventId, committeeId, dateStr, exitHref,
}: {
  eventId: string;
  committeeId: string;
  dateStr: string;
  exitHref: string;
}) {
  const sessionId = useMemo(() => makeSessionId(committeeId, dateStr), [committeeId, dateStr]);
  const [session, setSession] = useState<LiveSession | null | undefined>(undefined);

  useEffect(() => {
    if (!eventId || !committeeId || !dateStr) return;
    const unsub = subscribeSession(eventId, sessionId, setSession);
    return () => unsub();
  }, [eventId, committeeId, dateStr, sessionId]);

  if (session === undefined) {
    return (
      <ProjectorShell exitHref={exitHref}>
        <div className="h-full grid place-items-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </ProjectorShell>
    );
  }

  if (session === null) {
    return (
      <ProjectorShell exitHref={exitHref}>
        <div className="h-full flex flex-col items-center justify-center text-center gap-[0.6em]"
          style={{ fontSize: "var(--t-body)" }}>
          <Radio className="text-proj-dim" style={{ width: "2.6em", height: "2.6em" }} />
          <p className="font-display font-black uppercase leading-[0.9]"
            style={{ fontSize: "var(--t-display)", letterSpacing: "0.01em" }}>
            No live session
          </p>
          <p className="text-proj-dim font-semibold" style={{ maxWidth: "40ch" }}>
            {committeeId} is not in session for this date. This board updates the moment the chair gavels in.
          </p>
        </div>
      </ProjectorShell>
    );
  }

  const focal = resolveFocal(session);
  const ledger = focalQueue(session, focal);

  return (
    <ProjectorShell
      exitHref={exitHref}
      rail={<BoardRail session={session} committeeId={committeeId} />}
      ledger={<BoardLedger source={ledger.source} queue={ledger.queue} />}
    >
      {/* Keyed on the focal kind so each board runs its enter animation on the state change,
          and only on the state change — a re-render from a ballot landing must not re-animate. */}
      <div key={focal.kind} className="h-full min-h-0">
        {focal.kind === "vote" && <VoteBoard session={session} vote={focal.vote} />}
        {focal.kind === "result" && <ResultBoard published={focal.published} />}
        {/* Keyed on docId so publishing a different paper starts a fresh fetch and page 1. */}
        {focal.kind === "doc" && <DocumentBoard key={focal.published.docId} eventId={eventId} published={focal.published} />}
        {focal.kind === "caucus" && <CaucusBoard caucus={focal.caucus} />}
        {focal.kind === "speaker" && <SpeakerBoard session={session} speaker={focal.speaker} />}
        {focal.kind === "rollcall" && <RollCallBoard session={session} />}
        {focal.kind === "calm" && <CalmBoard session={session} />}
      </div>
    </ProjectorShell>
  );
}
