"use client";

/**
 * The delegate's half of the "digital placard raise".
 *
 * When a moderated caucus opens, real procedure has the chair ask who wants to speak and the
 * room raise placards; the order becomes the speakers list. This is that prompt.
 *
 * It is a PERSISTENT BAR, not a blocking modal, and that is deliberate. "Stays until answered"
 * is satisfied either way — it cannot be dismissed and only disappears once an answer exists.
 * But a modal would also stop the delegate watching the floor, re-reading the topic they are
 * being asked about, casting a ballot if a vote opens, and raising a point of order. Blocking
 * those is a procedural hazard, not a stricter UX.
 *
 * Whether to show is DERIVED from two live snapshots (the session doc + the delegate's own
 * requests) — never component state, never localStorage — so a reload mid-prompt re-derives
 * the same answer instead of losing or duplicating it.
 */
import { useEffect, useState } from "react";
import {
  answerCaucusSignup, timerRemainingMs,
  type FloorRequest, type LiveSession, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { Button } from "@/components/ui/button";
import { Users2, Check, Loader2 } from "lucide-react";

const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function CaucusSignupBar({
  eventId, sessionId, session, identity, myHands,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  identity: ParticipationIdentity;
  /** The delegate's own floor requests (already subscribed by the console). */
  myHands: FloorRequest[];
}) {
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Local 1s ticker: the bar is otherwise snapshot-driven, so without one it would never
  // notice the response window expiring — no write happens at that moment.
  const [now, setNow] = useState(() => Date.now());
  const ticking = session.caucus?.kind === "moderated" && session.caucus.signupEndsAt != null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const caucus = session.caucus;
  if (!caucus || caucus.kind !== "moderated" || !caucus.caucusId) return null;
  // A live ballot outranks a caucus signup, always — never compete for the same tap.
  if (session.activeVote) return null;
  // Don't ask in the dying seconds of a caucus nobody can be added to.
  if (timerRemainingMs(caucus.totalTimer) <= 0) return null;
  // Response window over → non-responders are "did not respond"; only the chair adds late.
  // (Caucuses predating the window have no signupEndsAt — they simply never time out.)
  const windowLeftMs = caucus.signupEndsAt != null ? caucus.signupEndsAt - now : null;
  if (windowLeftMs != null && windowLeftMs <= 0) return null;

  const att = session.attendance?.[identity.delegateId];
  if (att?.status !== "present" && att?.status !== "present_and_voting") return null;

  const answered = myHands.some((h) => h.kind === "caucus_signup" && h.caucusId === caucus.caucusId);
  if (answered) return null;

  const slots = caucus.perSpeakerSecs > 0
    ? Math.floor(caucus.totalDurationSecs / caucus.perSpeakerSecs)
    : 0;

  const answer = async (a: "yes" | "no") => {
    if (busy) return;
    setBusy(a);
    setErr(null);
    try {
      await answerCaucusSignup(eventId, sessionId, identity, caucus.caucusId, a);
    } catch (e) {
      console.error("answerCaucusSignup", e);
      setErr("Couldn't send that — you may not be checked in yet. Ask your chair.");
      setBusy(null);
    }
    // On success the doc arrives via subscribeMyHands and this whole bar unmounts, so `busy`
    // is deliberately left set — clearing it would flash the buttons back for a frame.
  };

  return (
    <div className="shrink-0 px-3 pt-3">
      <div className="@container rounded-xl border border-primary/30 bg-primary/[0.08] px-3.5 py-3">
        <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:gap-4">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Users2 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-snug">
                Moderated caucus{caucus.topic ? <> · <span className="text-primary">{caucus.topic}</span></> : null}
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Do you want to speak? · {caucus.perSpeakerSecs}s each
                {slots > 0 && <> · ≈{slots} slot{slots === 1 ? "" : "s"}</>}
                {windowLeftMs != null && (
                  <> · <span className={windowLeftMs < 15000 ? "text-red-600 dark:text-red-400 font-semibold tabular-nums" : "font-semibold tabular-nums"}>
                    answer within {fmtCountdown(windowLeftMs)}
                  </span></>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="flex-1 @lg:flex-none gap-1.5 min-w-20"
              disabled={!!busy} onClick={() => answer("yes")}>
              {busy === "yes" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Yes
            </Button>
            <Button size="sm" variant="outline" className="flex-1 @lg:flex-none min-w-20"
              disabled={!!busy} onClick={() => answer("no")}>
              {busy === "no" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "No"}
            </Button>
          </div>
        </div>

        {err && <p className="text-[11.5px] text-red-600 dark:text-red-400 mt-2">{err}</p>}
      </div>
    </div>
  );
}
