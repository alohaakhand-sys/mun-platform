"use client";

/**
 * Delegate control to raise a Point (Order / Information / Personal Privilege /
 * Parliamentary Inquiry) live from their own device, plus a list of their own raises
 * this session with status (Pending / Recognized / Dismissed) and a cancel on pending.
 * Rendered inside the delegate projector when a viewer identity is known.
 *
 * ON THE `caps` PROP AND WHY IT MATTERS. Until it existed the only limiter here was a three-pending
 * soft cap, so a delegate could raise points through a locked floor, an adjourned committee and a
 * suspended session — while `capabilitiesFor().canRaisePoint`, which rules on exactly that, was
 * already being computed on every snapshot for its `proposableMotionTypes` and then discarded. The
 * `FloorCard` honoured it for its own promoted button; every other door into this component did not.
 * Firestore rules still accept the write (they check attendance, not phase — see the header of
 * `motionFloor.ts` on UI-only enforcement), so this is a truthfulness fix, not a security boundary.
 */
import { useEffect, useMemo, useState } from "react";
import {
  raisePoint, cancelPoint, subscribeMyPoints, POINT_META,
  type RaisedPoint, type ParticipationIdentity, type PointType, type LiveSession,
} from "@/lib/services/sessionService";
import type { DelegateCapabilities } from "@/lib/services/floorGate";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { AiAssistBar } from "./ai/AiAssist";
import { PanelCard } from "./console/shared";
import { Hand, Gavel, ShieldAlert, Info, HelpCircle, Check, X, Clock, Lock } from "lucide-react";

const TYPES: { id: PointType; icon: React.ElementType; cls: string }[] = [
  { id: "order", icon: Gavel, cls: "hover:border-red-500/40 hover:bg-red-500/5" },
  { id: "information", icon: Info, cls: "hover:border-blue-500/40 hover:bg-blue-500/5" },
  { id: "personal_privilege", icon: ShieldAlert, cls: "hover:border-amber-500/40 hover:bg-amber-500/5" },
  { id: "parliamentary_inquiry", icon: HelpCircle, cls: "hover:border-violet-500/40 hover:bg-violet-500/5" },
];

