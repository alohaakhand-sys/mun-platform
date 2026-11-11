"use client";

/**
 * Route-level Live MUN gate — what a deep link, a bookmark or a refresh hits.
 *
 * The button-level modal (`LiveGateDialog`) can be walked around by typing the URL, so the
 * same verdict is re-derived here before either console mounts. This is the console side of
 * the fence, so it wears the console theme (`ConsoleScaffold`, see [[live-console-theme-scoping]])
 * rather than the app dialog.
 *
 * UNLIKE the modal, this one SUBSCRIBES. Someone sitting on this screen is waiting for exactly
 * the thing it is watching — the organizer flipping the switch, or their chair gavelling in —
 * so the page lets them straight through when it happens instead of asking them to reload.
 * Both listeners die the moment the gate passes and the console takes over.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, CalendarClock, Sparkles, Loader2 } from "lucide-react";
import { ConsoleScaffold } from "@/components/session/console/shared";
import {
  subscribeLiveControl, type EventLiveControl,
} from "@/lib/services/liveControlService";
import { makeSessionId, subscribeSession, type LiveSession } from "@/lib/services/sessionService";
import { resolveLiveGate, liveGateCopy, type LiveGateVerdict } from "./liveGate";

/**
 * Resolves the gate for a live route and keeps resolving it. Returns `{ kind: "loading" }`
 * until the control doc has been read once — render a spinner on that, never a gate.
 */
export function useRouteLiveGate(input: {
  eventId: string;
  role: "chair" | "delegate";
  committee?: string;
  dateStr?: string;
  bypass?: boolean;
  /** False while the page is still resolving eventId/committee — holds the gate at "loading". */
  ready?: boolean;
}): { verdict: LiveGateVerdict; control: EventLiveControl | null } {
  const { eventId, role, committee, dateStr, bypass, ready = true } = input;
  const [control, setControl] = useState<EventLiveControl | null | undefined>(undefined);
  const [session, setSession] = useState<LiveSession | null | undefined>(undefined);

  useEffect(() => {
    if (!ready || !eventId || bypass) return;
    const unsub = subscribeLiveControl(eventId, setControl);
    return () => unsub();
  }, [ready, eventId, bypass]);

  // Only a delegate is gated on the chair, and only once the organizer's switch is on.
  const watchSession =
    ready && !bypass && role === "delegate" && !!control?.sessionsOpen && !!committee && !!dateStr;
  useEffect(() => {
    if (!watchSession) { setSession(undefined); return; }
    const unsub = subscribeSession(eventId, makeSessionId(committee!, dateStr!), setSession);
    return () => unsub();
  }, [watchSession, eventId, committee, dateStr]);

  if (bypass) return { verdict: { kind: "pass" }, control: control ?? null };
  if (!ready) return { verdict: { kind: "loading" }, control: null };

  const verdict = resolveLiveGate({ control, session, role, committee, dateStr });
  return { verdict, control: control ?? null };
}

export function LiveGateScreen({
  verdict, control, eventId, eventTitle, exitHref,
}: {
  verdict: LiveGateVerdict;
  control: EventLiveControl | null;
  eventId: string;
  eventTitle?: string;
  exitHref: string;
}) {
  const copy = liveGateCopy(verdict, { eventId, eventTitle, control });

  if (!copy) {
    return (
      <ConsoleScaffold exitHref={exitHref} title="Live MUN" subtitle="Connecting…">
        <div className="flex justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </ConsoleScaffold>
    );
  }

  const Icon = verdict.kind === "ceremony_only" ? Sparkles
    : verdict.kind === "committee_not_open" ? CalendarClock : Radio;

  return (
    <ConsoleScaffold exitHref={exitHref} title="Live MUN" subtitle={eventTitle}>
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-primary/12 text-primary flex items-center justify-center mx-auto mb-4">
          <Icon className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold font-heading">{copy.title}</h2>
        <p className="text-sm text-muted-foreground mt-1.5">{copy.body}</p>

        {copy.note && (
          <p className="text-sm rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 mt-4 text-muted-foreground text-left">
            {copy.note}
          </p>
        )}

        {copy.cta && (
          <Link
            href={copy.cta.href}
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-4 h-4" /> {copy.cta.label}
          </Link>
        )}

        <p className="text-xs text-muted-foreground/80 flex items-center justify-center gap-1.5 mt-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> This page opens itself when it&apos;s ready
        </p>
      </div>
    </ConsoleScaffold>
  );
}
