"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid,
  Compass,
  Settings2,
  SlidersHorizontal,
  ArrowDownUp,
  Hourglass,
  Archive,
  Sparkles,
  CalendarX2,
  Telescope,
  XCircle,
  X,
} from "lucide-react";
import { ConferenceCard, ConferenceStatus } from "@/components/dashboard/ConferenceCard";
import { useAuth } from "@/contexts/AuthContext";
import { getUserApplications, ApplicationData } from "@/lib/services/applicationService";
import { getPublishedEvents, EventData, getEventsByIds } from "@/lib/services/eventService";
import { updateApplication } from "@/lib/services/applicationService";
import { getPaymentGate, PaymentGate } from "@/lib/services/paymentGate";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventBrowseCard } from "@/components/dashboard/EventBrowseCard";

interface EnhancedApplication extends ApplicationData {
  id: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  payment: PaymentGate;
}

type TabId = "my-conferences" | "browse";

export default function MyConferencesPage() {
  const { user, loading: authLoading } = useAuth();
  const [applications, setApplications] = useState<EnhancedApplication[]>([]);
  const [publishedEvents, setPublishedEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("my-conferences");
  const [filterRole, setFilterRole] = useState<string>("All");
  const [sortBy, setSortBy] = useState<string>("Date ↓");
  const [paymentCancelled, setPaymentCancelled] = useState(false);

  // Deep links: `?tab=browse` (e.g. from Network) opens Browse; `?payment=cancelled`
  // is where the checkout's cancel URL lands. Strip `payment` so a refresh doesn't
  // show the banner again.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("tab") === "browse") setActiveTab("browse");
    if (q.get("payment") === "cancelled") {
      setPaymentCancelled(true);
      q.delete("payment");
      const rest = q.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
  }, []);

  useEffect(() => {
    const savedRole = localStorage.getItem("myConferences.viewPrefs.role");
    const savedSort = localStorage.getItem("myConferences.viewPrefs.sort");
    if (savedRole) setFilterRole(savedRole);
    if (savedSort) setSortBy(savedSort);
  }, []);

  useEffect(() => {
    localStorage.setItem("myConferences.viewPrefs.role", filterRole);
    localStorage.setItem("myConferences.viewPrefs.sort", sortBy);
  }, [filterRole, sortBy]);

  useEffect(() => {
    async function fetchMyConferences() {
      if (!user) return;

      const apps = await getUserApplications(user.uid);

      const eventIds = apps.map(a => a.eventId);
      const eventsData = await getEventsByIds(eventIds);
      const eventMap = new Map(eventsData.map(e => [e.id, e]));

      // Fetch event details for each application to get names/dates/locations
      const enhancedApps = apps.map((app) => {
          const event = eventMap.get(app.eventId);
          return {
            ...app,
            id: (app as any).id,
            eventName: event?.title || "Unknown Event",
            eventDate: event?.date || "Date Pending",
            eventLocation: event?.location || "Location Pending",
            // Outstanding registration fee, if any — drives the card's whole presentation.
            payment: getPaymentGate(app, event),
          };
      });

      const published = await getPublishedEvents();

      setApplications(enhancedApps);
      setPublishedEvents(published);
      setLoading(false);
    }

    if (!authLoading && user) {
      fetchMyConferences();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]);

  async function handleWithdraw(appId: string) {
    const app = applications.find(a => a.id === appId);
    // Paid registrations can't be self-withdrawn — fees are already collected.
    if (app?.paymentStatus === "paid") {
      alert("You've already paid for this event. Contact the organizer for a refund or cancellation.");
      return;
    }
    if (!confirm("Are you sure you want to withdraw your application?")) return;
    setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: "withdrawn" as any } : a));
    await updateApplication(appId, { status: "withdrawn" as any });
  }

  const sortedAndFiltered = applications
    .filter(a => filterRole === "All" || a.role === filterRole)
    .sort((a, b) => {
      if (sortBy.includes("Date")) {
        const da = new Date(a.eventDate).getTime() || 0;
        const db = new Date(b.eventDate).getTime() || 0;
        return sortBy === "Date ↓" ? db - da : da - db;
      }
      if (sortBy === "Status") {
        return a.status.localeCompare(b.status);
      }
      return 0; // Recently updated could use createdAt/updatedAt
    });

  const activeConferences = sortedAndFiltered.filter(a => ["pending", "approved", "waitlisted", "active"].includes(a.status));
  const pastConferences = sortedAndFiltered.filter(a => ["completed", "rejected", "withdrawn", "past"].includes(a.status));

  const tabs: { id: TabId; label: string; icon: typeof LayoutGrid; count: number }[] = [
    { id: "my-conferences", label: "My Conferences", icon: LayoutGrid, count: activeConferences.length + pastConferences.length },
    { id: "browse", label: "Browse", icon: Compass, count: publishedEvents.length },
  ];

  if (loading || authLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-12 w-72 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-8">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[300px] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4"
      >
        <div>
          <p className="mp-eyebrow">My conferences</p>
          <h1 style={{ fontSize: "var(--h-xl)" }}>Conferences</h1>
          <p className="mp-lede" style={{ marginTop: 8 }}>
            Manage your applications or discover new events.
          </p>
        </div>
        <button
          onClick={() => (window.location.href = "/dashboard/organizer/events")}
          className="mp-btn mp-btn-line shrink-0"
        >
          <Settings2 className="w-4 h-4" style={{ marginRight: 8 }} />
          Organizer
        </button>
      </motion.div>

      {paymentCancelled && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <XCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">Payment cancelled. Nothing was charged. You can try again whenever you&apos;re ready.</span>
          <button
            onClick={() => setPaymentCancelled(false)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-1 hover:bg-amber-500/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Segmented Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
        className="inline-flex items-center gap-1 p-1.5 rounded-md glass-card"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 sm:px-5 py-2 rounded-sm text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {active && (
                <motion.div
                  layoutId="conferenceTabPill"
                  className="absolute inset-0 rounded-sm bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className={`relative z-10 flex items-center gap-2 ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-4 h-4" />
                {tab.label}
                <span className={`grid place-items-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  {tab.count}
                </span>
              </span>
            </button>
          );
        })}
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "my-conferences" ? (
          <motion.div
            key="my-conferences"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            {/* Filter / Sort toolbar */}
            <div className="mb-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between glass-card p-3 rounded-md">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 pl-1 pr-1 text-muted-foreground">
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Filter</span>
                </div>
                <Select value={filterRole} onValueChange={(v) => setFilterRole(v ?? "All")}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Roles</SelectItem>
                    <SelectItem value="Delegate">Delegate</SelectItem>
                    <SelectItem value="Chair">Chair</SelectItem>
                    <SelectItem value="Observer">Observer</SelectItem>
                    <SelectItem value="Head Delegate">Head Delegate</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 pl-1 text-muted-foreground">
                  <ArrowDownUp className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Sort</span>
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v ?? "Date ↓")}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Date ↓">Newest First</SelectItem>
                    <SelectItem value="Date ↑">Oldest First</SelectItem>
                    <SelectItem value="Status">Status</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-muted-foreground pr-1">
                {sortedAndFiltered.length} application{sortedAndFiltered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Active & Pending */}
            <SectionHeader
              icon={Hourglass}
              title="Active & Pending"
              count={activeConferences.length}
              accent="text-yellow-500"
              accentBg="bg-yellow-500/10"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-12 mt-4">
              {activeConferences.map((app, index) => (
                <div key={app.id} className="relative group">
                  <ConferenceCard
                    id={app.id}
                    name={app.eventName}
                    date={app.eventDate}
                    location={app.eventLocation}
                    role={app.role}
                    committee={app.choices?.primary?.committee || "Pending"}
                    country={app.choices?.primary?.country || "Pending"}
                    status={app.status as ConferenceStatus}
                    delay={index * 0.08}
                    payment={app.payment}
                    applicationId={app.id}
                    eventId={app.eventId}
                  />
                  {app.status === "pending" && app.paymentStatus !== "paid" && (
                    <button
                      onClick={() => handleWithdraw(app.id)}
                      className="absolute top-4 right-4 z-20 bg-red-500/90 hover:bg-red-500 text-white text-xs px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              ))}
              {activeConferences.length === 0 && (
                <EmptyState
                  icon={CalendarX2}
                  title="No active conferences"
                  subtitle="You haven't applied to any upcoming events yet."
                  cta={{ label: "Browse Conferences", onClick: () => setActiveTab("browse") }}
                />
              )}
            </div>

            {/* Past */}
            <SectionHeader
              icon={Archive}
              title="Past Conferences"
              count={pastConferences.length}
              accent="text-muted-foreground"
              accentBg="bg-muted/60"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-4">
              {pastConferences.map((app, index) => (
                <ConferenceCard
                  key={app.id}
                  id={app.id}
                  name={app.eventName}
                  date={app.eventDate}
                  location={app.eventLocation}
                  role={app.role}
                  committee={app.choices?.primary?.committee || "N/A"}
                  country={app.choices?.primary?.country || "N/A"}
                  status={app.status as ConferenceStatus}
                  delay={index * 0.08}
                />
              ))}
              {pastConferences.length === 0 && (
                <EmptyState
                  icon={Archive}
                  title="No past conferences"
                  subtitle="Your completed conferences will appear here."
                />
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="browse"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <SectionHeader
              icon={Sparkles}
              title="Discover Events"
              count={publishedEvents.length}
              subtitle="Find and apply to Model UN conferences around the world."
              accent="text-primary"
              accentBg="bg-primary/10"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-4">
              {publishedEvents.map((event, index) => {
                const hasApplied = applications.some(app => app.eventId === event.id);
                return (
                  <EventBrowseCard
                    key={event.id}
                    event={event}
                    delay={index * 0.08}
                    hasApplied={hasApplied}
                  />
                );
              })}

              {publishedEvents.length === 0 && (
                <EmptyState
                  icon={Telescope}
                  title="No conferences available"
                  subtitle="Check back later for new events to apply to."
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  subtitle,
  accent = "text-primary",
  accentBg = "bg-primary/10",
}: {
  icon: typeof LayoutGrid;
  title: string;
  count: number;
  subtitle?: string;
  accent?: string;
  accentBg?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="mp-block-title">{title}</h2>
          <span className={`grid place-items-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold ${accentBg} ${accent}`}>
            {count}
          </span>
        </div>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  subtitle,
  cta,
}: {
  icon: typeof LayoutGrid;
  title: string;
  subtitle: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="col-span-full flex flex-col items-center justify-center py-16 text-center glass-card rounded-md border-dashed"
    >
      <div className="grid place-items-center w-14 h-14 rounded-sm border border-border bg-secondary text-muted-foreground mb-4">
        <Icon className="w-7 h-7" />
      </div>
      <p className="text-lg font-semibold mb-1">{title}</p>
      <p className="text-sm text-muted-foreground max-w-xs">{subtitle}</p>
      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-5 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Compass className="w-4 h-4" />
          {cta.label}
        </button>
      )}
    </motion.div>
  );
}
