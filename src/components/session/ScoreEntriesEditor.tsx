"use client";

/**
 * Edits the list of individual marks for ONE criterion on ONE day (e.g. one mark per
 * speech). The parent persists the returned list via `setScoreEntries`, which keeps
 * `scores[id]` = mean(list). Shared by the in-console MarkingPanel detail and the external
 * chair matrix popover so the two surfaces can't diverge.
 *
 * Scale depends on the event's marking pattern:
 *   - decimal → a ±100 number field per mark; mean shown rounded to an integer.
 *   - binary  → +1 / 0 / −1 buttons per mark; mean kept fractional (a tally of +1,+1,0,−1
 *               averages to 0.4), so it must NOT be rounded here.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clamp, MARK_MIN, MARK_MAX, BINARY_MIN, BINARY_MAX } from "@/lib/services/markingScore";
import type { MarkingMode } from "@/lib/services/eventService";
import { X, Plus } from "lucide-react";

const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`);

export function ScoreEntriesEditor({
  entries, onChange, disabled, mode = "decimal",
}: {
  entries: number[];
  onChange: (entries: number[]) => void;
  disabled?: boolean;
  mode?: MarkingMode;
}) {
  const [draft, setDraft] = useState("");
  const binary = mode === "binary";

  const add = () => {
    const s = draft.trim();
    if (s === "" || s === "-") return;
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return;
    onChange([...entries, clamp(n, MARK_MIN, MARK_MAX)]);
    setDraft("");
  };
  const addBinary = (v: number) => onChange([...entries, clamp(v, BINARY_MIN, BINARY_MAX)]);
  const removeAt = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const rawAvg = entries.length ? entries.reduce((a, b) => a + b, 0) / entries.length : null;
  // Binary keeps a fractional mean (1 decimal); decimal rounds to an integer.
  const avg = rawAvg == null ? null : binary ? Math.round(rawAvg * 10) / 10 : Math.round(rawAvg);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[1.75rem]">
        {entries.length === 0 && <span className="text-xs text-muted-foreground">No marks yet</span>}
        {entries.map((v, i) => (
          <span
            key={i}
            className={cn(
              "inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs font-semibold tabular-nums",
              v < 0 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-primary/10 text-primary",
            )}
          >
            {fmt(v)}
            {!disabled && (
              <button type="button" onClick={() => removeAt(i)} className="opacity-60 hover:opacity-100" aria-label="Remove mark">
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex items-center gap-1.5">
          {binary ? (
            <div className="inline-flex items-stretch rounded-lg border border-border overflow-hidden">
              {[-1, 0, 1].map((v, i) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => addBinary(v)}
                  className={cn(
                    "h-7 px-2.5 text-xs font-semibold tabular-nums transition-colors hover:bg-muted/60",
                    i > 0 && "border-l border-border",
                    v < 0 ? "text-red-600 dark:text-red-400" : v > 0 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {v > 0 ? `+${v}` : v}
                </button>
              ))}
            </div>
          ) : (
            <>
              <Input
                type="number"
                min={MARK_MIN}
                max={MARK_MAX}
                value={draft}
                placeholder="±100"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                className="h-7 w-20 text-center text-sm"
              />
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={add}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </>
          )}
          {avg != null && (
            <span className="text-xs text-muted-foreground ml-auto">
              avg <span className="font-semibold text-foreground tabular-nums">{fmt(avg)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