export function DelegatePointBar({
  eventId, sessionId, identity, currentSpeakerCountry, embedded, session, caps, agenda,
}: {
  eventId: string;
  sessionId: string;
  identity: ParticipationIdentity;
  currentSpeakerCountry?: string;
  /** Drop the outer glass-card + header when rendered inside a modal that supplies its own header. */
  embedded?: boolean;
  /** Live session doc — only used to give the AI assist real floor context. Optional. */
  session?: LiveSession | null;
  /**
   * What this delegate may do, from `capabilitiesFor`. OPTIONAL so the vice-chair proxy surfaces can
   * adopt it separately; omitted ⇒ the pre-existing behaviour, where only the pending cap applies.
   */
  caps?: DelegateCapabilities;
  /** Committee agenda line, if the parent page has it. Sharpens AI suggestions. */
  agenda?: string;
}) {
  const [note, setNote] = useState("");
  const [toSpeaker, setToSpeaker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<RaisedPoint[]>([]);

  useEffect(
    () => subscribeMyPoints(eventId, sessionId, identity.delegateId, setMine),
    [eventId, sessionId, identity.delegateId]
  );

  const pendingCount = useMemo(() => mine.filter((p) => p.status === "pending").length, [mine]);
  const speakerIsSelf = currentSpeakerCountry && currentSpeakerCountry === identity.country;
  // Absent `caps` keeps today's behaviour — see the prop doc.
  const shut = !!caps && !caps.canRaisePoint;
  const shutReason = caps?.lockReason.canRaisePoint || "The chair has closed the floor to points.";

  // Floor context for the AI assist — all already in memory, no extra listener.
  const aiContext = useMemo(() => ({
    committee: identity.committeeId,
    country: identity.country,
    phase: session?.phase,
    agenda,
    caucusTopic: session?.caucus?.topic || undefined,
  }), [identity.committeeId, identity.country, session?.phase, session?.caucus?.topic, agenda]);

  const raise = async (type: PointType) => {
    if (shut || busy || pendingCount >= 3) return;  // soft anti-spam: max 3 outstanding
    setBusy(true);
    try {
      const target = type === "information" && toSpeaker && currentSpeakerCountry && !speakerIsSelf
        ? currentSpeakerCountry : "";
      await raisePoint(eventId, sessionId, identity, type, note.trim(), target);
      setNote("");
      setToSpeaker(false);
    } catch (e) {
      console.error("raisePoint", e);
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className={cn("space-y-3", embedded ? "" : "p-4")}>
        {/* The reason, once, at the top — the same sentence the Floor Card and the Hand menu print,
            straight from `capabilitiesFor`, so a delegate never reads two accounts of one closure. */}
        {shut && (
          <p className="flex items-start gap-2 text-[12px] leading-snug rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-amber-700 dark:text-amber-400">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-[1.5px]" aria-hidden />
            <span>{shutReason}</span>
          </p>
        )}
        {/* Composing a note you cannot send is busywork, and the AI call behind it costs a request. */}
        {!shut && (
        <div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the chair…"
            maxLength={160}
            rows={2}
            className="w-full min-h-[60px] px-3 py-2 rounded-md border border-input bg-background text-sm resize-y placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <AiAssistBar
            className="mt-1.5"
            value={note}
            onPick={setNote}
            field="point_note"
            context={aiContext}
            suggestLabel="Note ideas"
          />
        </div>
        )}
        {!shut && currentSpeakerCountry && !speakerIsSelf && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
            <input type="checkbox" checked={toSpeaker} onChange={(e) => setToSpeaker(e.target.checked)} className="accent-primary" />
            Direct a Point of Information to the current speaker
            ({getCountryName(currentSpeakerCountry) || currentSpeakerCountry})
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(({ id, icon: Icon, cls }) => {
            const meta = POINT_META[id];
            return (
              <button
                key={id}
                type="button"
                disabled={shut || busy || pendingCount >= 3}
                title={shut ? shutReason : undefined}
                onClick={() => raise(id)}
                className={cn(
                  "flex items-start gap-2 p-3 rounded-xl border border-border/50 bg-secondary/10 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  cls
                )}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{meta.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {meta.canInterrupt ? "May interrupt" : "Wait to be recognized"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {/* Suppressed while shut — the closure above is the operative reason, and printing both
            gives one blocked action two explanations. */}
        {!shut && pendingCount >= 3 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">You have several points pending — wait for the chair before raising more.</p>
        )}

        {mine.length > 0 && (
          <div className="pt-2 border-t border-border/40 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Your points</p>
            {mine.slice(0, 6).map((p) => (
              <div key={p.id}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{POINT_META[p.type].short}</span>
                  {p.targetCountry && <span className="text-muted-foreground">→ {getCountryName(p.targetCountry) || p.targetCountry}</span>}
                  <span className="ml-auto flex items-center gap-1.5">
                    {p.status === "pending" && <><Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" /><span className="text-amber-600 dark:text-amber-400 font-semibold">Pending</span></>}
                    {p.status === "recognized" && <><Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /><span className="text-emerald-600 dark:text-emerald-400 font-semibold">Recognized</span></>}
                    {p.status === "dismissed" && <><X className="w-3 h-3 text-muted-foreground" /><span className="text-muted-foreground font-semibold">Dismissed</span></>}
                    {p.status === "pending" && (
                      <button onClick={() => p.id && cancelPoint(eventId, sessionId, p.id)} className="ml-1 text-muted-foreground hover:text-red-600 dark:hover:text-red-400" title="Withdraw">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                {/* Why the chair ruled that way — otherwise a dismissal is silent. */}
                {p.chairNote && (
                  <p className="text-[11px] text-muted-foreground italic mt-0.5">Chair: “{p.chairNote}”</p>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );

  if (embedded) return body;

  return (
    <PanelCard
      icon={Hand}
      title="Raise a Point"
      bodyClassName="p-0"
      actions={pendingCount > 0 ? <span className="text-xs text-muted-foreground">{pendingCount} pending</span> : undefined}
    >
      {body}
    </PanelCard>
  );
}
