"use client";

/**
 * Chair's live queue of delegate-raised points. Subscribes to the session's `points`
 * subcollection and shows pending raises sorted by procedural priority (Order &
 * Personal Privilege — the ones that may interrupt — first, then Information / Inquiry,
 * then by time). Chair recognizes (credits the raiser's participation) or dismisses.
 */
import { useEffect, useMemo, useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  subscribePoints, resolvePoint, POINT_META,
  type RaisedPoint, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { PanelEmpty, QueueRow, GroupLabel, ProxyChip, DismissWithReason, type PanelTone } from "./console/shared";
import { Hand, Check, X, ShieldAlert, Info, Gavel, HelpCircle, Zap } from "lucide-react";

export const TYPE_ICON = {
  order: Gavel,
  personal_privilege: ShieldAlert,
  information: Info,
  parliamentary_inquiry: HelpCircle,
} as const;

export const TYPE_TONE: Record<keyof typeof TYPE_ICON, PanelTone> = {
  order: "red",
  personal_privilege: "amber",
  information: "primary",
  parliamentary_inquiry: "violet",
};

function ago(createdAt: any): string {
  const secs = createdAt?.seconds ? Math.max(0, Math.floor(Date.now() / 1000 - createdAt.seconds)) : 0;
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  return `${m}m`;
}

export function PointsQueuePanel({
  eventId, sessionId, delegates, canControl, identityFor, userId,
}: {
  eventId: string;
  sessionId: string;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  userId: string;
}) {
  const [points, setPoints] = useState<RaisedPoint[]>([]);
  useEffect(() => subscribePoints(eventId, sessionId, setPoints), [eventId, sessionId]);

  const nameOf = (id: string) => delegates.find((d) => d.userId === id)?.applicantName || "";

  const pending = useMemo(
    () => points.filter((p) => p.status === "pending").sort((a, b) => {
      const pa = POINT_META[a.type].priority, pb = POINT_META[b.type].priority;
      if (pa !== pb) return pa - pb;
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    }),
    [points]
  );
  const resolved = useMemo(
    () => points.filter((p) => p.status !== "pending").slice(0, 6),
    [points]
  );

  const recognize = (p: RaisedPoint) =>
    canControl && resolvePoint(eventId, sessionId, p, "recognized", userId, identityFor(p.delegateId));
  // No identity passed on dismissal — deliberately no participation credit.
  const dismiss = (p: RaisedPoint, reason = "") =>
    canControl && resolvePoint(eventId, sessionId, p, "dismissed", userId, undefined, reason);

  return (
    <div className="flex flex-col gap-2.5">
      <GroupLabel count={pending.length}>Points queue</GroupLabel>
      {pending.length === 0 ? (
        <PanelEmpty icon={Hand}>No points raised right now.</PanelEmpty>
      ) : (
        pending.map((p) => {
          const meta = POINT_META[p.type];
          return (
            <QueueRow
              key={p.id}
              tone={TYPE_TONE[p.type]}
              icon={TYPE_ICON[p.type]}
              coloredTitle
              flag={p.country ? <CountryFlag code={p.country} size={26} /> : undefined}
              title={meta.label}
              time={`${ago(p.createdAt)} ago`}
              statusChip={(
                <>
                  {meta.canInterrupt && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide opacity-80">
                      <Zap className="w-2.5 h-2.5" /> interrupts
                    </span>
                  )}
                  {p.proxyBy && <ProxyChip name={p.proxyByName} />}
                </>
              )}
              meta={(
                <>
                  {getCountryName(p.country) || p.country || "Delegate"}
                  {nameOf(p.delegateId) ? ` · ${nameOf(p.delegateId)}` : ""}
                  {p.targetCountry ? ` → ${getCountryName(p.targetCountry) || p.targetCountry}` : ""}
                </>
              )}
              note={p.note && <p className="text-xs text-muted-foreground mt-0.5 italic">“{p.note}”</p>}
              actions={canControl && (
                // flex-wrap so DismissWithReason can take a full line for its reason input.
                <div className="flex flex-wrap items-center gap-2 w-full @lg:w-auto">
                  <Button size="sm" className="gap-1.5 h-8 flex-1 @lg:flex-none" onClick={() => recognize(p)}>
                    <Check className="w-3.5 h-3.5" /> Recognize
                  </Button>
                  <DismissWithReason onConfirm={(reason) => { dismiss(p, reason); }} />
                </div>
              )}
            />
          );
        })
      )}

      {resolved.length > 0 && (
        <div className="pt-2 mt-1 border-t border-border/40 space-y-1">
          {resolved.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              {p.status === "recognized"
                ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                : <X className="w-3 h-3 text-muted-foreground shrink-0" />}
              <span className="truncate">
                {POINT_META[p.type].short} · {getCountryName(p.country) || p.country || "Delegate"}
              </span>
              <span className={cn("ml-auto text-[10px] font-semibold uppercase", p.status === "recognized" ? "text-emerald-600 dark:text-emerald-400" : "")}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
