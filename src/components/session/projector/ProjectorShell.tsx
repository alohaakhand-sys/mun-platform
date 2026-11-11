"use client";

/**
 * The board frame: three fixed zones on one screen that NEVER scrolls.
 *
 * A projector has no scrollbar the room can reach, so anything below the fold does not exist.
 * `LiveMunShell` (which this replaces on the projector route) was a `max-w-6xl` column of stacked
 * cards — a 1152px strip of a 1920 screen, with the speakers list pushed off the bottom. Here the
 * rail and the ledger are fixed bands and the stage takes whatever is left, at every aspect ratio
 * from a 1280x720 classroom beamer to a 4K hall display.
 *
 * TYPE SCALE LIVES HERE, once. Every board sizes from the `--t-*` custom properties below rather
 * than Tailwind's `text-*` steps, because the board's problem is throw distance, not breakpoints:
 * `text-5xl` is 48px on a phone and 48px on a 4m screen. Each is viewport-relative and multiplied
 * by `--proj-scale`, so the +/- keys resize the whole board coherently.
 */
import Link from "next/link";
import { ArrowLeft, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectorChrome } from "./useProjectorChrome";

/**
 * The board's whole type scale, in one place. Every size is viewport-relative — a projector's
 * problem is throw distance, not breakpoints, and `text-5xl` is 48px on a phone and 48px on a
 * four-metre screen. `--proj-scale` (the +/- keys) multiplies all of them together.
 */
const BOARD_VARS = (scale: number): React.CSSProperties => ({
  "--proj-scale": scale,
  // Overscan guard — a TV crops the outer few percent of the signal.
  "--proj-pad": "calc(clamp(20px, 2.6vw, 64px) * var(--proj-scale))",
  "--t-eyebrow": "calc(clamp(0.68rem, 0.95vw, 1.1rem) * var(--proj-scale))",
  "--t-rail": "calc(clamp(0.9rem, 1.35vw, 1.7rem) * var(--proj-scale))",
  "--t-body": "calc(clamp(1rem, 1.6vw, 2rem) * var(--proj-scale))",
  "--t-lead": "calc(clamp(1.35rem, 2.6vw, 3.4rem) * var(--proj-scale))",
  "--t-ledger": "calc(clamp(1rem, 1.9vw, 2.2rem) * var(--proj-scale))",
  "--t-figure": "calc(clamp(2.4rem, 6vw, 8rem) * var(--proj-scale))",
  "--t-display": "calc(clamp(2.4rem, 5.2vw, 7rem) * var(--proj-scale))",
  "--t-outcome": "calc(clamp(3rem, 8vw, 11rem) * var(--proj-scale))",
  "--t-clock": "calc(clamp(3.5rem, 10.5vw, 14rem) * var(--proj-scale))",
} as React.CSSProperties);

export function ProjectorShell({
  exitHref, rail, ledger, children,
}: {
  exitHref: string;
  rail?: React.ReactNode;
  ledger?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { chromeVisible, fullscreen, toggleFullscreen, scale, stepScale } = useProjectorChrome();

  return (
    <div
      className={cn(
        "mun-projector font-sans bg-proj-field text-proj-ink",
        "fixed inset-0 grid grid-rows-[auto_1fr_auto] overflow-hidden",
        !chromeVisible && "cursor-none",
      )}
      style={BOARD_VARS(scale)}
    >
      {/* All three rows are always present, even when empty. An absent rail would otherwise leave
          the stage in the `auto` row instead of the `1fr` one and collapse it to nothing. */}
      <div>{rail}</div>

      {/* `relative` + `absolute inset-0` rather than a plain flex child: the boards size themselves
          against a definite height (`h-full`, `flex-1 min-h-0`), and a percentage height needs a
          parent that actually has one. */}
      <main className="relative min-h-0 overflow-hidden">
        <div className="absolute inset-0" style={{ padding: "var(--proj-pad)" }}>
          {children}
        </div>
      </main>

      <div>{ledger}</div>

      {/* Operator cluster — the only thing on this screen that is not for the room. */}
      <div
        className={cn(
          "fixed bottom-3 right-3 z-50 flex items-center gap-1 rounded-full p-1",
          "bg-proj-ink text-proj-field transition-opacity duration-300",
          chromeVisible ? "opacity-90" : "opacity-0 pointer-events-none",
        )}
      >
        {/* The board is normally a popup the console opened, so "Exit" should close the window, not
            navigate it to a committee page the operator then has to close anyway. Falls back to a
            real link when the board was opened directly (a deep link, or a dedicated display PC). */}
        <Link
          href={exitHref}
          onClick={(e) => {
            if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
              e.preventDefault();
              window.close();
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold hover:bg-white/15 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Exit
        </Link>
        <span className="w-px h-4 bg-white/20" />
        <ChromeBtn title="Smaller (-)" onClick={() => stepScale(-1)}><Minus className="w-3.5 h-3.5" /></ChromeBtn>
        <span className="px-1 text-[11px] font-mono tabular-nums opacity-70">{Math.round(scale * 100)}%</span>
        <ChromeBtn title="Bigger (+)" onClick={() => stepScale(1)}><Plus className="w-3.5 h-3.5" /></ChromeBtn>
        <span className="w-px h-4 bg-white/20" />
        <ChromeBtn title={fullscreen ? "Leave full screen (F)" : "Full screen (F)"} onClick={toggleFullscreen}>
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </ChromeBtn>
      </div>
    </div>
  );
}

function ChromeBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="w-7 h-7 rounded-full inline-flex items-center justify-center hover:bg-white/15 transition-colors"
    >
      {children}
    </button>
  );
}
