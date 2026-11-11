"use client";

/**
 * Mark the delegate WHILE they speak — a collapsible strip docked in the floor-holder's tile.
 *
 * The chair's problem this solves: every existing marking surface pulls attention off the speech.
 * `QuickScoreDialog` is a modal over the whole stage, `SpeechScorer` fires only once the speech has
 * ended, and `MarkingPanel` lives in the tool rail. All three ask the chair to stop watching in
 * order to score. This one sits on the speaker's own tile, so the judgement happens against the
 * thing being judged.
 *
 * COLLAPSED BY DEFAULT — a single chip. An always-open rubric would cover the face of the person
 * being marked, which defeats the point.
 *
 * Writes through `appendScoreEntry` to the SAME `markings/{committeeId}_{delegateId}_{dateStr}` doc
 * as the quick dialog, the post-speech scorer and the full panel. Append-only: the day's value is
 * the mean of the list, so tapping twice during a long speech is meaningful rather than destructive.
 */
import { useState } from "react";
import { useExclusiveDisclosure } from "./useExclusiveDisclosure";
import { Star, Check, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarkingMode, MarkingTemplate } from "@/lib/services/eventService";
import { appendScoreEntry, type DailyMarkingBase } from "@/lib/services/markingService";
import { BinaryScoreSelect } from "./BinaryScoreSelect";
import { getCountryName } from "@/lib/data/countries";

/** Decimal-mode taps. Same semantic ladder as `QuickScoreDialog`, three wide instead of four. */
const DECIMAL_STEPS: { value: number; label: string }[] = [
  { value: -50, label: "−50" },
  { value: 0, label: "0" },
  { value: 100, label: "+100" },
];

/**
 * MOUNT THIS WITH `key={delegateId}`. A new speaker is a new scoring subject, and the open/tally
 * state below must not carry over — a remount key is how that reset happens, rather than an effect
 * that calls setState and triggers a cascading render.
 */
