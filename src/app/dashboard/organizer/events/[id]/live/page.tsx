"use client";

/**
 * Organizer Live Control — the switch that decides whether the conference is running, plus the
 * two ceremonies the organizer hosts themselves.
 *
 * ONE-TIME, NOT DAILY. "Open committee sessions" is turned on once at the start of a conference
 * and left on: chairs gavel their own sitting in each day, so there is nothing here to repeat
 * every morning. Turning it off is for after the conference, or to stop everything at once.
 *
 * The running-sessions table is a ONE-SHOT read with an explicit Refresh, not a listener. This
 * page can sit open on a projector for eight hours, and a live listener over every committee's
 * hot doc would spend the whole Spark daily read budget on a table nobody is watching
 * ([[spark-plan-read-budget]]).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  Radio, Sparkles, Loader2, RefreshCw, Users, ExternalLink, Lock, CheckCircle2, StopCircle,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { getEventById, EventData } from "@/lib/services/eventService";
import {
  ensureLiveControl, subscribeLiveControl, setSessionsOpen, setLiveControlNote,
  startCeremony, endCeremony, setCeremonyTitle, ceremonyLabel,
  type CeremonyKind, type EventLiveControl,
} from "@/lib/services/liveControlService";
import { closeStaleSitting, type LiveSession } from "@/lib/services/sessionService";
import { sessionDateStr } from "@/lib/services/sessionDate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface RunningSession {
  id: string;
  committeeId: string;
  dateStr: string;
  phase: string;
  present: number;
  onStage: number;
}

export default function OrganizerLiveControlPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();
  const staffRole = useEventStaffRole(eventId);

  const [event, setEvent] = useState<EventData | null>(null);
  const [control, setControl] = useState<EventLiveControl | null | undefined>(undefined);
  const [sessions, setSessions] = useState<RunningSession[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);

  const canManage = staffRole.isOrganizerLevel;

  useEffect(() => {
    getEventById(eventId).then(setEvent).catch(() => {});
  }, [eventId]);

  // Seed the doc on first visit so the gate has something to read, then watch it — this page is
  // the one place where a live control doc is worth a listener.
  useEffect(() => {
    if (!eventId || staffRole.loading) return;
    if (canManage) ensureLiveControl(eventId).catch((e) => console.error("ensureLiveControl", e));
    const unsub = subscribeLiveControl(eventId, setControl);
    return () => unsub();
  }, [eventId, canManage, staffRole.loading]);

  useEffect(() => {
    if (control && !noteDirty) setNote(control.note || "");
  }, [control, noteDirty]);

  const loadSessions = useCallback(async () => {
    setRefreshing(true);
    try {
      // Open sittings only: every closed day ever held would otherwise cost a read per Refresh.
      const snap = await getDocs(query(collection(db, "events", eventId, "sessions"), where("phase", "!=", "closed")));
      const rows: RunningSession[] = [];
      snap.forEach((d) => {
        // Ceremonies live in this collection too, under reserved ids — they have their own card.
        if (d.id.startsWith("__ceremony__")) return;
        const s = d.data() as LiveSession;
        if (s.finalized || s.phase === "closed") return;
        const attendance = s.attendance || {};
        rows.push({
          id: d.id,
          committeeId: s.committeeId || "—",
          dateStr: s.dateStr || "",
          phase: s.phase || "lobby",
          present: Object.values(attendance).filter(
            (a: any) => a?.status === "present" || a?.status === "present_and_voting",
          ).length,
          onStage: (s.live?.stage || []).length,
        });
      });
      rows.sort((a, b) => a.committeeId.localeCompare(b.committeeId));
      setSessions(rows);
    } catch (e) {
      console.error("loadSessions", e);
      setSessions([]);
    } finally {
      setRefreshing(false);
    }
  }, [eventId]);

  // The event's own today: a row from an earlier day is a sitting nobody closed, not a live one.
  const today = sessionDateStr(event?.timeZone);
  const closeLeftover = async (s: RunningSession) => {
    if (!confirm(`Close the ${s.committeeId} sitting from ${s.dateStr}? It was never closed. Its record and marks stay as they are.`)) return;
    setBusy(`close:${s.id}`);
    try {
      await closeStaleSitting(eventId, s.id);
      await loadSessions();
    } catch (e) {
      console.error("closeStaleSitting", e);
      alert("Couldn't close that sitting.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { console.error(`[live-control] ${key}`, e); }
    finally { setBusy(null); }
  };

  if (staffRole.loading || control === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <Card className="glass-card">
        <CardContent className="py-16 text-center text-muted-foreground">
          <Lock className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Organizers only</p>
          <p className="text-sm">Only the event owner or a co-organizer can control Live MUN.</p>
        </CardContent>
      </Card>
    );
  }

  const open = !!control?.sessionsOpen;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading flex items-center gap-2">
          <Radio className="w-6 h-6 text-primary" /> Live MUN Control
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {event?.title || "This conference"} — open the floor, run the ceremonies.
        </p>
      </div>

      {/* ── The gate ─────────────────────────────────────────────────────── */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                open ? "bg-emerald-500/15 text-emerald-600" : "bg-secondary text-muted-foreground"
              }`}>
                {open ? <CheckCircle2 className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">Committee sessions</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {open
                    ? "Open — chairs can gavel in and delegates can join their committee."
                    : "Closed — nobody can enter Live MUN. Chairs and delegates see a notice instead."}
                </p>
                <p className="text-xs text-muted-foreground/80 mt-2">
                  Turn this on once at the start of your conference. Chairs open their own sitting
                  each day, so you don&apos;t need to do this daily.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {busy === "gate" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={open}
                disabled={busy === "gate"}
                onCheckedChange={(v) => run("gate", () => setSessionsOpen(eventId, v, user?.uid || ""))}
              />
            </div>
          </div>

          {/* Running now */}
          <div className="mt-5 pt-4 border-t border-border/60">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Users className="w-4 h-4 text-muted-foreground" /> Sittings running now
              </p>
              <Button variant="ghost" size="sm" className="gap-1.5" disabled={refreshing}
                onClick={() => void loadSessions()}>
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
            {sessions === null ? (
              <Skeleton className="h-12 w-full" />
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">
                No committee is in session right now.
              </p>
            ) : (
              <div className="space-y-1.5">
                {sessions.map((s) => {
                  const leftover = !!s.dateStr && s.dateStr < today;
                  return (
                    <div key={s.id}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary px-3 py-2">
                      {leftover ? (
                        <span className="inline-flex rounded-full h-2 w-2 shrink-0 bg-muted-foreground/40" />
                      ) : (
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                      )}
                      <span className="font-medium text-sm truncate flex-1">{s.committeeId}</span>
                      {leftover ? (
                        <Badge variant="outline">Not closed</Badge>
                      ) : (
                        <>
                          <Badge variant="secondary" className="capitalize">{s.phase.replace(/_/g, " ")}</Badge>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {s.present} present · {s.onStage} on air
                          </span>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground/70 hidden sm:inline">{s.dateStr}</span>
                      {leftover ? (
                        canManage && (
                          <Button variant="ghost" size="sm" className="gap-1.5" disabled={busy === `close:${s.id}`}
                            onClick={() => void closeLeftover(s)}>
                            {busy === `close:${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                            Close
                          </Button>
                        )
                      ) : (
                        // Organizer and co-organizer pass the chair console's gate for any committee.
                        <Button variant="ghost" size="sm" className="gap-1.5" nativeButton={false}
                          render={<Link href={`/dashboard/chair/committee/${eventId}/live?committee=${encodeURIComponent(s.committeeId)}`} />}>
                          <ExternalLink className="w-3.5 h-3.5" /> Enter
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Ceremonies ───────────────────────────────────────────────────── */}
      {(["opening", "closing"] as CeremonyKind[]).map((kind) => (
        <CeremonyCard
          key={kind}
          kind={kind}
          eventId={eventId}
          state={control?.[kind]}
          busy={busy === kind}
          onStart={(title) => run(kind, () => startCeremony(eventId, kind, user?.uid || "", title))}
          onEnd={() => run(kind, () => endCeremony(eventId, kind))}
          onRename={(title) => run(`${kind}-title`, () => setCeremonyTitle(eventId, kind, title))}
        />
      ))}

      {/* ── Note shown in the gate notice ────────────────────────────────── */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Message to participants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Shown inside the notice chairs and delegates get when Live MUN isn&apos;t open yet.
            Leave it blank for none.
          </p>
          <div className="flex gap-2">
            <Input
              value={note}
              placeholder="e.g. Sessions begin at 10:00 after the opening ceremony."
              onChange={(e) => { setNote(e.target.value); setNoteDirty(true); }}
            />
            <Button
              disabled={!noteDirty || busy === "note"}
              onClick={() => run("note", async () => {
                await setLiveControlNote(eventId, note.trim());
                setNoteDirty(false);
              })}
            >
              {busy === "note" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CeremonyCard({
  kind, eventId, state, busy, onStart, onEnd, onRename,
}: {
  kind: CeremonyKind;
  eventId: string;
  state?: EventLiveControl["opening"];
  busy: boolean;
  onStart: (title: string) => void;
  onEnd: () => void;
  onRename: (title: string) => void;
}) {
  const fallback = ceremonyLabel(kind);
  const [title, setTitle] = useState(state?.title || fallback);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setTitle(state?.title || fallback); }, [state?.title, fallback, dirty]);

  const status = state?.status || "idle";
  const live = status === "live";

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              live ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
            }`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold truncate">{state?.title || fallback}</p>
                {live && (
                  <Badge className="bg-red-500/15 text-red-600 border-red-500/20 hover:bg-red-500/15">
                    LIVE
                  </Badge>
                )}
                {status === "ended" && <Badge variant="secondary">Ended</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                You host. Everyone else watches — no chat, no floor unless you give it to them.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            {live ? (
              <>
                <Button variant="outline" className="gap-1.5"
                  render={<Link href={`/dashboard/ceremony/${eventId}?kind=${kind}`} />}
                  nativeButton={false}>
                  <ExternalLink className="w-4 h-4" /> Enter room
                </Button>
                <Button variant="destructive" className="gap-1.5" disabled={busy} onClick={onEnd}>
                  <StopCircle className="w-4 h-4" /> End
                </Button>
              </>
            ) : (
              <Button className="gap-1.5" disabled={busy} onClick={() => onStart(title.trim() || fallback)}>
                <Radio className="w-4 h-4" /> {status === "ended" ? "Start again" : "Start ceremony"}
              </Button>
            )}
          </div>
        </div>

        {!live && (
          <div className="flex gap-2 mt-4">
            <Input
              value={title}
              placeholder={fallback}
              onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            />
            <Button variant="outline" disabled={!dirty}
              onClick={() => { onRename(title.trim() || fallback); setDirty(false); }}>
              Rename
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
