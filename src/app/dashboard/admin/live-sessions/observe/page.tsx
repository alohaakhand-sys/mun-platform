"use client";

/**
 * App Admin GHOST OBSERVER — watch any live committee sitting, touch nothing, be seen by nobody.
 *
 * The monitor at ../page.tsx could only ever tell an admin THAT a session was running (and
 * force-stop it). This is the other half: entering one. The admin gets exactly two surfaces,
 * both read-only — the video stage everyone else sees, and the projector board — and no control
 * of any kind. Every action prop `LiveVideoRoom` accepts is deliberately not passed; each one
 * renders nothing when absent, so "no functionality" is enforced by omission rather than by a
 * disabled state the admin could be tempted to re-enable.
 *
 * WHY IT LIVES UNDER /dashboard/admin. `dashboard/layout.tsx` redirects any App Admin off every
 * path that isn't /dashboard/admin/*, so the chair and delegate live routes are unreachable for
 * them by construction. That same layout has been taught to render THIS path chromeless.
 *
 * THE GHOST CONTRACT — three independent layers, each sufficient on its own:
 *   1. RTC     — the client joins `mode: "live"` as audience, and Agora only reports a HOST to
 *                remote clients. An audience member fires no `user-joined`: no tile, no roster
 *                entry, no event, anywhere in the room.
 *   2. Server  — /api/agora/token refuses to mint a publisher token for an observer, so the
 *                promotion path is closed even against a tampered client.
 *   3. Client  — `observer` pins the Agora role for life (never setClientRole("host"), which
 *                WOULD fire user-joined) and skips the RTDB presence write, so no "joined" toast.
 * The join is audit-logged server-side in the token route — an admin with devtools can suppress
 * a client-side log, not that one.
 *
 * The surface itself is components/session/WatchConsole (mode "ghost"), shared with the
 * committee's watch-only viewers; this page is the admin guard and the link parsing.
 *
 * PARAMS ARE QUERY, NOT PATH. `committeeId` is a committee NAME that may contain "/", and
 * makeSessionId collapses "/" to "_" irreversibly — a link built from a sessionId could never
 * recover the name that subscribeSession and the Agora channel both need.
 */
import { Suspense, useEffect, useState } from "react";
import { ensureMyMembership } from "@/lib/services/membershipService";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { WatchConsole } from "@/components/session/WatchConsole";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";

const EXIT_HREF = "/dashboard/admin/live-sessions";

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[100dvh] items-center justify-center bg-background">{children}</div>;
}

export default function ObservePage() {
  // useSearchParams on a route with no dynamic segment needs a boundary or `next build` fails.
  return (
    <Suspense fallback={<FullScreen><Loader2 className="h-8 w-8 animate-spin text-primary" /></FullScreen>}>
      <ObserveView />
    </Suspense>
  );
}

function ObserveView() {
  // The layout redirect only bounces admins off non-admin paths — it does nothing to a
  // non-admin who guesses this URL. This is the client bounce; the token route is the real gate.
  const { authorized, loading: guardLoading } = useAdminGuard();
  const { user } = useAuth();
  const sp = useSearchParams();

  const eventId = sp.get("eventId") || "";
  const committeeId = sp.get("committee") || "";
  const dateStr = sp.get("date") || "";
  const eventTitle = sp.get("title") || "";
  // Arms this admin's presence-read mirror (/platformAdmins) before the room's presence is read.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!authorized || !user || !eventId) return;
    void ensureMyMembership(eventId).finally(() => setArmed(true));
  }, [authorized, user, eventId]);

  if (guardLoading || !authorized || !user || (eventId && !armed)) {
    return <FullScreen><Loader2 className="h-8 w-8 animate-spin text-primary" /></FullScreen>;
  }

  if (!eventId || !committeeId || !dateStr) {
    return (
      <FullScreen>
        <div className="text-center px-6">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
          <p className="font-semibold">Incomplete session link</p>
          <p className="text-sm text-muted-foreground mt-1">
            An observe link needs <code>eventId</code>, <code>committee</code> and <code>date</code>.
          </p>
          <a href={EXIT_HREF} className="inline-flex items-center gap-1.5 mt-5 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to live sessions
          </a>
        </div>
      </FullScreen>
    );
  }

  return (
    <WatchConsole
      mode="ghost"
      eventId={eventId} committeeId={committeeId} dateStr={dateStr} eventTitle={eventTitle}
      exitHref={EXIT_HREF} myUid={user.uid}
    />
  );
}
