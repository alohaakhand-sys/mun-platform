"use client";

/**
 * Roll call, as a board the room watches fill in.
 *
 * This state used to render a static "Roll Call in Progress" card — a dead screen during the one
 * part of a sitting where every delegate is looking up and waiting to hear their own country. The
 * whole `session.attendance` map is already on the subscribed snapshot; nothing new is read here.
 *
 * Absent delegations stay on the board rather than being filtered out. A roll call is a public
 * record, and "who is missing" is the question it exists to answer.
 */
import { useMemo } from "react";
import {
  eligibleVoterCount, type AttendanceStatus, type LiveSession,
} from "@/lib/services/sessionService";
import { readRollCall } from "@/lib/services/rollCall";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { BoardFlag, Eyebrow } from "../board";

const STATUS: Record<AttendanceStatus, { cell: string; text: string; label: string }> = {
  present:            { cell: "bg-emerald-500/18", text: "text-emerald-700", label: "Present" },
  present_and_voting: { cell: "bg-sky-500/18",     text: "text-sky-700",     label: "Present & voting" },
  late:               { cell: "bg-amber-500/20",   text: "text-amber-700",   label: "Late" },
  absent:             { cell: "bg-proj-sunk",      text: "text-proj-dim",    label: "Absent" },
};

const LEGEND: AttendanceStatus[] = ["present", "present_and_voting", "late", "absent"];

export function RollCallBoard({ session }: { session: LiveSession }) {
  const rows = useMemo(() => {
    const entries = Object.values(session.attendance || {});
    return entries
      .map((e) => ({ ...e, name: getCountryName(e.country) || e.country || "Delegate" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [session.attendance]);

  const present = eligibleVoterCount(session.attendance);
  const quorum = session.quorumThreshold || 0;
  const met = quorum > 0 && present >= quorum;
  // The chair may rule an UN-QUORATE roll complete — that is the whole point of the ruling. Leaving
  // "3 more for quorum" on a 4-metre screen afterwards nags the room about a question already
  // settled, so the headline reports the ruling instead.
  const ruled = readRollCall(session).done;

  // The board never scrolls, so a large committee has to be fitted rather than clipped. Three
  // density steps: a 20-delegation crisis cabinet gets generous tiles, a 190-seat GA gets small
  // ones, and neither loses a delegation off the bottom edge.
  const step = rows.length > 96 ? 2 : rows.length > 48 ? 1 : 0;
  const minCol = ["clamp(120px, 12vw, 260px)", "clamp(96px, 9vw, 190px)", "clamp(74px, 6.5vw, 140px)"][step];
  const cellScale = [1, 0.86, 0.72][step];

  return (
    <div className="h-full flex flex-col gap-[0.8em] animate-proj-rise" style={{ fontSize: "var(--t-body)" }}>
      <div className="shrink-0 flex items-end justify-between gap-[1em]">
        <div>
          <Eyebrow tone="accent" dim={false}>Roll call</Eyebrow>
          <p className="font-display font-black uppercase leading-[0.85] mt-[0.2em]"
            style={{ fontSize: "var(--t-lead)", letterSpacing: "0.01em" }}>
            {ruled
              ? met ? "Roll call complete — quorum met" : "Roll call complete"
              : met ? "Quorum met"
              : quorum > 0 ? `${Math.max(0, quorum - present)} more for quorum`
              : "Taking attendance"}
          </p>
        </div>
        <p className="font-mono font-bold tabular-nums leading-none shrink-0"
          style={{ fontSize: "var(--t-figure)", letterSpacing: "-0.03em" }}>
          {present}<span className="text-proj-dim">/{rows.length}</span>
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 min-h-0 grid place-items-center text-proj-dim font-semibold"
          style={{ fontSize: "var(--t-lead)" }}>
          Waiting for the chair to open the roll
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 overflow-hidden grid content-start"
          style={{
            fontSize: `calc(var(--t-body) * ${cellScale})`,
            gap: "calc(clamp(4px, 0.5vw, 12px) * var(--proj-scale))",
            gridTemplateColumns: `repeat(auto-fill, minmax(calc(${minCol} * var(--proj-scale)), 1fr))`,
          }}
        >
          {rows.map((r) => {
            const s = STATUS[r.status] || STATUS.absent;
            return (
              <span
                key={r.delegateId}
                className={cn("flex items-center gap-[0.5em] rounded-[0.35em] min-w-0", s.cell)}
                style={{ padding: "0.4em 0.6em" }}
              >
                <span className={cn("shrink-0 overflow-hidden rounded-[0.15em]", r.status === "absent" && "opacity-45")}
                  style={{ width: "1.8em", height: "1.35em" }}>
                  <BoardFlag code={r.country} className="w-full h-full" />
                </span>
                <span className={cn("truncate font-bold leading-none", s.text)}>{r.name}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="shrink-0 flex flex-wrap items-center gap-[1.1em]">
        {LEGEND.map((k) => (
          <span key={k} className="inline-flex items-center gap-[0.45em]">
            <span className={cn("rounded-[0.15em]", STATUS[k].cell)} style={{ width: "0.9em", height: "0.9em" }} />
            <Eyebrow>{STATUS[k].label}</Eyebrow>
          </span>
        ))}
      </div>
    </div>
  );
}
