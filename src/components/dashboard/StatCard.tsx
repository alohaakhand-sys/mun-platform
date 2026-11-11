"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, LucideIcon } from "lucide-react";
import Link from "next/link";

type Accent = "primary" | "emerald" | "amber" | "violet";

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  delay?: number;
  accent?: Accent;
  href?: string;
}

/**
 * The press-sheet palette runs on ONE accent, so the four accents all resolve to the
 * same paper treatment: a hairline tile with ink. The prop stays — every call site
 * keeps passing `accent` and nothing downstream changes — it simply no longer tints.
 * Differentiating three KPI tiles by hue was decoration, not information.
 */
const PAPER_TILE = {
  tile: "border border-border bg-secondary text-foreground",
  ring: "group-hover:border-foreground",
};
const accentMap: Record<Accent, { tile: string; ring: string }> = {
  primary: PAPER_TILE,
  emerald: PAPER_TILE,
  amber: PAPER_TILE,
  violet: PAPER_TILE,
};

export function StatCard({ title, value, description, icon: Icon, delay = 0, accent = "primary", href }: StatCardProps) {
  const a = accentMap[accent];

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className={`glass-card group relative h-full rounded-md p-6 flex flex-col transition-colors ${a.ring} ${href ? "cursor-pointer" : ""}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`w-11 h-11 rounded-sm flex items-center justify-center ${a.tile}`}>
          <Icon className="w-6 h-6" />
        </div>
        {href && (
          <ArrowUpRight className="w-5 h-5 text-muted-foreground/40 transition-all group-hover:text-primary" />
        )}
      </div>
      <div>
        <h3 className="text-4xl mb-1 tabular-nums" style={{ fontFamily: "var(--font-mp-serif), Georgia, serif", fontWeight: 600 }}>{value}</h3>
        <p className="text-sm font-medium text-foreground mb-1">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );

  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}
