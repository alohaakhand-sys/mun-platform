"use client";

/**
 * Multi-device countdown. Reads the deadline (TimerState.endsAt) from the synced
 * session doc and ticks LOCALLY — no per-second writes. Controls call back to the
 * parent which persists start/pause/reset to Firestore.
 */
import { useEffect, useState } from "react";
import { timerRemainingMs, type TimerState } from "@/lib/services/sessionService";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CountdownTimer({
  timer, canControl, onStart, onPause, onReset, onAdjust, size = "lg",
}: {
  timer: TimerState;
  canControl: boolean;
  onStart: (remainingMs: number) => void;
  onPause: (remainingMs: number) => void;
  onReset: () => void;
  onAdjust?: (deltaMs: number) => void;
  size?: "sm" | "lg" | "xl";
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timer.running) return;
    // Tick locally against the synced deadline — no Firestore writes per second.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer.running, timer.endsAt]);

  const remaining = timerRemainingMs(timer, now);
  const pct = timer.durationMs > 0 ? (remaining / timer.durationMs) * 100 : 0;
  const expired = timer.running && remaining <= 0;

  const startRemaining = remaining > 0 ? remaining : timer.durationMs;

  return (
    // @container, not `sm:` — at `lg` this renders inside the ~376px chair tool panel, where a
    // viewport breakpoint would put the four transport buttons beside the clock with no room.
    <div className={cn("@container/timer flex items-center gap-3",
      size === "lg" || size === "xl" ? "flex-col @md/timer:flex-row" : "")}>
      <div className="flex-1 min-w-0 w-full">
        <div className={cn("flex items-baseline justify-between", size === "xl" ? "mb-2 justify-center @md/timer:justify-start" : "mb-1")}>
          <span className={cn("font-mono font-bold tabular-nums leading-none",
            size === "xl" ? "text-7xl sm:text-8xl tracking-tight" : size === "lg" ? "text-4xl" : "text-2xl",
            expired ? "text-red-600 dark:text-red-400" : remaining < 10000 && timer.running ? "text-amber-600" : "text-foreground",
            expired && timer.running ? "animate-pulse" : "")}>
            {fmt(remaining)}
          </span>
        </div>
        <div className={cn("w-full bg-secondary/40 rounded-full overflow-hidden", size === "xl" ? "h-3" : "h-2")}>
          <div
            className={cn("h-full rounded-full transition-all duration-200",
              expired ? "bg-red-500" : pct < 20 ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${Math.max(0, pct)}%` }}
          />
        </div>
      </div>

      {canControl && (
        <div className="flex items-center gap-1.5 shrink-0">
          {onAdjust && (
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onAdjust(-15000)} title="-15s">
              <Minus className="w-3.5 h-3.5" />
            </Button>
          )}
          {timer.running ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onPause(remaining)}>
              <Pause className="w-4 h-4" /> Pause
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={() => onStart(startRemaining)}>
              <Play className="w-4 h-4" /> Start
            </Button>
          )}
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onReset} title="Reset">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          {onAdjust && (
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onAdjust(15000)} title="+15s">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
