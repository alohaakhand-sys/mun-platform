"use client";

/**
 * Button-level Live MUN gate — the modal a chair or delegate gets when they press
 * "Launch Live MUN" before the conference is actually running.
 *
 * App chrome, so this is the app-theme `ui/dialog`, NOT the console `ConsoleModal`. The
 * route-level twin (`LiveGateScreen`) is the console-theme one; see [[live-console-theme-scoping]].
 *
 * READ COST. `launch()` does one `getLiveControl` read, plus one session read for a delegate.
 * No listener is held for the common case. The single exception is a "your chair hasn't started"
 * modal while it is OPEN: it subscribes, so the moment the chair gavels in the modal turns into
 * an "Enter Live MUN" button under the reader's eyes instead of asking them to retry.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, Loader2, CalendarClock, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getLiveControl, type EventLiveControl } from "@/lib/services/liveControlService";
import { getSession, makeSessionId, subscribeSession } from "@/lib/services/sessionService";
import { resolveLiveGate, liveGateCopy, type LiveGateVerdict } from "./liveGate";

export interface LaunchLiveOpts {
  eventId: string;
  /** Where to go when the gate passes. */
  href: string;
  role: "chair" | "delegate";
  committee?: string;
  /** YYYY-MM-DD in the EVENT's timezone — must match what the console will compute. */
  dateStr?: string;
  eventTitle?: string;
  /** Organizer / co-organizer / App Admin — straight through. */
  bypass?: boolean;
}

interface GateState {
  verdict: LiveGateVerdict;
  control: EventLiveControl | null;
  opts: LaunchLiveOpts;
}

/**
 * Drop-in for any "Launch Live MUN" control:
 *
 *   const { launch, checking, gate } = useLiveMunGate();
 *   <Button onClick={() => launch({...})} />
 *   {gate}
 */
export function useLiveMunGate() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<GateState | null>(null);

  const launch = useCallback(async (opts: LaunchLiveOpts) => {
    if (opts.bypass) { router.push(opts.href); return; }
    setChecking(true);
    try {
      const control = await getLiveControl(opts.eventId);
      // Only a delegate can be stopped by gate 2, so only a delegate pays for the second read.
      let session = undefined;
      if (control?.sessionsOpen && opts.role === "delegate" && opts.committee && opts.dateStr) {
        session = await getSession(opts.eventId, makeSessionId(opts.committee, opts.dateStr));
      }
      const verdict = resolveLiveGate({
        control, session, role: opts.role,
        committee: opts.committee, dateStr: opts.dateStr,
      });
      if (verdict.kind === "pass" || verdict.kind === "loading") { router.push(opts.href); return; }
      setState({ verdict, control, opts });
    } catch (e) {
      // A failed gate read must never strand someone outside their own session — the console
      // has its own gate and will stop them there if the conference really is shut.
      console.error("[liveGate] check failed", e);
      router.push(opts.href);
    } finally {
      setChecking(false);
    }
  }, [router]);

  const gate = state ? (
    <LiveGateDialog
      verdict={state.verdict}
      control={state.control}
      opts={state.opts}
      onClose={() => setState(null)}
    />
  ) : null;

  return { launch, checking, gate };
}

function LiveGateDialog({
  verdict, control, opts, onClose,
}: {
  verdict: LiveGateVerdict;
  control: EventLiveControl | null;
  opts: LaunchLiveOpts;
  onClose: () => void;
}) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);

  // Live-heal the "chair hasn't started" case only. One listener, only while this modal is up.
  const watching =
    verdict.kind === "committee_not_open" && !!opts.committee && !!opts.dateStr;
  useEffect(() => {
    if (!watching) return;
    const sessionId = makeSessionId(opts.committee!, opts.dateStr!);
    const unsub = subscribeSession(opts.eventId, sessionId, (s) => setOpened(!!s));
    return () => unsub();
  }, [watching, opts.eventId, opts.committee, opts.dateStr]);

  const copy = liveGateCopy(verdict, {
    eventId: opts.eventId, eventTitle: opts.eventTitle, control,
  });
  if (!copy) return null;

  const Icon = verdict.kind === "ceremony_only" ? Sparkles
    : verdict.kind === "committee_not_open" ? CalendarClock : Radio;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="w-11 h-11 rounded-xl bg-primary/12 text-primary flex items-center justify-center mb-1">
            {opened ? <Radio className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
          </div>
          <DialogTitle>
            {opened ? "Your chair just opened the session" : copy.title}
          </DialogTitle>
          <DialogDescription>
            {opened
              ? "The sitting is live now — you can go straight in."
              : copy.body}
          </DialogDescription>
        </DialogHeader>

        {!opened && copy.note && (
          <p className="text-sm rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-muted-foreground">
            {copy.note}
          </p>
        )}

        {!opened && watching && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Watching for your chair…
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {opened ? (
            <Button className="gap-2" onClick={() => router.push(opts.href)}>
              <Radio className="w-4 h-4" /> Enter Live MUN
            </Button>
          ) : copy.cta ? (
            <Button className="gap-2" onClick={() => router.push(copy.cta!.href)}>
              <Sparkles className="w-4 h-4" /> {copy.cta.label}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
