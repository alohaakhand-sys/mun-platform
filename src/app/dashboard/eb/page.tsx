"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import {
  getExecBoardAssignments, getEventStaff, updateStaffMember, removeStaffMember,
  isChairTierRole, roleLabel, StaffMember,
} from "@/lib/services/staffService";
import { getEventById, EventData } from "@/lib/services/eventService";
import { getApplicationsByEvent } from "@/lib/services/applicationService";
import { belongsToCommittee } from "@/lib/utils/committee";
import { getMarkingsByCommittee } from "@/lib/services/markingService";
import { getStudyGuide } from "@/lib/services/optionalModulesService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ShieldCheck, Users, Gavel, ChevronRight, Landmark, Trash2, AlertTriangle, CheckCircle2, Clock, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------- mini progress ring ---------------- */
function MiniRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const done = value >= 100;
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" className="stroke-secondary/50" />
        <motion.circle
          cx="26" cy="26" r={r} fill="none" strokeWidth="5" strokeLinecap="round"
          className={done ? "stroke-emerald-500" : "stroke-primary"}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (value / 100) * c }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </svg>
      <div className={cn("absolute inset-0 grid place-items-center text-[11px] font-bold", done && "text-emerald-500")}>
        {value}%
      </div>
    </div>
  );
}

/* ---------------- stat chip ---------------- */
function StatChip({ icon: Icon, label, value, tint }: { icon: React.ElementType; label: string; value: number | string; tint: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3"
    >
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", tint)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="leading-tight">
        <p className="text-lg font-bold">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </motion.div>
  );
}

interface CommitteeOversight {
  name: string;
  delegateCount: number;
  markedCount: number;
  chairs: StaffMember[];
  hasStudyGuide: boolean;
}

interface EventOversight {
  event: EventData;
  role: string;
  scopeAll: boolean;
  scopeCommittees: string[];
  committees: CommitteeOversight[];
}

const norm = (s?: string) => (s || "").trim().toLowerCase();

