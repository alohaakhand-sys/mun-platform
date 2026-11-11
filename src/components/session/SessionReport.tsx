"use client";

/**
 * On-screen session report + client-side PDF download. Two modes:
 *  - "full"  (chair): the whole committee — aggregated via `buildCommitteeReport`.
 *  - "own"   (delegate): just the viewer's own participation card (delegates may only
 *            read their own participation doc, so we compose from primitives).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  buildCommitteeReport, getMyParticipation, subscribeMyPoints, subscribeMotions,
  toReportRow, summarizePoints, yieldsFor, POINT_META,
  type CommitteeReport, type DelegateReportRow, type RaisedPoint, type MotionLogEntry,
  type ParticipationSummary,
} from "@/lib/services/sessionService";
import { makeSessionId, getSession } from "@/lib/services/sessionService";
import { downloadSessionReportPdf, type SessionReportData } from "@/lib/pdf/sessionReportPdf";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { SubCard } from "./console/shared";
import { Download, Printer, Loader2, RefreshCw, Mic, Clock, Hand, Scale, Vote } from "lucide-react";

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function attLabel(a?: string) {
  return a === "present_and_voting" ? "P&V" : a === "present" ? "Present" : a === "late" ? "Late" : a === "absent" ? "Absent" : "—";
}

export function SessionReport({
  mode, eventId, committeeId, dateStr, eventTitle, delegates = [], viewer,
}: {
  mode: "full" | "own";
  eventId: string;
  committeeId: string;
  dateStr: string;
  eventTitle: string;
  delegates?: ApplicationData[];
  viewer?: { delegateId: string; country: string; applicationId: string };
}) {
  const sessionId = useMemo(() => makeSessionId(committeeId, dateStr), [committeeId, dateStr]);
  const nameOf = useCallback(
    (id: string) => delegates.find((d) => d.userId === id)?.applicantName || "",
    [delegates]
  );

  // ── Full (chair) ──
  const [report, setReport] = useState<CommitteeReport | null>(null);
  const [loading, setLoading] = useState(mode === "full");

  const loadFull = useCallback(async () => {
    if (mode !== "full") return;
    setLoading(true);
    const quorum = Math.max(1, Math.ceil(delegates.length / 2));
    const r = await buildCommitteeReport(eventId, committeeId, dateStr, quorum);
    setReport(r);
    setLoading(false);
  }, [mode, eventId, committeeId, dateStr, delegates.length]);

  useEffect(() => { loadFull(); }, [loadFull]);

  // ── Own (delegate) ──
  const [myPart, setMyPart] = useState<ParticipationSummary | null>(null);
  const [myPoints, setMyPoints] = useState<RaisedPoint[]>([]);
  const [motions, setMotions] = useState<MotionLogEntry[]>([]);

  useEffect(() => {
    if (mode !== "own" || !viewer?.delegateId) return;
    let alive = true;
    // Attendance comes from the sitting's roll: answering roll call yourself never writes
    // participation (reportAttendance.ts).
    Promise.all([
      getMyParticipation(eventId, committeeId, dateStr, viewer.delegateId),
      getSession(eventId, sessionId).catch(() => null),
    ]).then(([p, sess]) => {
      if (!alive) return;
      const status = sess?.attendance?.[viewer.delegateId]?.status;
      setMyPart(p ? (status ? { ...p, attendanceStatus: status } : p) : status ? {
        delegateId: viewer.delegateId, country: viewer.country, applicationId: viewer.applicationId,
        eventId, committeeId, dateStr, speeches: 0, speakingSeconds: 0, caucusSpeeches: 0,
        points: 0, motions: 0, votesCast: 0, attendanceStatus: status,
      } : null);
    });
    const u1 = subscribeMyPoints(eventId, sessionId, viewer.delegateId, setMyPoints);
    const u2 = subscribeMotions(eventId, sessionId, setMotions);
    return () => { alive = false; u1(); u2(); };
  }, [mode, eventId, committeeId, dateStr, sessionId, viewer?.delegateId]);

  const ownRow: DelegateReportRow | null = useMemo(() => {
    if (mode !== "own" || !viewer) return null;
    const base: ParticipationSummary = myPart || {
      delegateId: viewer.delegateId, country: viewer.country, applicationId: viewer.applicationId,
      eventId, committeeId, dateStr, speeches: 0, speakingSeconds: 0, caucusSpeeches: 0,
      points: 0, motions: 0, votesCast: 0,
    };
    return toReportRow(base, myPoints, motions);
  }, [mode, viewer, myPart, myPoints, motions, eventId, committeeId, dateStr]);

  // ── PDF payload ──
  const [downloading, setDownloading] = useState(false);
  const buildPdfData = (): SessionReportData => {
    if (mode === "full" && report) {
      return {
        mode: "full", eventTitle, committeeId, dateStr,
        present: report.present, quorum: report.quorum,
        totalSpeeches: report.totalSpeeches, totalSpeakingSeconds: report.totalSpeakingSeconds,
        rows: report.rows.map((r) => ({ ...r, name: nameOf(r.delegateId) })),
        votes: report.votes.map((v) => ({ motion: v.motion, result: v.result, affirmative: v.affirmative, negative: v.negative, abstentions: v.abstentions })),
      };
    }
    return {
      mode: "own", eventTitle, committeeId, dateStr,
      rows: ownRow ? [{ ...ownRow, name: viewer ? nameOf(viewer.delegateId) : "" }] : [],
    };
  };
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadSessionReportPdf(buildPdfData(), `${committeeId}-report-${dateStr}`);
    } catch (e) {
      console.error("download report", e);
      alert("Could not generate the PDF. Try Print instead.");
    } finally { setDownloading(false); }
  };

  const Toolbar = (
    <div className="flex items-center gap-1.5 shrink-0">
      {mode === "full" && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={loadFull} disabled={loading}>
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
        </Button>
      )}
      <Button variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={() => window.print()}>
        <Printer className="w-3.5 h-3.5" /> Print
      </Button>
      <Button size="sm" className="gap-1.5 print:hidden" onClick={handleDownload} disabled={downloading}>
        {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download
      </Button>
    </div>
  );

  return (
    // "own" is rendered standalone on a page → keep it self-contained in a card; "full" lives
    // inside the console rail whose chrome already supplies the header, so it stays flat.
    <div className={cn("flex flex-col gap-3", mode === "own" && "rounded-2xl border border-border bg-card p-4")}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="font-heading text-[15px] font-bold leading-tight">Session Report</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{getCountryName(committeeId) || committeeId} · {dateStr}</p>
        </div>
        {Toolbar}
      </div>
      {mode === "full" ? (
        loading && !report ? (
          <div className="py-16 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" /></div>
        ) : !report || report.rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No participation recorded for this day yet.</p>
        ) : (
          <FullView report={report} nameOf={nameOf} />
        )
      ) : (
        <OwnView row={ownRow} country={viewer?.country} />
      )}
    </div>
  );
}

function StatCell({ n, label, tone = "fg" }: { n: React.ReactNode; label: string; tone?: "fg" | "primary" | "emerald" }) {
  const c = tone === "primary" ? "text-primary" : tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground";
  return (
    <SubCard className="px-2 py-2.5 text-center">
      <p className={cn("font-heading text-[20px] font-extrabold leading-none tabular-nums", c)}>{n}</p>
      <p className="text-[8.5px] text-muted-foreground uppercase tracking-[0.03em] mt-1.5">{label}</p>
    </SubCard>
  );
}

function FullView({ report, nameOf }: { report: CommitteeReport; nameOf: (id: string) => string }) {
  return (
    <div className="space-y-3">
      <div className="@container grid grid-cols-2 @xl:grid-cols-5 gap-2">
        <StatCell n={report.rows.length} label="Delegates" />
        <StatCell n={`${report.present}/${report.quorum}`} label="Quorum" tone="emerald" />
        <StatCell n={report.totalSpeeches} label="Speeches" />
        <StatCell n={fmtTime(report.totalSpeakingSeconds)} label="Sp. time" />
        <StatCell n={report.votes.length} label="Votes" tone="primary" />
      </div>

      <SubCard className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/10 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left px-3 py-2.5">Delegate</th>
              <th className="px-2 py-2.5">Att</th>
              <th className="px-2 py-2.5"><Mic className="w-3.5 h-3.5 inline" /></th>
              <th className="px-2 py-2.5"><Clock className="w-3.5 h-3.5 inline" /></th>
              <th className="px-2 py-2.5">Points (O/I/PP/PI)</th>
              <th className="px-2 py-2.5"><Scale className="w-3.5 h-3.5 inline" /></th>
              <th className="px-2 py-2.5"><Vote className="w-3.5 h-3.5 inline" /></th>
              <th className="text-left px-3 py-2.5">Yields</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {report.rows.map((r) => (
              <tr key={r.delegateId} className="hover:bg-secondary/5">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {r.country && <CountryFlag code={r.country} size={18} />}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{getCountryName(r.country) || r.country || "—"}</p>
                      {nameOf(r.delegateId) && <p className="text-[11px] text-muted-foreground truncate">{nameOf(r.delegateId)}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-center text-xs">{attLabel(r.attendanceStatus)}</td>
                <td className="px-2 py-2 text-center font-mono tabular-nums">{r.speeches}</td>
                <td className="px-2 py-2 text-center font-mono tabular-nums">{fmtTime(r.speakingSeconds)}</td>
                <td className="px-2 py-2 text-center text-xs font-mono tabular-nums">
                  {r.pointsTotal === 0 ? "—" : `${r.pointsByType.order}/${r.pointsByType.information}/${r.pointsByType.personal_privilege}/${r.pointsByType.parliamentary_inquiry}`}
                </td>
                <td className="px-2 py-2 text-center font-mono tabular-nums">{r.motions}</td>
                <td className="px-2 py-2 text-center font-mono tabular-nums">{r.votesCast}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.yieldsGiven.map((y) => getCountryName(y.targetCountry) || y.targetCountry).filter(Boolean).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SubCard>

      {report.votes.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Voting record</p>
          <div className="space-y-1.5">
            {report.votes.map((v, i) => (
              <SubCard key={i} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                <span className="truncate font-medium">{v.motion}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">{v.affirmative}-{v.negative}-{v.abstentions}</span>
                  <span className="text-[10px] font-bold uppercase">{v.result}</span>
                </span>
              </SubCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OwnView({ row, country }: { row: DelegateReportRow | null; country?: string }) {
  if (!row) return <p className="py-12 text-center text-sm text-muted-foreground">No participation recorded yet.</p>;
  const items: { icon: React.ElementType; label: string; value: React.ReactNode }[] = [
    { icon: Mic, label: "Speeches", value: row.speeches },
    { icon: Clock, label: "Speaking time", value: fmtTime(row.speakingSeconds) },
    { icon: Mic, label: "Caucus speeches", value: row.caucusSpeeches },
    { icon: Hand, label: POINT_META.order.label, value: row.pointsByType.order },
    { icon: Hand, label: POINT_META.information.label, value: row.pointsByType.information },
    { icon: Hand, label: POINT_META.personal_privilege.label, value: row.pointsByType.personal_privilege },
    { icon: Hand, label: POINT_META.parliamentary_inquiry.label, value: row.pointsByType.parliamentary_inquiry },
    { icon: Scale, label: "Motions raised", value: row.motions },
    { icon: Vote, label: "Votes cast", value: row.votesCast },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {country && <CountryFlag code={country} size={32} />}
        <div>
          <p className="text-lg font-bold">{getCountryName(country || "") || country || "Your delegation"}</p>
          <p className="text-xs text-muted-foreground">Attendance: {attLabel(row.attendanceStatus)}</p>
        </div>
      </div>
      <div className="@container grid grid-cols-2 @lg:grid-cols-3 gap-2.5">
        {items.map((it, i) => (
          <SubCard key={i} className="p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><it.icon className="w-3 h-3" /> {it.label}</div>
            <p className="font-heading text-2xl font-extrabold tabular-nums mt-1">{it.value}</p>
          </SubCard>
        ))}
      </div>
      {row.yieldsGiven.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Yielded to: {row.yieldsGiven.map((y) => getCountryName(y.targetCountry) || y.targetCountry).filter(Boolean).join(", ")}
        </p>
      )}
    </div>
  );
}
