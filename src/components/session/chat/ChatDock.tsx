"use client";

/**
 * The left dock's chrome: collapsed rail, docked column, or full-width mobile sheet.
 *
 * PLACEMENT IS LOAD-BEARING. The consoles mount this as a sibling BEFORE `<main>` in the stage row.
 * `<main>` carries `.dark` in BOTH live themes (the video stage is exempt from the toggle — see
 * `useLiveTheme`), so anything rendered inside it inherits the dark palette. Out here the dock
 * inherits the light `.live-console` tokens the console root declared, which is what makes it read
 * correctly in light mode. Do not move it inside the stage, and do not portal the mobile sheet — a
 * portal escapes the layout but not custom-property inheritance, so it would need
 * `consoleShellClass(theme)` AND `text-foreground` re-stamped (the `ConsoleModal` rule).
 *
 * The right tool panel already claims the full width below `lg`, so the dock is never an inline
 * column there: it is either the full-width sheet or nothing at all. A 44px rail on a phone is
 * stolen real estate — the TopBar button carries the badge instead.
 */
import { MessageSquare, ChevronLeft, X, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubCard } from "@/components/session/console/shared";

/**
 * A denied listener is DEAD — Firestore never retries one. Say so, because an empty panel reads as
 * "no messages" and a broken dais inbox could otherwise sit unnoticed for a whole conference.
 */
export function ChatDenied({ dais }: { dais: boolean }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3">
      <SubCard className="p-3 space-y-1.5">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-600 dark:text-amber-400">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> Messages unavailable
        </p>
        <p className="text-[12px] text-muted-foreground leading-snug">
          {dais
            ? "This account is not the chair, vice-chair or an organizer for this committee, so it cannot read delegates’ private notes."
            : "Your messages could not be loaded for this session."}
        </p>
        <p className="text-[11.5px] text-muted-foreground leading-snug">
          If you switched accounts in another tab, reload this page — a browser shares one signed-in
          user across tabs, and the connection cannot recover on its own.
        </p>
      </SubCard>
    </div>
  );
}

export function ChatDock({
  open, wide, unread, title, subtitle, onToggle, onBack, children,
}: {
  open: boolean;
  /** `useIsWide()` from the host console — desktop dock vs mobile sheet. */
  wide: boolean;
  unread: number;
  title: string;
  subtitle?: string;
  onToggle: () => void;
  /** Level-1 back arrow (chair drill-down). Absent on the delegate's single stream. */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  if (!open) {
    if (!wide) return null;
    return (
      <button
        type="button" onClick={onToggle} aria-expanded={false} aria-label="Show messages"
        className="hidden lg:flex w-11 shrink-0 flex-col items-center gap-2 pt-3 bg-card border-r border-border/60 hover:bg-secondary/40 transition-colors">
        <MessageSquare className="w-[18px] h-[18px] text-muted-foreground" />
        {unread > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      role="complementary" aria-label="Session messages"
      className="flex flex-col w-full lg:w-[320px] shrink-0 bg-card border-r border-border/60 min-h-0 animate-in slide-in-from-left-2">
      <header className="flex items-center gap-2 h-[52px] px-2.5 border-b border-border/60 shrink-0">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back to all messages"
            className="w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors">
            <ChevronLeft className="w-[18px] h-[18px]" />
          </button>
        ) : (
          <span className="w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center bg-primary/15 text-primary">
            <MessageSquare className="w-[18px] h-[18px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[14.5px] font-semibold leading-tight truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground leading-tight truncate">{subtitle}</p>}
        </div>
        <button type="button" onClick={onToggle} aria-label="Hide messages"
          className="w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors">
          <X className="w-[18px] h-[18px]" />
        </button>
      </header>
      <div className={cn("flex flex-col flex-1 min-h-0")}>{children}</div>
    </aside>
  );
}
