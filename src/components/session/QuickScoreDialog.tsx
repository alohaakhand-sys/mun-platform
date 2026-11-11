"use client";

/**
 * On-tile quick marking — the fast path the chair triggers by tapping a delegate's video
 * tile during a live session. One-tap preset chips (semantic labels over the underlying
 * ±100/±1 values) per criterion, each appended immediately to the delegate's daily marking
 * via `appendScoreEntry` (the day's value stays the mean of the list). Also surfaces
 * participation-based autofill suggestions, and an optional "full rubric" expand — a
 * slider (decimal) / 3-state select (binary) per criterion seeded from today's current
 * value, plus a feedback note — for when a one-tap preset isn't precise enough. Writes the
 * SAME `markings/{committeeId}_{delegateId}_{dateStr}` doc as the full MarkingPanel and the
 * post-speech SpeechScorer, so all three stay consistent.
 */
import { useEffect, useState } from "react";
import type { MarkingMode, MarkingTemplate } from "@/lib/services/eventService";
import { appendScoreEntry, setDailyFeedback, type DailyMarkingBase, type Marking } from "@/lib/services/markingService";
import {
  getMyParticipation, autoFillSuggestion, type ParticipationSummary,
} from "@/lib/services/sessionService";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { BinaryScoreSelect } from "./BinaryScoreSelect";
import { cn } from "@/lib/utils";
import { Star, Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const DECIMAL_PRESETS: { value: number; label: string }[] = [
  { value: 100, label: "Excellent" },
  { value: 50, label: "Good" },
  { value: 0, label: "Neutral" },
  { value: -50, label: "Needs work" },
];
const BINARY_PRESETS: { value: -1 | 0 | 1; label: string }[] = [
  { value: 1, label: "Good" },
  { value: 0, label: "Neutral" },
  { value: -1, label: "Needs work" },
];

export function QuickScoreDialog({
  base, templates, country, name, onClose, markMode = "decimal", initial,
}: {
  base: DailyMarkingBase;
  templates: MarkingTemplate[];
  country?: string;
  name?: string;
  onClose: () => void;
  markMode?: MarkingMode;
  /** Today's existing marking doc for this delegate, if any — seeds the full-rubric values. */
  initial?: Marking | null;
}) {
  const binary = markMode === "binary";
  const PRESETS = binary ? BINARY_PRESETS : DECIMAL_PRESETS;
  const [participation, setParticipation] = useState<ParticipationSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);          // `${templateId}:${value}` in flight
  const [added, setAdded] = useState<Record<string, number>>({}); // templateId → count appended here
  const [rubricOpen, setRubricOpen] = useState(false);
  const [rubricDraft, setRubricDraft] = useState<Record<string, number>>(() => {
    const d: Record<string, number> = {};
    templates.forEach((t) => { d[t.id] = typeof initial?.scores?.[t.id] === "number" ? initial!.scores![t.id] : 0; });
    return d;
  });
  const [feedback, setFeedback] = useState(initial?.feedback || "");
  const [feedbackSaved, setFeedbackSaved] = useState(true);
  const [savingFeedback, setSavingFeedback] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyParticipation(base.eventId, base.committeeId, base.dateStr, base.delegateId)
      .then((p) => { if (alive) setParticipation(p); });
    return () => { alive = false; };
  }, [base.eventId, base.committeeId, base.dateStr, base.delegateId]);

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const append = async (t: MarkingTemplate, value: number) => {
    const key = `${t.id}:${value}`;
    if (busy) return;
    setBusy(key);
    try {
      await appendScoreEntry(base, t.id, value);
      setAdded((a) => ({ ...a, [t.id]: (a[t.id] || 0) + 1 }));
    } catch (e) {
      console.error("quick appendScoreEntry", e);
    } finally {
      setBusy(null);
    }
  };

  const saveFeedback = async () => {
    setSavingFeedback(true);
    try {
      await setDailyFeedback(base, feedback);
      setFeedbackSaved(true);
    } catch (e) {
      console.error("quick setDailyFeedback", e);
    } finally {
      setSavingFeedback(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      {/* Launched from a video tile but rendered at the CONSOLE root, outside the stage's `.dark`.
          No theme class of its own — it takes whichever way the chair has the console set. */}
      <div className="w-[min(94vw,460px)] max-h-[88vh] overflow-y-auto rounded-2xl bg-background border border-border/60 shadow-lg shadow-primary/10 dark:shadow-xl p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 mb-1">
          {country
            ? <CountryFlag code={country} size={24} />
            : <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">?</span>}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold leading-tight flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Quick mark
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {name || (country && getCountryName(country)) || country || "Delegate"}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Each tap appends a {binary ? "−1 / 0 / +1" : "−100…+100"} mark to today&apos;s list · the day&apos;s value is the average.
        </p>

        {templates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No marking criteria set for this event.</p>
        ) : (
          <div className="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1 -mr-1">
            {templates.map((t) => {
              const suggestion = autoFillSuggestion(t, participation ?? undefined);
              return (
                <div key={t.id} className="rounded-xl border border-border/50 bg-secondary/20 p-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold truncate flex-1">{t.name}</span>
                    {added[t.id] > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Check className="w-3 h-3" /> {added[t.id]}
                      </span>
                    )}
                    {suggestion != null && suggestion > 0 && (
                      <button
                        type="button" disabled={!!busy}
                        onClick={() => append(t, binary ? 1 : suggestion)}
                        title={`Suggested from ${t.autoFillFrom} participation`}
                        className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-primary/15 text-primary text-[11px] font-bold hover:bg-primary/25 transition-colors disabled:opacity-40"
                      >
                        {binary ? "+1" : `+${suggestion}`} <span className="opacity-70 font-medium">auto</span>
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {PRESETS.map(({ value: v, label }) => {
                      const key = `${t.id}:${v}`;
                      return (
                        <button
                          key={v} type="button" disabled={!!busy}
                          onClick={() => append(t, v)}
                          className={cn(
                            "flex-1 h-11 rounded-lg border text-[10.5px] font-bold transition-all disabled:opacity-40 active:scale-95 flex flex-col items-center justify-center gap-0.5",
                            v > 0
                              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50"
                              : v < 0
                                ? "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300 hover:bg-red-500/20 hover:border-red-500/50"
                                : "border-border/60 bg-muted/10 text-muted-foreground hover:bg-muted/40",
                          )}
                        >
                          {busy === key ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                            <>
                              <span className="text-[12px]">{v > 0 ? `+${v}` : v}</span>
                              <span className="opacity-80 leading-none">{label}</span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {templates.length > 0 && (
          <button type="button" onClick={() => setRubricOpen((v) => !v)}
            className="mt-3.5 w-full h-9 rounded-lg border border-border/60 bg-secondary/30 text-[12.5px] font-semibold hover:bg-secondary/50 transition-colors flex items-center justify-center gap-1.5">
            {rubricOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {rubricOpen ? "Hide full rubric" : "Open full rubric"}
          </button>
        )}

        {rubricOpen && (
          <div className="mt-3.5 pt-3.5 border-t border-border/60 space-y-4">
            {templates.map((t) => {
              const val = rubricDraft[t.id] ?? 0;
              const commit = () => append(t, rubricDraft[t.id] ?? 0);
              return (
                <div key={t.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12.5px] font-semibold">{t.name}</span>
                    <span className={cn("text-[12.5px] font-bold tabular-nums",
                      val > 0 ? "text-emerald-600 dark:text-emerald-400" : val < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {val > 0 ? `+${val}` : val}
                    </span>
                  </div>
                  {binary ? (
                    <BinaryScoreSelect
                      value={val}
                      onChange={(v) => {
                        // Append-only model — re-clicking to "unscore" (v === null) is a no-op here;
                        // clearing a criterion is a MarkingPanel action, not a quick-mark one.
                        if (v == null) return;
                        setRubricDraft((d) => ({ ...d, [t.id]: v }));
                        append(t, v);
                      }}
                    />
                  ) : (
                    <input
                      type="range" min={-100} max={100} step={5} value={val}
                      onChange={(e) => setRubricDraft((d) => ({ ...d, [t.id]: Number(e.target.value) }))}
                      onMouseUp={commit} onTouchEnd={commit} onKeyUp={commit}
                      className="w-full accent-primary"
                    />
                  )}
                </div>
              );
            })}

            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">Feedback</div>
              <textarea
                value={feedback}
                onChange={(e) => { setFeedback(e.target.value); setFeedbackSaved(false); }}
                onBlur={() => !feedbackSaved && saveFeedback()}
                placeholder="Private feedback for this delegate…"
                className="w-full min-h-16 px-3 py-2 rounded-lg bg-secondary/30 border border-border/60 text-[13px] outline-none focus:border-primary/50 resize-y"
              />
              <div className="flex items-center justify-end gap-2 mt-1.5">
                {savingFeedback ? (
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>
                ) : !feedbackSaved ? (
                  <button type="button" onClick={saveFeedback}
                    className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-[11.5px] font-semibold hover:bg-primary/90 transition-colors">
                    Save feedback
                  </button>
                ) : feedback && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
