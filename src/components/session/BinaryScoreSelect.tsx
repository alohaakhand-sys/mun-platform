"use client";

/**
 * Binary-mode score input: a 3-state segmented control [ −1 | 0 | +1 ] for scoring one
 * criterion when the event's marking pattern is "binary". `null` = unscored (excluded
 * from the average), kept distinct from a scored 0 — clicking the active value again
 * clears it back to unscored. Mirrors the ±100 number inputs used in decimal mode, so
 * the two patterns stay interchangeable across every chair surface.
 */
import { cn } from "@/lib/utils";

const OPTIONS: { value: -1 | 0 | 1; label: string }[] = [
  { value: -1, label: "−1" },
  { value: 0, label: "0" },
  { value: 1, label: "+1" },
];

export function BinaryScoreSelect({
  value,
  onChange,
  disabled,
  fill,
  className,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  /**
   * Stretch to the container instead of hugging its labels, splitting the width three ways.
   * For column layouts (one criterion per column) where the control sits UNDER its own label
   * and must line up with the neighbouring columns' controls.
   */
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex h-8 items-stretch rounded-lg border border-border overflow-hidden bg-background",
        fill && "flex w-full",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      {OPTIONS.map((opt, i) => {
        const active = value === opt.value;
        const activeClass =
          opt.value < 0
            ? "bg-red-600 text-white font-bold shadow-[0_0_12px_rgba(239,68,68,0.7)] ring-1 ring-red-400 z-10"
            : opt.value > 0
              ? "bg-emerald-600 text-white font-bold shadow-[0_0_12px_rgba(16,185,129,0.7)] ring-1 ring-emerald-400 z-10"
              : "bg-amber-600 text-white font-bold shadow-[0_0_12px_rgba(245,158,11,0.7)] ring-1 ring-amber-400 z-10";
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            // Re-clicking the active value clears it back to unscored (null).
            onClick={() => onChange(active ? null : opt.value)}
            className={cn(
              "px-2.5 text-xs font-semibold tabular-nums transition-colors",
              fill && "flex-1 px-0",
              i > 0 && "border-l border-border",
              active ? activeClass : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
