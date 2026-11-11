"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getApplicationsByEvent, updateApplication, isAwaitingPayment, getAppCommitteePreferences, ApplicationData } from "@/lib/services/applicationService";
import { getEventById, EventData } from "@/lib/services/eventService";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, Filter, CheckCircle, XCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApplicationDetailSidebar } from "@/components/features/organizer/ApplicationDetailSidebar";

type AppWithId = ApplicationData & { id: string };

// The applications review workflow (search/filter, approve/reject, detail sidebar).
// Used as a tab inside the Allocation page.
export function ApplicationsTable() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();

  const [applications, setApplications] = useState<AppWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedApp, setSelectedApp] = useState<AppWithId | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!user || !eventId) return;
      const [apps, eventData] = await Promise.all([
        getApplicationsByEvent(eventId),
        getEventById(eventId)
      ]);
      setApplications(apps as AppWithId[]);
      setEvent(eventData);
      setLoading(false);
    }
    loadData();
  }, [user, eventId]);

  const handleUpdateStatus = async (appId: string, newStatus: "approved" | "rejected") => {
    // Approving places the delegate (committee + country), so it happens in the detail panel.
    if (newStatus === "approved") {
      const app = applications.find((a) => a.id === appId);
      if (app) setSelectedApp(app);
      return;
    }
    await updateApplication(appId, { status: newStatus });
    setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, status: newStatus } : a));
    if (selectedApp?.id === appId) {
      setSelectedApp((prev) => prev ? { ...prev, status: newStatus } : prev);
    }
  };

  const handleRowClick = (app: AppWithId) => {
    setSelectedApp(app);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }

  const filteredApps = applications.filter((a) => {
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    const searchString = `${a.applicantName} ${a.applicantEmail}`.toLowerCase();
    const matchesSearch = searchString.includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const statusColor = (s: string) =>
    s === "approved" ? "default" : s === "rejected" ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <div className="w-full">
        {/* Main table */}
        <div className="w-full">
          <Card className="glass-card overflow-hidden">
            <CardHeader className="bg-secondary border-b border-border/50 py-4 px-6">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search applicants..."
                    className="pl-9 bg-background"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
                    <SelectTrigger className="w-[140px] bg-background">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">all</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Applicant</th>
                    <th className="px-6 py-4 font-semibold">Role</th>
                    <th className="px-6 py-4 font-semibold">Pref. Committee</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredApps.map((app) => (
                    <tr
                      key={app.id}
                      className={`transition-colors cursor-pointer ${
                        selectedApp?.id === app.id
                          ? "bg-primary/5 border-l-4 border-l-primary"
                          : "hover:bg-secondary"
                      }`}
                      onClick={() => handleRowClick(app)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                            {(app.applicantName || app.role)[0]?.toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{app.applicantName || "Unknown Delegate"}</span>
                            <span className="text-xs text-muted-foreground">{app.applicantEmail || "No email"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">{app.role}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {(() => {
                          const prefs = getAppCommitteePreferences(app);
                          if (prefs.length === 0) return "N/A";
                          return (
                            <span>
                              {prefs[0].committee}
                              {prefs.length > 1 && (
                                <span className="ml-1.5 text-xs text-primary font-medium">+{prefs.length - 1}</span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={statusColor(app.status)} className="capitalize">
                            {app.status}
                          </Badge>
                          {isAwaitingPayment(app, event) && app.status !== "rejected" && (
                            <Badge variant="outline" className="gap-1 text-[10px] text-amber-600 border-amber-500/30 bg-amber-500/10">
                              <Clock className="w-3 h-3" /> Awaiting payment
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {app.status !== "approved" && (
                            isAwaitingPayment(app, event) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                                title="Applicant must pay before approval"
                                className="text-muted-foreground"
                              >
                                <Clock className="w-4 h-4 mr-1" /> Unpaid
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-500 border-green-500/20 hover:bg-green-500/10 hover:text-green-600"
                                onClick={() => handleUpdateStatus(app.id, "approved")}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" /> Approve
                              </Button>
                            )
                          )}
                          {app.status !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleUpdateStatus(app.id, "rejected")}
                            >
                              <XCircle className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredApps.length === 0 && (
                <div className="py-16 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No applications found matching your filters.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <ApplicationDetailSidebar
        application={selectedApp}
        event={event}
        applications={applications}
        onClose={() => setSelectedApp(null)}
        onStatusUpdate={(appId, newStatus, assignedCommittee, assignedCountry) => {
          setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, status: newStatus, assignedCommittee, assignedCountry } : a));
          setSelectedApp((prev) => prev && prev.id === appId ? { ...prev, status: newStatus, assignedCommittee, assignedCountry } : prev);
        }}
      />
    </div>
  );
}
