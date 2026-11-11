"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecentActivitiesRealtime, ActivityData } from "@/lib/services/activityService";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { getConnectionsRealtime, Connection } from "@/lib/services/connectionService";
import { useRouter } from "next/navigation";

export function ActivityFeed() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"All" | "Mine" | "Following">("All");
  const [limitCount, setLimitCount] = useState(10);
  const [followingUids, setFollowingUids] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = getConnectionsRealtime(user.uid, conns => {
      setFollowingUids(conns.filter(c => c.status === "active").map(c => c.otherUid));
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = getRecentActivitiesRealtime(user.uid, scope, limitCount, followingUids, data => {
      setActivities(data);
      setLoading(false);
    });
    return unsub;
  }, [user, scope, limitCount, followingUids]);

  function handleActivityClick(a: ActivityData) {
    if (a.type.startsWith("application_") || a.type === "position_paper_submitted") {
      router.push(`/dashboard/conferences/${a.targetId}`);
    } else if (a.type === "event_published") {
      router.push(`/events/${a.targetId}`);
    } else if (a.type === "marking_submitted") {
      router.push(`/dashboard/conferences/${a.targetId}#results`);
    }
  }

  const getInitials = (name: string) => name.charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-2 mb-4 border-b border-border/50 pb-2">
        {(["All", "Following", "Mine"] as const).map(s => (
          <button
            key={s}
            onClick={() => { setScope(s); setLimitCount(10); }}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && activities.length === 0 ? (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-x-4">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <Skeleton className="flex-1 h-16 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground border border-dashed border-border/50 rounded-2xl">
          <p className="text-sm">No recent activity yet. Apply to a conference to get started!</p>
        </div>
      ) : (
        <>
          {activities.map((activity, index) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="flex gap-x-4 group cursor-pointer"
              onClick={() => handleActivityClick(activity)}
            >
              <div className="relative flex flex-col items-center">
                {index !== activities.length - 1 && (
                  <div className="absolute top-10 bottom-[-1.5rem] w-px bg-border/50" />
                )}
                <Avatar className="h-10 w-10 ring-2 ring-background z-10 shadow-sm">
                  <AvatarFallback className="bg-primary/20 text-primary font-medium">
                    {getInitials(activity.actorName)}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div className="glass-card flex-1 rounded-2xl p-4 sm:p-5 mb-2 hover:border-primary/20 transition-colors">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1">
                  <div>
                    <span className="font-semibold text-foreground mr-1">{activity.actorName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/50 mr-2">
                      {activity.actorRole}
                    </span>
                    <span className="text-muted-foreground mr-1">{activity.action}</span>
                    <span className="font-medium text-foreground">{activity.targetTitle}</span>
                  </div>
                  <time className="text-xs text-muted-foreground whitespace-nowrap">
                    {activity.createdAt
                      ? formatDistanceToNow(activity.createdAt.toDate(), { addSuffix: true })
                      : "just now"}
                  </time>
                </div>
              </div>
            </motion.div>
          ))}

          {activities.length >= limitCount && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-center pt-4"
            >
              <button 
                onClick={() => setLimitCount(prev => prev + 10)}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors bg-primary/10 px-4 py-2 rounded-full"
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
