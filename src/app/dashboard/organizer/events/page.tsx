"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { EventData, getCoOrganizedEvents, getEventCapacity } from "@/lib/services/eventService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PlusCircle, Calendar, MapPin, ChevronRight, Search,
  LayoutGrid, Globe, FileEdit, Landmark, Sparkles, UserCheck, CalendarX2,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { CreateEventDialog } from "@/components/features/organizer/CreateEventDialog";

type FilterKey = "all" | "published" | "draft";

const isDraft = (e: EventData) => e.status === "draft";

/* ---------------- stat chip ---------------- */
function StatChip({ icon: Icon, label, value, tint }: { icon: React.ElementType; label: string; value: number; tint: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", tint)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="leading-tight">
        <p className="text-lg font-bold">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/* ---------------- event card ---------------- */
function EventCard({ event, coOrg, index }: { event: EventData; coOrg: boolean; index: number }) {
  const draft = isDraft(event);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
      whileHover={{ y: -4 }}
    >
      <Link href={`/dashboard/organizer/events/${event.id}`} className="block h-full group focus-visible:outline-none">
        <div className="h-full flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/60 group-hover:ring-primary/40 transition-shadow group-hover:shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-primary/50">
          {/* Cover */}
          <div className="h-32 w-full relative overflow-hidden">
            {event.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.coverUrl} alt={event.title} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500" />
            ) : (
              <div className="h-full w-full bg-[var(--h-placard)] flex items-center justify-center">
                <Calendar className="w-10 h-10 text-[var(--h-placard-ink)] opacity-60" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            {/* status */}
            <span className={cn(
              "absolute top-2 right-2 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border",
              draft ? "bg-amber-500/15 text-amber-100 border-amber-300/40" : "bg-emerald-500/15 text-emerald-100 border-emerald-300/40"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", draft ? "bg-amber-300" : "bg-emerald-300")} />
              {draft ? "Draft" : "Published"}
            </span>
            {coOrg && (
              <span className="absolute top-2 left-2 inline-flex items-center rounded-md border border-white/30 bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Co-organizer
              </span>
            )}
            {/* format pill */}
            {event.format && (
              <span className="absolute bottom-2 left-2 inline-flex items-center rounded-full bg-white/85 dark:bg-black/50 px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                {event.format}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="flex flex-col flex-1 p-4 gap-3">
            <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">{event.title}</h3>

            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 shrink-0 text-primary/70" />
                <span className="line-clamp-1">{event.date || "Date TBA"}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 shrink-0 text-primary/70" />
                <span className="line-clamp-1">{event.location || "Location TBA"}</span>
              </div>
            </div>

            {/* mini stats */}
            <div className="flex items-center gap-2 mt-auto pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium">
                <Landmark className="w-3.5 h-3.5 text-primary/70" />
                {event.committees?.length || 0} Committees
              </span>
              {(event.expectedDelegates || getEventCapacity(event)) ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium">
                  <UserCheck className="w-3.5 h-3.5 text-primary/70" />
                  {event.expectedDelegates || getEventCapacity(event)}
                </span>
              ) : null}
            </div>

            {/* CTA */}
            <span className="mt-1 w-full inline-flex items-center justify-center gap-1 rounded-lg border border-border/60 py-2 text-sm font-semibold text-foreground/80 group-hover:border-primary/50 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
              Manage Conference
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ---------------- skeleton ---------------- */
function CardSkeleton() {
  return (
    <div className="h-full rounded-2xl bg-card ring-1 ring-border/60 overflow-hidden animate-pulse">
      <div className="h-32 w-full bg-secondary" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-2/3 bg-secondary rounded" />
        <div className="h-3 w-1/2 bg-secondary rounded" />
        <div className="h-3 w-2/5 bg-secondary rounded" />
        <div className="h-9 w-full bg-secondary rounded-lg mt-3" />
      </div>
    </div>
  );
}

export default function OrganizerEventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventData[]>([]);
  const [coOrgIds, setCoOrgIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchMyEvents() {
      if (!user) return;
      try {
        const [snapshot, coOrgEvents] = await Promise.all([
          getDocs(query(collection(db, "events"), where("organizerId", "==", user.uid))),
          getCoOrganizedEvents(user.uid),
        ]);
        const owned = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as EventData[];
        const ownedIds = new Set(owned.map((e) => e.id));
        const coOrgOnly = coOrgEvents.filter((e) => !ownedIds.has(e.id));
        setCoOrgIds(new Set(coOrgOnly.map((e) => e.id)));
        setEvents([...owned, ...coOrgOnly]);
      } catch (error) {
        console.error("Error fetching my events:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchMyEvents();
  }, [user]);

  const stats = useMemo(() => {
    const published = events.filter((e) => !isDraft(e)).length;
    const drafts = events.filter(isDraft).length;
    return { total: events.length, published, drafts };
  }, [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (filter === "published" && isDraft(e)) return false;
      if (filter === "draft" && !isDraft(e)) return false;
      if (q && !`${e.title} ${e.location}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, filter, search]);

  const filterTabs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "published", label: "Published", count: stats.published },
    { key: "draft", label: "Drafts", count: stats.drafts },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manage Events</h1>
          <p className="text-muted-foreground mt-1">Create and manage your Model UN conferences.</p>
        </div>
        <CreateEventDialog
          trigger={
            <Button className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Create Event
            </Button>
          }
        />
      </div>

      {/* Stats */}
      {!loading && events.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3"
        >
          <StatChip icon={LayoutGrid} label="Total Events" value={stats.total} tint="bg-primary/10 text-primary" />
          <StatChip icon={Globe} label="Published" value={stats.published} tint="bg-emerald-500/10 text-emerald-600" />
          <StatChip icon={FileEdit} label="Drafts" value={stats.drafts} tint="bg-amber-500/10 text-amber-600" />
        </motion.div>
      )}

      {/* Filter + search */}
      {!loading && events.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <SegmentedTabs
            layoutId="events-filter-pill"
            value={filter}
            onChange={(v) => setFilter(v as FilterKey)}
            items={filterTabs.map((t) => ({ id: t.key, label: t.label, count: t.count }))}
          />
          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events..."
              className="h-9 pl-9"
            />
          </div>
        </div>
      )}

      {/* Grid / states */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : events.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-border/60 bg-card"
        >
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No events yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Start by creating your first Model United Nations conference. It only takes a minute.
          </p>
          <CreateEventDialog trigger={<Button size="lg" className="gap-2"><PlusCircle className="w-4 h-4" /> Create Your First Event</Button>} />
        </motion.div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border/60">
          <CalendarX2 className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="font-medium">No events match your filters</p>
          <button onClick={() => { setSearch(""); setFilter("all"); }} className="text-sm text-primary hover:underline mt-2">
            Clear filters
          </button>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filtered.map((event, i) => (
              <EventCard key={event.id} event={event} coOrg={coOrgIds.has(event.id)} index={i} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
