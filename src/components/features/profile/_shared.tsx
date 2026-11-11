"use client";

import { motion } from "framer-motion";
import { Pencil, Plus, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Staggered fade-up wrapper used across the profile sections. */
export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}>
      {children}
    </motion.div>
  );
}

/** White card section with an optional header (title/subtitle + edit or custom action). */
export function SectionCard({
  id, title, subtitle, action, onEdit, editLabel = "Edit", children,
}: {
  id?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  onEdit?: () => void;
  editLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6">
        {(title || onEdit || action) && (
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              {title && <h2 className="font-semibold text-lg leading-tight tracking-tight">{title}</h2>}
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {action}
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  {editLabel === "Edit" ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {editLabel}
                </button>
              )}
            </div>
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** Read-only star average with optional rating count. Supports half stars. */
export function StarDisplay({ value, count, className }: { value: number; count?: number; className?: string }) {
  const rounded = Math.round((value || 0) * 2) / 2;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = rounded >= i ? "full" : rounded >= i - 0.5 ? "half" : "empty";
          return (
            <span key={i} className="relative inline-flex">
              <Star className="w-4 h-4 text-amber-400/35" />
              {fill !== "empty" && (
                <Star
                  className={cn(
                    "w-4 h-4 text-amber-400 fill-amber-400 absolute inset-0",
                    fill === "half" && "[clip-path:inset(0_50%_0_0)]"
                  )}
                />
              )}
            </span>
          );
        })}
      </span>
      <span className="text-sm font-semibold text-foreground">{value ? value.toFixed(1) : "—"}</span>
      {count !== undefined && (
        <span className="text-sm text-muted-foreground">· {count} rating{count === 1 ? "" : "s"}</span>
      )}
    </span>
  );
}
