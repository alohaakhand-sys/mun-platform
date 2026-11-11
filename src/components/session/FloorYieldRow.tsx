"use client";

/**
 * Chair-side yield controls for whoever currently holds the floor — GSL speaker or moderated-caucus
 * speaker, identically.
 *
 * IT USED TO BE INLINE IN `ConsoleSpeakersPanel`, hard-coded to `gsl.activeSpeaker`, which meant a
 * moderated caucus had no chair-side yield control anywhere in the console: the Speakers List tool
 * showed "No active speaker" for the whole caucus, and the Caucus tool never had one. Lifting it
 * out is what lets the Caucus tool render the same control against the same state.
 *
 * The three-way split is the same as everywhere else: "to questions" / "to comments" only change
 * how the speaker's OWN remaining time is run and apply immediately (`setYield`), while "to a
 * delegate" TRANSFERS time and goes through `chairYieldFloorToDelegate`, which credits the outgoing
 * speaker, writes the motion log and picks the GSL vs caucus transaction.
 *
 * Renders nothing when nobody holds the floor, so hosts can drop it in unconditionally.
 */
import {
  setYield, chairYieldFloorToDelegate,
  type LiveSession, type SpeakerSlot, type YieldKind, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { floorHolder } from "@/lib/services/floorGate";
import type { ApplicationData } from "@/lib/services/applicationService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { CornerDownRight } from "lucide-react";

const YIELDS: { id: YieldKind; label: string }[] = [
  { id: "none", label: "No yield" },
  { id: "questions", label: "To questions" },
  { id: "comments", label: "To comments" },
  { id: "delegate", label: "To a delegate" },
];

export function FloorYieldRow({
  eventId, sessionId, session, delegates, canControl, identityFor, onSpeechComplete, className,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  /** So the console can open its post-speech scorer, as it does on every other speech end. */
  onSpeechComplete?: (slot: SpeakerSlot) => void;
  className?: string;
}) {
  const active = floorHolder(session);
  if (!active) return null;

  const yieldTargets = delegates.filter((d) => d.assignedCountry && d.userId !== active.delegateId);
  const targetResolvable = !!active.yieldTargetCountry &&
    delegates.some((d) => d.assignedCountry === active.yieldTargetCountry && d.userId !== active.delegateId);

  const passFloorToYieldTarget = async () => {
    if (active.yieldTo !== "delegate") return;
    const t = delegates.find(
      (d) => d.assignedCountry === active.yieldTargetCountry && d.userId !== active.delegateId,
    );
    if (!t || !t.userId) return;
    const slot: SpeakerSlot = {
      delegateId: t.userId, country: t.assignedCountry || "", applicationId: t.id || "",
    };
    const res = await chairYieldFloorToDelegate(
      eventId, sessionId, session, slot, identityFor(active.delegateId),
    );
    if (res.ok && res.finishing) onSpeechComplete?.(res.finishing);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      <span className="text-[12.5px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          {getCountryName(active.country) || active.country || "Delegate"}
        </span>{" "}
        yields:
      </span>
      {active.viaYield ? (
        // A yield recipient's clock is base + carried, so a chain would compound without bound.
        // Same sentence the delegate's own menu and firestore.rules enforce.
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
          <CornerDownRight className="w-3.5 h-3.5" /> received the floor by yield — cannot yield again
        </span>
      ) : canControl ? (
        <>
          <Select
            value={active.yieldTo || "none"}
            onValueChange={(v) =>
              setYield(eventId, sessionId, session, v as YieldKind,
                v === "delegate" ? (active.yieldTargetCountry || "") : "")
            }
          >
            <SelectTrigger className="w-auto min-w-[140px] h-9 rounded-lg bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YIELDS.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {active.yieldTo === "delegate" && (
            <Select
              value={active.yieldTargetCountry || ""}
              onValueChange={(v) => setYield(eventId, sessionId, session, "delegate", v || "")}
            >
              <SelectTrigger className="w-auto min-w-[180px] h-9 rounded-lg bg-background">
                <SelectValue placeholder="Yield to delegate…">
                  {(val) => val ? <CountryFlag code={val as string} size={16} showName /> : "Yield to delegate…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {yieldTargets.length === 0
                  ? <div className="px-3 py-2 text-xs text-muted-foreground">No other delegates</div>
                  : yieldTargets.map((d) => (
                      <SelectItem key={d.userId} value={d.assignedCountry || ""}>
                        <CountryFlag code={d.assignedCountry || ""} size={16} showName />
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          )}

          {active.yieldTo === "delegate" && targetResolvable && (
            <button type="button" onClick={passFloorToYieldTarget}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90 transition-colors">
              <CornerDownRight className="w-4 h-4" /> Pass floor
            </button>
          )}
        </>
      ) : (
        <span className="text-[12.5px] text-muted-foreground capitalize">
          {active.yieldTo && active.yieldTo !== "none" ? active.yieldTo : "no yield"}
        </span>
      )}
    </div>
  );
}