export function LiveMarkStrip({
  base, templates, country, markMode = "decimal", defaultOpen = true, openUp, className, onMarkAppended,
}: {
  /** Identity of whoever currently holds the floor. */
  base: DailyMarkingBase;
  templates: MarkingTemplate[];
  country?: string;
  markMode?: MarkingMode;
  defaultOpen?: boolean;
  openUp?: boolean;
  className?: string;
  /** Optimistic echo for the post-speech scorer's prefill. NOT a "refresh your copy" signal —
   *  every reader of the marking docs is on a live listener. */
  onMarkAppended?: (templateId: string, value: number) => void;
}) {
  // Exclusive with the gate bar's override menu — both sit in the chair's stage and would overlap.
  const [open, setOpen] = useExclusiveDisclosure("live-marks", defaultOpen);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, number>>({});
  const [lastMarked, setLastMarked] = useState<Record<string, number>>({});

  if (templates.length === 0) return null;

  const total = Object.values(added).reduce((n, v) => n + v, 0);

  const append = async (t: MarkingTemplate, value: number) => {
    const key = `${t.id}:${value}`;
    if (busy) return;
    setBusy(key);
    try {
      setLastMarked((l) => ({ ...l, [t.id]: value }));
      onMarkAppended?.(t.id, value);
      await appendScoreEntry(base, t.id, value);
      setAdded((a) => ({ ...a, [t.id]: (a[t.id] || 0) + 1 }));
    } catch (e) {
      console.error("live mark", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("pointer-events-auto", openUp && "flex flex-col-reverse items-start min-h-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-bold",
          "bg-black/65 backdrop-blur-md border border-white/15 text-white/85",
          "hover:text-white hover:border-white/35 transition-colors",
          // The chip is the affordance — a short tile must clip the rubric, never this.
          openUp && "shrink-0",
        )}
      >
        <Star className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        Mark {country ? getCountryName(country) || country.toUpperCase() : "speaker"}
        {total > 0 && (
          <span className="inline-flex items-center gap-0.5 text-emerald-300">
            <Check className="w-3 h-3" /> {total}
          </span>
        )}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            // `w-full`, NOT `w-fit`. The criteria grid uses `repeat(auto-fit,…)`, and per spec a
            // grid container with an INDEFINITE width resolves an auto-fit repeat to exactly ONE
            // track — a fit-content panel collapses the criteria into a single stacked column.
            // Definite width, sized by the mount, which spans the tile.
            "w-full rounded-xl bg-black/80 backdrop-blur-md",
            "border border-white/15 p-2.5 max-h-[46vh] overflow-y-auto",
            // `min-h-0` so a bounded parent column can shrink this below its content height and let
            // the existing scroll take over, instead of pushing the chip out of the tile.
            openUp ? "mb-1.5 min-h-0" : "mt-1.5",
          )}
        >
          <MarkCriteriaList
            templates={templates} markMode={markMode}
            busy={busy} added={added} lastMarked={lastMarked} onAppend={append}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The criteria rows on their own — no chip, no container.
 *
 * Split out so a video tile can render the marking controls INSIDE itself instead of launching
 * `QuickScoreDialog` over the whole stage. Marking a delegate while covering every other delegate
 * with a modal is exactly backwards; the judgement should sit on the face being judged.
 */
export function MarkCriteriaList({
  templates, markMode = "decimal", busy, added, lastMarked, onAppend, compact,
}: {
  templates: MarkingTemplate[];
  markMode?: MarkingMode;
  /** `${templateId}:${value}` currently in flight, or null. */
  busy: string | null;
  /** templateId → how many marks this session has appended, for the ×N tally. */
  added: Record<string, number>;
  lastMarked?: Record<string, number>;
  onAppend: (t: MarkingTemplate, value: number) => void;
  /** Tighter type for small tiles. */
  compact?: boolean;
}) {
  const binary = markMode === "binary";
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "grid gap-x-1.5 gap-y-2",
          binary
            ? "grid-cols-[repeat(auto-fit,minmax(5rem,1fr))]"
            : "grid-cols-[repeat(auto-fit,minmax(6.25rem,1fr))]",
        )}
      >
        {templates.map((t) => (
          <div key={t.id} className="min-w-0 max-w-[11rem]">
            <div
              className={cn(
                "flex items-end gap-1 mb-1",
                compact ? "h-[2.2em]" : "h-[2.4em]",
              )}
            >
              <span
                className={cn(
                  "font-semibold text-white/85 leading-tight min-w-0 line-clamp-2 break-words",
                  compact ? "text-[10px]" : "text-[10.5px]",
                )}
                title={t.name}
              >
                {t.name}
              </span>
            </div>
            {binary ? (
              <BinaryScoreSelect
                value={lastMarked?.[t.id] ?? null}
                disabled={!!busy}
                onChange={(v) => { if (v != null) onAppend(t, v); }}
                fill
              />
            ) : (
              <div className="flex h-8 w-full items-stretch rounded-lg border border-white/20 overflow-hidden">
                {DECIMAL_STEPS.map((s, i) => {
                  const active = lastMarked?.[t.id] === s.value;
                  const activeClass =
                    s.value < 0
                      ? "bg-red-600 text-white font-bold shadow-[0_0_12px_rgba(239,68,68,0.7)] ring-1 ring-red-400 z-10"
                      : s.value > 0
                        ? "bg-emerald-600 text-white font-bold shadow-[0_0_12px_rgba(16,185,129,0.7)] ring-1 ring-emerald-400 z-10"
                        : "bg-amber-600 text-white font-bold shadow-[0_0_12px_rgba(245,158,11,0.7)] ring-1 ring-amber-400 z-10";
                  return (
                    <button
                      key={s.value}
                      type="button"
                      disabled={!!busy}
                      onClick={() => onAppend(t, s.value)}
                      className={cn(
                        "flex-1 min-w-0 grid place-items-center text-[10.5px] font-semibold tabular-nums",
                        "transition-all disabled:opacity-40",
                        i > 0 && "border-l border-white/20",
                        active
                          ? activeClass
                          : s.value > 0
                            ? "text-emerald-300 hover:bg-emerald-500/20"
                            : s.value < 0
                              ? "text-red-300 hover:bg-red-500/20"
                              : "text-white/60 hover:bg-white/10",
                      )}
                    >
                      {busy === `${t.id}:${s.value}`
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : s.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-white/40 leading-snug pt-0.5">
        Each tap appends a mark — the day&apos;s score is the average, so you can score more than once.
      </p>
    </div>
  );
}

