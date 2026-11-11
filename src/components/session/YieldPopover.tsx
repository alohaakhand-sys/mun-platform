"use client";

/**
 * On-stage "Yield the floor" popover — the fast path the chair triggers from the active
 * speaker's video tile, instead of drilling into the Speakers List tool panel. Calls the
 * exact same `setYield`/`yieldFloorToDelegate` service functions `ConsoleSpeakersPanel`
 * already uses; "to a delegate" (which transfers the remaining time + credits the outgoing
 * speaker) is assembled by the caller (needs the console's `identityFor`/participation
 * wiring) and handed in as `onYieldToDelegate`.
 */
import { useState } from "react";
import { setYield, type LiveSession } from "@/lib/services/sessionService";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { cn } from "@/lib/utils";
import { HelpCircle, Forward, User, X, ChevronRight, CornerDownRight } from "lucide-react";

export interface YieldTarget { uid: string; country: string; name?: string }

export function YieldPopover({
  eventId, sessionId, session, activeCountry, timerText, targets, onYieldToDelegate, onClose,
}: {
  eventId: string;
  sessionId: string;
  /** Picks which speaker slot the yield fields sit under — GSL or moderated caucus. */
  session: LiveSession;
  activeCountry?: string;
  timerText?: string;
  targets: YieldTarget[];
  onYieldToDelegate: (uid: string) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<"type" | "target">("type");

  const yieldToKind = (kind: "questions" | "comments") => {
    setYield(eventId, sessionId, session, kind, "");
    onClose();
  };
  const yieldToDelegate = (uid: string) => {
    onYieldToDelegate(uid);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div className="w-[min(94vw,380px)] rounded-2xl bg-background border border-border/60 shadow-lg shadow-primary/10 dark:shadow-xl text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border/60">
          <span className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <CornerDownRight className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[15px] leading-tight">Yield the floor</h3>
            {activeCountry && (
              <p className="text-xs text-muted-foreground truncate">
                {activeCountry} holds {timerText || "the floor"}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close"
            className="w-8 h-8 rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground flex items-center justify-center shrink-0 transition-colors">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="p-3.5">
          {stage === "type" ? (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => yieldToKind("questions")}
                className="flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl border border-border/60 bg-secondary/40 hover:bg-secondary/70 transition-colors">
                <HelpCircle className="w-5 h-5 text-primary shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold">To questions</span>
                  <span className="block text-[11.5px] text-muted-foreground">Open the floor to points of inquiry</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              <button type="button" onClick={() => yieldToKind("comments")}
                className="flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl border border-border/60 bg-secondary/40 hover:bg-secondary/70 transition-colors">
                <Forward className="w-5 h-5 text-primary shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold">To comments</span>
                  <span className="block text-[11.5px] text-muted-foreground">Yield remaining time to comments</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              <button type="button" onClick={() => setStage("target")} disabled={targets.length === 0}
                className="flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl border border-primary/35 bg-primary/[0.08] hover:bg-primary/[0.14] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <User className="w-5 h-5 text-primary shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold">To a delegate</span>
                  <span className="block text-[11.5px] text-muted-foreground">Pass the floor + remaining time</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground px-0.5 mb-0.5">
                Pass the floor{timerText ? ` and ${timerText}` : ""} to:
              </p>
              {targets.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">No other delegates.</p>
              ) : targets.map((t) => (
                <button key={t.uid} type="button" onClick={() => yieldToDelegate(t.uid)}
                  className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl border border-border/60 bg-secondary/40 hover:bg-secondary/70 transition-colors">
                  <CountryFlag code={t.country} size={22} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{t.country}</span>
                    {t.name && <span className="block text-[11px] text-muted-foreground truncate">{t.name}</span>}
                  </span>
                  <CornerDownRight className="w-4 h-4 text-primary shrink-0" />
                </button>
              ))}
              <button type="button" onClick={() => setStage("type")}
                className={cn("mt-1 h-9 rounded-lg border border-border/60 bg-transparent text-muted-foreground text-[12.5px] font-semibold hover:bg-secondary/50 transition-colors")}>
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
