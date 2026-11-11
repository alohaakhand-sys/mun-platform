"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { FileText, Users, Award, Calendar, Compass, Rocket, ArrowRight, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getUserApplications } from "@/lib/services/applicationService";
import { getUserProfile, UserProfile } from "@/lib/services/userService";
import { getPublishedEvents, getCoOrganizedEventIds, getEventStartMs, EventData } from "@/lib/services/eventService";
import { formatEventWhen } from "@/components/public/cardFormat";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCcw } from "lucide-react";

interface DashboardClientProps {
  initialStats?: any;
  initialRecommendations?: any;
  serverError?: string | null;
}

export default function DashboardClient({ initialStats, initialRecommendations, serverError }: DashboardClientProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState(initialStats || {
    conferences: 0,
    papers: 0,
    achievements: 0,
    upcomingCount: 0,
    pastCount: 0
  });
  const [recommendedEvents, setRecommendedEvents] = useState<EventData[]>(initialRecommendations || []);
  const [isCoOrg, setIsCoOrg] = useState(false);
  const [loading, setLoading] = useState(!initialStats && true);
  const [error, setError] = useState(serverError);

  useEffect(() => {
    async function fetchDashboardData() {
      if (!user) return;
      
      try {
        const [userProfile, userApps, achievements] = await Promise.all([
          getUserProfile(user.uid),
          getUserApplications(user.uid),
          import("@/lib/services/resultService").then(m => m.getUserAchievements(user.uid))
        ]);

        setProfile(userProfile);

        const role = (userProfile?.role || "delegate").toLowerCase();
        if (role !== "organizer" && role !== "admin") {
          const coOrgIds = await getCoOrganizedEventIds(user.uid);
          setIsCoOrg(coOrgIds.length > 0);
        }

        if (!initialStats) {
          const upcoming = userApps.filter(a => a.status !== "past").length;
          const past = userApps.filter(a => a.status === "past").length;
          const papers = userApps.filter(a => (a as any).positionPaperUrl != null || (a as any).positionPaperContent != null).length;
          
          setStats({
            conferences: userApps.length,
            upcomingCount: upcoming,
            pastCount: past,
            papers,
            achievements: achievements.length
          });
        }

        if (!initialRecommendations) {
          const allEvents = await getPublishedEvents();
          const appliedEventIds = new Set(userApps.map(a => a.eventId));
          const recommended = allEvents
            .filter(e => !appliedEventIds.has(e.id))
            .slice(0, 3);

          setRecommendedEvents(recommended);
        }
      } catch (err) {
        setError("Failed to load dashboard data. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading && user) {
      fetchDashboardData();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Oops! Something went wrong</h2>
          <p className="text-muted-foreground mt-1">{error}</p>
        </div>
        <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
          <RefreshCcw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  if (loading || authLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-1/2" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-md" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Skeleton className="lg:col-span-2 h-[400px] rounded-md" />
          <Skeleton className="h-[400px] rounded-md" />
        </div>
      </div>
    );
  }

  const role = (profile?.role || "delegate").toLowerCase();
  const isOwnOrganizer = role === "organizer" || role === "admin";
  const isOrganizer = isOwnOrganizer || isCoOrg;
  // Pure co-organizers have no owner dashboard/stats — send them to the events list.
  const organizerHref = isOwnOrganizer ? "/dashboard/organizer" : "/dashboard/organizer/events";
  const organizerLabel = isOwnOrganizer ? "Organizer Dashboard" : "Co-organizer Events";

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div>
          <p className="mp-eyebrow">{profile?.role || "Delegate"}</p>
          <h1 style={{ fontSize: "var(--h-xl)" }}>
            Welcome back, {user?.displayName?.split(" ")[0] || "User"}
          </h1>
          <p className="mp-lede" style={{ marginTop: 8 }}>
            Here&apos;s what&apos;s happening with your MUN journey today.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isOrganizer ? (
            <Button
              variant="outline"
              className="gap-2"
              render={<Link href={organizerHref} />}
              nativeButton={false}
            >
              <LayoutDashboard className="w-4 h-4" />
              {organizerLabel}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="gap-2"
              render={<Link href="/dashboard/organizer" />}
              nativeButton={false}
            >
              <Rocket className="w-4 h-4" />
              Become an Organizer
            </Button>
          )}
          <Button
            className="gap-2 px-6"
            render={<Link href="/events" />}
            nativeButton={false}
          >
            <Compass className="w-4 h-4" />
            Explore
          </Button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          title="My Conferences"
          value={stats.conferences.toString()}
          description={`${stats.upcomingCount} Active · ${stats.pastCount} Past`}
          icon={Users}
          accent="primary"
          href="/dashboard/conferences"
          delay={0.1}
        />
        <StatCard
          title="Position Papers"
          value={stats.papers.toString()}
          description="Submissions Track"
          icon={FileText}
          accent="violet"
          href="/dashboard/conferences"
          delay={0.2}
        />
        <StatCard
          title="Achievements"
          value={stats.achievements.toString()}
          description="Recognition & Awards"
          icon={Award}
          accent="amber"
          href="/dashboard/achievements"
          delay={0.3}
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-2">
        {/* Activity Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="mp-block-head">
            <h2 className="mp-block-title">Recent activity</h2>
          </div>
          <ActivityFeed />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recommended Conferences */}
          <div className="glass-card rounded-md p-6">
            <h3 className="mp-panel-title">Recommended</h3>
            <div className="space-y-2">
              {recommendedEvents.length > 0 ? (
                recommendedEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="group relative flex gap-x-3 p-3 -mx-3 rounded-xl hover:bg-secondary transition-colors"
                  >
                    <div className="w-12 h-12 rounded-lg bg-secondary border border-border/40 overflow-hidden flex-shrink-0">
                      {event.coverUrl ? (
                        <img src={event.coverUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center bg-secondary text-muted-foreground">
                          <Calendar className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">{event.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3 shrink-0" /> {formatEventWhen(getEventStartMs(event), event.date)}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/0 group-hover:text-primary self-center transition-colors" />
                  </Link>
                ))
              ) : (
                <div className="py-8 text-center">
                  <Compass className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No new recommendations yet.</p>
                </div>
              )}
              <Button
                variant="outline"
                className="w-full mt-3"
                render={<Link href="/events" />}
                nativeButton={false}
              >
                Browse all conferences
              </Button>
            </div>
          </div>

          {/* Become an Organizer promo */}
          {!isOrganizer && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mp-organise"
              style={{ display: "block", margin: 0, padding: "26px 24px" }}
            >
              <h2 style={{ fontSize: "var(--h-md)", maxWidth: "none" }}>Become an organiser</h2>
              <p style={{ fontSize: "var(--h-sm)" }}>
                Host your own Model UN conference — create events, manage delegates, and run
                committees.
              </p>
              <Link className="mp-btn mp-btn-light" href="/dashboard/organizer" style={{ marginTop: 16 }}>
                Get started
              </Link>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
