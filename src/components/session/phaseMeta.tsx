/**
 * The one phase table for live sessions.
 *
 * Extracted because the label set had drifted into three divergent copies — `PHASE_META` in
 * `console/shared.tsx`, `PHASE_LABEL` in `projector/SessionHeroes.tsx`, and a third in the
 * now-deleted `SessionHeader.tsx`. The delegate console read two of them at once, so its top
 * bar said "Mod Caucus" while its own Status tool said "Moderated Caucus" on the same screen.
 *
 * Two label forms are legitimate and both live here:
 *   `label` — compact, for pills and chips where width is tight
 *   `long`  — full parliamentary wording, for projector heroes read from across a room
 *
 * Kept dependency-light (icons only, no console atoms) so `SessionProjector` can import it
 * without pulling in the AI assist bar. Same discipline as `lib/services/motionMeta.ts`.
 */
import type { SessionPhase } from "@/lib/services/sessionService";
import { Radio, Mic, Users2, Coffee, Vote, PauseCircle, Lock, ListChecks } from "lucide-react";

export const PHASE_META: Record<
  SessionPhase,
  { label: string; long: string; icon: React.ElementType }
> = {
  lobby: { label: "Lobby", long: "In Lobby", icon: Radio },
  roll_call: { label: "Roll Call", long: "Roll Call", icon: ListChecks },
  gsl: { label: "Speakers", long: "Speakers List", icon: Mic },
  mod_caucus: { label: "Mod Caucus", long: "Moderated Caucus", icon: Users2 },
  unmod_caucus: { label: "Unmod Caucus", long: "Unmoderated Caucus", icon: Coffee },
  voting: { label: "Voting", long: "Voting", icon: Vote },
  suspended: { label: "Suspended", long: "Suspended", icon: PauseCircle },
  closed: { label: "Closed", long: "Closed", icon: Lock },
};

/** Full-wording labels, for the projector and any surface read at a distance. */
export const PHASE_LABEL: Record<SessionPhase, string> = Object.fromEntries(
  (Object.keys(PHASE_META) as SessionPhase[]).map((p) => [p, PHASE_META[p].long]),
) as Record<SessionPhase, string>;

export function PhaseIcon({ phase, className }: { phase: SessionPhase; className?: string }) {
  const Icon = PHASE_META[phase].icon;
  return <Icon className={className} />;
}
