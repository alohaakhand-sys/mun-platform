"use client";

import { useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  setGslQueue, setGslDefaultSecs, nextSpeaker, clearActiveSpeaker,
  timerStart, timerPause, timerReset, timerRemainingMs,
  type LiveSession, type SpeakerSlot, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountdownTimer } from "./CountdownTimer";
import { FloorYieldRow } from "./FloorYieldRow";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { Mic, SkipForward, X, ChevronUp, ChevronDown, Plus, Square, CornerDownRight } from "lucide-react";

export function GslPanel({
  eventId, sessionId, session, delegates, canControl, identityFor, embedded = false, onSpeechComplete,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  /** When true the speaker timer + next/stop controls live in the Live dock, so this panel hides them. */
  embedded?: boolean;
  onSpeechComplete?: (slot: SpeakerSlot) => void;
}) {
  const gsl = session.gsl;
  const queue = gsl?.queue || [];
  const active = gsl?.activeSpeaker || null;
  const [addId, setAddId] = useState("");

  const inList = new Set([...queue.map((q) => q.delegateId), active?.delegateId].filter(Boolean) as string[]);
  const addable = delegates.filter((d) => d.userId && !inList.has(d.userId));

  const path = "gsl.timer" as const;
  // A yield recipient's clock is their own allotment PLUS what was handed over, and that total is
  // what `yieldFloorToDelegate` wrote to `durationMs`. Resetting them to the plain default would
  // confiscate the transferred time with no way to give it back. Ordinary speakers keep reading
  // the default, so a chair who edits the speech length mid-speech still sees Reset pick it up.
  const resetMs = active?.viaYield
    ? (gsl?.timer?.durationMs || (gsl?.defaultSpeakerSecs || 90) * 1000)
    : (gsl?.defaultSpeakerSecs || 90) * 1000;
  const adjust = (delta: number) => {
    const rem = Math.max(0, timerRemainingMs(gsl.timer) + delta);
    if (gsl.timer.running) timerStart(eventId, sessionId, path, rem);
    else timerPause(eventId, sessionId, path, rem);
  };

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

  // Participation credit lives in nextSpeaker / clearActiveSpeaker themselves now — every
  // caller credits, and no caller double-credits.
  const handleNext = async () => {
    const finishing = active;
    await nextSpeaker(eventId, sessionId);
    if (finishing) onSpeechComplete?.(finishing);
  };
  const handleStop = async () => {
    const finishing = active;
    await clearActiveSpeaker(eventId, sessionId);
    if (finishing) onSpeechComplete?.(finishing);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Active speaker + timer */}
      <Card className="console-panel overflow-hidden lg:col-span-3">
        <CardHeader className="bg-secondary/10 border-b border-border/50">
          <CardTitle className="flex items-center gap-2"><Mic className="w-5 h-5 text-primary" /> Now Speaking</CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          {active ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                  {active.country
                    ? <CountryFlag code={active.country} size={30} />
                    : <span className="font-bold text-primary">?</span>}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold truncate">{getCountryName(active.country) || active.country || "Delegate"}</p>
                  {active.viaYield ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                      <CornerDownRight className="w-3 h-3" /> Received the floor by yield
                    </span>
                  ) : active.yieldTo && active.yieldTo !== "none" && (
                    <p className="text-xs text-muted-foreground">
                      Yielding {active.yieldTo === "delegate"
                        ? `to ${getCountryName(active.yieldTargetCountry || "") || active.yieldTargetCountry || "a delegate"}`
                        : `to ${active.yieldTo}`}
                    </p>
                  )}
                </div>
              </div>

              {!embedded && (
                <CountdownTimer
                  timer={gsl.timer}
                  canControl={canControl}
                  onStart={(rem) => timerStart(eventId, sessionId, path, rem)}
                  onPause={(rem) => timerPause(eventId, sessionId, path, rem)}
                  onReset={() => timerReset(eventId, sessionId, path, resetMs)}
                  onAdjust={adjust}
                />
              )}

              {canControl && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* One control, shared with the wide console panel and the Caucus tool —
                      see FloorYieldRow. */}
                  <FloorYieldRow
                    eventId={eventId} sessionId={sessionId} session={session}
                    delegates={delegates} canControl={canControl}
                    identityFor={identityFor} onSpeechComplete={onSpeechComplete}
                  />
                  {!embedded && (
                    <>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleStop}>
                        <Square className="w-3.5 h-3.5" /> Stop
                      </Button>
                      <Button size="sm" className="gap-1.5" onClick={handleNext}>
                        <SkipForward className="w-4 h-4" /> Next speaker
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Mic className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm">No active speaker.</p>
              {!embedded && canControl && queue.length > 0 && (
                <Button size="sm" className="mt-3 gap-1.5" onClick={handleNext}>
                  <SkipForward className="w-4 h-4" /> Start first speaker
                </Button>
              )}
              {embedded && canControl && queue.length > 0 && (
                <p className="mt-2 text-xs text-primary">Start the first speaker from the Live panel →</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Speakers list */}
      <Card className="console-panel overflow-hidden lg:col-span-2">
        <CardHeader className="bg-secondary/10 border-b border-border/50">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Speakers List ({queue.length})</CardTitle>
            {canControl && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>time</span>
                <Input
                  type="number" min={5} className="w-16 h-7"
                  value={gsl.defaultSpeakerSecs}
                  onChange={(e) => setGslDefaultSecs(eventId, sessionId, parseInt(e.target.value) || 90)}
                />
                <span>s</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {canControl && (
            <div className="flex items-center gap-2">
              <Select value={addId} onValueChange={(v) => setAddId(v || "")}>
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Add delegate…">
                    {(val) => {
                      const d = delegates.find((x) => x.userId === val);
                      if (!d) return "Add delegate…";
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
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={addSpeaker} disabled={!addId}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
          {queue.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">List is empty.</p>
          ) : (
            <div className="space-y-1.5">
              {queue.map((s, i) => (
                <div key={`${s.delegateId}-${i}`} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/15 border border-border/40">
                  <span className="w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  {s.country && <CountryFlag code={s.country} size={18} />}
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{getCountryName(s.country) || s.country || "Delegate"}</span>
                  {canControl && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => move(i, -1)} className="p-1 rounded hover:bg-secondary/50 text-muted-foreground" title="Up"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => move(i, 1)} className="p-1 rounded hover:bg-secondary/50 text-muted-foreground" title="Down"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => removeAt(i)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-600 dark:hover:text-red-400" title="Remove"><X className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
