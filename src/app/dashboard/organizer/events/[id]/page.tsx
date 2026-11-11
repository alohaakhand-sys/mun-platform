"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, updateEvent, isUserCoOrganizer, getEnabledRoleTiers, EventData, freeEventsInUse } from "@/lib/services/eventService";
import { resolvePlan } from "@/lib/data/eventPlan";
import { belongsToCommittee } from "@/lib/utils/committee";
import { getApplicationsByEvent, ApplicationData } from "@/lib/services/applicationService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Settings, Globe2, Clock, CheckCircle2,
  Mail, CalendarDays, ExternalLink, Activity, Target, ArrowRight, Award, AlertTriangle,
  Rocket, EyeOff, CircleCheck, Circle, MapPin, ChevronRight
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { ApplicationDetailSidebar } from "@/components/features/organizer/ApplicationDetailSidebar";
import { CreateEventDialog } from "@/components/features/organizer/CreateEventDialog";

export default function OrganizerEventOverviewPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();

  const [event, setEvent] = useState<EventData | null>(null);
  const [applications, setApplications] = useState<(ApplicationData & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<(ApplicationData & { id: string }) | null>(null);
  const [publishing, setPublishing] = useState(false);

  async function reloadEvent() {
    if (!eventId) return;
    const fresh = await getEventById(eventId);
    if (fresh) setEvent(fresh);
  }

  useEffect(() => {
    async function loadData() {
      if (!user || !eventId) return;
      const [eventData, apps] = await Promise.all([
        getEventById(eventId),
        getApplicationsByEvent(eventId),
      ]);
      const allowed = !!eventData &&
        (eventData.organizerId === user.uid || await isUserCoOrganizer(eventId, user.uid));
      if (!allowed) {
        router.push("/dashboard/organizer/events");
        return;
      }
      setEvent(eventData);
      setApplications(apps as (ApplicationData & { id: string })[]);
      setLoading(false);
    }
    loadData();
  }, [user, eventId, router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    );
  }

  if (!event) return null;

  const stats = {
    total: applications.length,
    approved: applications.filter(a => a.status === "approved").length,
    pending: applications.filter(a => a.status === "pending").length,
    capacityLimit: event.committees?.reduce((acc, c) => acc + (c.capacity || 0), 0) || 0,
  };

  const capacityPercent = stats.capacityLimit > 0 ? Math.round((stats.approved / stats.capacityLimit) * 100) : 0;
  const daysUntilEvent = Math.max(0, Math.ceil((new Date(event.date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
  const nextSession = event.schedule?.filter(s => new Date(s.startTime).getTime() > new Date().getTime()).sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];

  const pendingAssignments = applications.filter(a => a.status === "approved" && !a.assignedCountry).length;

  const readiness = {
    basics: Boolean(event.title && event.date && event.location && event.description),
    committees: Boolean(event.committees?.some(c => c.name && (c.capacity ?? 0) > 0)),
    tickets: getEnabledRoleTiers(event).length > 0,
    details: Boolean(event.expectedDelegates || event.targetAudience || event.applicationDeadlines),
    schedule: Boolean(event.schedule?.length),
  };
  const requiredReady = readiness.basics && readiness.committees && readiness.tickets && readiness.details;

  const _eventDt = new Date(event.date);
  const eventDateLabel = isNaN(_eventDt.getTime()) ? event.date : format(_eventDt, "MMM d, yyyy · h:mm a");

  async function handlePublish() {
    if (!event) return;
    if (!requiredReady) return;
    setPublishing(true);
    try {
      // A Free event counts against the organizer's Free events at once (eventPlan.ts).
      if (!resolvePlan(event).isPro && event.organizerId) {
        const { used, cap } = await freeEventsInUse(event.organizerId, event.id);
        if (used >= cap) {
          alert(`You already have ${used} published Free event${used === 1 ? "" : "s"} (the limit is ${cap}). Make this event Pro, or ask for more room, under Plan.`);
          return;
        }
      }
      await updateEvent(event.id, { status: "published" });
      await reloadEvent();
    } catch (err) {
      console.error("Failed to publish:", err);
      alert("Failed to publish event.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    if (!event) return;
    if (!confirm("Unpublish this event? It will no longer appear on the public events page.")) return;
    setPublishing(true);
    try {
      await updateEvent(event.id, { status: "draft" });
      await reloadEvent();
    } catch (err) {
      console.error("Failed to unpublish:", err);
      alert("Failed to unpublish event.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Event Header Card */}
      <Card className="relative overflow-hidden border-border/40 p-0 gap-0 h-56 sm:h-60">
        {/* Blurred cover fill so any aspect ratio reads cleanly, no hard seams */}
        {event.coverUrl ? (
          <>
            <img src={event.coverUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60" />
            <img src={event.coverUrl} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[var(--h-slab)] flex items-center justify-center">
            <Award className="w-24 h-24 opacity-15 text-white" />
          </div>
        )}
        {/* Legibility: darken top (for buttons) and bottom (for title) */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/85" />

        {/* Top row: status + actions */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Badge className={cn("border-0 gap-1.5 shadow-sm", event.status === "published" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>
              <span className={cn("w-1.5 h-1.5 rounded-full bg-white", event.status === "published" && "animate-pulse")} />
              {event.status === "published" ? "Live" : "Draft"}
            </Badge>
            {event.lastEditedAt && (
              <span className="hidden sm:inline text-xs text-white/70 drop-shadow">
                Edited {formatDistanceToNow(typeof event.lastEditedAt === 'string' ? new Date(event.lastEditedAt) : event.lastEditedAt.toDate?.() || new Date())} ago
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {event.status === "draft" ? (
              <Button
                onClick={handlePublish}
                disabled={!requiredReady || publishing}
                size="sm"
                className="gap-2 bg-emerald-500 hover:bg-emerald-400 text-white border-0 shadow-sm"
              >
                <Rocket className="w-4 h-4" />
                {publishing ? "Publishing..." : "Publish"}
              </Button>
            ) : (
              <Button onClick={handleUnpublish} disabled={publishing} size="sm" className="gap-2 bg-white/15 hover:bg-white/25 text-white border border-white/25">
                <EyeOff className="w-4 h-4" />
                {publishing ? "Updating..." : "Unpublish"}
              </Button>
            )}
            <CreateEventDialog
              mode="edit"
              initialEvent={event}
              onSuccess={() => reloadEvent()}
              trigger={
                <Button size="sm" className="gap-2 bg-white/15 hover:bg-white/25 text-white border border-white/25">
                  <Settings className="w-4 h-4" /> <span className="hidden sm:inline">Edit</span>
                </Button>
              }
            />
            <Button size="sm" className="gap-2 bg-white/15 hover:bg-white/25 text-white border border-white/25" render={<Link href={`/events/${eventId}`} target="_blank" />} nativeButton={false}>
              <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">View</span>
            </Button>
          </div>
        </div>

        {/* Bottom: title + meta */}
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow-sm">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
            <span className="flex items-center gap-1.5 drop-shadow"><Clock className="w-4 h-4" /> {eventDateLabel}</span>
            <span className="flex items-center gap-1.5 drop-shadow"><MapPin className="w-4 h-4" /> {event.location}</span>
          </div>
        </div>
      </Card>

      {event.status === "draft" && (
        <Card className="glass-card border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="w-5 h-5 text-amber-500" /> Ready to publish?
            </CardTitle>
            <CardDescription>
              Complete the required steps below to make this event public. Schedule is recommended but optional.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              <ReadinessRow
                done={readiness.basics}
                label="Basic info — title, date, location, description"
              />
              <ReadinessRow
                done={readiness.committees}
                label="At least one committee with name and capacity"
                href={`/dashboard/organizer/events/${eventId}/committees`}
              />
              <ReadinessRow
                done={readiness.tickets}
                label="At least one accepted role with pricing"
                href={`/dashboard/organizer/events/${eventId}/financials`}
              />
              <ReadinessRow
                done={readiness.details}
                label="Event details — expected delegates, audience, application deadlines"
                href={`/dashboard/organizer/events/${eventId}/details`}
              />
              <ReadinessRow
                done={readiness.schedule}
                label="Schedule items (optional)"
                href={`/dashboard/organizer/events/${eventId}/schedule`}
                optional
              />
            </ul>
            {!requiredReady && (
              <p className="text-xs text-muted-foreground mt-4">
                Publish unlocks once all required items are checked.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
            <Users className="w-6 h-6 text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Applicants</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
            <CheckCircle2 className="w-6 h-6 text-green-500 mb-2" />
            <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Approved</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
            <Activity className="w-6 h-6 text-primary mb-2" />
            <p className="text-2xl font-bold">{capacityPercent}%</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Capacity</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
            <CalendarDays className="w-6 h-6 text-orange-500 mb-2" />
            <p className="text-2xl font-bold">{daysUntilEvent}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Days Away</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Recent Applications</CardTitle>
                <CardDescription>Latest delegates and staff</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground" onClick={() => router.push(`/dashboard/organizer/events/${eventId}/allocation`)}>
                View All <ArrowRight className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {applications.slice(0, 5).map((app: any) => (
                  <div 
                    key={app.id} 
                    onClick={() => setSelectedApp(app)}
                    className="flex items-center justify-between p-3 rounded-xl bg-secondary border border-border/40 hover:bg-secondary cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                        {app.role[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{app.applicantName || "New Applicant"}</p>
                        <p className="text-xs text-muted-foreground">{app.choices?.primary?.committee || app.role}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">{app.status}</Badge>
                  </div>
                ))}
                {applications.length === 0 && (
                  <p className="text-center text-muted-foreground py-8 text-sm">No applications yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Pending Assignments */}
             <Card className="glass-card flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe2 className="w-5 h-5 text-blue-500" /> Country Assignments
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="flex-1">
                  <p className="text-3xl font-bold mb-1">{pendingAssignments}</p>
                  <p className="text-sm text-muted-foreground mb-4">Pending assignments</p>
                </div>
                <Button className="w-full gap-2 mt-auto" variant={pendingAssignments > 0 ? "default" : "secondary"} onClick={() => router.push(`/dashboard/organizer/events/${eventId}/allocation?tab=countries`)}>
                  Assign Now <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            {/* Next Schedule Item */}
            <Card className="glass-card flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="w-5 h-5 text-orange-500" /> Upcoming Session
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="flex-1">
                  {nextSession ? (
                    <>
                      <p className="font-semibold mb-1 truncate">{nextSession.title}</p>
                      <p className="text-sm text-muted-foreground mb-4">{new Date(nextSession.startTime).toLocaleString()} - {nextSession.location}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold mb-1">No upcoming sessions</p>
                      <p className="text-sm text-muted-foreground mb-4">Within 7 days</p>
                    </>
                  )}
                </div>
                <Button className="w-full gap-2 mt-auto" variant="outline" onClick={() => router.push(`/dashboard/organizer/events/${eventId}/schedule`)}>
                  View Full Schedule <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Committees</CardTitle>
              <Button variant="ghost" size="sm" className="p-0 h-auto text-muted-foreground hover:text-foreground" onClick={() => router.push(`/dashboard/organizer/events/${eventId}/committees`)}>
                Manage
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {event.committees?.map((committee: any, i: number) => {
                const count = applications.filter(a => belongsToCommittee(a, committee.name)).length;
                const progress = Math.min((count / (committee.capacity || 100)) * 100, 100);
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="truncate max-w-[120px]">{committee.name}</span>
                      <span>{count} / {committee.capacity || 100}</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle>Quick Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Link href={`/dashboard/organizer/events/${eventId}/complaints`} className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary hover:bg-secondary border border-border/40 transition-colors text-center group">
                  <Badge className="mb-2 bg-primary/10 text-primary group-hover:bg-primary/20"><AlertTriangle className="w-4 h-4" /></Badge>
                  <span className="text-xs font-medium">Complaints</span>
                </Link>
                <Link href={`/dashboard/organizer/events/${eventId}/tools/id-cards`} className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary hover:bg-secondary border border-border/40 transition-colors text-center group">
                  <Badge className="mb-2 bg-primary/10 text-primary group-hover:bg-primary/20"><Users className="w-4 h-4" /></Badge>
                  <span className="text-xs font-medium">ID Cards</span>
                </Link>
                <Link href={`/dashboard/organizer/events/${eventId}/tools/certificates`} className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary hover:bg-secondary border border-border/40 transition-colors text-center group">
                  <Badge className="mb-2 bg-primary/10 text-primary group-hover:bg-primary/20"><Award className="w-4 h-4" /></Badge>
                  <span className="text-xs font-medium">Certificates</span>
                </Link>
                <Link href={`/dashboard/organizer/events/${eventId}/announcements`} className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary hover:bg-secondary border border-border/40 transition-colors text-center group">
                  <Badge className="mb-2 bg-primary/10 text-primary group-hover:bg-primary/20"><Mail className="w-4 h-4" /></Badge>
                  <span className="text-xs font-medium">Announcements</span>
                </Link>
                <Link href={`/dashboard/organizer/events/${eventId}/partners`} className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary hover:bg-secondary border border-border/40 transition-colors text-center group">
                  <Badge className="mb-2 bg-primary/10 text-primary group-hover:bg-primary/20"><Target className="w-4 h-4" /></Badge>
                  <span className="text-xs font-medium">Partners</span>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <ApplicationDetailSidebar
        application={selectedApp}
        event={event}
        onClose={() => setSelectedApp(null)}
        onStatusUpdate={(appId, newStatus, assignedCommittee, assignedCountry) => {
          setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: newStatus, assignedCommittee, assignedCountry } : a));
          setSelectedApp(prev => prev && prev.id === appId ? { ...prev, status: newStatus, assignedCommittee, assignedCountry } : prev);
        }}
      />
    </div>
  );
}

function ReadinessRow({ done, label, href, optional }: { done: boolean; label: string; href?: string; optional?: boolean }) {
  const Icon = done ? CircleCheck : Circle;
  const iconColor = done ? "text-emerald-500" : optional ? "text-muted-foreground" : "text-amber-500";
  const tone = done
    ? "border-emerald-500/30 bg-emerald-500/5"
    : optional
    ? "border-border/40 bg-secondary"
    : "border-amber-500/30 bg-amber-500/5";
  const base = `flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${tone}`;

  const inner = (
    <>
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className={`w-5 h-5 shrink-0 ${iconColor}`} />
        <span className={`truncate text-sm ${done ? "text-foreground font-medium" : "text-foreground/80"}`}>
          {label}
          {optional && <span className="text-[10px] text-muted-foreground ml-2">(optional)</span>}
        </span>
      </div>
      {href && (
        <span className="flex items-center gap-0.5 text-xs font-semibold shrink-0 text-primary">
          {done ? "Edit" : "Add"}
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <li>
        <Link href={href} className={`group ${base} hover:border-primary/50 hover:bg-secondary`}>
          {inner}
        </Link>
      </li>
    );
  }
  return <li className={base}>{inner}</li>;
}
