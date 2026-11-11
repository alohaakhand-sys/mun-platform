"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isAppAdminProfile } from "@/lib/utils/roles";
import { getAuditLogs, AuditLogEntry } from "@/lib/services/auditService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, ShieldAlert, Download, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { collection, query, orderBy, limit, onSnapshot, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { format } from "date-fns";

export default function AuditLogsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [realtime, setRealtime] = useState(false);
  const [filterAction, setFilterAction] = useState<string>("all");
  const [cursor, setCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const loadLogs = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const res = await getAuditLogs({
        pageSize: 50,
        cursor: reset ? null : cursor,
        filterByAction: filterAction !== "all" ? filterAction : undefined
      });
      setLogs(prev => reset ? res.logs : [...prev, ...res.logs]);
      setCursor(res.lastVisible);
      setHasMore(res.logs.length === 50);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [cursor, filterAction]);

  useEffect(() => {
    if (authLoading) return;
    if (!profile || !isAppAdminProfile(profile as any)) {
      router.push("/dashboard");
      return;
    }
    
    if (realtime) {
      // Realtime listener for last 50 logs (24h approx for demo)
      const logsRef = collection(db, "auditLogs");
      const q = query(logsRef, orderBy("timestamp", "desc"), limit(50));
      const unsub = onSnapshot(q, (snap) => {
        const newLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLogEntry));
        if (filterAction !== "all") {
          setLogs(newLogs.filter(l => l.action === filterAction));
        } else {
          setLogs(newLogs);
        }
      });
      setLoading(false);
      return () => unsub();
    } else {
      loadLogs(true);
    }
  }, [profile, authLoading, router, realtime, filterAction]);

  const exportCSV = () => {
    const headers = ["Timestamp", "Actor UID", "Actor Email", "Role", "Action", "Target Type", "Target ID", "Target Name"];
    const csvContent = [
      headers.join(","),
      ...logs.map(log => [
        log.timestamp?.toDate ? log.timestamp.toDate().toISOString() : "",
        log.actorUid,
        log.actorEmail || "",
        log.actorRole,
        log.action,
        log.targetType,
        log.targetId,
        `"${log.targetName || ""}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `audit_logs_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading && logs.length === 0) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground mt-1">Immutable record of critical system actions.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border px-3 py-1.5 rounded-xl bg-background">
            <div className={`w-2 h-2 rounded-full ${realtime ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
            <span className="text-sm font-medium">Live Monitoring</span>
            <Switch checked={realtime} onCheckedChange={setRealtime} className="ml-2" />
          </div>
          <Button variant="outline" onClick={exportCSV} className="gap-2"><Download className="w-4 h-4"/> Export CSV</Button>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-medium">Filter by Action:</span>
              <Select value={filterAction} onValueChange={(v) => setFilterAction(v ?? "all")}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="role_changed">Role Changed</SelectItem>
                  <SelectItem value="event_deleted">Event Deleted</SelectItem>
                  <SelectItem value="organizer_approved">Organizer Approved</SelectItem>
                  <SelectItem value="organizer_rejected">Organizer Rejected</SelectItem>
                  <SelectItem value="system_settings_updated">Settings Updated</SelectItem>
                  <SelectItem value="complaint_resolved_by_admin">Complaint Resolved</SelectItem>
                  <SelectItem value="complaint_escalated_by_admin">Complaint Escalated</SelectItem>
                  <SelectItem value="session_observed">Session Observed</SelectItem>
                  <SelectItem value="session_force_closed">Session Force-Stopped</SelectItem>
                  <SelectItem value="session_reset">Session Reset</SelectItem>
                  <SelectItem value="payment_mode_updated">Payment Mode Changed</SelectItem>
                  <SelectItem value="payout_marked_paid">Payout Paid</SelectItem>
                  <SelectItem value="payout_rejected">Payout Rejected</SelectItem>
                  <SelectItem value="event_plan_set">Event Plan Set</SelectItem>
                  <SelectItem value="upgrade_request_decided">Upgrade Request Decided</SelectItem>
                  <SelectItem value="event_status_changed">Event Published / Drafted</SelectItem>
                  <SelectItem value="payment_refunded">Payment Refunded</SelectItem>
                  <SelectItem value="user_overrides_set">Member Plan Settings</SelectItem>
                  <SelectItem value="user_disabled">Member Disabled</SelectItem>
                  <SelectItem value="user_enabled">Member Enabled</SelectItem>
                  <SelectItem value="user_deleted">Member Deleted</SelectItem>
                  <SelectItem value="complaint_reassigned_by_admin">Complaint Reassigned</SelectItem>
                  <SelectItem value="complaint_rejected_by_admin">Complaint Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!realtime && (
              <Button variant="ghost" size="sm" onClick={() => loadLogs(true)} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Refresh
              </Button>
            )}
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground border-y border-border/50">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Actor</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">Target</th>
                <th className="px-6 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">No audit logs found.</td>
                </tr>
              ) : logs.map(log => (
                <React.Fragment key={log.id}>
                  <tr className="hover:bg-secondary transition-colors group">
                    <td className="px-6 py-3 whitespace-nowrap text-muted-foreground">
                      {log.timestamp?.toDate ? format(log.timestamp.toDate(), "MMM d, HH:mm:ss") : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <div className="font-medium">{log.actorEmail || log.actorUid.slice(0,8)}</div>
                      <div className="text-xs text-muted-foreground capitalize">{log.actorRole}</div>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant="outline" className="font-mono bg-background">{log.action}</Badge>
                    </td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-xs uppercase tracking-wider text-muted-foreground">{log.targetType}</div>
                      <div className="truncate max-w-[200px]" title={log.targetName || log.targetId}>
                        {log.targetName || log.targetId}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {(log.before || log.after) && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : (log.id as string))}
                        >
                          {expandedLog === log.id ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {expandedLog === log.id && (log.before || log.after) && (
                    <tr className="bg-muted/30">
                      <td colSpan={5} className="px-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          {log.before && (
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-1">BEFORE</div>
                              <pre className="text-xs bg-background p-2 rounded border font-mono overflow-auto max-h-40">{log.before}</pre>
                            </div>
                          )}
                          {log.after && (
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-1">AFTER</div>
                              <pre className="text-xs bg-background p-2 rounded border font-mono overflow-auto max-h-40">{log.after}</pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!realtime && hasMore && logs.length > 0 && (
          <div className="p-4 border-t flex justify-center">
            <Button variant="outline" onClick={() => loadLogs(false)} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null} Load More
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
