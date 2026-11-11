"use client";

import { useEffect, useState } from "react";
import { ApplicationData, getApplicationsByEvent } from "@/lib/services/applicationService";
import { getMarkingsByCommittee, Marking } from "@/lib/services/markingService";
import { EventData } from "@/lib/services/eventService";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle, GraduationCap, Loader2, Clock, CheckCircle2, XCircle } from "lucide-react";

interface FacultyAdvisorPortalProps {
  event: EventData;
  myApplication: ApplicationData;
  advisorUid: string;
}

interface DelegateRow {
  app: ApplicationData & { id?: string };
  marking?: Marking;
  complaintCount: number;
}

export function FacultyAdvisorPortal({ event, myApplication, advisorUid }: FacultyAdvisorPortalProps) {
  const [rows, setRows] = useState<DelegateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!event.id) return;

      const allApps = await getApplicationsByEvent(event.id);
      const myInstitution = (myApplication as any).institution || "";

      const myDelegates = allApps.filter(app =>
        app.userId !== advisorUid &&
        app.role === "Delegate" &&
        app.status === "approved" &&
        (!myInstitution || (app as any).institution === myInstitution)
      ) as (ApplicationData & { id?: string })[];

      // Fetch complaints per delegate
      const complaintMap: Record<string, number> = {};
      await Promise.all(
        myDelegates.map(async (delegate) => {
          if (!delegate.userId) return;
          const q = query(
            collection(db, "complaints"),
            where("eventId", "==", event.id),
            where("userId", "==", delegate.userId)
          );
          const snap = await getDocs(q);
          complaintMap[delegate.userId] = snap.size;
        })
      );

      // Fetch markings per committee
      const uniqueCommittees = [...new Set(myDelegates.map(a => a.assignedCommittee || a.choices.primary.committee))];
      const allMarkings: Marking[] = [];
      for (const c of uniqueCommittees) {
        const marks = await getMarkingsByCommittee(event.id, c);
        allMarkings.push(...marks);
      }

      setRows(myDelegates.map(app => ({
        app,
        marking: allMarkings.find(m => m.delegateId === app.userId && (m.kind === "final" || m.id?.endsWith("__final"))),
        complaintCount: complaintMap[app.userId] || 0,
      })));
      setLoading(false);
    }
    load();
  }, [event.id, advisorUid, myApplication]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const statusIcon = (status: string) => {
    if (status === "approved") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    if (status === "rejected") return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return <Clock className="w-3.5 h-3.5 text-yellow-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6 flex items-center gap-4 border border-primary/20 bg-primary/5">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <GraduationCap className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Faculty Advisor View</h2>
          <p className="text-sm text-muted-foreground">
            Monitoring {rows.length} delegate{rows.length !== 1 ? "s" : ""} from your institution
          </p>
        </div>
      </div>

      <Card className="glass-card rounded-2xl overflow-hidden">
        <CardHeader className="bg-secondary border-b border-border/50">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            My Delegates
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium">No delegates found from your institution</p>
              <p className="text-sm mt-1">Delegates must have matching institution to appear here.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-secondary text-xs uppercase tracking-wider font-semibold text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-6 py-3">Delegate</th>
                  <th className="px-6 py-3">Committee</th>
                  <th className="px-6 py-3">Country</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Score</th>
                  <th className="px-6 py-3">Requests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map(({ app, marking, complaintCount }) => (
                  <tr key={app.userId} className="hover:bg-secondary transition-colors">
                    <td className="px-6 py-3">
                      <div>
                        <p className="font-medium text-sm">{app.applicantName || "Delegate"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{app.userId.slice(0, 8)}</p>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {app.assignedCommittee || app.choices.primary.committee || "—"}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {app.assignedCountry || app.choices.primary.country || "Pending"}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium capitalize">
                        {statusIcon(app.status)}
                        {app.status}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      {marking ? (
                        <span className="font-bold text-primary">{marking.finalScore ?? 0}/100</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not graded</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {complaintCount > 0 ? (
                        <Badge variant="outline" className="gap-1 text-xs border-yellow-500/30 text-yellow-600 bg-yellow-500/10">
                          <AlertTriangle className="w-3 h-3" />
                          {complaintCount}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
