"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, EventData } from "@/lib/services/eventService";
import { resolveComplaint, escalateComplaint, rejectComplaint } from "@/lib/services/complaintService";
import { db } from "@/lib/firebase/client";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import { AlertTriangle, Loader2, CheckCircle2, ArrowUpCircle, XCircle, User, Clock } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { ComplaintData } from "@/lib/services/complaintService";

export default function OrganizerComplaintsPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();

  const [event, setEvent] = useState<EventData | null>(null);
  const [complaints, setComplaints] = useState<ComplaintData[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolutionText, setResolutionText] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"active" | "resolved">("active");

  useEffect(() => {
    async function loadData() {
      if (!user || !eventId) return;
      const eventData = await getEventById(eventId);
      if (!eventData) {
        router.push("/dashboard/organizer");
        return;
      }
      setEvent(eventData);

      // We load complaints assigned to the current user
      const q = query(
        collection(db, "complaints"),
        where("eventId", "==", eventId),
        where("assignedTo", "==", user.uid)
      );
      const snap = await getDocs(q);
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as ComplaintData));
      
      // Sort by creation desc in memory
      loaded.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setComplaints(loaded);
      setLoading(false);
    }
    loadData();
  }, [user, eventId, router]);

  const handleResolve = async (complaint: ComplaintData) => {
    if (!complaint.id) return;
    const res = resolutionText[complaint.id] || "";
    await resolveComplaint(complaint.id, res, user!.uid, complaint.assignedRole);
    setComplaints(prev => prev.map(c => 
      c.id === complaint.id ? { ...c, status: "resolved", resolution: res } : c
    ));
  };

  const handleEscalate = async (complaint: ComplaintData) => {
    if (!complaint.id) return;
    const reason = resolutionText[complaint.id] || `Escalated by ${complaint.assignedRole}.`;
    await escalateComplaint(complaint.id, complaint.escalationLevel, reason, user!.uid, complaint.assignedRole);
    
    // Once escalated, it is no longer assigned to this user. We could remove it or update its status.
    setComplaints(prev => prev.filter(c => c.id !== complaint.id));
  };

  const handleReject = async (complaint: ComplaintData) => {
    if (!complaint.id) return;
    const reason = resolutionText[complaint.id] || `Rejected by ${complaint.assignedRole}.`;
    await rejectComplaint(complaint.id, reason, user!.uid, complaint.assignedRole);
    setComplaints(prev => prev.map(c => 
      c.id === complaint.id ? { ...c, status: "rejected" } : c
    ));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeComplaints = complaints.filter(c => c.status === "open" || c.status === "escalated" || c.status === "under_review");
  const resolvedComplaints = complaints.filter(c => c.status === "resolved" || c.status === "rejected");
  const displayList = tab === "active" ? activeComplaints : resolvedComplaints;

  return (
    <div className="space-y-8 pb-20">
      <div>
        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 mb-2">Organizer Hub</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Complaint Escalations</h1>
        <p className="text-muted-foreground mt-1">Review and manage complaints escalated to your level.</p>
      </div>

      <Card className="glass-card overflow-hidden">
        <CardHeader className="bg-secondary border-b border-border/50">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary" /> Escalated Complaints
              {activeComplaints.length > 0 && (
                <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">{activeComplaints.length}</Badge>
              )}
            </CardTitle>
            <SegmentedTabs
              layoutId="eventComplaintsTab"
              value={tab}
              onChange={(v) => setTab(v as "active" | "resolved")}
              items={[
                { id: "active", label: "Active", icon: AlertTriangle, count: activeComplaints.length },
                { id: "resolved", label: "Resolved", icon: CheckCircle2, count: resolvedComplaints.length },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {displayList.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No {tab} complaints found.</p>
            </div>
          ) : (
            displayList.map(complaint => (
              <div key={complaint.id} className="border border-border/50 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="uppercase text-[10px] tracking-wider">{complaint.type}</Badge>
                      <Badge variant="outline" className={`text-xs ${complaint.status === "resolved" ? "text-green-500" : complaint.status === "rejected" ? "text-red-500" : "text-yellow-500"}`}>
                        {complaint.status}
                      </Badge>
                    </div>
                    <h3 className="font-bold text-lg">{complaint.subject}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {complaint.createdAt?.toDate?.()?.toLocaleDateString() || "Unknown"}
                  </span>
                </div>

                <div className="bg-secondary rounded-lg p-3 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">Description:</p>
                  {complaint.description}
                </div>

                {/* History Timeline */}
                {complaint.history && complaint.history.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">History</p>
                    <div className="space-y-2">
                      {complaint.history.map((h, i) => (
                        <div key={i} className="flex gap-2 text-sm border-l-2 border-primary/20 pl-3 py-1">
                          <div>
                            <span className="font-semibold capitalize">{h.actorRole}</span>{" "}
                            <span className="text-muted-foreground">({h.action})</span>
                            <p className="text-xs text-muted-foreground mt-0.5">{h.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === "active" && (
                  <div className="pt-2 space-y-3">
                    <Textarea
                      placeholder="Enter resolution or reason for escalation/rejection..."
                      value={resolutionText[complaint.id!] || ""}
                      onChange={e => setResolutionText({ ...resolutionText, [complaint.id!]: e.target.value })}
                    />
                    <AiTextareaAssist
                      value={resolutionText[complaint.id!] || ""}
                      onPick={(t) => setResolutionText({ ...resolutionText, [complaint.id!]: t })}
                      surface="complaint-resolution"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <Button className="gap-2 bg-green-600 hover:bg-green-700 flex-1" onClick={() => handleResolve(complaint)}>
                        <CheckCircle2 className="w-4 h-4" /> Resolve
                      </Button>
                      <Button variant="outline" className="gap-2 flex-1 border-primary/20 text-primary hover:bg-primary/10" onClick={() => handleEscalate(complaint)}>
                        <ArrowUpCircle className="w-4 h-4" /> Escalate {complaint.assignedRole === "mainOrganizer" ? "to Admin" : "to Main Org"}
                      </Button>
                      <Button variant="outline" className="gap-2 flex-1 border-red-500/20 text-red-500 hover:bg-red-500/10" onClick={() => handleReject(complaint)}>
                        <XCircle className="w-4 h-4" /> Reject
                      </Button>
                    </div>
                  </div>
                )}
                
                {complaint.resolution && (
                  <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-lg text-sm text-green-700">
                    <strong>Resolution:</strong> {complaint.resolution}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
