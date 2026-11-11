"use client";

/**
 * Shared stateless shell atoms for the live-session consoles (chair + delegate).
 *
 * Both the chair console and the delegate console render the same Google-Meet-style
 * chrome, so the small, presentation-only building blocks live here once instead of being
 * duplicated. These were lifted verbatim out of `ChairSessionConsole.tsx` — no behaviour
 * change — so the two consoles stay pixel-identical.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StageLayoutMode } from "../video/LiveVideoRoom";
import { useBarMenu, BarMenuPopover } from "./barMenu";
import { AiAssistBar } from "../ai/AiAssist";
import { useLiveTheme, consoleShellClass } from "../useLiveTheme";
import {
  ArrowLeft, X, Sparkles, LayoutGrid, Focus, CheckCircle2, UserSquare2,
} from "lucide-react";

/** mm:ss for a millisecond duration. */
export function fmt(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Re-exported so existing `PHASE_META` imports from this barrel keep working. */
export { PHASE_META, PHASE_LABEL, PhaseIcon } from "../phaseMeta";

/**
 * True at `lg` (≥1024px), where the side panels sit BESIDE the video stage. Below it a panel
 * becomes a full-width sheet that replaces the stage, which is why both consoles branch on this
 * rather than on a CSS class alone — the left chat dock and the right tool panel both claim the
 * whole width there, so only one may be open at a time. SSR-safe.
 */
export function useIsWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

/** Corner launcher button used on the video overlay (Chat / Tools / Host …). */
export function LauncherBtn({
  title, icon: Icon, onClick, active, badge = 0,
}: { title: string; icon: React.ElementType; onClick: () => void; active?: boolean; badge?: number }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      className={cn("relative w-[42px] h-[42px] rounded-full flex items-center justify-center transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-white/90 hover:bg-white/10")}>
      <Icon className="w-[22px] h-[22px]" />
      {badge > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>
      )}
    </button>
  );
}

/**
 * Round Meet-style control-bar button (mic / cam / present …).
 *
 * TWO ATTENTION LEVELS, AND THEY MUST NOT BOTH FIRE. `blink` is a ballot's act-now pulse: a thing
 * with a deadline that closes against you. `glow` is an advisory invitation the chair has opened —
 * worth looking at, not worth panicking about. Two competing pulses in a six-button bar cancel each
 * other out, so the caller picks one; `blink` wins where they could overlap, because a vote outranks
 * an invitation. Both degrade under `prefers-reduced-motion` (globals.css) — `blink` keeps its
 * static ring and `glow` keeps its own, so neither signal depends on movement.
 */
export function RoundBtn({
  title, icon: Icon, onClick, danger, active, activeTone = "primary", disabled, blink, glow,
  haspopup, expanded,
}: {
  title: string; icon: React.ElementType; onClick: () => void;
  danger?: boolean; active?: boolean; activeTone?: "primary" | "amber"; disabled?: boolean;
  /** Set on the buttons that open a control-bar menu, so the popover is announced. */
  haspopup?: boolean;
  expanded?: boolean;
  /**
   * Act-now pulse — amber fill, a static ring, and an `animate-vote-pulse` halo. Used for an
   * open vote: the static ring carries the signal on its own under `prefers-reduced-motion`.
   */
  blink?: boolean;
  /**
   * Advisory glow — the same soft amber treatment the chair's own Gate Bar uses to mark what the
   * flow suggests (`animate-flow-advice-glow`). Composes with `active`/`activeTone` rather than
   * replacing the fill, so an invited control keeps reading as available, not as alarmed. Ignored
   * while `blink` is set.
   */
  glow?: boolean;
}) {
  const glowing = glow && !blink;
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} disabled={disabled}
      aria-haspopup={haspopup ? "menu" : undefined} aria-expanded={haspopup ? !!expanded : undefined}
      className={cn(
        "relative w-12 h-12 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        danger ? "bg-red-500 text-white hover:bg-red-600"
          : blink ? "bg-amber-500 text-black hover:bg-amber-600 ring-2 ring-amber-300/70 animate-vote-blink"
          : active ? (activeTone === "amber" ? "bg-amber-500 text-black" : "bg-primary text-primary-foreground")
          : "bg-white/10 text-white hover:bg-white/20",
        glowing && "ring-1 ring-amber-400/60 animate-flow-advice-glow",
      )}>
      {blink && <span aria-hidden className="absolute inset-0 rounded-full animate-vote-pulse text-amber-600 dark:text-amber-400 pointer-events-none" />}
      <Icon className="w-[22px] h-[22px]" />
    </button>
  );
}

