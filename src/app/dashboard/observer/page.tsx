"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import {
  getObserverAssignments, getFacultyStaffAssignments, getMyStaffDoc,
  roleLabel, hasStaffPermission, ExecBoardAssignment, StaffMember,
} from "@/lib/services/staffService";
import { getEventById, EventData } from "@/lib/services/eventService";
import { getApplicationsByEvent } from "@/lib/services/applicationService";
import { belongsToCommittee } from "@/lib/utils/committee";
import { getAnnouncements, isUserInAudience, Announcement } from "@/lib/services/announcementService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Calendar, MapPin, Landmark, Megaphone, Users, Lock, Radio } from "lucide-react";

interface ReadonlyEvent {
  event: EventData;
  role: string;
  committeeId: string | null;
  permissions: StaffMember["permissions"] | null;
  announcements: Announcement[];
  roster: { name: string; committee: string; country: string }[] | null;
}

export default function ObserverDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ReadonlyEvent[]>([]);

  useEffect(() => {
    async function load() {
      if (!user) return;
      try {
        const [observerA, facultyA] = await Promise.all([
          getObserverAssignments(user.uid),
          getFacultyStaffAssignments(user.uid),
        ]);
        // De-dupe by event (a user is unlikely to hold both, but be safe).
        const byEvent = new Map<string, ExecBoardAssignment>();
        [...observerA, ...facultyA].forEach(a => { if (!byEvent.has(a.eventId)) byEvent.set(a.eventId, a); });

        const result = await Promise.all(
          [...byEvent.values()].map(async (a) => {
            const [event, staff] = await Promise.all([
              getEventById(a.eventId),
              getMyStaffDoc(a.eventId, user.uid),
            ]);
            if (!event) return null;

            const annAll = await getAnnouncements(a.eventId).catch(() => []);
            const announcements = annAll
              .filter(an => isUserInAudience(a.role, an.audience))
              .slice(0, 5);

            let roster: ReadonlyEvent["roster"] = null;
            if (hasStaffPermission(staff, "canViewApplications")) {
              const apps = await getApplicationsByEvent(a.eventId).catch(() => []);
              const scoped = a.committeeId
                ? apps.filter(ap => belongsToCommittee(ap, a.committeeId!))
                : apps;
              roster = scoped
                .filter(ap => /delegate/i.test(ap.role || "") && ap.status === "approved")
                .map(ap => ({
                  name: ap.applicantName || "Delegate",
                  committee: ap.assignedCommittee || ap.choices?.primary?.committee || "—",
                  country: ap.assignedCountry || "—",
                }));
            }

            return { event, role: a.role, committeeId: a.committeeId, permissions: staff?.permissions ?? null, announcements, roster } as ReadonlyEvent;
          })
        );
        setItems(result.filter((r): r is ReadonlyEvent => r !== null));
      } catch (err) {
        console.error("Error loading read-only dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 mb-2">Read-only Access</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Observer Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Follow the conferences you're attached to. Your access is read-only unless the organizer grants you abilities.
        </p>
      </div>

      {items.length === 0 ? (
        <Card className="glass-card flex flex-col items-center justify-center py-20 text-center border-dashed">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Eye className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-xl mb-2">No observer access yet</CardTitle>
          <CardDescription className="max-w-md mx-auto mb-6">
            Once an organizer adds you as an observer or faculty advisor, the conference appears here.
          </CardDescription>
          <Link href="/dashboard/conferences"><Button>Browse Conferences</Button></Link>
        </Card>
      ) : (
        <div className="space-y-8">
          {items.map(({ event, role, committeeId, announcements, roster }, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="glass-card overflow-hidden">
                <div className="h-1.5 w-full bg-primary" />
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl">{event.title}</CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {event.date || "Date TBA"}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {event.location || "Location TBA"}</span>
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="capitalize shrink-0">
                      {roleLabel(role)}{committeeId ? ` · ${committeeId}` : ""}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Committees */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5" /> Committees
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {/* Each committee opens its live sitting, watch-only (the chair route renders
                          WatchConsole for anyone who can't run it, and waits if nothing is sitting). */}
                      {(committeeId ? [committeeId] : (event.committees || []).map(c => c.name)).map(name => (
                        <Link key={name} href={`/dashboard/chair/committee/${event.id}/live?committee=${encodeURIComponent(name)}`}
                          title={`Watch ${name} live`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors">
                          <Radio className="w-3 h-3" /> {name}
                        </Link>
                      ))}
                      {(!event.committees || event.committees.length === 0) && !committeeId && (
                        <span className="text-sm text-muted-foreground italic">No committees yet.</span>
                      )}
                    </div>
                  </div>

                  {/* Announcements */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5" /> Recent Announcements
                    </p>
                    {announcements.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No announcements yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {announcements.map(a => (
                          <div key={a.id} className="rounded-lg border border-border/50 bg-secondary p-3">
                            <p className="text-sm font-medium">{a.subject}</p>
                            {a.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.body.replace(/<[^>]+>/g, "")}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Roster (only if granted canViewApplications) */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Delegates
                    </p>
                    {roster === null ? (
                      <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> Roster hidden — ask the organizer to grant "View Applications".
                      </p>
                    ) : roster.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No approved delegates yet.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border/50">
                        <table className="w-full text-sm">
                          <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                            <tr>
                              <th className="text-left p-2.5">Delegate</th>
                              <th className="text-left p-2.5">Committee</th>
                              <th className="text-left p-2.5">Country</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {roster.map((r, idx) => (
                              <tr key={idx}>
                                <td className="p-2.5">{r.name}</td>
                                <td className="p-2.5">{r.committee}</td>
                                <td className="p-2.5">{r.country}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
