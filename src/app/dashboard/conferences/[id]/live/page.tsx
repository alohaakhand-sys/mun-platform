"use client";

/**
 * Full-page Live MUN view for delegates — the same video-first, Google-Meet-style console the
 * chair sees, but with delegate-only controls (watch, raise a point / hand / speak request, cast a
 * vote, and broadcast when the chair gives them the floor). Standalone immersive route reached via
 * "Launch Live MUN" on the conference portal. The URL param may be an applicationId, so we resolve
 * the real event id + assigned committee from the delegate's application.
 *
 * Only an APPROVED application gets in, and only a delegate application debates: any other
 * approved role (observer, press, faculty advisor) gets the watch-only console, since every
 * floor action is a write the rules accept from a seated delegate alone.
 */
import { ensureMyMembership } from "@/lib/services/membershipService";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getUserApplications, ApplicationData } from "@/lib/services/applicationService";
import { getEventById, getCommitteeAgendas } from "@/lib/services/eventService";
import { sessionDateStr } from "@/lib/services/sessionDate";
import { Loader2 } from "lucide-react";
import { DelegateSessionConsole } from "@/components/session/DelegateSessionConsole";
import { WatchConsole } from "@/components/session/WatchConsole";
import { ConsoleScaffold } from "@/components/session/console/shared";
import { useRouteLiveGate, LiveGateScreen } from "@/components/session/gate/LiveGateScreen";
import type { ProjectorViewer } from "@/components/session/SessionProjector";

export default function DelegateLiveMunPage() {
  const params = useParams();
  const router = useRouter();
  const conferenceId = params.id as string;
  const { user, loading: authLoading } = useAuth();

  const [eventId, setEventId] = useState("");
  const [committee, setCommittee] = useState("");
  const [viewer, setViewer] = useState<ProjectorViewer | null>(null);
  // Committee agenda topics — only the top bar's fallback for sessions created before
  // `session.agenda` shipped. One extra read on mount; never written from here.
  const [agendas, setAgendas] = useState<string[]>([]);
  const [eventTitle, setEventTitle] = useState("");
  const [loading, setLoading] = useState(true);
  // Not approved yet (pending / waitlisted / rejected / withdrawn): no sitting to show.
  const [notApproved, setNotApproved] = useState(false);
  // Approved, but not as a delegate: watches instead of debating.
  const [watchOnly, setWatchOnly] = useState(false);

  const exitHref = useMemo(() => `/dashboard/conferences/${conferenceId}`, [conferenceId]);

  // The session id is keyed by committee + date, so this must match the chair's day exactly.
  // Resolved in the EVENT's timezone once the event loads; see `sessionDateStr`.
  const [today, setToday] = useState("");

  useEffect(() => {
    async function load() {
      if (!user || !conferenceId) return;
      const apps = await getUserApplications(user.uid);
      // A re-application leaves the withdrawn one behind on the same event, so prefer the approved.
      const matches = apps.filter(a => (a as any).id === conferenceId || a.eventId === conferenceId);
      const app: ApplicationData | undefined = matches.find(a => a.status === "approved") || matches[0];
      if (!app) { router.push("/dashboard"); return; }
      if (app.status !== "approved") { setNotApproved(true); setLoading(false); return; }
      setWatchOnly(!/delegate/i.test(app.role || ""));
      // The live read rules check a membership marker; make sure ours exists before the console
      // subscribes (a listener denied once is never retried).
      await ensureMyMembership(app.eventId);
      const committeeName = app.assignedCommittee || app.choices?.primary?.committee || "";
      setEventId(app.eventId);
      setCommittee(committeeName);
      // Non-blocking: a failed/empty read just means the top bar leans on session.agenda alone,
      // and the session day falls back to the viewer's local date.
      let timeZone: string | undefined;
      try {
        const ev = await getEventById(app.eventId);
        timeZone = ev?.timeZone;
        setEventTitle(ev?.title || "");
        const c = ev?.committees?.find((x) => x.name === committeeName);
        setAgendas(c ? getCommitteeAgendas(c) : []);
      } catch { /* leave agendas empty */ }
      setToday(sessionDateStr(timeZone));
      setViewer({
        delegateId: user.uid,
        country: app.assignedCountry || "",
        applicationId: (app as any).id || "",
      });
      setLoading(false);
    }
    if (!authLoading && user) load();
    else if (!authLoading && !user) setLoading(false);
  }, [user, authLoading, conferenceId, router]);

  // ENTRY GATE — two things must be true before a delegate sees a sitting: the organizer opened
  // Live MUN for the conference, and this committee's chair gavelled in today. Both are watched,
  // so a delegate waiting here is let straight in the moment either one lands.
  const { verdict: gateVerdict, control: gateControl } = useRouteLiveGate({
    eventId,
    role: "delegate",
    committee,
    dateStr: today,
    ready: !loading && !!eventId && !!committee && !!today,
  });

  if (notApproved) {
    return (
      <ConsoleScaffold exitHref={exitHref} title="Live MUN" subtitle="Not open to you yet">
        <div className="max-w-md mx-auto text-center py-24 px-6">
          <p className="font-semibold">Your application isn&rsquo;t approved yet</p>
          <p className="text-sm text-muted-foreground mt-1.5">
            Live sessions open once the organizer approves your application and places you in a committee.
          </p>
        </div>
      </ConsoleScaffold>
    );
  }

  if (loading || authLoading || !eventId || !viewer || !today) {
    // ConsoleScaffold, not a bare div: it reads the same stored `mun-live-theme` the console does,
    // so entering a light console no longer flashes a full-screen dark frame first.
    return (
      <ConsoleScaffold exitHref={exitHref} title="Live MUN" subtitle="Connecting…">
        <div className="flex justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </ConsoleScaffold>
    );
  }

  if (gateVerdict.kind !== "pass") {
    return (
      <LiveGateScreen
        verdict={gateVerdict}
        control={gateControl}
        eventId={eventId}
        eventTitle={eventTitle}
        exitHref={exitHref}
      />
    );
  }

  if (watchOnly) {
    return (
      <WatchConsole
        mode="watch"
        eventId={eventId} committeeId={committee} dateStr={today} eventTitle={eventTitle}
        exitHref={exitHref} myUid={viewer.delegateId}
      />
    );
  }

  return (
    <DelegateSessionConsole
      eventId={eventId}
      committeeId={committee}
      dateStr={today}
      viewer={viewer}
      committeeName={committee || "Live MUN"}
      exitHref={exitHref}
      agendas={agendas}
      userName={user?.displayName || ""}
    />
  );
}
