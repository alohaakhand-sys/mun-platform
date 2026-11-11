"use client";

/**
 * Light/dark switch for the Live MUN consoles — a two-state segment, not an icon that changes
 * meaning when you press it.
 *
 * A single toggling icon is ambiguous during a sitting: a sun could mean "you are in light" or
 * "press for light", and a chair mid-procedure should not have to work that out. Showing both
 * states with the active one filled says where you are and where you can go at once.
 *
 * Shadows stay flat: light mode here keeps a hairline border and no elevation, per the project's
 * light-mode rule against heavy or coloured glows.
 */
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveTheme } from "./useLiveTheme";

const OPTIONS: { value: LiveTheme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function LiveThemeToggle({
  theme, onChange, className,
}: {
  theme: LiveTheme;
  onChange: (t: LiveTheme) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Console appearance"
      className={cn(
        "inline-flex items-stretch h-8 rounded-lg border border-border/70 bg-secondary/30 overflow-hidden",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${label} appearance`}
            onClick={() => onChange(value)}
            className={cn(
              "px-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
