"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { getUserAchievements, DelegateResult, AwardType } from "@/lib/services/resultService";
import { getEventById } from "@/lib/services/eventService";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Trophy, Medal, Star, Award, ExternalLink } from "lucide-react";

type AchievementWithEvent = DelegateResult & { eventId: string; eventTitle?: string };

const AWARD_CONFIG: Record<AwardType, { label: string; text: string; bg: string; border: string; grad: string; icon: React.ElementType }> = {
  best_delegate: { label: "Best Delegate", text: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", grad: "from-yellow-500/15", icon: Trophy },
  outstanding: { label: "Outstanding Delegate", text: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", grad: "from-blue-500/15", icon: Medal },
  honorable: { label: "Honorable Mention", text: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20", grad: "from-green-500/15", icon: Award },
  verbal_mention: { label: "Verbal Mention", text: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", grad: "from-purple-500/15", icon: Star },
  none: { label: "None", text: "text-muted-foreground", bg: "bg-muted/50", border: "border-border/50", grad: "from-muted/30", icon: Star },
};

const FILTER_OPTIONS: Array<{ value: AwardType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "best_delegate", label: "Best Delegate" },
  { value: "outstanding", label: "Outstanding" },
  { value: "honorable", label: "Honorable" },
  { value: "verbal_mention", label: "Verbal Mention" },
];

export default function AchievementsPage() {
  const { user } = useAuth();
  const [achievements, setAchievements] = useState<AchievementWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AwardType | "all">("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const results = (await getUserAchievements(user.uid)) as AchievementWithEvent[];
      const withEvents = await Promise.all(
        results.map(async (r) => {
          if (!r.eventId) return r;
          const event = await getEventById(r.eventId);
          return { ...r, eventTitle: event?.title };
        })
      );
      setAchievements(withEvents);
      setLoading(false);
    })();
  }, [user]);

  const filtered = filter === "all" ? achievements : achievements.filter((a) => a.awardType === filter);

  const statCards = [
    { label: "Total Awards", value: achievements.length, icon: Trophy, text: "text-primary", bg: "bg-primary/10" },
    { label: "Best Delegate", value: achievements.filter((a) => a.awardType === "best_delegate").length, icon: Trophy, text: "text-yellow-500", bg: "bg-yellow-500/10" },
    { label: "Outstanding", value: achievements.filter((a) => a.awardType === "outstanding").length, icon: Medal, text: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Honorable", value: achievements.filter((a) => a.awardType === "honorable").length, icon: Award, text: "text-green-500", bg: "bg-green-500/10" },
    { label: "Verbal Mention", value: achievements.filter((a) => a.awardType === "verbal_mention").length, icon: Star, text: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex items-center gap-4"
      >
        <div className="grid place-items-center w-11 h-11 rounded-sm border border-border bg-secondary text-foreground shrink-0">
          <Trophy className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">Achievements</span></h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Your Model UN awards and accolades.</p>
        </div>
      </motion.div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
          </div>
        </div>
      ) : achievements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center glass-card rounded-2xl border-dashed">
          <div className="grid place-items-center w-16 h-16 rounded-2xl bg-yellow-500/10 text-yellow-500 mb-4">
            <Trophy className="w-8 h-8" />
          </div>
          <p className="text-lg font-semibold mb-1">No awards yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mb-5">
            Complete a conference to start your collection.
          </p>
          <Button className="rounded-xl gap-2" render={<Link href="/dashboard/conferences" />} nativeButton={false}>
            View my conferences
          </Button>
        </div>
      ) : (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {statCards.map(({ label, value, icon: Icon, text, bg }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="glass-card rounded-2xl p-4 flex flex-col gap-2"
              >
                <div className={`grid place-items-center w-9 h-9 rounded-xl ${bg} ${text}`}>
                  <Icon className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  filter === value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border/40 hover:bg-secondary hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Award grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((achievement, i) => {
              const config = AWARD_CONFIG[achievement.awardType] || AWARD_CONFIG.honorable;
              const Icon = config.icon;
              return (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className={`glass-card group relative overflow-hidden rounded-2xl hover:border-primary/30 transition-colors`}
                >
                  <div className={`absolute inset-x-0 top-0 h-1 ${config.bg} pointer-events-none`} />
                  <div className="relative p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className={`grid place-items-center w-11 h-11 rounded-xl border ${config.bg} ${config.text} ${config.border}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${config.bg} ${config.text} ${config.border}`}>
                        {config.label}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold">{achievement.committeeName}</p>
                      {achievement.eventTitle && (
                        <p className="text-sm text-muted-foreground">{achievement.eventTitle}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-border/40">
                      <span className="text-muted-foreground">
                        Score: <span className="font-medium text-foreground tabular-nums">{achievement.score}/100</span>
                      </span>
                      {achievement.eventId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 h-7 text-xs"
                          render={<Link href={`/dashboard/conferences/${achievement.eventId}?tab=certificate`} />}
                          nativeButton={false}
                        >
                          <ExternalLink className="w-3 h-3" /> Certificate
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
