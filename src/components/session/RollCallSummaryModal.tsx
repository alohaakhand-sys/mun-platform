"use client";

/**
 * "The roll is taken" — the beat between roll call and the agenda.
 *
 * WHY A DIALOG AND NOT A TOAST. Completing the roll is a RULING: it fixes who is in the room for the
 * rest of the sitting, decides the vote denominator, and is the one moment the chair should read the
 * register back before the committee transacts. A toast that slides away in four seconds is the
 * wrong weight for that. Same argument `CaucusSeatModal` makes for seating a speakers list.
 *
 * IT PERFORMS NO WRITE. `completeRollCall` is what stamps `completedAt`, and that timestamp is what
 * RAISES this — see `showRollCallSummary` in ChairSessionConsole. Deriving it from the document
 * rather than firing it from the click buys three things a click could not: it appears only after
 * the write has actually landed, it appears on the co-chair's screen too, and it survives a reload.
 * So the only button here closes it.
 *
 * It reads the FROZEN snapshot in preference to the live tally. A delegate the chair moves between
 * completing the roll and dismissing this dialog must not silently rewrite the numbers the ruling
 * was made on.
 */
import { useMemo } from "react";
import { CheckCircle2, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { readRollCall } from "@/lib/services/rollCall";
import type { LiveSession, Motion } from "@/lib/services/sessionService";
import { adviseGate } from "./flow/gateAdvice";
import { ConsoleModal, SubCard } from "./console/shared";

/** Same colour vocabulary as `RollCallPanel`'s legend, so the two read as one register. */
type CountKey = "present" | "presentAndVoting" | "late" | "absent";
const ROWS: { key: CountKey; label: string; dot: string }[] = [
  { key: "present", label: "Present", dot: "bg-emerald-500" },
  { key: "presentAndVoting", label: "Present and voting", dot: "bg-sky-500" },
  { key: "late", label: "Late", dot: "bg-amber-500" },
  { key: "absent", label: "Never answered", dot: "bg-muted-foreground" },
];

export function RollCallSummaryModal({
  session, motions, onClose,
}: {
  session: LiveSession;
  /** Only for `adviseGate`, which names what the chair should open next. */
  motions: Motion[];
  onClose: () => void;
}) {
  const reading = readRollCall(session);
  const t = reading.snapshot ?? reading.tally;
  // The same sentence the gate chooser prints, from the same function — one authored answer to
  // "what happens next", so the modal cannot promise something the chooser then contradicts.
  const next = useMemo(() => adviseGate({ session, motions }).next, [session, motions]);

  return (
    <ConsoleModal
      icon={ListChecks}
      title="Roll call complete"
      subtitle="The register is fixed for today's session."
      onClose={onClose}
    >
      {/* The number the chair called for. Everything else on this screen explains it. */}
      <SubCard className="p-4 text-center">
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="font-heading text-[44px] font-extrabold leading-none tabular-nums text-emerald-600 dark:text-emerald-400">
            {t.seated}
          </span>
          <span className="text-[15px] font-semibold text-muted-foreground">of {t.total}</span>
        </div>
        <p className="text-[12.5px] text-muted-foreground mt-1.5">
          delegation{t.seated === 1 ? "" : "s"} present in today&apos;s session
        </p>
      </SubCard>

      <div className="flex flex-col gap-[7px] mt-3">
        {ROWS.map((r) => (
          <SubCard key={r.key} className="flex items-center gap-2.5 p-2 px-3">
            <i className={cn("w-2 h-2 rounded-sm shrink-0", r.dot)} />
            <span className="text-[12.5px] flex-1">{r.label}</span>
            <span className="text-[13px] font-bold tabular-nums">{t[r.key]}</span>
          </SubCard>
        ))}
      </div>

      {t.absent > 0 && (
        <p className="text-[11.5px] text-muted-foreground leading-snug mt-2.5">
          <b className="text-foreground">{t.absent} never answered</b> — they stay marked absent. Change
          any of it from the Roll call panel.
        </p>
      )}

      {/* Quorum is REPORTED, never enforced. The whole point of completing the roll is that the
          sitting proceeds on the chair's ruling, so an un-quorate result is a fact to state, not an
          error to raise — amber, and worded so it does not read as a blocked screen. */}
      <div
        className={cn(
          "rounded-xl border px-3.5 py-3 mt-3",
          t.quorumMet
            ? "border-emerald-500/30 bg-emerald-500/[0.07]"
            : "border-amber-500/30 bg-amber-500/[0.07]",
        )}
      >
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-[12.5px] font-bold",
            t.quorumMet
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400",
          )}
        >
          {t.quorumMet && <CheckCircle2 className="w-3.5 h-3.5" />}
          {t.quorumMet
            ? `Quorum met — ${t.seated} of ${t.quorumThreshold}`
            : `Below quorum — ${t.seated} of ${t.quorumThreshold}`}
        </p>
        {!t.quorumMet && (
          <p className="text-[11.5px] text-muted-foreground leading-snug mt-1">
            The committee may proceed; votes will be recorded against {t.seated} eligible
            delegation{t.seated === 1 ? "" : "s"}.
          </p>
        )}
      </div>

      <p className="text-[11.5px] text-muted-foreground leading-snug mt-3 pt-3 border-t border-border/60">
        <span className="font-semibold text-foreground/70">Next: </span>{next}
      </p>

      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-bold
                     hover:bg-primary/90 transition-colors"
        >
          Done
        </button>
      </div>
    </ConsoleModal>
  );
}
