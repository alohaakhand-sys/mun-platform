"use client";

import { useState } from "react";
import { Users2, Play } from "lucide-react";
import type { LiveSession, Motion } from "@/lib/services/sessionService";
import { startModCaucus, SIGNUP_WINDOW_DEFAULT_SECS } from "@/lib/services/sessionService";
import { Button } from "@/components/ui/button";
import { UnitField, ConsoleModal } from "./console/shared";

export function ModCaucusStartModal({
  eventId,
  sessionId,
  session,
  userId,
  motion,
  onClose,
  onStarted,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  userId: string;
  motion?: Motion | null;
  onClose: () => void;
  onStarted?: (signupWindowSecs: number) => Promise<void>;
}) {
  const params = motion?.params || {};
  const topic = params.topic || "Moderated Caucus";
  const totalSecs = params.totalDurationSecs || 600;
  const perSpeakerSecs = params.perSpeakerSecs || 45;

  const [signupWindowSecs, setSignupWindowSecs] = useState(
    (params as any).signupWindowSecs || SIGNUP_WINDOW_DEFAULT_SECS
  );
  const [busy, setBusy] = useState(false);

  const totalMin = Math.round(totalSecs / 60);
  const estSpeakers = perSpeakerSecs > 0 ? Math.floor(totalSecs / perSpeakerSecs) : 0;

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (onStarted) {
        await onStarted(signupWindowSecs);
      } else {
        await startModCaucus(
          eventId,
          sessionId,
          topic,
          totalSecs,
          perSpeakerSecs,
          signupWindowSecs,
          userId
        );
      }
      onClose();
    } catch (err) {
      console.error("Failed to start mod caucus signup", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsoleModal
      icon={Users2}
      title="Start Moderated Caucus Signup"
      subtitle="The caucus motion has carried. Open the speaker signup window for delegates."
      onClose={onClose}
    >
      <div className="rounded-xl border border-primary/30 bg-primary/[0.05] p-4 my-3 space-y-3">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Caucus Topic
          </span>
          <h4 className="text-base font-bold text-foreground">{topic}</h4>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-border/40 text-xs">
          <div>
            <span className="text-muted-foreground block text-[11px]">Total Time</span>
            <span className="font-bold text-foreground text-sm">{totalMin} min</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Per Speaker</span>
            <span className="font-bold text-foreground text-sm">{perSpeakerSecs} sec</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Est. Speakers</span>
            <span className="font-bold text-primary text-sm">~{estSpeakers}</span>
          </div>
        </div>
      </div>

      <div className="my-4 space-y-1.5">
        <UnitField
          label="Speaker Signup Window"
          unit="sec"
          value={signupWindowSecs}
          onChange={setSignupWindowSecs}
          min={10}
        />
        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
          Delegates get this long to answer &ldquo;do you want to speak?&rdquo;.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 mt-5 pt-3 border-t border-border/60">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleStart} disabled={busy} className="gap-2 px-5 font-bold shadow-md shadow-primary/20">
          <Play className="w-4 h-4 fill-current" /> Start Speaker Signup
        </Button>
      </div>
    </ConsoleModal>
  );
}
