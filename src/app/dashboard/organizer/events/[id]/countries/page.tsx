'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CountryAssignmentRow, Applicant } from '@/components/features/organizer/CountryAssignmentRow';
import { Globe, Clock, Bot, Save, AlertTriangle } from 'lucide-react';
import { getEventById, Committee } from '@/lib/services/eventService';
import { belongsToCommittee } from '@/lib/utils/committee';
import { notifyCountryAssigned } from '@/lib/services/notifyService';
import { getApplicationsByEvent, updateApplication, ApplicationData } from '@/lib/services/applicationService';
import { batchCheckConflicts, ConflictRecord } from '@/lib/services/conflictService';

export default function CountryManagementPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [allApplications, setAllApplications] = useState<ApplicationData[]>([]);
  const [eventTitle, setEventTitle] = useState("");
  const [applicants, setApplicants] = useState<Record<string, Applicant[]>>({});
  const [activeCommittee, setActiveCommittee] = useState('');
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [assignmentStatus, setAssignmentStatus] = useState<string>("pending");
  const [assignmentMode, setAssignmentMode] = useState<string>("manual");
  const [conflictsMap, setConflictsMap] = useState<Map<string, ConflictRecord>>(new Map());

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      const [event, apps] = await Promise.all([
        getEventById(eventId),
        getApplicationsByEvent(eventId),
      ]);
      if (!event) { setLoading(false); return; }

      const approved = apps.filter(a => a.status === 'approved');
      setAllApplications(apps);
      setEventTitle(event.title || "the conference");
      setCommittees(event.committees ?? []);
      setAssignmentStatus(event.assignmentStatus ?? "pending");
      setAssignmentMode(event.countryAssignmentMode ?? "manual");
      
      if (event.assignmentDeadline) {
         const deadlineMs = event.assignmentDeadline.toDate ? event.assignmentDeadline.toDate().getTime() : new Date(event.assignmentDeadline).getTime();
         setTimeLeft(Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000)));
      } else {
         setTimeLeft(24 * 60 * 60); // Default fallback
      }

      const map: Record<string, Applicant[]> = {};
      for (const c of event.committees ?? []) {
        // Authoritative placement: assigned committee wins, preference is only a
        // fallback. OR-ing them would double-show migrated delegates (their old
        // preference still points at the previous committee).
        const committeeApps = approved.filter(a => belongsToCommittee(a, c.name));
        map[c.name] = committeeApps.map(a => ({
          id: (a as any).id,
          userId: a.userId,
          name: a.applicantName ?? a.userId,
          email: a.applicantEmail ?? '',
          experience: a.experience ?? '',
          preferences: [
            a.choices?.primary?.country,
            a.choices?.secondary?.country,
            a.choices?.tertiary?.country,
          ].filter(Boolean) as string[],
          assignedCountry: a.assignedCountry ?? null,
        }));
      }
      setApplicants(map);
      if (event.committees?.length) setActiveCommittee(event.committees[0].name);
      setLoading(false);
    }
    load();
  }, [eventId]);

  useEffect(() => {
    if (!activeCommittee || committees.length === 0 || loading) return;
    async function checkCurrentCommitteeConflicts() {
       const committeeApps = applicants[activeCommittee] ?? [];
       const committee = committees.find(c => c.name === activeCommittee);
       if (!committee || committeeApps.length === 0) return;
       const results = await batchCheckConflicts(committeeApps, committee.countries ?? [], eventId);
       setConflictsMap(results);
    }
    checkCurrentCommitteeConflicts();
  }, [activeCommittee, applicants, committees, eventId, loading]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleAssign = (applicantId: string, country: string) => {
    setApplicants(prev => {
      const updated = { ...prev };
      updated[activeCommittee] = (updated[activeCommittee] ?? []).map(app =>
        app.id === applicantId ? { ...app, assignedCountry: country === 'unassigned' ? null : country } : app
      );
      return updated;
    });
  };

  const handleSave = async () => {
    const currentApplicants = applicants[activeCommittee] ?? [];
    const toAssign = currentApplicants.filter(a => a.assignedCountry);
    // A country set back to "Unassigned" is cleared too (it used to be dropped silently).
    const toClear = currentApplicants.filter(a =>
      !a.assignedCountry && allApplications.find(ap => (ap as any).id === a.id)?.assignedCountry
    );
    await Promise.all([
      ...toAssign.map(a => updateApplication(a.id, { assignedCountry: a.assignedCountry! })),
      ...toClear.map(a => updateApplication(a.id, { assignedCountry: null as any })),
    ]);
    if (toClear.length) {
      const cleared = new Set(toClear.map(a => a.id));
      setAllApplications(prev => prev.map(ap => cleared.has((ap as any).id) ? { ...ap, assignedCountry: undefined } : ap));
    }
    // Email only delegates whose country is newly set (was previously unassigned).
    const newlyAssignedIds: string[] = [];
    for (const a of toAssign) {
      const orig = allApplications.find(ap => (ap as any).id === a.id);
      if (a.email && !orig?.assignedCountry) {
        notifyCountryAssigned(eventId, a.email, eventTitle, a.assignedCountry!, activeCommittee);
        newlyAssignedIds.push(a.id);
      }
    }
    // Reflect saved assignments locally so a re-save doesn't re-email.
    if (newlyAssignedIds.length) {
      setAllApplications(prev => prev.map(ap =>
        newlyAssignedIds.includes((ap as any).id)
          ? { ...ap, assignedCountry: toAssign.find(t => t.id === (ap as any).id)?.assignedCountry ?? ap.assignedCountry }
          : ap
      ));
    }
  };

  const committeeApps = applicants[activeCommittee] ?? [];
  const unassignedCount = committeeApps.filter(a => !a.assignedCountry).length;
  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid place-items-center w-11 h-11 rounded-sm border border-border bg-secondary text-foreground shrink-0">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">Country Assignments</span></h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Assign countries to applicants manually or use AI auto-assignment.
            </p>
          </div>
        </div>
        <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl shrink-0">
          <div className="grid place-items-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Assignment Deadline</p>
            <p className={`font-mono text-lg font-bold tabular-nums ${assignmentStatus === 'auto_assigned' ? 'text-emerald-500' : timeLeft <= 3600 && timeLeft > 0 ? 'text-red-500' : 'text-foreground'}`}>
               {assignmentStatus === 'auto_assigned' ? 'COMPLETED' : formatTime(timeLeft)}
            </p>
          </div>
        </div>
      </div>
      
      {timeLeft > 0 && timeLeft <= 3600 && assignmentStatus !== 'auto_assigned' && (
         <div className="bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 p-4 rounded-lg border border-red-200 dark:border-red-900 flex items-start gap-3">
           <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
           <div className="text-sm">
             <p className="font-semibold mb-1">1 hour until {assignmentMode === 'ai' ? 'AI auto-assigns' : 'deadline'}</p>
             <p>Please lock in any manual assignments before the deadline.</p>
           </div>
         </div>
      )}
      
      {timeLeft === 0 && assignmentStatus !== 'auto_assigned' && assignmentMode === 'ai' && (
         <div className="bg-amber-50 text-amber-800 p-4 rounded-lg border border-amber-200 flex items-start gap-3">
           <Bot className="w-5 h-5 shrink-0 mt-0.5" />
           <div className="text-sm">
             <p className="font-semibold mb-1">AI Assignment in progress...</p>
             <p>Manual edits are temporarily disabled.</p>
           </div>
         </div>
      )}

      {committees.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No committees configured for this event.
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <CardHeader className="pb-4 border-b border-border/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Delegation Matrix
                </CardTitle>
                <CardDescription>
                  {unassignedCount > 0
                    ? <span className="text-amber-600 font-medium">{unassignedCount} applicants need assignment.</span>
                    : <span className="text-green-600 font-medium">All applicants assigned!</span>
                  }
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={timeLeft === 0 && assignmentMode === 'ai'} className="bg-primary hover:bg-primary text-white gap-2">
                  <Save className="w-4 h-4" /> Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs value={activeCommittee} onValueChange={setActiveCommittee} className="w-full">
              <div className="px-6 pt-4 border-b">
                <TabsList className="mb-4">
                  {committees.map(c => (
                    <TabsTrigger key={c.name} value={c.name} className="gap-2">
                      {c.name}
                      {(applicants[c.name] ?? []).filter(a => !a.assignedCountry).length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 rounded-full text-[10px]">
                          {(applicants[c.name] ?? []).filter(a => !a.assignedCountry).length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {committees.map(c => (
                <TabsContent key={c.name} value={c.name} className="p-6 m-0 space-y-4">
                  {(applicants[c.name] ?? []).length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      No approved applicants for this committee yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(applicants[c.name] ?? []).map(app => {
                        const appConflicts: Record<string, string> = {};
                        (c.countries ?? []).forEach(country => {
                           const key = `${app.userId}_${country}`;
                           if (conflictsMap.has(key)) {
                             const conf = conflictsMap.get(key)!;
                             appConflicts[country] = `Held at ${conf.eventName} on ${conf.date}`;
                           }
                        });

                        // Countries already assigned to OTHER applicants in this
                        // committee — ghost them so one country can't be given twice.
                        const takenCountries = (applicants[c.name] ?? [])
                          .filter(other => other.id !== app.id && other.assignedCountry)
                          .map(other => other.assignedCountry!);

                        return (
                          <CountryAssignmentRow
                            key={app.id}
                            applicant={app}
                            availableCountries={c.countries ?? []}
                            conflicts={appConflicts}
                            takenCountries={takenCountries}
                            onAssign={handleAssign}
                          />
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 p-4 rounded-lg border border-blue-200 dark:border-blue-900 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold mb-1">Conflict Detection System Active</p>
          <p>
            The system automatically cross-references an applicant's past events. If they are assigned a country they have represented before, a yellow conflict warning will appear.
          </p>
        </div>
      </div>
    </div>
  );
}
