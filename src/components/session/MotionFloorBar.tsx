"use client";

/**
 * "The floor is open to motions" — the delegate's half of the chair's invitation.
 *
 * The digital equivalent of the chair asking the room "are there any points or motions on the
 * floor?". Modelled on `CaucusSignupBar`, and it keeps that component's two hard rules:
 *
 *   • Whether to show is DERIVED from live snapshots (the session doc + this delegate's own
 *     motions) — never component state, never localStorage. A reload mid-invite re-derives the
 *     same answer instead of losing or duplicating it.
 *   • A persistent BAR, not a modal. A modal would stop the delegate watching the floor, casting
 *     a ballot, or raising a point of order — blocking those is a procedural hazard, not stricter UX.
 *
 * Unlike the caucus prompt there is no Yes/No and no stored answer: a motion invite's product is
 * the MOTION, which is already observable. So this bar performs no write at all — it just opens the
 * propose modal — and there is nothing to leave a `busy` flag hanging on.
 */
import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeMyMotions, type LiveSession, type ParticipationIdentity } from "@/lib/services/sessionService";
import type { MotionFloorStatus } from "@/lib/services/motionFloor";

const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function MotionFloorBar({
  eventId, sessionId, session, identity, status, onPropose,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  identity: ParticipationIdentity;
  /** From `useMotionFloor` — the console owns the single 1Hz tick, so this bar needs no ticker. */
  status: MotionFloorStatus;
  /** Opens the existing propose-motion modal, which is itself gated. This bar never writes. */
  onPropose: () => void;
}) {
  const [minePending, setMinePending] = useState(0);

  // Own subscription rather than a new console prop: the SDK multiplexes this identical query onto
  // the one the propose form already runs, so mounting both costs nothing extra.
  useEffect(
    () => subscribeMyMotions(eventId, sessionId, identity.delegateId, (ms) =>
      setMinePending(ms.filter((m) => ["pending", "recognized", "voting"].includes(m.status)).length)),
    [eventId, sessionId, identity.delegateId]
  );

  // 1. ONE line, six conditions. `invited` sits below every blocking state in the precedence chain
  //    (see motionFloor.ts), so this is unreachable while a GSL speaker, a caucus speaker, a granted
  //    floor, a live ballot, a suspension or a closure is in effect. That subsumes CaucusSignupBar's
  //    "a live ballot outranks a prompt, always" rule without a second check, and guarantees the bar
  //    can never outlive the thing that made it valid.
  if (!status.inOrder || status.code !== "invited") return null;

  // 2. Yield to CaucusSignupBar: a delegate being asked "do you want to speak?" must not be asked
  //    for motions in the same breath. Deliberately CONSERVATIVE — it yields for the whole signup
  //    window, even in cases where that bar wouldn't render (already answered, not present). Being
  //    over-eager in a SUPPRESSION check is the safe direction: the worst case is a missing nudge,
  //    while the propose button stays enabled and amber throughout.
  const caucus = session.caucus;
  if (caucus?.kind === "moderated" && caucus.signupEndsAt != null && caucus.signupEndsAt > Date.now()) {
    return null;
  }

  // 3. An invitation is addressed to the room's members. Note this is an INDIVIDUAL attendance
  //    check, not a quorum check — `motionsInOrder` deliberately gates on neither, so an unmarked
  //    delegate keeps the capability (button enabled) while not being personally invited.
  const att = session.attendance?.[identity.delegateId];
  if (att?.status !== "present" && att?.status !== "present_and_voting") return null;

  // 4. Already responded. The motion IS the answer, so no separate record is written or read.
  if (minePending > 0) return null;

  const left = status.endsInMs;

  return (
    // keyed by inviteId so a chair's "Ask again" replays the entrance instead of silently
    // mutating what looks like a stale countdown
    <div key={status.inviteId} className="shrink-0 px-3 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="@container rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-3">
        <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:gap-4">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <span className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Megaphone className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-snug">The floor is open to motions</p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                {status.note || "The chair is entertaining motions"}
                {" · "}
                <span className={left < 15000
                  ? "text-red-600 dark:text-red-400 font-semibold tabular-nums"
                  : "font-semibold tabular-nums"}>
                  {fmtCountdown(left)} left
                </span>
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <Button size="sm" className="w-full @lg:w-auto gap-1.5" onClick={onPropose}>
              <Megaphone className="w-3.5 h-3.5" /> Propose a motion
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
