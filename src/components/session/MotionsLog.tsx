"use client";

import { useEffect, useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  logMotion, subscribeMotions,
  type MotionLogEntry, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SubCard, GroupLabel } from "./console/shared";
import { AiAssistBar } from "./ai/AiAssist";
import { Plus } from "lucide-react";

export function MotionsLog({
  eventId, sessionId, delegates, canControl, identityFor, only,
}: {
  eventId: string;
  sessionId: string;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  /** Restrict to one kind — used by the tabbed Points & Motions panel (mock 1g). */
  only?: "point" | "motion";
}) {
  const [kindState, setKind] = useState<"point" | "motion">("motion");
  const kind = only ?? kindState;
  const [label, setLabel] = useState("");
  const [byId, setById] = useState("");
  const [entries, setEntries] = useState<MotionLogEntry[]>([]);

  useEffect(() => subscribeMotions(eventId, sessionId, setEntries), [eventId, sessionId]);

  const shown = only ? entries.filter((e) => e.kind === only) : entries;
  const noun = only === "point" ? "point" : only === "motion" ? "motion" : "motion or point";

  const add = async () => {
    if (!label.trim()) return;
    const d = delegates.find((x) => x.userId === byId);
    await logMotion(
      eventId, sessionId,
      { kind, label: label.trim(), byDelegateId: byId || "", byCountry: d?.assignedCountry || "", outcome: "raised" },
      byId ? identityFor(byId) : undefined,
    );
    setLabel("");
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* @container, not `sm:` — in the ~376px tool panel a viewport breakpoint put all four
          controls on one line and squeezed the text input down to a few characters. */}
      {canControl && (
        <SubCard className="@container p-3.5 space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Log a {noun}</p>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              {!only && (
                <Select value={kind} onValueChange={(v) => setKind(v as "point" | "motion")}>
                  <SelectTrigger className="w-28 shrink-0 h-9 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="motion">Motion</SelectItem>
                    <SelectItem value="point">Point</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Input className="min-w-0 flex-1 h-9 bg-background"
                placeholder={kind === "point" ? "e.g. Point of order" : "e.g. Motion to open a 10-min mod caucus"} value={label}
                onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            </div>
            <AiAssistBar
              value={label}
              onPick={setLabel}
              field="vote_label"
              context={{ subject: `a ${kind} being logged by the chair` }}
              suggestLabel="Label ideas"
            />
            <div className="flex gap-2">
              <Select value={byId} onValueChange={(v) => setById(v || "")}>
                <SelectTrigger className="min-w-0 flex-1 h-9 bg-background"><SelectValue placeholder="By (optional)" /></SelectTrigger>
                <SelectContent>
                  {delegates.filter((d) => d.userId).map((d) => (
                    <SelectItem key={d.userId} value={d.userId}>{d.assignedCountry || d.applicantName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="h-9 gap-1.5 shrink-0" onClick={add} disabled={!label.trim()}><Plus className="w-4 h-4" /> Log</Button>
            </div>
          </div>
        </SubCard>
      )}

      {shown.length > 0 && (
        <>
          <GroupLabel count={shown.length}>Recent</GroupLabel>
          <div className="flex flex-col gap-[7px]">
            {shown.map((m) => (
              <SubCard key={m.id} className="flex items-center gap-2.5 px-2.5 py-2.5 text-sm">
                <span className={cn("px-1.5 py-1 rounded-md text-[8.5px] font-bold uppercase tracking-[0.05em] shrink-0",
                  m.kind === "point" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-primary/15 text-primary")}>{m.kind}</span>
                <span className="flex-1 min-w-0 truncate text-[11.5px] text-muted-foreground">{m.label}</span>
                {m.byCountry && <span className="text-[10.5px] text-muted-foreground shrink-0">{m.byCountry}</span>}
              </SubCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
