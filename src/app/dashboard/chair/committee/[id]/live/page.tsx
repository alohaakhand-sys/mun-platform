"use client";

/**
 * Full-page Live MUN route for chairs. A standalone immersive route (not a tab) — loads the event
 * roster + resolves the viewer's committee, then renders either the chair console or, under
 * `?view=projector`, the room-facing board. Both own the whole viewport; the dashboard layout
 * skips its shells for /live. Reached via "Launch Live MUN" on the committee hub overview.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { isExecBoardRole, roleLabel } from "@/lib/services/staffService";
import { getEventById, EventData, getMarkingMode, getCommitteeAgendas } from "@/lib/services/eventService";
import { getApplicationsByEvent, ApplicationData } from "@/lib/services/applicationService";
import { sessionDateStr } from "@/lib/services/sessionDate";
import { belongsToCommittee } from "@/lib/utils/committee";
import { db } from "@/lib/firebase/client";
import { collection, query, where, getDocs } from "firebase/firestore";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { ChairSessionConsole } from "@/components/session/ChairSessionConsole";
import { WatchConsole } from "@/components/session/WatchConsole";
import { SessionProjector } from "@/components/session/SessionProjector";
import { ConsoleScaffold } from "@/components/session/console/shared";
import { useRouteLiveGate, LiveGateScreen } from "@/components/session/gate/LiveGateScreen";

export default function ChairLiveMunPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const committeeParam = searchParams.get("committee");
  const isProjector = searchParams.get("view") === "projector";
  const staffRole = useEventStaffRole(eventId);

  const [event, setEvent] = useState<EventData | null>(null);
  const [delegates, setDelegates] = useState<ApplicationData[]>([]);
  const [committeeName, setCommitteeName] = useState("");
  const [viewerName, setViewerName] = useState("");
  const [viewerRole, setViewerRole] = useState("");
  const [loading, setLoading] = useState(true);
  const dateParam = searchParams.get("date");
  const [selectedDate, setSelectedDate] = useState(
    dateParam || format(new Date(), "yyyy-MM-dd")
  );

  // The session id is keyed by committee + date, so the chair and every delegate must agree on
  // the day. It is taken in the EVENT's timezone (see `sessionDateStr`); the local date above is
  // only the pre-load placeholder. Applied once, and never over a `?date=` deep link or a date
  // the chair picked by hand.
  const tzDateApplied = useRef(false);
  useEffect(() => {
    if (tzDateApplied.current || dateParam || !event?.timeZone) return;
    tzDateApplied.current = true;
    setSelectedDate(sessionDateStr(event.timeZone));
  }, [event, dateParam]);

  const exitHref = useMemo(
    () =>
      committeeParam
        ? `/dashboard/chair/committee/${eventId}?committee=${encodeURIComponent(committeeParam)}`
        : `/dashboard/chair/committee/${eventId}`,
    [eventId, committeeParam]
  );

  // The "Open projector view" launcher opens this route (projector mode) in a popup window.
  // Carry the session date so a popup opened on a non-today session shows the right day.
  // The committee's agenda topics. Seeds session.agenda on first start and backs the Flow Bar's
  // agenda step on sessions created before session.agenda existed. `event` is already loaded, so
  // this costs no extra fetch.
  const committeeAgendas = useMemo(() => {
    const c = event?.committees?.find((x) => x.name === committeeName);
    return c ? getCommitteeAgendas(c) : [];
  }, [event, committeeName]);

  const projectorHref = useMemo(() => {
    let base = `/dashboard/chair/committee/${eventId}/live?view=projector&date=${selectedDate}`;
    if (committeeParam) base += `&committee=${encodeURIComponent(committeeParam)}`;
    return base;
  }, [eventId, committeeParam, selectedDate]);

  useEffect(() => {
    async function load() {
      if (!user || !eventId) return;

      const [eventData, allApps] = await Promise.all([
        getEventById(eventId),
        getApplicationsByEvent(eventId),
      ]);
      if (!eventData) { router.push("/dashboard/chair"); return; }

      // Resolve which committee this viewer runs. Oversight roles may open any via ?committee=.
      const staffRef = collection(db, "events", eventId, "staff");
      const staffSnap = await getDocs(query(staffRef, where("uid", "==", user.uid)));
      const myStaffRole = !staffSnap.empty ? (staffSnap.docs[0].data().role || "") : "";
      const myStaffName = !staffSnap.empty ? (staffSnap.docs[0].data().name || "") : "";
      const myStaffCommittee = !staffSnap.empty ? (staffSnap.docs[0].data().committeeId || "") : "";
      // Oversight roles may open any committee via ?committee=, and so may event-wide staff (an
      // observer or faculty advisor with no committee on their staff doc): they watch, never run,
      // so the choice only decides what they look at.
      const canOversee =
        isExecBoardRole(myStaffRole) ||
        myStaffRole === "co-organizer" ||
        eventData.organizerId === user.uid ||
        (!staffSnap.empty && staffSnap.docs[0].data().inviteStatus === "accepted" && !myStaffCommittee);

      let name = "";
      if (committeeParam && canOversee) name = committeeParam;
      else if (!staffSnap.empty) name = staffSnap.docs[0].data().committeeId || "";
      if (!name) {
        const myApp = allApps.find(a => a.userId === user.uid && a.status === "approved");
        name = myApp?.assignedCommittee || myApp?.choices?.primary?.committee || "";
      }

      const committeeDelegates = allApps.filter(app =>
        /delegate/i.test(app.role || "") &&
        app.status === "approved" &&
        belongsToCommittee(app, name)
      );

      setEvent(eventData);
      setCommitteeName(name);
      setViewerName(myStaffName || user.displayName || "");
      setViewerRole(myStaffRole ? roleLabel(myStaffRole) : "");
      setDelegates(committeeDelegates);
      setLoading(false);
    }
    load();
  }, [user, eventId, committeeParam, router]);

  // EB control is scoped: a Director/USG assigned to one committee runs that one only, which is
  // exactly what the session rules allow (isEbOf in firestore.rules).
  const canControl = staffRole.isOrganizerLevel || staffRole.isExecBoardOf(committeeName) ||
    staffRole.isChairOf(committeeName) || staffRole.can("canMarkDelegates");
  /**
   * Who may read and answer delegates' PRIVATE chat. `canControl` minus `isExecBoard`, on purpose:
   * the `/chat` rule accepts exactly `canWriteMarking` (chair, vice-chair, organizer, co-organizer,
   * canMarkDelegates), and an EB overseer reading every delegation's private notes in every
   * committee they oversee is a wider grant than this feature was asked for. Widening `canControl`
   * here instead would hand them a composer whose every send is silently denied.
   */
  const canDais = staffRole.isOrganizerLevel ||
    staffRole.isChairOf(committeeName) || staffRole.can("canMarkDelegates");

  // ENTRY GATE. A chair cannot open a sitting before the organizer has opened Live MUN for the
  // conference — the same rule the "Launch Live MUN" button enforces, re-derived here because a
  // pasted URL skips that button. Organizer-level viewers pass so they can check their own setup.
  const { verdict: gateVerdict, control: gateControl } = useRouteLiveGate({
    eventId,
    // A viewer who can't run the sitting waits for it like a delegate: it must exist first.
    role: canControl ? "chair" : "delegate",
    committee: committeeName,
    dateStr: selectedDate,
    bypass: staffRole.isOrganizerLevel,
    // The role decides chair vs watch below, so nothing renders until it has loaded.
    ready: !loading && !staffRole.loading && !!eventId,
  });

  if (loading || staffRole.loading) {
    // ConsoleScaffold, so the gate is already on `mun-live-theme` — the theme the console behind it
    // uses. A loader on the APP theme would flip the whole screen on the way in.
    return (
      <ConsoleScaffold exitHref={exitHref} title="Live MUN" subtitle="Loading committee…">
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
        eventTitle={event?.title}
        exitHref={exitHref}
      />
    );
  }

  // Projector mode — read-only, room-facing board (opened in a popup from the console).
  // Rendered bare: the board owns the whole viewport and carries its own auto-hiding chrome, so
  // there is no shell around it. A permanent "Exit" bar projected at a committee for three hours
  // is operator UI in the audience's face.
  if (isProjector) {
    if (!committeeName) {
      return (
        <ConsoleScaffold exitHref={exitHref} title="Live MUN" subtitle="Projector">
          <div className="py-24 text-center text-muted-foreground text-sm">No committee assigned.</div>
        </ConsoleScaffold>
      );
    }
    return (
      <SessionProjector
        eventId={eventId}
        committeeId={committeeName}
        dateStr={selectedDate}
        exitHref={exitHref}
      />
    );
  }

  // Staff who belong to the committee without running it: a staff observer, a faculty advisor,
  // an Executive Board member outside their scope. The chair console would only tell them
  // "Waiting for the chair…" behind a wall of denied controls; they watch instead.
  if (!canControl) {
    return (
      <WatchConsole
        mode="watch"
        eventId={eventId} committeeId={committeeName} dateStr={selectedDate}
        eventTitle={event?.title || ""} exitHref={exitHref} myUid={user?.uid || ""}
      />
    );
  }

  return (
    <ChairSessionConsole
      eventId={eventId}
      committeeId={committeeName}
      dateStr={selectedDate}
      onDateChange={setSelectedDate}
      delegates={delegates}
      canControl={canControl}
      canDais={canDais}
      userId={user?.uid || ""}
      markingTemplates={event?.markingTemplates || []}
      markMode={getMarkingMode(event)}
      eventTitle={event?.title || ""}
      committeeName={committeeName || "Committee"}
      exitHref={exitHref}
      projectorHref={projectorHref}
      canActAsDelegate={staffRole.canActAsDelegate}
      userName={viewerName}
      userRole={viewerRole}
      agendas={committeeAgendas}
    />
  );
}
