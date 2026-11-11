"use client";

/**
 * Speakers List panel for the redesigned chair console (wide layout only).
 *
 * Flat, room-clean cards matching the console design — the speaker TIMER and the
 * "Next speaker" action live in the Live dock, so this panel owns only: the speakers
 * queue (add / reorder / remove) + yield management for the current speaker.
 * On narrow screens the console falls back to the full GslPanel (which keeps its own
 * inline timer). Wires to the same sessionService as GslPanel.
 */
import { useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  setGslQueue, setGslDefaultSecs,
  type LiveSession, type SpeakerSlot, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { SubCard, GroupLabel, ProxyChip } from "./console/shared";
import { CountdownTimer } from "./CountdownTimer";
import { FloorYieldRow } from "./FloorYieldRow";
import { Plus, ChevronUp, ChevronDown, X, ArrowRight, Mic } from "lucide-react";

const noop = () => {};

export function ConsoleSpeakersPanel({
  eventId, sessionId, session, delegates, canControl, identityFor, onSpeechComplete,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  onSpeechComplete?: (slot: SpeakerSlot) => void;
}) {
  const gsl = session.gsl;
  const queue = gsl?.queue || [];
  const active = gsl?.activeSpeaker || null;
  const [addId, setAddId] = useState("");

  const inList = new Set([...queue.map((q) => q.delegateId), active?.delegateId].filter(Boolean) as string[]);
  const addable = delegates.filter((d) => d.userId && !inList.has(d.userId));

  const addSpeaker = () => {
    const d = delegates.find((x) => x.userId === addId);
    if (!d) return;
    const slot: SpeakerSlot = { delegateId: d.userId, country: d.assignedCountry || "", applicationId: d.id || "", yieldTo: "none" };
    setGslQueue(eventId, sessionId, [...queue, slot]);
    setAddId("");
  };
  const removeAt = (i: number) => setGslQueue(eventId, sessionId, queue.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= queue.length) return;
    const q = [...queue];
    [q[i], q[j]] = [q[j], q[i]];
    setGslQueue(eventId, sessionId, q);
  };

  const activeName = active ? (delegates.find((d) => d.userId === active.delegateId)?.applicantName || "") : "";

  return (
    <div className="flex flex-col gap-3">
      {/* Now speaking */}
      {active && gsl ? (
        <div className="rounded-[15px] border border-primary/35 bg-gradient-to-b from-primary/[0.12] to-card2 p-3.5">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
              <span className="relative flex w-[7px] h-[7px]">
                <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
                <span className="relative w-[7px] h-[7px] rounded-full bg-primary" />
              </span>
              Now speaking
            </span>
            <span className="text-[11px] text-muted-foreground">1 of {queue.length + 1}</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            {active.country
              ? <CountryFlag code={active.country} size={38} />
              : <span className="w-[38px] h-[38px] rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0"><Mic className="w-4 h-4" /></span>}
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[15px] font-bold leading-tight truncate">{getCountryName(active.country) || active.country || "Delegate"}</p>
              {activeName && <p className="text-[11.5px] text-muted-foreground truncate">{activeName}</p>}
            </div>
          </div>
          <CountdownTimer timer={gsl.timer} canControl={false} size="sm" onStart={noop} onPause={noop} onReset={noop} />

          {/* Yield. Lifted into FloorYieldRow so the Caucus tool renders the identical control
              against `caucus.currentSpeaker` — see that file's header. */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <FloorYieldRow
              eventId={eventId} sessionId={sessionId} session={session}
              delegates={delegates} canControl={canControl}
              identityFor={identityFor} onSpeechComplete={onSpeechComplete}
            />
          </div>
        </div>
      ) : (
        <SubCard className="px-3.5 py-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Mic className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          No active speaker — start the first from the Live panel. <ArrowRight className="w-4 h-4 text-primary shrink-0" />
        </SubCard>
      )}

      {/* Add to the list */}
      {canControl && (
        <div className="flex items-center gap-2">
          <Select value={addId} onValueChange={(v) => setAddId(v || "")}>
            <SelectTrigger className="flex-1 h-10 rounded-xl bg-background">
              <SelectValue placeholder="Add delegate to the list…">
                {(val) => {
                  const d = delegates.find((x) => x.userId === val);
                  if (!d) return "Add delegate to the list…";
                  return d.assignedCountry
                    ? <CountryFlag code={d.assignedCountry} size={16} showName />
                    : d.applicantName;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {addable.length === 0
                ? <div className="px-3 py-2 text-xs text-muted-foreground">Everyone is on the list</div>
                : addable.map((d) => (
                    <SelectItem key={d.userId} value={d.userId}>
                      {d.assignedCountry
                        ? <CountryFlag code={d.assignedCountry} size={16} showName />
                        : d.applicantName}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
          <button type="button" onClick={addSpeaker} disabled={!addId}
            className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Plus className="w-[18px] h-[18px]" />
          </button>
        </div>
      )}

      {/* Up-next header + default time */}
      <div className="flex items-center justify-between">
        <GroupLabel>Up next ({queue.length})</GroupLabel>
        {canControl && (
          <div className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            Default
            <input
              type="number" min={5} value={gsl?.defaultSpeakerSecs ?? 90}
              onChange={(e) => setGslDefaultSecs(eventId, sessionId, parseInt(e.target.value) || 90)}
              className="w-14 h-7 text-center rounded-md border border-border bg-muted text-foreground font-mono text-[12px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            s
          </div>
        )}
      </div>

      {/* Queue */}
      {queue.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">The speakers list is empty.</p>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {queue.map((s, i) => (
            <SubCard key={`${s.delegateId}-${i}`}
              className="flex items-center gap-2.5 px-2.5 py-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
              <span className="w-4 shrink-0 text-center font-mono text-[12px] font-bold text-muted-foreground tabular-nums">{i + 1}</span>
              {s.country && <CountryFlag code={s.country} size={22} />}
              <span className="flex-1 min-w-0 text-[12.5px] font-semibold truncate">{getCountryName(s.country) || s.country || "Delegate"}</span>
              {s.proxyBy && <ProxyChip name={s.proxyByName} className="shrink-0" />}
              {canControl && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up"
                    className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === queue.length - 1} title="Move down"
                    className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeAt(i)} title="Remove"
                    className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </SubCard>
          ))}
        </div>
      )}
    </div>
  );
}
