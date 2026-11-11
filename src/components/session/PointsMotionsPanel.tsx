"use client";

/**
 * Points & Motions tool (mock 1g) — a Motions / Points tab switch, one at a time.
 *  - Motions tab: the on-the-floor motion queue + a "Log a motion" form.
 *  - Points tab:  the raised-points queue + a "Log a point" form.
 * Tab badges show the pending counts.
 */
import { useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import type { ParticipationIdentity, LiveSession } from "@/lib/services/sessionService";
import { MotionQueuePanel } from "./MotionQueuePanel";
import { PointsQueuePanel } from "./PointsQueuePanel";
import { MotionsLog } from "./MotionsLog";
import { cn } from "@/lib/utils";
import { MessageSquareText, HandMetal } from "lucide-react";

import type { Motion } from "@/lib/services/sessionService";

export function PointsMotionsPanel({
  eventId, sessionId, session, delegates, canControl, identityFor, userId,
  pendingMotions, pendingPoints, agendas = [], onStartModCaucus,
}: {
  eventId: string;
  sessionId: string;
  /** Live session doc — the Motions tab needs it for the "floor open to motions" header. */
  session: LiveSession;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  userId: string;
  pendingMotions: number;
  pendingPoints: number;
  /** Committee topics — `getAgenda`'s fallback, so the queue can tell an answered motion from a live one. */
  agendas?: string[];
  onStartModCaucus?: (m: Motion) => void;
}) {
  const [tab, setTab] = useState<"motions" | "points">("motions");
  const common = { eventId, sessionId, delegates, canControl, identityFor, userId };

  return (
    <div className="flex flex-col gap-3">
      {/* Tab switch */}
      <div className="inline-flex w-full rounded-[11px] bg-background border border-border p-[3px] gap-[3px]">
        <TabBtn active={tab === "motions"} onClick={() => setTab("motions")} icon={MessageSquareText} label="Motions" count={pendingMotions} tone="amber" />
        <TabBtn active={tab === "points"} onClick={() => setTab("points")} icon={HandMetal} label="Points" count={pendingPoints} tone="muted" />
      </div>

      {tab === "motions" ? (
        <div key="motions" className="flex flex-col gap-3 animate-in fade-in duration-200">
          <MotionQueuePanel {...common} session={session} agendas={agendas} onStartModCaucus={onStartModCaucus} />
          <MotionsLog only="motion" eventId={eventId} sessionId={sessionId} delegates={delegates} canControl={canControl} identityFor={identityFor} />
        </div>
      ) : (
        <div key="points" className="flex flex-col gap-3 animate-in fade-in duration-200">
          <PointsQueuePanel {...common} />
          <MotionsLog only="point" eventId={eventId} sessionId={sessionId} delegates={delegates} canControl={canControl} identityFor={identityFor} />
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active, onClick, icon: Icon, label, count, tone,
}: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string; count: number; tone: "amber" | "muted";
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn("flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs transition-colors",
        active ? "bg-secondary text-foreground font-bold" : "text-muted-foreground font-semibold hover:text-foreground")}>
      <Icon className="w-3.5 h-3.5" /> {label}
      {count > 0 && (
        <span className={cn("inline-flex items-center justify-center min-w-[17px] h-[17px] px-1.5 rounded-full text-[10px] font-bold",
          tone === "amber" ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")}>{count}</span>
      )}
    </button>
  );
}
