"use client";

import { useEffect, useState } from "react";
import { ApplicationData } from "@/lib/services/applicationService";
import { getMarkingsByCommittee, Marking } from "@/lib/services/markingService";
import { EventData } from "@/lib/services/eventService";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users2, Trophy, Loader2, CheckCircle2, Clock } from "lucide-react";

interface TeamDelegationSectionProps {
  event: EventData;
  myApplication: ApplicationData & { id?: string };
}

interface TeamMember {
  app: ApplicationData & { id?: string };
  marking?: Marking;
}

export function TeamDelegationSection({ event, myApplication }: TeamDelegationSectionProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const delegationId = (myApplication as any).delegationId as string | undefined;

  useEffect(() => {
    if (!delegationId || !event.id) { setLoading(false); return; }

    async function load() {
      const q = query(
        collection(db, "applications"),
        where("delegationId", "==", delegationId),
        where("eventId", "==", event.id)
      );
      const snap = await getDocs(q);
      const apps = snap.docs.map(d => ({ id: d.id, ...d.data() } as ApplicationData & { id?: string }));

      const committees = [...new Set(apps.map(a => a.assignedCommittee || a.choices.primary.committee))];
      const allMarkings: Marking[] = [];
      for (const c of committees) {
        if (c) allMarkings.push(...await getMarkingsByCommittee(event.id!, c));
      }

      setMembers(apps.map(app => ({
        app,
        marking: allMarkings.find(m => m.delegateId === app.userId && (m.kind === "final" || m.id?.endsWith("__final"))),
      })));
      setLoading(false);
    }
    load();
  }, [delegationId, event.id]);

  if (!delegationId) return null;

  const delegationName = (myApplication as any).delegationName as string | undefined;
  const isTeamHead = (myApplication as any).role === "team_head";

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading team...</span>
      </div>
    );
  }

  const totalScore = members.reduce((sum, m) => sum + (m.marking?.finalScore || 0), 0);
  const avgScore = members.length > 0 ? Math.round(totalScore / members.length) : 0;

  return (
    <Card className="glass-card rounded-2xl border-primary/10">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Users2 className="w-5 h-5 text-primary" />
          {delegationName || "My Team"}
          {isTeamHead && (
            <Badge className="ml-2 bg-primary/10 text-primary border-primary/20 text-xs">Team Head</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isTeamHead && members.some(m => m.marking) && (
          <div className="flex items-center gap-3 p-3 bg-secondary rounded-xl">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <div>
              <p className="text-xs text-muted-foreground">Team Average Score</p>
              <p className="font-bold text-lg">{avgScore} / 100</p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
              <tr>
                <th className="py-2 pr-4">Member</th>
                <th className="py-2 pr-4">Committee</th>
                <th className="py-2 pr-4">Country</th>
                {isTeamHead && <th className="py-2">Score</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {members.map(({ app, marking }) => {
                const isMe = app.userId === myApplication.userId;
                return (
                  <tr key={app.userId} className={isMe ? "font-semibold" : ""}>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {(app.applicantName || "D")[0]}
                        </div>
                        <span>{app.applicantName || "Delegate"}</span>
                        {isMe && <span className="text-[10px] text-muted-foreground">(you)</span>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {app.assignedCommittee || app.choices.primary.committee || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {app.assignedCountry || app.choices.primary.country || "Pending"}
                    </td>
                    {isTeamHead && (
                      <td className="py-2.5">
                        {marking
                          ? <span className="font-bold text-primary">{marking.finalScore ?? 0}/100</span>
                          : <span className="text-xs text-muted-foreground">Not graded</span>
                        }
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
