"use client";

/**
 * Live marking matrix, in-console. Date-wise (follows the session header date) and
 * delegate-wise (tap a row to open the full detail drawer). Writes the SAME deterministic
 * marking doc id as the external chair-page matrix
 * (`markings/{committeeId}_{delegateId}_{dateStr}`), so the two stay in sync.
 * Live participation drives per-cell auto-fill suggestions.
 *
 * Marks arrive here from FOUR other writers during a session — LiveMarkStrip on the
 * speaker's tile, QuickScoreDialog, SpeechScorer, and the chair page in another tab — so
 * the doc list is a live subscription, not a one-shot read, and every cell write addresses
 * a single field path. A whole-`scores`-map write from a stale matrix used to silently
 * overwrite a mean that a per-speech mark had already advanced.
 */
import { useEffect, useMemo, useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import type { MarkingMode, MarkingTemplate } from "@/lib/services/eventService";
import { subscribeDailyMarkings, setCriterionScore, setScoreEntries, type Marking } from "@/lib/services/markingService";
import { computeDailyScore, MARK_MIN, MARK_MAX, clamp, DEFAULT_OVERALL_WEIGHT } from "@/lib/services/markingScore";
import { BinaryScoreSelect } from "./BinaryScoreSelect";
import {
  subscribeParticipation, autoFillSuggestion,
  type ParticipationSummary,
} from "@/lib/services/sessionService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { SubCard, PanelEmpty } from "./console/shared";
import { useLiveTheme, consoleShellClass } from "./useLiveTheme";
import { AttendancePill, ParticipationChips, cellTone, scaleLabel } from "@/components/marking/markingUi";
import { DelegateMarkingDetail, type DetailDelegate } from "@/components/marking/DelegateMarkingDetail";
import { ClipboardList, Loader2, Search, Star, ChevronRight } from "lucide-react";

export function MarkingPanel({
  eventId, committeeId, dateStr, delegates, canControl, markingTemplates, userId, markMode = "decimal",
}: {
  eventId: string;
  committeeId: string;
  dateStr: string;
  delegates: ApplicationData[];
  canControl: boolean;
  markingTemplates: MarkingTemplate[];
  userId: string;
  markMode?: MarkingMode;
}) {
  const binary = markMode === "binary";
  // The detail drawer portals to <body>, escaping the console shell — it has to re-stamp
  // the console's theme scope itself or it renders in the app theme. Same reason
  // ConsoleModal does it (see useLiveTheme's note on the three shells).
  const [liveTheme] = useLiveTheme();
  const shellClass = consoleShellClass(liveTheme);
  const [markings, setMarkings] = useState<Marking[]>([]);
  const [participation, setParticipation] = useState<ParticipationSummary[]>([]);
  const [detailUid, setDetailUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const sessionId = useMemo(() => `${(committeeId || "").replace(/\//g, "_")}__${dateStr}`, [committeeId, dateStr]);

  useEffect(
    () => subscribeDailyMarkings(eventId, committeeId, dateStr, setMarkings),
    [eventId, committeeId, dateStr],
  );

  useEffect(() => {
    if (!eventId || !sessionId) return;
    const unsub = subscribeParticipation(eventId, sessionId, setParticipation);
    return () => unsub();
  }, [eventId, sessionId]);

  const templates = markingTemplates || [];
  const markFor = (id: string) => markings.find((m) => m.delegateId === id);
  const partFor = (id: string) => participation.find((p) => p.delegateId === id);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...delegates]
      .filter((d) => d.userId)
      .filter((d) => !q || (d.assignedCountry || "").toLowerCase().includes(q) || (d.applicantName || "").toLowerCase().includes(q))
      .sort((a, b) => (a.assignedCountry || "").localeCompare(b.assignedCountry || ""));
  }, [delegates, search]);

  const detailIndex = useMemo(() => sorted.findIndex((d) => d.userId === detailUid), [sorted, detailUid]);
  const detailDelegate: DetailDelegate | null = useMemo(() => {
    const d = sorted[detailIndex];
    return d ? { userId: d.userId, applicationId: d.id || "", country: d.assignedCountry || "", name: d.applicantName || "" } : null;
  }, [sorted, detailIndex]);

  const baseFor = (d: ApplicationData) => ({
    eventId, committeeId, delegateId: d.userId, applicationId: d.id || "", dateStr,
    gradedBy: userId, markMode,
  });

  // Write ONE criterion, addressed by field path. `value === null` clears it (unscored →
  // excluded from the daily average, which is not the same as a scored 0). The optimistic
  // patch is cosmetic only — the subscription is what reconciles.
  const commitCell = async (d: ApplicationData, templateId: string, value: number | null) => {
    if (!canControl) return;
    setMarkings((cur) => {
      const i = cur.findIndex((m) => m.delegateId === d.userId);
      if (i === -1) {
        return [...cur, {
          id: `${committeeId}_${d.userId}_${dateStr}`, eventId, committeeId,
          delegateId: d.userId, applicationId: d.id || "", dateStr,
          scores: value === null ? {} : { [templateId]: value },
          feedback: "", gradedBy: userId, markMode,
        }];
      }
      return cur.map((m, idx) => {
        if (idx !== i) return m;
        const scores = { ...(m.scores || {}) };
        const scoreEntries = { ...(m.scoreEntries || {}) };
        delete scoreEntries[templateId];
        if (value === null) delete scores[templateId]; else scores[templateId] = value;
        return { ...m, scores, scoreEntries };
      });
    });
    setSaving(true);
    await setCriterionScore(baseFor(d), templateId, value);
    setSaving(false);
  };

  // Input handler: blank (or lone "-") ⇒ unscored; otherwise clamp to the mode's scale.
  const handleCell = (d: ApplicationData, templateId: string, raw: string) => {
    const s = (raw ?? "").trim();
    if (s === "" || s === "-") return commitCell(d, templateId, null);
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return;
    return commitCell(d, templateId, clamp(n, binary ? -1 : MARK_MIN, binary ? 1 : MARK_MAX));
  };

  // Append one mark to a criterion's list (the "+N" suggestion chip).
  const appendMark = async (d: ApplicationData, templateId: string, value: number) => {
    if (!canControl) return;
    const prev = markFor(d.userId);
    const existing = prev?.scoreEntries?.[templateId]
      ?? (typeof prev?.scores?.[templateId] === "number" ? [prev!.scores[templateId]] : []);
    setSaving(true);
    await setScoreEntries(baseFor(d), templateId, [...existing, value]);
    setSaving(false);
  };

  const applyAll = async () => {
    if (!canControl) return;
    for (const d of sorted) {
      const p = partFor(d.userId);
      for (const t of templates) {
        const sug = autoFillSuggestion(t, p);
        // Binary can't carry a numeric magnitude — any participation ⇒ +1, else neutral.
        if (sug != null) await commitCell(d, t.id, binary ? (sug > 0 ? 1 : 0) : clamp(sug, MARK_MIN, MARK_MAX));
      }
    }
  };

  if (templates.length === 0) {
    return (
      <PanelEmpty icon={ClipboardList}>
        <span className="block font-medium text-foreground">No marking templates</span>
        The organizer needs to configure marking rubrics in the event settings.
      </PanelEmpty>
    );
  }

  const hasSuggestions = templates.some((t) => t.autoFillFrom);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search delegate…" className="pl-8 h-9 bg-background" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
        {hasSuggestions && canControl && (
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={applyAll}>
            <Star className="w-4 h-4" /> Apply suggestions
          </Button>
        )}
      </div>

      {/* Column header */}
      <div className="hidden md:grid items-end gap-2 px-2.5 text-[10px] font-semibold text-muted-foreground"
        style={{ gridTemplateColumns: `minmax(120px,1.5fr) repeat(${templates.length}, minmax(48px,1fr)) minmax(46px,0.7fr)` }}>
        <span>Delegate</span>
        {templates.map((t) => (
          <span key={t.id} className="text-center leading-tight truncate" title={t.name}>
            {t.name}
            <span className="block text-[8.5px] font-medium normal-case text-muted-foreground/70">{binary ? "−1…+1" : "−100…+100"}</span>
          </span>
        ))}
        <span className="text-center">Total</span>
      </div>

      {sorted.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No delegates.</p>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {sorted.map((d) => {
            const m = markFor(d.userId);
            const p = partFor(d.userId);
            const pct = computeDailyScore(m, templates, markMode).pct;
            return (
              <SubCard key={d.userId} className={cn("transition-shadow", detailUid === d.userId && "ring-1 ring-primary/30")}>
                <div className="grid items-center gap-2 px-2.5 py-2"
                  style={{ gridTemplateColumns: `minmax(120px,1.5fr) repeat(${templates.length}, minmax(48px,1fr)) minmax(46px,0.7fr)` }}>
                  {/* Delegate — opens the full record */}
                  <button type="button" onClick={() => setDetailUid(d.userId)} className="flex items-center gap-2 min-w-0 text-left group">
                    {d.assignedCountry
                      ? <CountryFlag code={d.assignedCountry} size={22} />
                      : <span className="w-[22px] h-[22px] rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">?</span>}
                    <div className="min-w-0">
                      <p className="font-semibold text-[12px] leading-tight truncate flex items-center gap-1">
                        {getCountryName(d.assignedCountry || "") || "Pending"}
                        <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
                      </p>
                      <p className="text-[9.5px] text-muted-foreground leading-tight truncate">{d.applicantName}</p>
                    </div>
                  </button>
                  {/* Cells */}
                  {templates.map((t) => {
                    const ent = m?.scoreEntries?.[t.id];
                    const cell = m?.scores?.[t.id];
                    // Multi-mark → read-only mean·count chip (edit in the detail drawer).
                    if (ent && ent.length) {
                      const mv = binary ? Math.round((cell ?? 0) * 10) / 10 : Math.round(cell ?? 0);
                      return (
                        <button key={t.id} type="button" onClick={() => setDetailUid(d.userId)}
                          title={`${ent.length} marks · avg ${mv}`}
                          className={cn("h-8 rounded-lg border font-mono text-[13px] font-bold tabular-nums flex items-center justify-center gap-0.5", cellTone(cell))}>
                          {mv > 0 ? `+${mv}` : mv}<span className="text-[8.5px] font-normal opacity-60">·{ent.length}</span>
                        </button>
                      );
                    }
                    if (binary) {
                      return (
                        <div key={t.id} className="flex justify-center">
                          <BinaryScoreSelect value={typeof cell === "number" ? cell : null} disabled={!canControl} onChange={(v) => commitCell(d, t.id, v)} />
                        </div>
                      );
                    }
                    return (
                      <input
                        key={t.id}
                        type="number" min={MARK_MIN} max={MARK_MAX} disabled={!canControl}
                        value={cell ?? ""} placeholder="—"
                        onChange={(e) => handleCell(d, t.id, e.target.value)}
                        className={cn("h-8 w-full min-w-0 rounded-lg border text-center font-mono text-[13px] font-bold tabular-nums outline-none transition-colors focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed placeholder:font-normal placeholder:text-muted-foreground/40", cellTone(typeof cell === "number" ? cell : null))}
                      />
                    );
                  })}
                  {/* Total */}
                  <span className={cn("text-center font-mono text-[14px] font-extrabold tabular-nums", pct != null && pct < 0 ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                    {pct == null ? <span className="text-muted-foreground font-bold">—</span> : `${Math.round(pct)}%`}
                  </span>
                </div>

                <div className="px-2.5 pb-2 -mt-0.5 pl-[2.6rem] flex items-center gap-2 flex-wrap">
                  <AttendancePill status={m?.attendanceStatus ?? p?.attendanceStatus} />
                  <ParticipationChips p={p} />
                  {canControl && templates.some((t) => autoFillSuggestion(t, p) != null) && (
                    <button
                      onClick={() => { for (const t of templates) { const s = autoFillSuggestion(t, p); if (s != null) void appendMark(d, t.id, binary ? (s > 0 ? 1 : 0) : clamp(s, MARK_MIN, MARK_MAX)); } }}
                      className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20"
                      title="Append the participation suggestion to every auto-filled criterion"
                    >
                      <Star className="w-2.5 h-2.5" /> suggest
                    </button>
                  )}
                </div>
              </SubCard>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground text-center">Tap a delegate for their full record · scoring {scaleLabel(markMode)}</p>

      <DelegateMarkingDetail
        open={!!detailUid}
        onOpenChange={(v) => { if (!v) setDetailUid(null); }}
        eventId={eventId}
        committeeId={committeeId}
        delegate={detailDelegate}
        templates={templates}
        markMode={markMode}
        // Empty ⇒ the drawer derives the conference days from the delegate's own marking
        // docs. The console only knows today's date; it must not claim today is the only day.
        days={[]}
        selectedDate={dateStr}
        overallWeight={DEFAULT_OVERALL_WEIGHT}
        canMark={canControl}
        gradedBy={userId}
        shellClass={shellClass}
        onPrev={detailIndex > 0 ? () => setDetailUid(sorted[detailIndex - 1].userId) : undefined}
        onNext={detailIndex >= 0 && detailIndex < sorted.length - 1 ? () => setDetailUid(sorted[detailIndex + 1].userId) : undefined}
      />
    </div>
  );
}
