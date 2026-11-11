"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, getDoc, query, where, doc, writeBatch, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { logAudit } from "@/lib/services/auditService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, ShieldCheck, Crown } from "lucide-react";
import { PlanEditorDialog } from "@/components/features/admin/PlanEditorDialog";
import type { UpgradeRequest } from "@/lib/data/eventPlan";

interface OrgApp { id: string; uid: string; displayName?: string; email?: string; organization?: string; experience?: string; }

export default function AdminApplicationsPage() {
  const { authorized, profile } = useAdminGuard();
  const [orgApps, setOrgApps] = useState<OrgApp[]>([]);
  const [requests, setRequests] = useState<(UpgradeRequest & { id: string })[]>([]);
  const [deciding, setDeciding] = useState<(UpgradeRequest & { id: string }) | null>(null);
  // The last 30 decided upgrade requests and organizer applications (history, not a full sweep).
  const [history, setHistory] = useState<{ upgrades: (UpgradeRequest & { id: string })[]; organizers: (OrgApp & { status?: string })[] }>({ upgrades: [], organizers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      try {
        const [orgSnap, proSnap] = await Promise.all([
          getDocs(query(collection(db, "organizerApplications"), where("status", "==", "pending"))),
          getDocs(query(collection(db, "upgradeRequests"), where("status", "==", "pending"))),
        ]);
        setOrgApps(orgSnap.docs.map(d => ({ id: d.id, ...d.data() } as OrgApp)));
        setRequests(proSnap.docs.map(d => ({ id: d.id, ...d.data() } as UpgradeRequest & { id: string })));
        const [upHist, orgHist] = await Promise.all([
          getDocs(query(collection(db, "upgradeRequests"), orderBy("createdAt", "desc"), limit(30))).catch(() => null),
          getDocs(query(collection(db, "organizerApplications"), where("status", "in", ["approved", "rejected"]), limit(30))).catch(() => null),
        ]);
        setHistory({
          upgrades: (upHist?.docs || []).map(d => ({ id: d.id, ...d.data() } as UpgradeRequest & { id: string })).filter(r => r.status !== "pending"),
          organizers: (orgHist?.docs || []).map(d => ({ id: d.id, ...d.data() } as OrgApp & { status?: string })),
        });
      } catch (err) {
        console.error("Error loading applications:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [authorized]);

  const audit = (action: string, targetId: string, targetName: string) => logAudit({
    actorUid: profile?.uid || "", actorEmail: profile?.email || "", actorRole: profile?.role || "",
    action, targetType: "user", targetId, targetName,
  });

  async function decideOrganizer(app: OrgApp, approve: boolean) {
    const batch = writeBatch(db);
    batch.update(doc(db, "users", app.uid), approve
      ? { role: "Organizer", organizerApplicationStatus: "approved" }
      : { organizerApplicationStatus: "rejected" });
    batch.update(doc(db, "organizerApplications", app.id), { status: approve ? "approved" : "rejected" });
    await batch.commit();
    await audit(approve ? "organizer_approved" : "organizer_rejected", app.uid, "Organizer Application");
    setOrgApps(prev => prev.filter(a => a.id !== app.id));
  }



  const ApproveReject = ({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) => (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" className="text-green-500 border-green-500/20 hover:bg-green-500/10 hover:text-green-600" onClick={onApprove}>
        <CheckCircle className="w-4 h-4 mr-1" /> Approve
      </Button>
      <Button variant="outline" size="sm" className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive" onClick={onReject}>
        <XCircle className="w-4 h-4 mr-1" /> Reject
      </Button>
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
        <p className="text-muted-foreground mt-1">Review organizer applications and event upgrade requests.</p>
      </div>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Organizer Applications</CardTitle>
          <CardDescription>Approve grants the Organizer role.</CardDescription>
        </CardHeader>
        {loading ? (
          <CardContent><Skeleton className="h-40 w-full rounded-xl" /></CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">Applicant</th>
                  <th className="px-6 py-4 hidden md:table-cell">Organization</th>
                  <th className="px-6 py-4 hidden lg:table-cell">Experience</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {orgApps.map(app => (
                  <tr key={app.id} className="hover:bg-secondary transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{app.displayName || "—"}</span>
                        <span className="text-xs text-muted-foreground">{app.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium hidden md:table-cell">{app.organization}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate hidden lg:table-cell">{app.experience}</td>
                    <td className="px-6 py-4 text-right">
                      <ApproveReject onApprove={() => decideOrganizer(app, true)} onReject={() => decideOrganizer(app, false)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orgApps.length === 0 && <div className="py-16 text-center text-muted-foreground text-sm">No pending organizer applications.</div>}
          </div>
        )}
      </Card>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Crown className="w-5 h-5" /> Upgrade requests</CardTitle>
          <CardDescription>Pro for an event, or more Free room. Approve sets that event&apos;s plan: its limits, features and fee.</CardDescription>
        </CardHeader>
        {loading ? (
          <CardContent><Skeleton className="h-40 w-full rounded-xl" /></CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">Event</th>
                  <th className="px-6 py-4 hidden sm:table-cell">Asks for</th>
                  <th className="px-6 py-4 hidden lg:table-cell">Why</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {requests.map(r => (
                  <tr key={r.id} className="hover:bg-secondary transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{r.eventTitle || r.eventId}</span>
                        <span className="text-xs text-muted-foreground">{r.organizerName || r.organizerId}{r.orgName ? ` · ${r.orgName}` : ""}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                        {r.kind === "pro" ? "Pro" : Object.entries(r.wanted || {}).map(([k, v]) => `${v} ${k}`).join(", ") || "More room"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate hidden lg:table-cell">{r.message || "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <Button size="sm" variant="outline" onClick={() => setDeciding(r)}>Review</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {requests.length === 0 && <div className="py-16 text-center text-muted-foreground text-sm">No pending upgrade requests.</div>}
          </div>
        )}
      </Card>
      <Card className="border-border/60 overflow-hidden">
        <CardHeader>
          <CardTitle>Recent decisions</CardTitle>
          <CardDescription>The last decided upgrade requests and organizer applications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.upgrades.length + history.organizers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing decided yet.</p>
          ) : (
            <>
              {history.upgrades.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-3 border rounded-lg p-3 text-sm">
                  <div>
                    <p className="font-medium">{r.eventTitle || r.eventId} · {r.kind === "pro" ? "Pro" : "More room"}</p>
                    <p className="text-xs text-muted-foreground">{r.organizerName || r.organizerId}{r.adminNote ? ` · ${r.adminNote}` : ""}</p>
                  </div>
                  <Badge variant="outline">{r.status === "approved" ? "Approved" : "Declined"}</Badge>
                </div>
              ))}
              {history.organizers.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 border rounded-lg p-3 text-sm">
                  <div>
                    <p className="font-medium">Organizer · {a.displayName || a.email || a.uid}</p>
                    <p className="text-xs text-muted-foreground">{a.organization || ""}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">{a.status}</Badge>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <PlanEditorDialog
        open={!!deciding}
        onOpenChange={(v) => { if (!v) setDeciding(null); }}
        eventId={deciding?.eventId || ""}
        eventTitle={deciding?.eventTitle}
        request={deciding}
        onSaved={() => {
          if (deciding) void audit("upgrade_request_decided", deciding.eventId, deciding.eventTitle || "Upgrade request");
          setRequests(prev => prev.filter(x => x.id !== deciding?.id));
        }}
      />
    </div>
  );
}
