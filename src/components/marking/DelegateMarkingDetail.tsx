"use client";

/**
 * One delegate's complete marking record — the "detail mode" behind every marking matrix.
 *
 * The matrix answers "what did I give them today". This answers the questions a chair
 * actually has to defend at awards time: which days counted, what each individual mark
 * was, what the delegate did on the floor to earn it, and exactly how those numbers
 * became a final percentage. That last section is the point of the whole component —
 * the final score used to be a figure with no derivation shown anywhere in the product.
 *
 * Mounted from both the chair page matrix and the in-console MarkingPanel; pass
 * `shellClass` when mounting inside the live console so the portalled sheet keeps the
 * console's theme scope instead of inheriting the app's.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarkingMode, MarkingTemplate } from "@/lib/services/eventService";
import {
  getDelegateCommitteeMarkings, setScoreEntries, setDailyFeedback,
  type Marking,
} from "@/lib/services/markingService";
import {
  computeDailyScore, computeFinalScore, criterionPct, splitMarkings, clamp,
  MARK_MIN, MARK_MAX,
} from "@/lib/services/markingScore";
import { getMyParticipation, autoFillSuggestion, type ParticipationSummary } from "@/lib/services/sessionService";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { ScoreEntriesEditor } from "@/components/session/ScoreEntriesEditor";
import { AttendancePill, ParticipationChips, PctBar, cellTone, pctTone, scaleLabel, attendanceLabel } from "./markingUi";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, Star, Trophy, CalendarDays, Sigma } from "lucide-react";

export interface DetailDelegate {
  userId: string;
  applicationId: string;
  country: string;
  name: string;
}

export function DelegateMarkingDetail({
  open, onOpenChange, eventId, committeeId, delegate, templates, markMode, days, selectedDate,
  overallWeight, chairOverall = null, canMark, gradedBy, rank, shellClass, onPrev, onNext,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  committeeId: string;
  delegate: DetailDelegate | null;
  templates: MarkingTemplate[];
  markMode: MarkingMode;
  days: string[];
  selectedDate: string;
  overallWeight: number;
  chairOverall?: number | null;
  canMark: boolean;
  gradedBy: string;
  rank?: { position: number; of: number } | null;
  shellClass?: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const binary = markMode === "binary";
  const [markings, setMarkings] = useState<Marking[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [day, setDay] = useState(selectedDate);
  const [part, setPart] = useState<ParticipationSummary | null>(null);

  // Follow the matrix's day whenever the drawer is (re)opened on a new delegate.
  useEffect(() => { if (open) setDay(selectedDate); }, [open, selectedDate, delegate?.userId]);

  useEffect(() => {
    if (!open || !delegate?.userId) return;
    let alive = true;
    setLoading(true);
    getDelegateCommitteeMarkings(eventId, committeeId, delegate.userId)
      .then((rows) => { if (alive) setMarkings(rows); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, eventId, committeeId, delegate?.userId]);

  // One read per day viewed — the day's participation doc for THIS delegate only.
  useEffect(() => {
    if (!open || !delegate?.userId || !day) { setPart(null); return; }
    let alive = true;
    getMyParticipation(eventId, committeeId, day, delegate.userId)
      .then((p) => { if (alive) setPart(p); });
    return () => { alive = false; };
  }, [open, eventId, committeeId, day, delegate?.userId]);

  const { daily } = useMemo(() => splitMarkings(markings), [markings]);
  const dayset = useMemo(() => (days.length ? days : Array.from(new Set(daily.map(d => d.dateStr).filter(Boolean) as string[])).sort()), [days, daily]);
  const final = useMemo(
    () => computeFinalScore(daily, templates, dayset, chairOverall, overallWeight, markMode),
    [daily, templates, dayset, chairOverall, overallWeight, markMode],
  );
  const dayDoc = useMemo(() => daily.find((m) => m.dateStr === day), [daily, day]);
  const dayScore = useMemo(() => computeDailyScore(dayDoc, templates, markMode), [dayDoc, templates, markMode]);

  const base = useMemo(() => ({
    eventId, committeeId, delegateId: delegate?.userId || "", applicationId: delegate?.applicationId || "",
    dateStr: day, gradedBy, markMode,
  }), [eventId, committeeId, delegate?.userId, delegate?.applicationId, day, gradedBy, markMode]);

  /** Patch the local copy of a day's doc so the drawer reflects a write immediately. */
  const patchDay = useCallback((mutate: (m: Marking) => Marking) => {
    setMarkings((cur) => {
      const i = cur.findIndex((m) => m.dateStr === day && m.kind !== "final");
      if (i === -1) {
        return [...cur, mutate({
          id: `${committeeId}_${delegate?.userId}_${day}`, eventId, committeeId,
          delegateId: delegate?.userId || "", applicationId: delegate?.applicationId || "",
          dateStr: day, scores: {}, feedback: "", gradedBy, markMode,
        })];
      }
      return cur.map((m, idx) => (idx === i ? mutate(m) : m));
    });
  }, [committeeId, delegate?.userId, delegate?.applicationId, day, eventId, gradedBy, markMode]);

  const commitEntries = async (templateId: string, entries: number[]) => {
    if (!canMark || !delegate) return;
    patchDay((m) => {
      const scores = { ...(m.scores || {}) };
      const scoreEntries = { ...(m.scoreEntries || {}) };
      if (!entries.length) { delete scores[templateId]; delete scoreEntries[templateId]; }
      else { scoreEntries[templateId] = entries; scores[templateId] = entries.reduce((a, b) => a + b, 0) / entries.length; }
      return { ...m, scores, scoreEntries };
    });
    setSaving(true);
    await setScoreEntries(base, templateId, entries);
    setSaving(false);
  };

  const commitFeedback = async (text: string) => {
    if (!canMark || !delegate) return;
    patchDay((m) => ({ ...m, feedback: text }));
    setSaving(true);
    await setDailyFeedback(base, text);
    setSaving(false);
  };

  if (!delegate) return null;

  const countedDays = final.daily.filter((d) => d.counted).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("w-full sm:max-w-xl p-0 gap-0", shellClass)}>
        <SheetTitle className="sr-only">{delegate.name} — marking detail</SheetTitle>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border/60 bg-card">
          <div className="flex items-start gap-3 pr-9">
            {delegate.country
              ? <CountryFlag code={delegate.country} size={34} />
              : <span className="w-[34px] h-[34px] rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">?</span>}
            <div className="min-w-0 flex-1">
              <p className="font-heading text-base font-semibold leading-tight truncate">
                {getCountryName(delegate.country) || "Unassigned"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{delegate.name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn("font-mono text-2xl font-extrabold tabular-nums leading-none", pctTone(final.finalScore))}>
                {final.finalScore}%
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Final</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            {rank && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold">
                <Trophy className="w-3 h-3" /> Rank {rank.position} of {rank.of}
              </span>
            )}
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="icon-sm" disabled={!onPrev} onClick={onPrev} title="Previous delegate">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon-sm" disabled={!onNext} onClick={onNext} title="Next delegate">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {loading ? (
            <div className="py-16 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Day by day ──────────────────────────────────────────────── */}
              <section>
                <SectionTitle icon={CalendarDays}>Day by day</SectionTitle>
                {final.daily.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No conference days recorded yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {final.daily.map((d) => {
                      const active = d.dateStr === day;
                      return (
                        <button
                          key={d.dateStr}
                          type="button"
                          onClick={() => d.dateStr && setDay(d.dateStr)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-colors",
                            active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background hover:bg-secondary/20",
                          )}
                        >
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground w-[74px] shrink-0">{d.dateStr}</span>
                          <AttendancePill status={d.attendanceStatus} />
                          <span className="text-[10px] text-muted-foreground truncate">
                            {!d.counted ? "not counted" : d.present ? `${d.scoredCount}/${templates.length} scored` : "counts as 0%"}
                          </span>
                          <PctBar pct={d.counted ? (d.present ? d.pct : 0) : d.pct} className="ml-auto w-16 shrink-0 text-right" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── The selected day's criteria ─────────────────────────────── */}
              <section>
                <SectionTitle>
                  {day} · {dayScore.pct == null ? "unscored" : `${Math.round(dayScore.pct)}%`}
                  <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">{attendanceLabel(dayDoc?.attendanceStatus)}</span>
                </SectionTitle>
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No marking criteria configured for this event.</p>
                ) : (
                  <div className="space-y-2.5">
                    {templates.map((t) => {
                      const entries = dayDoc?.scoreEntries?.[t.id]
                        ?? (typeof dayDoc?.scores?.[t.id] === "number" ? [dayDoc!.scores[t.id]] : []);
                      const raw = dayDoc?.scores?.[t.id];
                      const sug = autoFillSuggestion(t, part || undefined);
                      return (
                        <div key={t.id} className="p-3 rounded-xl border border-border/60 bg-background space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{t.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {entries.length > 1 ? `mean of ${entries.length} marks` : `single mark`} · {scaleLabel(markMode)}
                                {t.autoFillFrom ? ` · auto-fill from ${t.autoFillFrom}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {sug != null && canMark && (
                                <button
                                  onClick={() => commitEntries(t.id, [...entries, binary ? (sug > 0 ? 1 : 0) : clamp(sug, MARK_MIN, MARK_MAX)])}
                                  title="Append the live-participation suggestion as another mark"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20"
                                >
                                  <Star className="w-3 h-3" /> {binary ? "+1" : `+${sug}`}
                                </button>
                              )}
                              <span className={cn("px-2 h-7 min-w-[46px] rounded-lg border font-mono text-[13px] font-bold tabular-nums flex items-center justify-center", cellTone(typeof raw === "number" ? raw : null))}>
                                {typeof raw !== "number" ? "—" : binary ? (Math.round(raw * 10) / 10 > 0 ? `+${Math.round(raw * 10) / 10}` : `${Math.round(raw * 10) / 10}`) : (Math.round(raw) > 0 ? `+${Math.round(raw)}` : `${Math.round(raw)}`)}
                              </span>
                            </div>
                          </div>
                          <ScoreEntriesEditor
                            mode={markMode}
                            entries={entries}
                            disabled={!canMark}
                            onChange={(next) => commitEntries(t.id, next)}
                          />
                          {typeof raw === "number" && (
                            <p className="text-[10.5px] text-muted-foreground">
                              contributes <span className="font-mono font-semibold">{Math.round(criterionPct(raw, markMode))}%</span> to the day
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── What they did on the floor ──────────────────────────────── */}
              <section>
                <SectionTitle>On the floor · {day}</SectionTitle>
                {part ? (
                  <div className="p-3 rounded-xl border border-border/60 bg-background space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <Metric label="GSL" value={part.speeches || 0} />
                      <Metric label="Caucus" value={part.caucusSpeeches || 0} />
                      <Metric label="Minutes" value={Math.round((part.speakingSeconds || 0) / 60)} />
                      <Metric label="Points" value={part.pointsRaised ?? part.points ?? 0} />
                      <Metric label="Motions" value={part.motionsProposed ?? part.motions ?? 0} />
                      <Metric label="Votes" value={part.votesCast || 0} />
                    </div>
                    <ParticipationChips p={part} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No live-session record for this day.</p>
                )}
              </section>

              {/* ── How the final was computed ──────────────────────────────── */}
              <section>
                <SectionTitle icon={Sigma}>How this final was computed</SectionTitle>
                <div className="p-3 rounded-xl border border-border/60 bg-secondary/10 space-y-2 text-[12px]">
                  <div className="space-y-1">
                    {final.daily.map((d) => (
                      <div key={d.dateStr} className="flex items-center gap-2 font-mono tabular-nums">
                        <span className="text-muted-foreground w-[74px] shrink-0">{d.dateStr}</span>
                        <span className={cn("w-12 text-right font-semibold", !d.counted && "text-muted-foreground line-through")}>
                          {d.counted ? `${Math.round(d.present && d.pct != null ? d.pct : 0)}%` : "—"}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {!d.counted
                            ? "present, not scored — dropped from the average"
                            : d.present ? "scored" : "no marks — counts as zero"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-border/50 space-y-1 font-mono tabular-nums">
                    <p>computed % = sum ÷ {countedDays} day{countedDays === 1 ? "" : "s"} = <b>{final.computedPct}%</b></p>
                    {final.chairOverall != null ? (
                      <p>
                        final = {Math.round((1 - final.overallWeight) * 100)}% × {final.computedPct}
                        {" + "}{Math.round(final.overallWeight * 100)}% × {Math.round(criterionPct(final.chairOverall, markMode))}
                        {" = "}<b>{final.finalScore}%</b>
                      </p>
                    ) : (
                      <p className="text-muted-foreground">no chair overall entered — final = computed %</p>
                    )}
                  </div>
                  {final.excludedDays > 0 && (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      {final.excludedDays} day{final.excludedDays === 1 ? " was" : "s were"} excluded: the delegate was marked present but never scored.
                      Score them, or set them absent, to bring the day back into the average.
                    </p>
                  )}
                </div>
              </section>

              {/* ── Feedback ────────────────────────────────────────────────── */}
              <section>
                <SectionTitle>Feedback · {day}</SectionTitle>
                <Textarea
                  key={`${delegate.userId}-${day}`}
                  defaultValue={dayDoc?.feedback || ""}
                  disabled={!canMark}
                  placeholder="Private feedback for this delegate (shown in their results)…"
                  className="min-h-[88px] text-sm bg-background"
                  onBlur={(e) => { if (e.target.value !== (dayDoc?.feedback || "")) commitFeedback(e.target.value); }}
                />
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {Icon && <Icon className="w-3.5 h-3.5" />}{children}
    </h3>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary/20 px-2 py-1.5 text-center">
      <p className="font-mono text-base font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
