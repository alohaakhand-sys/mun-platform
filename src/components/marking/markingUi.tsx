"use client";

/**
 * Shared marking primitives.
 *
 * WHY THIS FILE EXISTS: the chair page matrix and the in-console MarkingPanel render the
 * same delegate, the same criteria and the same participation, and had drifted into two
 * different visual languages — one with emoji chips and a letter-circle avatar, the other
 * with lucide icons and a real flag. Same data, two answers. Everything both surfaces
 * share now lives here, so a change lands in both.
 */

import type { MarkingMode } from "@/lib/services/eventService";
import type { MarkingAttendance } from "@/lib/services/markingService";
import type { ParticipationSummary } from "@/lib/services/sessionService";
import { cn } from "@/lib/utils";
import { Mic, Clock, Hand, Scale, Vote, Users } from "lucide-react";

/** Score-cell fill by sign: emerald tint for credit, red for penalty, neutral when blank. */
export function cellTone(v: number | null | undefined): string {
  if (v == null || v === 0) return "bg-background border-border text-muted-foreground";
  if (v > 0) return "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400";
  return "bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400";
}

/** The criterion input range, spelled the way the chair scores it. */
export const scaleLabel = (mode: MarkingMode): string => (mode === "binary" ? "−1 / 0 / +1" : "−100…+100");

/** Colour band for a 0..100 percentage — used by every bar and figure in the marking UI. */
export function pctTone(pct: number | null | undefined): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "text-foreground";
  if (pct >= 30) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function pctBarTone(pct: number): string {
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 50) return "bg-primary";
  if (pct >= 30) return "bg-amber-500";
  return "bg-red-500";
}

/** A percentage with its bar. `null` renders an em dash — unscored is not zero. */
export function PctBar({ pct, className, showBar = true }: { pct: number | null; className?: string; showBar?: boolean }) {
  return (
    <div className={cn("min-w-0", className)}>
      <span className={cn("block font-mono text-[13px] font-extrabold tabular-nums leading-none", pctTone(pct))}>
        {pct == null ? "—" : `${Math.round(pct)}%`}
      </span>
      {showBar && (
        <div className="mt-1 h-1 w-full rounded-full bg-secondary/60 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", pct == null ? "bg-transparent" : pctBarTone(pct))}
            style={{ width: `${pct == null ? 0 : Math.max(2, Math.min(100, pct))}%` }} />
        </div>
      )}
    </div>
  );
}

const ATTENDANCE_LABEL: Record<MarkingAttendance, string> = {
  present: "Present",
  present_and_voting: "P&V",
  late: "Late",
  absent: "Absent",
};

const ATTENDANCE_TONE: Record<MarkingAttendance, string> = {
  present: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  present_and_voting: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  late: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  absent: "bg-red-500/15 text-red-600 dark:text-red-400",
};

/**
 * Roll call's verdict for the day. `null` status renders nothing — "no roll call taken"
 * is a real third state and must not look like a present/absent claim.
 */
export function AttendancePill({ status, className }: { status?: MarkingAttendance; className?: string }) {
  if (!status) return null;
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide", ATTENDANCE_TONE[status], className)}>
      {ATTENDANCE_LABEL[status]}
    </span>
  );
}

export const attendanceLabel = (s?: MarkingAttendance): string => (s ? ATTENDANCE_LABEL[s] : "No roll call");

/**
 * What the delegate actually did on the floor that day. Reads the live participation
 * doc, so it is the evidence behind an auto-fill suggestion — a chair scoring a cell
 * can see the number the suggestion came from.
 */
export function ParticipationChips({ p, className }: { p?: ParticipationSummary; className?: string }) {
  if (!p) return null;
  const bits: Array<{ icon: React.ElementType; value: string; title: string }> = [];
  if (p.speeches) bits.push({ icon: Mic, value: String(p.speeches), title: "GSL speeches" });
  if (p.caucusSpeeches) bits.push({ icon: Users, value: String(p.caucusSpeeches), title: "Caucus speeches" });
  if (p.speakingSeconds) bits.push({ icon: Clock, value: `${Math.round(p.speakingSeconds / 60)}m`, title: "Speaking time" });
  if (p.pointsRaised ?? p.points) bits.push({ icon: Hand, value: String(p.pointsRaised ?? p.points), title: "Points raised" });
  if (p.motionsProposed ?? p.motions) bits.push({ icon: Scale, value: String(p.motionsProposed ?? p.motions), title: "Motions proposed" });
  if (p.votesCast) bits.push({ icon: Vote, value: String(p.votesCast), title: "Votes cast" });
  if (!bits.length) return null;
  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {bits.map((b, i) => (
        <span key={i} title={b.title} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums">
          <b.icon className="w-2.5 h-2.5" />{b.value}
        </span>
      ))}
    </div>
  );
}

/** True when the delegate has no floor activity at all — used for "nothing to suggest" states. */
export const hasParticipation = (p?: ParticipationSummary): boolean =>
  !!p && !!(p.speeches || p.caucusSpeeches || p.speakingSeconds || p.points || p.pointsRaised || p.motions || p.motionsProposed || p.votesCast);
