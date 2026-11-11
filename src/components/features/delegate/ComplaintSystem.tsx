"use client";

import { useState, useEffect } from "react";
import { ApplicationData } from "@/lib/services/applicationService";
import { submitComplaint } from "@/lib/services/complaintService";
import { EventData } from "@/lib/services/eventService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Loader2, Send, Clock, CheckCircle2, XCircle,
  User, ArrowUpCircle
} from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import { isChairTierRole } from "@/lib/services/staffService";
import { sameCommittee } from "@/lib/utils/committee";
import {
  collection, addDoc, query, where, getDocs, orderBy, serverTimestamp
} from "firebase/firestore";

interface ComplaintSystemProps {
  application: ApplicationData;
  event: EventData;
}

interface HistoryEntry {
  action: string;
  actorUid: string;
  actorRole: string;
  message: string;
  timestamp: any;
}

interface Complaint {
  id: string;
  type: string;
  subject: string;
  description: string;
  status: "open" | "under_review" | "escalated" | "resolved" | "rejected" | "pending";
  escalationLevel: number;
  assignedRole: "chair" | "organizer" | "mainOrganizer" | "appAdmin";
  history: HistoryEntry[];
  resolution?: string;
  createdAt: any;
}

const ESCALATION_STEPS = [
  { label: "Chair", role: "chair" },
  { label: "Organizer", role: "organizer" },
  { label: "Main Org", role: "mainOrganizer" },
  { label: "App Admin", role: "appAdmin" },
];

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  open: { label: "Open", icon: Clock, className: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20" },
  under_review: { label: "Under Review", icon: AlertTriangle, className: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  escalated: { label: "Escalated", icon: ArrowUpCircle, className: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  resolved: { label: "Resolved", icon: CheckCircle2, className: "text-green-500 bg-green-500/10 border-green-500/20" },
  rejected: { label: "Rejected", icon: XCircle, className: "text-red-500 bg-red-500/10 border-red-500/20" },
  pending: { label: "Pending", icon: Clock, className: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20" },
};

export function ComplaintSystem({ application, event }: ComplaintSystemProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [type, setType] = useState("general");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    async function fetchComplaints() {
      const appId = (application as any).id;
      if (!appId || !application.userId) { setLoading(false); return; }
      try {
        const q = query(
          collection(db, "complaints"),
          where("applicationId", "==", appId),
          where("userId", "==", application.userId)
        );
        const snapshot = await getDocs(q);
        const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Complaint));
        fetched.sort((a, b) => {
          const tA = a.createdAt?.toDate?.()?.getTime() || 0;
          const tB = b.createdAt?.toDate?.()?.getTime() || 0;
          return tB - tA;
        });
        setComplaints(fetched);
      } catch (error) {
        console.error("Error fetching complaints:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchComplaints();
  }, [application]);

  /**
   * The committee's chair, from the conference member list (staff with their committee). The
   * old query read other delegates' applications, which firestore.rules refuse, so every request
   * was stored with no handler and no chair ever saw it.
   */
  const findChairUid = async (): Promise<string | null> => {
    try {
      const committeeName = application.assignedCommittee || application.choices?.primary?.committee;
      const token = await auth.currentUser?.getIdToken();
      if (!committeeName || !event.id || !token) return null;
      const res = await fetch(`/api/events/${event.id}/members`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const { members = [] } = (await res.json()) as { members?: { uid: string; role?: string; committee?: string; isStaff?: boolean }[] };
      const chair = members.find((m) => m.isStaff && isChairTierRole(m.role) && sameCommittee(m.committee, committeeName));
      return chair?.uid || null;
    } catch { return null; }
  };

  const handleSubmit = async () => {
    if (!subject || !description) return;
    setSubmitting(true);

    try {
      const chairUid = await findChairUid();
      
      const newComplaint = await submitComplaint({
        eventId: event.id,
        applicationId: (application as any).id,
        userId: application.userId,
        type,
        subject,
        description,
        chairUid,
      });

      setComplaints([{
        ...newComplaint,
        createdAt: { toDate: () => new Date() },
      } as unknown as Complaint, ...complaints]);
      
      setSubject("");
      setDescription("");
      setType("general");
    } catch (error) {
      console.error("Error submitting complaint:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Submission Form */}
      <Card className="glass-card shadow-sm border-primary/10 lg:col-span-1 h-fit">
        <CardHeader className="bg-secondary border-b border-border/50 pb-6">
          <CardTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="w-5 h-5 text-primary" />
            New Request
          </CardTitle>
          <CardDescription>Submit an official request, complaint, or query.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v || "")}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Inquiry</SelectItem>
                <SelectItem value="academic">Academic / Chair</SelectItem>
                <SelectItem value="logistics">Logistics (Food, Transport)</SelectItem>
                <SelectItem value="complaint">Code of Conduct Complaint</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input placeholder="Brief subject" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Provide detailed information..."
              className="min-h-[120px]"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
            <AiTextareaAssist value={description} onPick={setDescription} surface="complaint" />
          </div>
          <Button
            className="w-full shadow-sm mt-4"
            disabled={!subject || !description || submitting}
            onClick={handleSubmit}
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
              : <><Send className="w-4 h-4 mr-2" /> Submit Request</>
            }
          </Button>
        </CardContent>
      </Card>

      {/* Complaints History */}
      <Card className="glass-card shadow-sm border-primary/10 lg:col-span-2">
        <CardHeader className="bg-secondary border-b border-border/50 pb-6">
          <CardTitle className="text-xl">Your Requests</CardTitle>
          <CardDescription>Track status and escalation of your submitted requests.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : complaints.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground bg-secondary rounded-xl border border-dashed border-border/50">
              <CheckCircle2 className="w-12 h-12 text-primary/40 mx-auto mb-3" />
              <p className="text-lg font-medium">No requests submitted</p>
              <p className="text-sm">You haven't filed any requests or complaints yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {complaints.map(complaint => {
                const statusCfg = statusConfig[complaint.status] || statusConfig.pending;
                const StatusIcon = statusCfg.icon;
                const level = complaint.escalationLevel ?? 0;

                return (
                  <div key={complaint.id} className="bg-secondary border border-border/50 rounded-2xl p-5 space-y-5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
                            {complaint.type}
                          </span>
                          <Badge variant="outline" className={`${statusCfg.className} gap-1 text-xs`}>
                            <StatusIcon className="w-3 h-3" /> {statusCfg.label}
                          </Badge>
                        </div>
                        <h4 className="font-bold text-base">{complaint.subject}</h4>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {complaint.createdAt?.toDate?.() instanceof Date
                          ? complaint.createdAt.toDate().toLocaleDateString()
                          : "Just now"}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground bg-background p-3 rounded-lg">
                      {complaint.description}
                    </p>

                    {/* Escalation Stepper */}
                    <div>
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">
                        Escalation Path
                      </p>
                      <div className="flex items-center gap-1">
                        {ESCALATION_STEPS.map((step, i) => (
                          <div key={step.role} className="flex items-center gap-1 flex-1">
                            <div className={`flex-1 flex flex-col items-center gap-1`}>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                                i < level ? "bg-primary border-primary text-primary-foreground"
                                : i === level ? "bg-primary/20 border-primary text-primary"
                                : "bg-secondary border-border/50 text-muted-foreground"
                              }`}>
                                {i + 1}
                              </div>
                              <span className={`text-[10px] font-medium text-center ${
                                i <= level ? "text-foreground" : "text-muted-foreground"
                              }`}>{step.label}</span>
                            </div>
                            {i < ESCALATION_STEPS.length - 1 && (
                              <div className={`h-0.5 flex-1 mb-4 rounded-full ${i < level ? "bg-primary" : "bg-border/50"}`} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resolution */}
                    {complaint.resolution && (
                      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3">
                        <p className="text-xs font-semibold text-green-600 mb-1">Resolution</p>
                        <p className="text-sm text-muted-foreground">{complaint.resolution}</p>
                      </div>
                    )}

                    {/* History Timeline */}
                    {(complaint.history || []).length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">
                          Activity Log
                        </p>
                        <div className="space-y-2">
                          {(complaint.history || []).map((entry, i) => (
                            <div key={i} className="flex items-start gap-3 text-sm">
                              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                                <User className="w-3 h-3 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium capitalize">{entry.actorRole}</span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-muted-foreground capitalize">{entry.action}</span>
                                </div>
                                {entry.message && entry.message !== "Complaint submitted." && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{entry.message}</p>
                                )}
                                {entry.timestamp && (
                                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                    {typeof entry.timestamp === "string"
                                      ? new Date(entry.timestamp).toLocaleString()
                                      : entry.timestamp?.toDate?.()?.toLocaleString() || ""}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
