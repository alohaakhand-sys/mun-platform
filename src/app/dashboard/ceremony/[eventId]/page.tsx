"use client";

/**
 * The conference-wide ceremony room. ONE shared route for everybody — organizer, chairs,
 * delegates — because a ceremony is one room, unlike committee sittings which are per-committee
 * and therefore have a chair route and a delegate route.
 *
 * Chromeless: listed in the dashboard layout's `isLiveMun` regex so the sidebar/header shell is
 * skipped and the console owns the viewport.
 *
 * Access is enforced SERVER-SIDE by the Agora token route (accepted staff or an approved
 * application in this event; publisher only for the organizer or whoever is on `live.stage`).
 * This page only decides what to render: the room when the organizer has it live, a notice
 * otherwise.
 */
import { ensureMyMembership } from "@/lib/services/membershipService";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { getEventById } from "@/lib/services/eventService";
import {
  subscribeLiveControl, ceremonyLabel,
  type CeremonyKind, type EventLiveControl,
} from "@/lib/services/liveControlService";
import { ConsoleScaffold } from "@/components/session/console/shared";
import { CeremonyConsole } from "@/components/session/ceremony/CeremonyConsole";

export default function CeremonyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const kindParam = searchParams.get("kind");
  const kind: CeremonyKind = kindParam === "closing" ? "closing" : "opening";

  const { user, loading: authLoading } = useAuth();
  const staffRole = useEventStaffRole(eventId);
  const [control, setControl] = useState<EventLiveControl | null | undefined>(undefined);
  const [eventTitle, setEventTitle] = useState("");

  useEffect(() => {
    if (!eventId) return;
    getEventById(eventId).then((e) => setEventTitle(e?.title || "")).catch(() => {});
    const unsub = subscribeLiveControl(eventId, setControl);
    // The room's session doc is read under the live read rules: self-heal our marker first.
    void ensureMyMembership(eventId);
    return () => unsub();
  }, [eventId]);

  // The organizer's own exit goes back to the control page they started this from.
  const exitHref = staffRole.isOrganizerLevel
    ? `/dashboard/organizer/events/${eventId}/live`
    : "/dashboard";

  if (authLoading || control === undefined || staffRole.loading) {
    return (
      <ConsoleScaffold exitHref={exitHref} title={ceremonyLabel(kind)} subtitle="Connecting…">
        <div className="flex justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </ConsoleScaffold>
    );
  }

  if (!user) {
    return (
      <ConsoleScaffold exitHref="/login" title={ceremonyLabel(kind)}>
        <div className="py-24 text-center text-muted-foreground text-sm">
          Sign in to join the ceremony.
        </div>
      </ConsoleScaffold>
    );
  }

  const state = control?.[kind];
  const live = state?.status === "live";

  // Not live: there is no room to enter, for anyone. The organizer is not exempted — a room that
  // is open for the host but shut for everyone else is a room that looks broken from both sides.
  // They get the same notice with a way back to the switch that starts it.
  if (!live) {
    const host = staffRole.isOrganizerLevel;
    return (
      <ConsoleScaffold exitHref={exitHref} title={state?.title || ceremonyLabel(kind)} subtitle={eventTitle}>
        <div className="max-w-md mx-auto text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-primary/12 text-primary flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold font-heading">
            {state?.status === "ended"
              ? `${state.title || ceremonyLabel(kind)} has ended`
              : `${ceremonyLabel(kind)} hasn't started`}
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            {state?.status === "ended"
              ? "The organizer closed the room."
              : host
                ? "Start it from Live Control and the room opens for everyone."
                : "The organizer hasn't opened this room yet. It appears here the moment they do."}
          </p>
          <Link href={exitHref}
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            <ArrowLeft className="w-4 h-4" /> {host ? "Go to Live Control" : "Back"}
          </Link>
        </div>
      </ConsoleScaffold>
    );
  }

  return (
    <CeremonyConsole
      eventId={eventId}
      kind={kind}
      control={control || { eventId, sessionsOpen: false, opening: { status: "idle", title: ceremonyLabel("opening") }, closing: { status: "idle", title: ceremonyLabel("closing") } }}
      eventTitle={eventTitle}
      exitHref={exitHref}
    />
  );
}
