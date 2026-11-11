"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type SegItem = {
  id: string;
  label: string;
  icon?: React.ElementType;
  count?: number;
};

/**
 * Pill segmented tabs — the project's canonical tab look.
 * Glass container, sliding primary pill (motion layoutId), optional icon + count badge.
 */
export function SegmentedTabs({
  items,
  value,
  onChange,
  layoutId = "segTabPill",
  className,
}: {
  items: SegItem[];
  value: string;
  onChange: (id: string) => void;
  /** Unique id when multiple instances render on one page. */
  layoutId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1.5 rounded-2xl bg-card/40 backdrop-blur-xl border border-border/60 w-fit",
        className
      )}
    >
      {items.map((t) => {
        const active = value === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className="relative px-3.5 sm:px-5 py-2 rounded-xl text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {active && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl bg-primary shadow-sm shadow-primary/10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex items-center gap-2",
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "grid place-items-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold",
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-muted-foreground"
                  )}
                >
                  {t.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
