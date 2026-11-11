"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getOrganizerStats, getOrganizerEvents, OrganizerStats, EventData } from "@/lib/services/eventService";
import { getApplicationsByEvent } from "@/lib/services/applicationService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Users, CheckCircle2, TrendingUp, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CreateEventDialog } from "@/components/features/organizer/CreateEventDialog";

interface RoleBreakdown {
  role: string;
  total: number;
  approved: number;
}

export default function OrganizerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<OrganizerStats | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [roleBreakdown, setRoleBreakdown] = useState<RoleBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user) return;
      const [statsData, eventsData] = await Promise.all([
        getOrganizerStats(user.uid),
        getOrganizerEvents(user.uid),
      ]);
      setStats(statsData);
      setEvents(eventsData);

      // Build role breakdown across all events
      const roleMap: Record<string, { total: number; approved: number }> = {};
      for (const event of eventsData) {
        const apps = await getApplicationsByEvent(event.id);
        for (const app of apps) {
          const role = app.role || "Delegate";
          if (!roleMap[role]) roleMap[role] = { total: 0, approved: 0 };
          roleMap[role].total++;
          if (app.status === "approved") roleMap[role].approved++;
        }
      }
      setRoleBreakdown(
        Object.entries(roleMap).map(([role, counts]) => ({ role, ...counts }))
      );
      setLoading(false);
    }
    load();
  }, [user]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const pendingEvents = events.filter(e => e.status === "draft").length;
  const publishedEvents = events.filter(e => e.status === "published").length;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Organizer Dashboard</h1>
        <CreateEventDialog
          trigger={
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> New Event
            </Button>
          }
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: stats?.totalEvents ?? 0, icon: CalendarDays, color: "text-primary" },
          { label: "Published", value: publishedEvents, icon: CheckCircle2, color: "text-green-500" },
          { label: "Total Applications", value: stats?.totalApplications ?? 0, icon: Users, color: "text-blue-500" },
          { label: "Approved", value: stats?.totalApproved ?? 0, icon: TrendingUp, color: "text-yellow-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="glass-card">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Application breakdown by role */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        <div className="space-y-4">
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Events at a Glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Published</span>
                <span className="font-semibold text-green-500">{publishedEvents}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Drafts</span>
                <span className="font-semibold text-yellow-500">{pendingEvents}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Approval Rate</span>
                <span className="font-semibold">
                  {stats && stats.totalApplications > 0
                    ? `${Math.round((stats.totalApproved / stats.totalApplications) * 100)}%`
                    : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {events.length === 0 && (
            <Card className="glass-card border-dashed">
              <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                <CalendarDays className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No events yet.</p>
                <CreateEventDialog
                  trigger={
                    <Button variant="outline" size="sm">Create first event</Button>
                  }
                />
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-2 border-b border-border/40">
            <CardTitle className="text-base">Applications by Role</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="text-left font-semibold p-4">Role</th>
                  <th className="text-center font-semibold p-4">Total</th>
                  <th className="text-center font-semibold p-4">Approved</th>
                  <th className="text-center font-semibold p-4">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {roleBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground text-sm">
                      No applications across your events yet.
                    </td>
                  </tr>
                ) : (
                  roleBreakdown.map(({ role, total, approved }) => (
                    <tr key={role} className="hover:bg-secondary">
                      <td className="p-4 font-medium">{role}</td>
                      <td className="p-4 text-center">{total}</td>
                      <td className="p-4 text-center text-green-500 font-medium">{approved}</td>
                      <td className="p-4 text-center text-yellow-500">{total - approved}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Recent events list */}
      {events.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Your Events</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.slice(0, 4).map(event => (
              <Card key={event.id} className="glass-card hover:border-primary/30 transition-colors">
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{event.date} · {event.location}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={event.status === "published" ? "default" : "secondary"} className="capitalize">
                      {event.status ?? "draft"}
                    </Badge>
                    <Link href={`/dashboard/organizer/events/${event.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      Manage
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {events.length > 4 && (
            <Link href="/dashboard/organizer/events" className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center")}>
              View all {events.length} events
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