export default function ExecBoardDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventOversight[]>([]);
  const [busyChair, setBusyChair] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ eventId: string; chair: StaffMember } | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user) return;
      try {
        const assignments = await getExecBoardAssignments(user.uid);

        const result = await Promise.all(
          assignments.map(async (a) => {
            const [event, allStaff, apps] = await Promise.all([
              getEventById(a.eventId),
              getEventStaff(a.eventId),
              getApplicationsByEvent(a.eventId),
            ]);
            if (!event) return null;

            const allCommittees = (event.committees || []).map(c => c.name);
            const scopeCommittees = a.committeeId ? [a.committeeId] : allCommittees;

            const committees = await Promise.all(
              scopeCommittees.map(async (name) => {
                const target = norm(name);
                const delegateCount = apps.filter(app =>
                  /delegate/i.test(app.role || "") &&
                  app.status === "approved" &&
                  belongsToCommittee(app, name)
                ).length;
                const chairs = allStaff.filter(s =>
                  isChairTierRole(s.role) && s.inviteStatus === "accepted" && norm(s.committeeId || "") === target
                );
                const [markings, guide] = await Promise.all([
                  getMarkingsByCommittee(a.eventId, name),
                  getStudyGuide(a.eventId, name),
                ]);
                const markedCount = new Set(markings.map(m => m.delegateId)).size;
                return { name, delegateCount, markedCount, chairs, hasStudyGuide: !!guide } as CommitteeOversight;
              })
            );

            return {
              event,
              role: a.role,
              scopeAll: !a.committeeId,
              scopeCommittees,
              committees,
            } as EventOversight;
          })
        );

        setEvents(result.filter((e): e is EventOversight => e !== null));
      } catch (err) {
        console.error("Error loading EB dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  const handleReassign = async (eventId: string, chair: StaffMember, newCommittee: string) => {
    if (!chair.id || newCommittee === chair.committeeId) return;
    setBusyChair(chair.id);
    const res = await updateStaffMember(eventId, chair.id, { committeeId: newCommittee }, chair);
    if (res.success) {
      setEvents(prev => prev.map(ev => ev.event.id !== eventId ? ev : rebuildAfterChairMove(ev, chair, newCommittee)));
    }
    setBusyChair(null);
  };

  const handleRemove = async () => {
    if (!removeTarget?.chair.id) return;
    setRemoving(true);
    const { eventId, chair } = removeTarget;
    const res = await removeStaffMember(eventId, chair.id!, chair);
    if (res.success) {
      setEvents(prev => prev.map(ev => ev.event.id !== eventId ? ev : {
        ...ev,
        committees: ev.committees.map(c => ({ ...c, chairs: c.chairs.filter(ch => ch.id !== chair.id) })),
      }));
      setRemoveTarget(null);
    }
    setRemoving(false);
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const allCommittees = events.flatMap((e) => e.committees);
  const totalDelegates = allCommittees.reduce((s, c) => s + c.delegateCount, 0);
  const totalChairs = allCommittees.reduce((s, c) => s + c.chairs.length, 0);
  const totalMarked = allCommittees.reduce((s, c) => s + c.markedCount, 0);
  const gradePct = totalDelegates ? Math.round((totalMarked / totalDelegates) * 100) : 0;

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex items-center gap-4"
      >
        <div className="grid place-items-center w-11 h-11 rounded-sm border border-border bg-secondary text-foreground shrink-0">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 mb-1">Executive Board</Badge>
          <h1 className="text-3xl font-bold tracking-tight">Executive Board Dashboard</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Oversee your committees, monitor grading progress, and manage chairs within your scope.
          </p>
        </div>
      </motion.div>

      {events.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatChip icon={Landmark} label="Committees" value={allCommittees.length} tint="bg-primary/10 text-primary" />
          <StatChip icon={Users} label="Delegates" value={totalDelegates} tint="bg-sky-500/10 text-sky-500" />
          <StatChip icon={Gavel} label="Chairs" value={totalChairs} tint="bg-primary/10 text-primary" />
          <StatChip icon={Trophy} label="Graded" value={`${gradePct}%`} tint="bg-emerald-500/10 text-emerald-600" />
        </div>
      )}

      {events.length === 0 ? (
        <Card className="glass-card flex flex-col items-center justify-center py-20 text-center border-dashed">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-xl mb-2">No Executive Board Assignments</CardTitle>
          <CardDescription className="max-w-md mx-auto mb-6">
            You don't have any accepted Director or USG roles yet. Once an organizer assigns you, your committees will appear here.
          </CardDescription>
          <Link href="/dashboard/conferences"><Button>Browse Conferences</Button></Link>
        </Card>
      ) : (
        <div className="space-y-10">
          {events.map(({ event, role, scopeAll, scopeCommittees, committees }, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between gap-4 border-b border-border/50 pb-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{event.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {roleLabel(role)} · {scopeAll ? "All committees" : `${scopeCommittees.length} committee${scopeCommittees.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <Badge variant="secondary" className="capitalize shrink-0">{roleLabel(role)}</Badge>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {committees.map((c, ci) => {
                  const pct = Math.round((c.markedCount / (c.delegateCount || 1)) * 100);
                  return (
                  <motion.div
                    key={c.name}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(ci * 0.05, 0.3) }}
                    whileHover={{ y: -4 }}
                  >
                  <Card className="glass-card overflow-hidden h-full ring-1 ring-border/60 hover:ring-primary/40 hover:shadow-sm transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Landmark className="w-5 h-5" />
                          </span>
                          <div className="min-w-0">
                            <CardTitle className="text-lg truncate">{c.name}</CardTitle>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-0.5 text-xs font-medium"><Users className="w-3.5 h-3.5 text-sky-500" /> {c.delegateCount}</span>
                              <span className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-0.5 text-xs font-medium"><Gavel className="w-3.5 h-3.5 text-primary" /> {c.chairs.length}</span>
                              <span className={cn(
                                "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium",
                                c.hasStudyGuide ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                              )}>
                                {c.hasStudyGuide ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                                {c.hasStudyGuide ? "Guide" : "No guide"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <MiniRing value={pct} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Grading progress */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Grading progress</span>
                          <span className="font-semibold text-foreground">{c.markedCount}/{c.delegateCount}</span>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <motion.div
                            className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-primary")}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                      </div>

                      {/* Chairs roster */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chairs</p>
                        {c.chairs.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No chairs assigned to this committee.</p>
                        ) : (
                          <div className="space-y-2">
                            {c.chairs.map((chair, chi) => (
                              <motion.div
                                key={chair.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 + chi * 0.04 }}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary p-2.5"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="w-8 h-8 rounded-full border border-border bg-secondary text-foreground text-xs font-bold grid place-items-center shrink-0">
                                    {(chair.name || chair.email || "?").charAt(0).toUpperCase()}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{chair.name || chair.email}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{roleLabel(chair.role)}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {scopeAll && scopeCommittees.length > 1 && (
                                    <Select
                                      value={chair.committeeId || ""}
                                      onValueChange={(val) => val && handleReassign(event.id, chair, val)}
                                    >
                                      <SelectTrigger className="h-8 w-[140px] text-xs" disabled={busyChair === chair.id}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {scopeCommittees.map(name => (
                                          <SelectItem key={name} value={name}>{name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    onClick={() => setRemoveTarget({ eventId: event.id, chair })}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    <span className="sr-only">Remove chair</span>
                                  </Button>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Link href={`/dashboard/chair/committee/${event.id}?committee=${encodeURIComponent(c.name)}`}>
                        <Button className="w-full gap-2 group">
                          Open Committee
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                  </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </span>
              Remove chair?
            </DialogTitle>
            <DialogDescription>
              {removeTarget && (
                <><strong>{removeTarget.chair.name || removeTarget.chair.email}</strong> will be removed from the committee
                staff and lose chair access. This cannot be undone — the organizer can re-invite them later.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>Cancel</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" onClick={handleRemove} disabled={removing}>
              <Trash2 className="w-4 h-4 mr-2" />
              {removing ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Moves a chair between committee cards in local state after a successful reassignment. */
function rebuildAfterChairMove(ev: EventOversight, chair: StaffMember, newCommittee: string): EventOversight {
  const moved: StaffMember = { ...chair, committeeId: newCommittee };
  return {
    ...ev,
    committees: ev.committees.map(c => {
      if (c.name === newCommittee) {
        return c.chairs.some(ch => ch.id === chair.id)
          ? { ...c, chairs: c.chairs.map(ch => ch.id === chair.id ? moved : ch) }
          : { ...c, chairs: [...c.chairs, moved] };
      }
      return { ...c, chairs: c.chairs.filter(ch => ch.id !== chair.id) };
    }),
  };
}
