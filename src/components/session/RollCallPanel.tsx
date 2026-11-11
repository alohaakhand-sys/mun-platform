"use client";

import { useMemo } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  setAttendance, setAttendanceBulk, eligibleVoterCount,
  type LiveSession, type AttendanceStatus, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { SubCard, PanelEmpty } from "./console/shared";
import { CheckCircle2, Users2 } from "lucide-react";

/** Segmented status chip — label + the active fill (mock 1a: emerald / blue / amber / neutral). */
const STATUSES: { id: AttendanceStatus; label: string; active: string }[] = [
  { id: "present", label: "P", active: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
  { id: "present_and_voting", label: "P&V", active: "bg-sky-500/20 text-sky-600 dark:text-sky-400" },
  { id: "late", label: "Late", active: "bg-amber-500/20 text-amber-600 dark:text-amber-400" },
  { id: "absent", label: "Abs", active: "bg-muted-foreground/25 text-foreground" },
];

const LEGEND: { label: string; dot: string }[] = [
  { label: "Present", dot: "bg-emerald-500" },
  { label: "P&V", dot: "bg-sky-500" },
  { label: "Late", dot: "bg-amber-500" },
  { label: "Absent", dot: "bg-muted-foreground" },
];

export function RollCallPanel({
  eventId, sessionId, session, delegates, canControl, identityFor,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
}) {
  const present = eligibleVoterCount(session.attendance);
  const quorum = session.quorumThreshold || 0;
  const quorumPct = quorum > 0 ? Math.min(100, (present / quorum) * 100) : 0;
  const quorumMet = present >= quorum;

  const sorted = useMemo(
    () => [...delegates].sort((a, b) => (a.assignedCountry || "").localeCompare(b.assignedCountry || "")),
    [delegates]
  );

  const setOne = (delegateId: string, status: AttendanceStatus) =>
    canControl && setAttendance(eventId, sessionId, identityFor(delegateId), status);

  const setAll = (status: AttendanceStatus) =>
    canControl && setAttendanceBulk(
      eventId, sessionId,
      delegates.filter((d) => d.userId).map((d) => identityFor(d.userId)),
      status
    );

  return (
    <div className="flex flex-col gap-3">
      {/* Quorum summary */}
      <SubCard className="p-3.5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-baseline gap-1.5">
            <span className="font-heading text-[22px] font-extrabold leading-none tabular-nums">{present}</span>
            <span className="text-xs text-muted-foreground">present &amp; voting</span>
          </div>
          {canControl && (
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setAll("present")}
                className="px-2.5 py-1.5 rounded-lg border border-border text-[11.5px] font-semibold hover:bg-secondary/60 transition-colors">
                All present
              </button>
              <button type="button" onClick={() => setAll("absent")}
                className="px-2.5 py-1.5 rounded-lg border border-border text-[11.5px] font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors">
                All absent
              </button>
            </div>
          )}
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", quorumMet ? "bg-gradient-to-r from-emerald-500 to-sky-500" : "bg-amber-400")}
            style={{ width: `${quorumPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          {quorumMet ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Quorum met
            </span>
          ) : (
            <span className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">Below quorum</span>
          )}
          <span className="text-[11.5px] text-muted-foreground">threshold {quorum}</span>
        </div>
      </SubCard>

      {/* Legend */}
      <div className="flex gap-3.5 px-0.5 text-[10.5px] text-muted-foreground">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <i className={cn("w-2 h-2 rounded-sm", l.dot)} /> {l.label}
          </span>
        ))}
      </div>

      {/* Rows */}
      {sorted.length === 0 ? (
        <PanelEmpty icon={Users2}>No approved delegates in this committee yet.</PanelEmpty>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {sorted.map((d) => {
            const entry = session.attendance[d.userId];
            const status = entry?.status || "absent";
            return (
              <SubCard key={d.userId} className="flex items-center gap-2.5 p-2 px-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {d.assignedCountry
                    ? <CountryFlag code={d.assignedCountry} size={22} />
                    : <span className="w-[22px] h-[22px] rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">?</span>}
                  <div className="min-w-0">
                    <p className="font-semibold text-[13px] leading-tight truncate">{getCountryName(d.assignedCountry || "") || "Pending"}</p>
                    <p className="text-[10.5px] text-muted-foreground leading-tight truncate">{d.applicantName}</p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-px shrink-0 rounded-[9px] bg-background border border-border p-0.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!canControl}
                      onClick={() => setOne(d.userId, s.id)}
                      className={cn(
                        "px-2 py-[5px] rounded-md text-[11px] font-semibold transition-colors disabled:cursor-not-allowed",
                        status === s.id ? s.active : "text-muted-foreground enabled:hover:text-foreground"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </SubCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