/**
 * Google Meet–style "change layout" control — Auto / Tiled / Spotlight (per-viewer, not synced).
 *
 * Its open state lives in the control bar's `BarMenuGroup`, so opening it closes whichever other
 * bar menu was showing (and vice versa) — the four bar popovers all open into the same band.
 */
export function LayoutSwitcher({
  mode, onChange,
}: {
  mode: StageLayoutMode;
  onChange: (m: StageLayoutMode) => void;
}) {
  const [open, setOpen] = useBarMenu("layout");
  const opts: { id: StageLayoutMode; label: string; icon: React.ElementType }[] = [
    { id: "auto", label: "Auto", icon: Sparkles },
    { id: "grid", label: "Tiled", icon: LayoutGrid },
    { id: "spotlight", label: "Spotlight", icon: Focus },
  ];
  return (
    <div className="relative">
      <RoundBtn title="Change layout" icon={LayoutGrid} onClick={() => setOpen(!open)} active={open}
        haspopup expanded={open} />
      <BarMenuPopover open={open} onClose={() => setOpen(false)} className="w-[186px] p-1.5">
        {opts.map((o) => {
          const OIcon = o.icon;
          const active = mode === o.id;
          return (
            <button key={o.id} type="button" role="menuitem" onClick={() => { onChange(o.id); setOpen(false); }}
              className={cn("flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary/60")}>
              <OIcon className="w-4 h-4" /> {o.label}
              {active && <CheckCircle2 className="w-4 h-4 ml-auto" />}
            </button>
          );
        })}
      </BarMenuPopover>
    </div>
  );
}

/** Slim square icon button used in the "Live now" strip transport. */
export function StripIcon({ title, icon: Icon, onClick, primary }: { title: string; icon: React.ElementType; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
        primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border/60 text-muted-foreground hover:bg-secondary/60")}>
      <Icon className="w-4 h-4" />
    </button>
  );
}

/**
 * The floor clock's countdown ring — conic progress around an mm:ss core.
 *
 * Hardcoded hex is correct here, and only here: this renders INSIDE the video stage, which is
 * `.dark` under both console themes (see useLiveTheme), so a token-driven fill would follow the
 * console palette and go pale-on-black in light mode.
 */
