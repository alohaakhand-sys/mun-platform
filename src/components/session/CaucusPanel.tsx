"use client";

import { useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  startModCaucus, startUnmodCaucus, endCaucus, setCaucusCountry, nextCaucusSpeaker,
  timerStart, timerPause, timerReset, timerRemainingMs, SIGNUP_WINDOW_DEFAULT_SECS,
  type LiveSession, type TimerState, type SpeakerSlot, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountdownTimer } from "./CountdownTimer";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { AiAssistBar } from "./ai/AiAssist";
import { SubCard, FieldLabel, Segmented, UnitField } from "./console/shared";
import { CaucusSpeakersList } from "./CaucusSpeakersList";
import { FloorYieldRow } from "./FloorYieldRow";
import { Users2, Coffee, Square, Play, SkipForward } from "lucide-react";

const PRESETS = [5, 10, 15, 20];

export function CaucusPanel({
  eventId, sessionId, session, delegates, canControl, userId, embedded = false, agenda,
  onReviewSignups, identityFor, onSpeechComplete,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  delegates: ApplicationData[];
  canControl: boolean;
  /** Chair uid — stamped onto a caucus signup when the chair adds it to the speakers list. */
  userId: string;
  /** When true the running caucus timer lives in the Live dock, so this panel shows a slim banner instead. */
  embedded?: boolean;
  /** Committee agenda line, if the parent page has it. Sharpens AI suggestions. */
  agenda?: string;
  /** Open the seat dialog now. Owned by the console — see CaucusSpeakersList. */
  onReviewSignups?: () => void;
  /**
   * Participation identity resolver + post-speech hook, for the caucus speaker's yield row.
   * Optional so the panel still mounts from surfaces that have no participation wiring; without
   * `identityFor` the yield row is omitted rather than crediting the wrong delegate.
   */
  identityFor?: (delegateId: string) => ParticipationIdentity;
  onSpeechComplete?: (slot: SpeakerSlot) => void;
}) {
  const caucus = session.caucus;
  const [mode, setMode] = useState<"moderated" | "unmoderated">("moderated");
  const [topic, setTopic] = useState("");
  const [modTotal, setModTotal] = useState(10);
  const [modSpeaker, setModSpeaker] = useState(60);
  const [signupWindow, setSignupWindow] = useState(SIGNUP_WINDOW_DEFAULT_SECS);
  const [unmodTotal, setUnmodTotal] = useState(15);

  const adjust = (path: "caucus.totalTimer" | "caucus.speakerTimer", t: TimerState, delta: number) => {
    const rem = Math.max(0, timerRemainingMs(t) + delta);
    if (t.running) timerStart(eventId, sessionId, path, rem);
    else timerPause(eventId, sessionId, path, rem);
  };

  // ── No caucus running ──────────────────────────────────────────────────────
  if (!caucus) {
    if (!canControl) return <CaucusEmpty />;

    const moderated = mode === "moderated";
    const total = moderated ? modTotal : unmodTotal;
    const setTotal = moderated ? setModTotal : setUnmodTotal;
    const speakers = moderated && modSpeaker > 0 ? Math.floor((modTotal * 60) / modSpeaker) : 0;

    return (
      <div className="flex flex-col gap-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { id: "moderated", label: "Moderated", icon: Users2 },
            { id: "unmoderated", label: "Unmoderated", icon: Coffee },
          ]}
        />

        <SubCard className="p-3.5 space-y-3.5">
          {moderated && (
            <div className="space-y-1.5">
              <FieldLabel>Topic</FieldLabel>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Funding mechanisms" className="bg-background" />
              <AiAssistBar
                value={topic}
                onPick={setTopic}
                field="caucus_topic"
                context={{ committee: session.committeeId, phase: session.phase, agenda }}
                suggestLabel="Caucus topics"
              />
            </div>
          )}

          <div className={moderated ? "grid grid-cols-2 gap-3" : ""}>
            <UnitField label="Total time" unit="min" value={total} onChange={setTotal} min={1} />
            {moderated && <UnitField label="Per speaker" unit="sec" value={modSpeaker} onChange={setModSpeaker} min={5} />}
          </div>

          {moderated && (
            <div className="space-y-1">
              <UnitField label="Answer window" unit="sec" value={signupWindow} onChange={setSignupWindow} min={10} />
              <p className="text-[11px] text-muted-foreground">
                Delegates get this long to answer “do you want to speak?”. No answer = not speaking.
              </p>
            </div>
          )}

          <div className="flex gap-1.5">
            {PRESETS.map((p) => {
              const on = total === p;
              return (
                <button key={p} type="button" onClick={() => setTotal(p)}
                  className={on
                    ? "flex-1 py-1.5 rounded-lg border border-primary/45 bg-primary/12 text-primary text-[11.5px] font-bold"
                    : "flex-1 py-1.5 rounded-lg border border-border text-muted-foreground text-[11.5px] font-semibold hover:bg-secondary/60 transition-colors"}>
                  {p} min
                </button>
              );
            })}
          </div>

          {moderated && (
            <p className="text-[11.5px] text-muted-foreground">
              ≈ <b className="text-foreground">{speakers} speaker{speakers === 1 ? "" : "s"}</b> at {modSpeaker}s each
            </p>
          )}

          <Button
            className="w-full gap-2"
            disabled={moderated && !topic.trim()}
            onClick={() => moderated
              // userId opens the signup window with the caucus — see startModCaucus.
              ? startModCaucus(eventId, sessionId, topic.trim(), modTotal * 60, modSpeaker, signupWindow, userId)
              : startUnmodCaucus(eventId, sessionId, unmodTotal * 60)}
          >
            <Play className="w-4 h-4 fill-current" /> Start {moderated ? "moderated" : "unmoderated"} caucus
          </Button>
        </SubCard>
      </div>
    );
  }

  // ── Embedded: the running caucus's timers live in the Live dock, so this shows a slim
  //    banner — PLUS the speakers list, which has nowhere else to go. `embedded` is the
  //    chair's normal wide-screen layout, so anything omitted here is unreachable in practice.
  if (embedded) {
    const Icon = caucus.kind === "moderated" ? Users2 : Coffee;
    return (
      <div className="flex flex-col gap-3">
        <SubCard className="p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold leading-tight">
                {caucus.kind === "moderated" ? "Moderated caucus" : "Unmoderated caucus"} in progress
              </p>
              <p className="text-sm text-muted-foreground truncate">
                Timer is in the Live panel →{caucus.topic ? <> · <span className="font-medium text-foreground">{caucus.topic}</span></> : null}
              </p>
            </div>
          </div>
          {canControl && (
            <EndCaucusButton eventId={eventId} sessionId={sessionId} queued={caucus.queue?.length || 0} />
          )}
        </SubCard>

        {/* The caucus speaker's yield, in the tool the chair is already in. It used to exist only
            in the Speakers List panel, hard-coded to the GSL — so a mod caucus had no chair-side
            yield anywhere. FloorYieldRow renders nothing until someone is recognized. */}
        {identityFor && (
          <FloorYieldRow
            eventId={eventId} sessionId={sessionId} session={session}
            delegates={delegates} canControl={canControl}
            identityFor={identityFor} onSpeechComplete={onSpeechComplete}
            className="px-0.5"
          />
        )}

        <CaucusSpeakersList
          eventId={eventId} sessionId={sessionId} session={session}
          canControl={canControl} userId={userId} onReviewSignups={onReviewSignups}
        />
      </div>
    );
  }

  // ── Full caucus view (narrow layout — timers live here) ──────────────────────
  return (
    <div className="flex flex-col gap-3">
      <SubCard className="p-3.5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {caucus.kind === "moderated" ? <Users2 className="w-[17px] h-[17px] text-primary shrink-0" /> : <Coffee className="w-[17px] h-[17px] text-primary shrink-0" />}
            <div className="min-w-0">
              <p className="font-heading text-[14px] font-bold leading-tight">{caucus.kind === "moderated" ? "Moderated caucus" : "Unmoderated caucus"}</p>
              {caucus.topic && <p className="text-[11.5px] text-muted-foreground truncate">Topic: <span className="font-medium text-foreground">{caucus.topic}</span></p>}
            </div>
          </div>
          {canControl && (
            <EndCaucusButton eventId={eventId} sessionId={sessionId} queued={caucus.queue?.length || 0} />
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-2">Total time</p>
          <CountdownTimer
            timer={caucus.totalTimer} canControl={canControl}
            onStart={(rem) => timerStart(eventId, sessionId, "caucus.totalTimer", rem)}
            onPause={(rem) => timerPause(eventId, sessionId, "caucus.totalTimer", rem)}
            onReset={() => timerReset(eventId, sessionId, "caucus.totalTimer", caucus.totalDurationSecs * 1000)}
            onAdjust={(d) => adjust("caucus.totalTimer", caucus.totalTimer, d)}
          />
        </div>

        {caucus.kind === "moderated" && (
          <div className="pt-4 border-t border-border/60">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Current speaker</p>
              {canControl && (
                // Hand-pick stays available for a chair who wants to recognize off-list; the
                // queue is the normal path (see "Next speaker" below).
                <Select value={caucus.currentCountry || ""} onValueChange={(v) => setCaucusCountry(eventId, sessionId, v || "")}>
                  <SelectTrigger className="w-44 h-8 bg-background">
                    <SelectValue placeholder="Pick country…">
                      {(val) => val ? <CountryFlag code={val as string} size={16} showName /> : "Pick country…"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {delegates.filter((d) => d.userId).map((d) => (
                      <SelectItem key={d.userId} value={d.assignedCountry || d.userId}>
                        {d.assignedCountry
                          ? <CountryFlag code={d.assignedCountry} size={16} showName />
                          : d.applicantName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {caucus.currentCountry && (
              <div className="flex items-center gap-2 mb-2">
                <CountryFlag code={caucus.currentCountry} size={22} />
                <p className="text-lg font-bold">{getCountryName(caucus.currentCountry) || caucus.currentCountry}</p>
              </div>
            )}
            <CountdownTimer
              timer={caucus.speakerTimer} canControl={canControl} size="sm"
              onStart={(rem) => timerStart(eventId, sessionId, "caucus.speakerTimer", rem)}
              onPause={(rem) => timerPause(eventId, sessionId, "caucus.speakerTimer", rem)}
              onReset={() => timerReset(eventId, sessionId, "caucus.speakerTimer", caucus.perSpeakerSecs * 1000)}
              onAdjust={(d) => adjust("caucus.speakerTimer", caucus.speakerTimer, d)}
            />
            {identityFor && (
              <FloorYieldRow
                eventId={eventId} sessionId={sessionId} session={session}
                delegates={delegates} canControl={canControl}
                identityFor={identityFor} onSpeechComplete={onSpeechComplete}
                className="mt-3"
              />
            )}
            {canControl && (
              <Button variant="outline" size="sm" className="w-full mt-3 gap-1.5"
                disabled={!caucus.queue?.length}
                onClick={() => nextCaucusSpeaker(eventId, sessionId)}>
                <SkipForward className="w-3.5 h-3.5" />
                {caucus.queue?.length ? "Next speaker" : "No one queued"}
              </Button>
            )}
          </div>
        )}
      </SubCard>

      {caucus.kind === "moderated" && (
        <CaucusSpeakersList
          eventId={eventId} sessionId={sessionId} session={session}
          canControl={canControl} userId={userId} onReviewSignups={onReviewSignups}
        />
      )}
    </div>
  );
}

/**
 * Ending a caucus discards its speakers list, which the room spent real time building —
 * so once anyone is queued, confirm. (Before this feature a caucus held nothing worth losing,
 * which is why the original button fired straight away.)
 */
function EndCaucusButton({ eventId, sessionId, queued }: { eventId: string; sessionId: string; queued: number }) {
  const [armed, setArmed] = useState(false);

  if (queued > 0 && armed) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => endCaucus(eventId, sessionId)}>
          Discard {queued} &amp; end
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>Cancel</Button>
      </div>
    );
  }
  return (
    <Button variant="outline" size="sm" className="gap-1.5 shrink-0"
      onClick={() => (queued > 0 ? setArmed(true) : endCaucus(eventId, sessionId))}>
      <Square className="w-3.5 h-3.5" /> End caucus
    </Button>
  );
}

function CaucusEmpty() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <Coffee className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
      <p>No caucus in progress.</p>
    </div>
  );
}
