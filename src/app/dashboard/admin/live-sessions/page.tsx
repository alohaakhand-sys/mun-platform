"use client";

/**
 * App-admin monitor of every live committee session across all events. Polls the admin
 * API every 10s (client can't run a cross-event collectionGroup listener under the rules),
 * shows who's in each session, and lets an admin force-stop one (→ phase "closed", which
 * also ends the Agora video for everyone) or wipe one back to an empty sitting for testing.
 * That reset lives HERE, not in the chair console: it deletes the day's motions, points,
 * requests, votes, participation and markings, so no chair or organizer may hold it, and
 * dashboard/layout.tsx keeps an App Admin off the chair console anyway.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { auth } from "@/lib/firebase/client";
import { logAudit } from "@/lib/services/auditService";
import { resetSessionDev } from "@/lib/services/sessionService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCountryName } from "@/lib/data/countries";
import {
  Radio, Users, Mic, RefreshCw, Square, Building2, Calendar, Loader2, AlertTriangle, Eye, RotateCcw,
} from "lucide-react";

interface AdminSession {
  eventId: string;
  sessionId: string;
  eventTitle: string;
  committeeId: string;
  dateStr: string;
  phase: string;
  presentCount: number;
  totalDelegates: number;
  presentCountries: string[];
  onStageCount: number;
  currentSpeaker: string;
  updatedAtMs: number;
  createdAtMs: number;
}

// Each poll costs one Firestore read per session doc in the project, against a 50k/day cap.
// 60s (and only while the tab is visible) keeps a left-open monitor tab from eating the day's
// quota; the server caches each scan for the same window, so extra admins are free.
const POLL_MS = 60_000;

// Deep link into the ghost observer. Carries committee NAME + date, never the sessionId:
// makeSessionId collapses "/" to "_", so a name with a slash can't be recovered from the id.
function observeHref(s: AdminSession): string {
  const q = new URLSearchParams({
    eventId: s.eventId, committee: s.committeeId, date: s.dateStr, title: s.eventTitle || "",
  });
  return `/dashboard/admin/live-sessions/observe?${q.toString()}`;
}

async function adminFetch(path: string, init?: RequestInit) {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    (err as any).quotaExceeded = body?.quotaExceeded === true;
    throw err;
  }
  return body;
}

export default function AdminLiveSessionsPage() {
  const { authorized, profile, loading: guardLoading } = useAdminGuard();
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once the backend reports quota exhaustion — stops the poll for the rest of the day
  // (manual Refresh still works, in case the daily reset has since passed).
  const [halted, setHalted] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch("/api/admin/live-sessions");
      setSessions(data.sessions || []);
      setError(data.stale ? "Firestore read quota exhausted — showing the last snapshot." : null);
      setHalted(data.quotaExceeded === true);
    } catch (e) {
      const quota = (e as any)?.quotaExceeded === true;
      setError(
        quota
          ? "Firestore daily read quota exhausted. Resets at midnight US/Pacific."
          : e instanceof Error ? e.message : "Failed to load sessions",
      );
      // Back off on any failure — a broken backend polled every minute burns quota for nothing.
      setHalted(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized || halted) return;
    load();
    const tick = () => { if (document.visibilityState === "visible") load(); };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [authorized, halted, load]);

  const manualRefresh = useCallback(() => { setHalted(false); load(); }, [load]);

  const forceStop = async (s: AdminSession) => {
    if (!confirm(`Force-stop “${s.committeeId}” in ${s.eventTitle}?\n\nControls lock and everyone's live video ends immediately.`)) return;
    setClosing(s.sessionId);
    try {
      await adminFetch("/api/admin/live-sessions", {
        method: "POST",
        body: JSON.stringify({ eventId: s.eventId, sessionId: s.sessionId }),
      });
      if (profile) {
        await logAudit({
          actorUid: profile.uid,
          actorEmail: profile.email || "",
          actorRole: profile.role,
          action: "session_force_closed",
          targetType: "session",
          targetId: s.sessionId,
          targetName: `${s.committeeId} · ${s.eventTitle}`,
        }).catch(() => {});
      }
      await load();
    } catch (e) {
      console.error("force stop", e);
      alert("Failed to stop the session.");
    } finally {
      setClosing(null);
    }
  };

  const resetSession = async (s: AdminSession) => {
    if (!confirm(`Reset “${s.committeeId}” (${s.dateStr}) in ${s.eventTitle}?

Test tool: every motion, point, request, vote, roll call, speakers list and the day's markings for this sitting are permanently deleted.`)) return;
    setResetting(s.sessionId);
    try {
      await resetSessionDev(s.eventId, s.sessionId, s.committeeId, s.dateStr);
      if (profile) {
        await logAudit({
          actorUid: profile.uid,
          actorEmail: profile.email || "",
          actorRole: profile.role,
          action: "session_reset",
          targetType: "session",
          targetId: s.sessionId,
          targetName: `${s.committeeId} · ${s.eventTitle}`,
        }).catch(() => {});
      }
      await load();
    } catch (e) {
      console.error("reset session", e);
      alert("Failed to reset the session.");
    } finally {
      setResetting(null);
    }
  };

  if (guardLoading || !authorized) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <Radio className="w-7 h-7 text-primary" /> Live Sessions
          </h1>
          <p className="text-muted-foreground mt-1">Every committee session running right now, across all events.</p>
          <p className="text-xs text-muted-foreground/80 mt-1">Observing is silent — participants see no indicator. Each join is written to the audit log.</p>
        </div>
        <Button variant="outline" onClick={manualRefresh} className="gap-2 shrink-0">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {error && (
        <Card className="glass-card border-amber-500/30">
          <CardContent className="py-3 px-4 flex items-start gap-2.5 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">{error}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Auto-refresh paused. Use Refresh to retry.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : sessions.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Radio className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-semibold text-foreground">No sessions running</p>
            <p className="text-sm mt-1">Live committee sessions show up here as chairs start them.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{sessions.length} running · auto-refreshes every 60s while this tab is open</p>
          {sessions.map((s) => (
            <Card key={`${s.eventId}/${s.sessionId}`} className="glass-card">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold truncate">{s.committeeId || "Committee"}</span>
                    <Badge className="bg-primary/10 text-primary uppercase text-[10px] tracking-wide">{(s.phase || "").replace(/_/g, " ")}</Badge>
                    {s.onStageCount > 0 && (
                      <Badge className="bg-red-500 text-white gap-1 text-[10px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> On air
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {s.eventTitle}</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {s.dateStr}</span>
                    <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {s.presentCount}/{s.totalDelegates} present</span>
                    {s.currentSpeaker && (
                      <span className="inline-flex items-center gap-1 text-primary font-medium">
                        <Mic className="w-3.5 h-3.5" /> {getCountryName(s.currentSpeaker) || s.currentSpeaker}
                      </span>
                    )}
                  </div>
                  {s.presentCountries.length > 0 && (
                    <p className="text-[11px] text-muted-foreground/80 mt-1.5 line-clamp-1">
                      {s.presentCountries.map((c) => getCountryName(c) || c).join(", ")}
                    </p>
                  )}
                </div>
                {/* Two buttons, no card-wide click target — Force stop is destructive and sits
                    right here. A registry entry can be thin, and an observe link without both
                    committee and date resolves to no session, so gate on them. `noopener` is
                    load-bearing: with an opener set, the projector board's Exit link closes the
                    window instead of navigating back here. */}
                <div className="flex items-center gap-2 shrink-0">
                  {s.committeeId && s.dateStr ? (
                    <Button
                      variant="outline"
                      nativeButton={false}
                      render={<a href={observeHref(s)} target="_blank" rel="noopener noreferrer" />}
                      className="gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                      title="Watch this session silently — the chair and delegates are not told"
                    >
                      <Eye className="w-4 h-4" /> Observe
                    </Button>
                  ) : (
                    <Button variant="outline" disabled className="gap-2" title="This session has no committee/date on record">
                      <Eye className="w-4 h-4" /> Observe
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="gap-2 text-red-600 border-red-500/30 hover:bg-red-500/10 hover:text-red-600"
                    onClick={() => forceStop(s)}
                    disabled={closing === s.sessionId}
                  >
                    {closing === s.sessionId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                    Force stop
                  </Button>
                  {s.committeeId && s.dateStr && (
                    <Button
                      variant="ghost"
                      className="gap-2 text-muted-foreground hover:text-red-600"
                      onClick={() => resetSession(s)}
                      disabled={resetting === s.sessionId}
                      title="Test tool: wipe this sitting's motions, points, roll call, lists and markings"
                    >
                      {resetting === s.sessionId ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      Reset
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
