"use client";

/**
 * Compact "Raise a point" trigger — a single button that opens a popover of the four
 * point types (Order / Information / Personal Privilege / Parliamentary Inquiry) and
 * raises the chosen one straight into the session's `points` queue.
 *
 * This is the quick control surfaced on the delegate's live video card. The richer flow
 * (optional note + directing a Point of Information at the current speaker) still lives in
 * the full `DelegatePointBar` panel below the video — this popover deliberately keeps it to
 * one tap. Reuses the same `raisePoint` service + the ≥3-pending soft anti-spam guard.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  raisePoint, subscribeMyPoints, POINT_META,
  type ParticipationIdentity, type PointType, type RaisedPoint, type ProxyAttribution,
} from "@/lib/services/sessionService";
import type { DelegateCapabilities } from "@/lib/services/floorGate";
import { cn } from "@/lib/utils";
import { Hand, Gavel, ShieldAlert, Info, HelpCircle, Lock } from "lucide-react";

const TYPES: { id: PointType; icon: React.ElementType; cls: string }[] = [
  { id: "order", icon: Gavel, cls: "hover:border-red-500/40 hover:bg-red-500/5" },
  { id: "information", icon: Info, cls: "hover:border-blue-500/40 hover:bg-blue-500/5" },
  { id: "personal_privilege", icon: ShieldAlert, cls: "hover:border-amber-500/40 hover:bg-amber-500/5" },
  { id: "parliamentary_inquiry", icon: HelpCircle, cls: "hover:border-violet-500/40 hover:bg-violet-500/5" },
];

export function RaisePointMenu({
  eventId, sessionId, identity, className, proxy, caps,
}: {
  eventId: string;
  sessionId: string;
  identity: ParticipationIdentity;
  className?: string;
  /** When set, the point is raised ON BEHALF of `identity`'s delegation by this vice-chair. */
  proxy?: ProxyAttribution;
  /**
   * `capabilitiesFor(session, identity.delegateId)`, when the caller has it. OPTIONAL, and omitting
   * it keeps the pre-existing behaviour: this component's only consumer is the vice-chair's
   * Represent panel, where the operator is proxying for a delegation and is entitled to see the
   * same closure the delegate would. Parity with `DelegatePointBar`'s prop of the same name.
   */
  caps?: DelegateCapabilities;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<RaisedPoint[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    () => subscribeMyPoints(eventId, sessionId, identity.delegateId, setMine),
    [eventId, sessionId, identity.delegateId]
  );

  const pendingCount = useMemo(() => mine.filter((p) => p.status === "pending").length, [mine]);
  const atLimit = pendingCount >= 3; // soft anti-spam: max 3 outstanding, parity with DelegatePointBar
  const shut = !!caps && !caps.canRaisePoint;
  const shutReason = caps?.lockReason.canRaisePoint || "The chair has closed the floor to points.";

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const raise = async (type: PointType) => {
    if (shut || busy || atLimit) return;
    setBusy(true);
    try {
      await raisePoint(eventId, sessionId, identity, type, "", "", proxy);
      setOpen(false);
    } catch (e) {
      console.error("raisePoint", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors",
          open ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 hover:bg-secondary/50",
        )}
      >
        <Hand className="w-4 h-4" /> Raise a point
        {pendingCount > 0 && (
          <span className="ml-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold inline-flex items-center justify-center">
            {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 bottom-[calc(100%+6px)] z-20 rounded-xl bg-card text-foreground border border-border/70 shadow-lg shadow-primary/10 dark:shadow-xl p-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {/* Same sentence, same source, as every other closed-floor surface. */}
          {shut && (
            <p className="flex items-start gap-1.5 px-2 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-[1px]" aria-hidden /> {shutReason}
            </p>
          )}
          {TYPES.map(({ id, icon: Icon, cls }) => {
            const meta = POINT_META[id];
            return (
              <button
                key={id}
                type="button"
                disabled={shut || busy || atLimit}
                title={shut ? shutReason : undefined}
                onClick={() => raise(id)}
                className={cn(
                  "flex items-start gap-2 w-full p-2.5 rounded-lg border border-transparent text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  cls,
                )}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight">{meta.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {meta.canInterrupt ? "May interrupt" : "Wait to be recognized"}
                  </span>
                </span>
              </button>
            );
          })}
          {!shut && atLimit && (
            <p className="px-2 py-1.5 text-[11px] text-amber-600">
              Several points pending — wait for the chair before raising more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