export function FloorRing({ pct, text, danger }: { pct: number; text: string; danger?: boolean }) {
  const ringColor = danger ? "#f59e0b" : "#10b981";
  return (
    <div className="relative w-11 h-11 shrink-0">
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${ringColor} ${pct}%, rgba(255,255,255,.15) 0)` }} />
      <div className="absolute inset-[3px] rounded-full bg-[#0c1114] flex items-center justify-center">
        <span className={cn("text-[12px] font-bold font-mono tabular-nums leading-none", danger ? "text-amber-600 dark:text-amber-400" : "text-white")}>
          {text}
        </span>
      </div>
    </div>
  );
}

/**
 * The floating pill the floor clock rides in — docked top-left of the floor-holder's video tile
 * (`LiveVideoRoom`'s `floorBar` slot), or of the stage itself when that tile does not exist.
 *
 * `absolute` is not optional: the tile root is `relative overflow-hidden` with the video player at
 * `absolute inset-0`, so anything left in normal flow renders *beneath* the video and is invisible.
 * z-[4] clears the tile's own identity label and status chips.
 */
export function FloorPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("absolute left-4 top-4 z-[4] flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-full bg-black/65 backdrop-blur-md border border-white/10 shadow-xl shadow-black/40 max-w-[min(94%,440px)]", className)}>
      {children}
    </div>
  );
}

/** Panel-header close (×) button. */
export function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Close" aria-label="Close"
      className="w-8 h-8 rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground flex items-center justify-center shrink-0 transition-colors">
      <X className="w-[18px] h-[18px]" />
    </button>
  );
}

/**
 * Centered modal dialog for the live console. Rendered *in the console tree* (not portalled to
 * `document.body` like Radix `ui/dialog`) so it follows the console's own theme rather than the
 * app theme. Backdrop-click / Escape / × all close.
 *
 * RE-ASSERTS THE THEME on its own root. Callers open these from anywhere in the tree, including
 * the video stage — and the stage is `.dark` in both themes. `fixed inset-0` takes the dialog out
 * of flow and out of the stage's `overflow-hidden`, but custom properties still inherit down the
 * DOM, so a modal opened from the stage rendered full-screen dark while the console was light.
 * Stamping `consoleShellClass()` here re-declares the palette the console is actually set to, so
 * the dialog looks the same wherever it was opened from.
 */
export function ConsoleModal({
  title, subtitle, icon: Icon, onClose, wide, children,
}: {
  title: string; subtitle?: string; icon: React.ElementType; onClose: () => void;
  /** Roomier dialog (document composer) — max-w-3xl instead of max-w-md. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [theme] = useLiveTheme();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose}
      className={cn(
        consoleShellClass(theme),
        // `text-foreground` must ride WITH the shell class, always. The class re-declares the
        // palette variables, but `color` inherits as a COMPUTED value: a dialog opened from the
        // video stage inherits the stage's near-white ink, and re-declaring `--foreground` under it
        // changes nothing. Result was a correctly-light dialog with invisible headings. Re-stating
        // the token here forces it to resolve against the palette this root just declared.
        "text-foreground",
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150",
      )}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-h-[85vh] overflow-y-auto rounded-2xl bg-card border border-border/70 shadow-lg shadow-primary/10 dark:shadow-xl animate-in fade-in zoom-in-95 duration-200",
          wide ? "max-w-3xl" : "max-w-md",
        )}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60 sticky top-0 bg-card z-10">
          <span className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight truncate">{title}</div>
            {subtitle && <div className="text-[11.5px] text-muted-foreground leading-tight truncate">{subtitle}</div>}
          </div>
          <div className="flex-1" />
          <CloseBtn onClick={onClose} />
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/** Chromeless full-viewport shell for console gate/loading states. */
export function ConsoleScaffold({
  exitHref, title, subtitle, children,
}: { exitHref: string; title: string; subtitle?: string; children: React.ReactNode }) {
  // Reads the same stored preference as the consoles, so an empty/loading state does not flash the
  // opposite theme on the way in.
  const [theme] = useLiveTheme();
  return (
    <div className={cn(consoleShellClass(theme), "flex flex-col h-[100dvh] bg-background text-foreground")}>
      <header className="flex items-center gap-3 px-4 h-[56px] bg-background border-b border-border/60 shrink-0">
        <Link href={exitHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Exit
        </Link>
        <div className="h-6 w-px bg-border/60" />
        <div className="min-w-0">
          <p className="font-bold leading-tight truncate font-heading">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </header>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="max-w-sm mx-auto text-center py-20 text-muted-foreground">
      <Icon className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
      <p className="font-semibold text-foreground">{title}</p>
      <p className="text-sm">{body}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Panel design atoms (Chair Panels Redesign)
 *
 * Shared, token-based building blocks so every side-panel tool — in BOTH the chair
 * and delegate consoles — reads as one system: an icon-chipped titled card, solid-accent
 * toggle chips, tinted queue rows with a left accent bar, count pills, and compact empty
 * states. They render in BOTH console themes — no hardcoded hex, pure Tailwind semantic tokens
 * plus the fixed accent scale below, whose text weights are split light/dark deliberately.
 * ──────────────────────────────────────────────────────────────────────────── */

export type PanelTone = "primary" | "emerald" | "amber" | "red" | "violet" | "muted";

/**
 * Complete class strings per tone (Tailwind can't build class names dynamically).
 *
 * Text weights are DUAL: `-600` reads on a light panel, `-400` on a dark one. These were `-400`
 * only, from when the console was hard-coded dark — on the light theme they sat at roughly 2:1
 * against white, well under the readable floor. Fills and tints are alpha-based and work in both,
 * so only the text needed splitting.
 */
const PANEL_TONE: Record<PanelTone, {
  chip: string; accent: string; tint: string; title: string; solid: string;
}> = {
  primary: { chip: "bg-primary/15 text-primary", accent: "bg-primary", tint: "border-primary/25 bg-primary/[0.07]", title: "text-primary", solid: "bg-primary text-primary-foreground border-primary hover:bg-primary/90" },
  emerald: { chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", accent: "bg-emerald-500", tint: "border-emerald-500/25 bg-emerald-500/[0.07]", title: "text-emerald-600 dark:text-emerald-400", solid: "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-500/90" },
  amber: { chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400", accent: "bg-amber-500", tint: "border-amber-500/25 bg-amber-500/[0.07]", title: "text-amber-600 dark:text-amber-400", solid: "bg-amber-500 text-black border-amber-500 hover:bg-amber-500/90" },
  red: { chip: "bg-red-500/15 text-red-600 dark:text-red-400", accent: "bg-red-500", tint: "border-red-500/25 bg-red-500/[0.07]", title: "text-red-600 dark:text-red-400", solid: "bg-red-500 text-white border-red-500 hover:bg-red-500/90" },
  violet: { chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400", accent: "bg-violet-500", tint: "border-violet-500/25 bg-violet-500/[0.07]", title: "text-violet-600 dark:text-violet-400", solid: "bg-violet-500 text-white border-violet-500 hover:bg-violet-500/90" },
  // For rows that are no longer actionable (e.g. a re-vote request whose vote already closed).
  muted: { chip: "bg-muted text-muted-foreground", accent: "bg-muted-foreground/40", tint: "border-border/60 bg-secondary/20", title: "text-muted-foreground", solid: "bg-muted text-muted-foreground border-border hover:bg-muted/90" },
};

export const panelTone = (t: PanelTone) => PANEL_TONE[t];

/** Small count pill (pending requests / points / motions). */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold", className)}>
      {count}
    </span>
  );
}

/**
 * Titled panel surface: icon chip + title (+ optional count badge / subtitle) + right-aligned
 * actions, over a bordered body. Replaces the repeated
 * `<Card className="glass-card"><CardHeader className="bg-secondary/10 border-b">…`.
 */
export function PanelCard({
  icon: Icon, title, subtitle, badge, tone = "primary", actions,
  className, headerClassName, bodyClassName, children,
}: {
  icon?: React.ElementType;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: number;
  tone?: PanelTone;
  actions?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const t = PANEL_TONE[tone];
  const hasHeader = title != null || Icon != null || actions != null;
  return (
    // `console-panel`, not `glass-card`: see the utility's note in globals.css. The header band is
    // mode-split because 8% secondary over a white card is nothing — dark keeps its original value.
    <section className={cn("console-panel rounded-2xl overflow-hidden", className)}>
      {hasHeader && (
        <header className={cn("flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-secondary/40 dark:bg-secondary/[0.08]", headerClassName)}>
          {Icon && (
            <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", t.chip)}>
              <Icon className="w-[18px] h-[18px]" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-heading text-[15px] font-semibold leading-tight truncate">{title}</span>
              {badge != null && badge > 0 && <CountBadge count={badge} />}
            </div>
            {subtitle && <p className="text-[11.5px] text-muted-foreground leading-tight truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Pill toggle — active = SOLID accent fill (mock's blue "Allow abstain"); off = muted. */
export function ToggleChip({
  on, onClick, tone = "primary", disabled, className, children,
}: {
  on: boolean; onClick: () => void; tone?: PanelTone; disabled?: boolean;
  className?: string; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={cn(
        "px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        on ? PANEL_TONE[tone].solid : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
        className,
      )}>
      {children}
    </button>
  );
}

/**
 * Two-step dismiss with an optional reason. The first tap swaps the row's action slot for a
 * compact input + Send/Cancel; Enter or Send confirms (an empty reason is allowed).
 *
 * Two-step on purpose: dismissing a delegate's point or motion is a ruling, not a mistap —
 * this mirrors the delegate's own two-step ballot confirm. Styled as a RED OUTLINE rather than
 * the ghost it replaced, so it reads as a real decision; deliberately not a solid red fill,
 * which would out-shout the primary Execute / Recognize sitting beside it.
 */
export function DismissWithReason({
  label = "Dismiss", placeholder = "Reason (optional)", onConfirm, disabled,
}: {
  label?: string;
  placeholder?: string;
  onConfirm: (reason: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button type="button" disabled={disabled} onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md border border-red-500/40 text-red-600 dark:text-red-400 text-[13px] font-medium hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        <X className="w-3.5 h-3.5" /> {label}
      </button>
    );
  }

  const send = () => { setOpen(false); onConfirm(reason.trim()); setReason(""); };
  return (
    // Takes the whole action band while open — a fixed-width input would overflow the row it
    // expands inside.
    <div className="w-full space-y-1">
      <div className="flex items-center gap-1.5 w-full">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); send(); }
            if (e.key === "Escape") { setOpen(false); setReason(""); }
          }}
          placeholder={placeholder}
          className="h-8 min-w-0 flex-1 px-2.5 rounded-md bg-background border border-border/60 text-[12.5px] outline-none focus:border-red-500/50"
        />
        <button type="button" disabled={disabled} onClick={send}
          className="h-8 px-2.5 shrink-0 rounded-md bg-red-500 text-white text-[12.5px] font-semibold hover:bg-red-500/90 transition-colors disabled:opacity-50">
          Send
        </button>
        <button type="button" onClick={() => { setOpen(false); setReason(""); }}
          className="h-8 px-2 shrink-0 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
      <AiAssistBar
        value={reason}
        onPick={setReason}
        field="dismiss_reason"
        context={{}}
        suggestLabel="Reason ideas"
      />
    </div>
  );
}

/** Small colored status label (VOTING… / passed / recognized). */
export function StatusPill({ tone = "primary", className, children }: { tone?: PanelTone; className?: string; children: React.ReactNode }) {
  return <span className={cn("text-[9px] font-bold uppercase tracking-wide", PANEL_TONE[tone].title, className)}>{children}</span>;
}

/**
 * Tinted queue row (raised hand / point / motion) — a tone-tinted card with a left accent
 * bar, flag + icon + title, optional status chip, meta lines, and a right-aligned actions slot.
 */
export function QueueRow({
  tone = "primary", icon: Icon, coloredTitle = false, flag, title, statusChip, time, meta, note, actions, className,
}: {
  tone?: PanelTone;
  icon?: React.ElementType;
  /** Color the title in the tone accent (requests / points). Motions keep a neutral title. */
  coloredTitle?: boolean;
  flag?: React.ReactNode;
  title: React.ReactNode;
  statusChip?: React.ReactNode;
  /** Elapsed time ("19s"). Pinned top-right so it never reflows the title. */
  time?: React.ReactNode;
  meta?: React.ReactNode;
  note?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const t = PANEL_TONE[tone];
  return (
    // @container, NOT a viewport breakpoint: this row lives in a ~376px tool panel on a wide
    // screen, so `sm:` would flip it to a horizontal layout that has no room for it — the text
    // column collapses to a word-per-line and the actions run off the edge. Measure the row.
    <div className={cn("@container relative rounded-xl border overflow-hidden", t.tint, className)}>
      <span aria-hidden className={cn("absolute left-0 inset-y-0 w-1", t.accent)} />
      <div className="flex flex-col gap-2.5 p-3 pl-3.5 @lg:flex-row @lg:items-center @lg:gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {flag && <span className="shrink-0 mt-px">{flag}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                {Icon && <Icon className={cn("w-3.5 h-3.5 shrink-0", coloredTitle ? t.title : "text-foreground/80")} />}
                <span className={cn("font-semibold text-sm leading-snug", coloredTitle ? t.title : "text-foreground")}>{title}</span>
                {statusChip}
              </div>
              {time && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70 leading-5">{time}</span>
              )}
            </div>
            {meta && <div className="text-xs text-foreground/70 truncate mt-0.5">{meta}</div>}
            {note}
          </div>
        </div>
        {actions && (
          // Stacked: actions get their own full-width band under a hairline, so a wrapped
          // button never looks like it belongs to the text above it.
          <div className="flex flex-wrap items-center gap-2 w-full border-t border-border/40 pt-2.5 @lg:w-auto @lg:shrink-0 @lg:border-0 @lg:pt-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Small pill marking a queue item that a vice-chair raised ON BEHALF of the delegation
 * (proxy). Shown by the chair's request / point / motion queues next to the country.
 */
export function ProxyChip({ name, className }: { name?: string; className?: string }) {
  return (
    // `PANEL_TONE.violet.chip` rather than a literal: it already carries the dual light/dark text
    // weight, which the hand-rolled `text-violet-300` here did not (≈1.7:1 on a light panel).
    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide", PANEL_TONE.violet.chip, className)}>
      <UserSquare2 className="w-2.5 h-2.5" /> Proxy{name ? ` · ${name}` : ""}
    </span>
  );
}

/** Compact inline empty state for a panel body ("No points raised right now."). */
export function PanelEmpty({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      {Icon && <Icon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />}
      <p>{children}</p>
    </div>
  );
}

/**
 * Elevated inner surface — the redesign's `--card2` sub-card (solid fill, full-opacity 1px
 * border, radius 14). The building block of every rebuilt console panel body: the panel's
 * one header lives in the host rail (ToolPanel chrome), and the body is a flat stack of these.
 * Pass padding via `className` (the mock varies 8–15px per card).
 */
export function SubCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[14px] border border-border bg-card2", className)}>{children}</div>;
}

/**
 * The uppercase micro-label above a group ("On the floor", "Up next (3)", "Points queue").
 */
export function GroupLabel({ children, count, className }: { children: React.ReactNode; count?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 px-0.5", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{children}</span>
      {count != null && (
        <span className="inline-flex items-center justify-center min-w-4 h-4 px-1.5 rounded-full bg-muted text-muted-foreground text-[9.5px] font-bold">{count}</span>
      )}
    </div>
  );
}

/** Uppercase field label above an input (mock: 11px 600 uppercase, muted). */
export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn("block text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground", className)}>{children}</label>;
}

/**
 * Number input with a trailing unit suffix (mock 1f: "10 | min").
 * Lived in CaucusPanel until the motion-invite header needed the same "N sec" window field.
 */
export function UnitField({
  label, unit, value, onChange, min,
}: { label: string; unit: string; value: number; onChange: (n: number) => void; min: number }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center bg-background border border-border rounded-[10px] overflow-hidden focus-within:ring-2 focus-within:ring-primary/30">
        <input
          type="number" min={min} value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || min)}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 font-mono text-[15px] font-bold tabular-nums outline-none"
        />
        <span className="px-3 text-[11px] font-semibold text-muted-foreground shrink-0">{unit}</span>
      </div>
    </div>
  );
}

/** Icon + title row heading a sub-card (mock: "Open a vote", "Vote record"). */
export function SubCardTitle({ icon: Icon, children, badge, className }: { icon?: React.ElementType; children: React.ReactNode; badge?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 mb-3.5", className)}>
      {Icon && <Icon className="w-[17px] h-[17px] text-primary shrink-0" />}
      <span className="font-heading text-[14px] font-bold leading-tight">{children}</span>
      {badge != null && <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{badge}</span>}
    </div>
  );
}

/** Segmented pill control — active option = solid primary fill (mock Mode / Caucus toggle). */
export function Segmented<T extends string | number>({
  value, onChange, options, disabled, className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: React.ReactNode; icon?: React.ElementType }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex w-full rounded-[10px] bg-background border border-border p-[3px] gap-[3px]", className)}>
      {options.map((o) => {
        const on = value === o.id;
        const Icon = o.icon;
        return (
          <button key={o.id} type="button" disabled={disabled} onClick={() => onChange(o.id)}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-[7px] text-xs font-semibold transition-colors disabled:cursor-not-allowed",
              on ? "bg-primary text-primary-foreground" : "text-muted-foreground enabled:hover:text-foreground",
            )}>
            {Icon && <Icon className="w-3.5 h-3.5" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}
