"use client";

/**
 * The moderated caucus's speakers list — the chair's half of the "digital placard raise".
 *
 * Real procedure: when a moderated caucus opens the chair asks who wishes to speak, delegates
 * raise placards, and the ORDER the chair reads them in becomes the speakers list. Delegates
 * answer the prompt on their console; each answer is a `caucus_signup` floor request whose
 * serverTimestamp fixes that order without trusting any client's clock.
 *
 * `caucus.queue` is the only authority on who speaks next. A signup never lands there on its
 * own — the chair adds it, exactly like granting any other floor request. That keeps the
 * initial batch and a delegate who raises their hand ten minutes later on ONE code path.
 */
import { useEffect, useMemo, useState } from "react";
import {
  subscribeRequests, resolveHand, enqueueSpeaker, setCaucusQueue, reaskCaucusSignups,
  type FloorRequest, type LiveSession,
} from "@/lib/services/sessionService";
import {
  caucusListState, caucusSlots, orderSignups, allAnswers, slotOfSignup,
} from "@/lib/services/caucusList";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { GroupLabel, QueueRow, PanelEmpty, ProxyChip } from "./console/shared";
import { SpeakerOrderList, IconBtn } from "./SpeakerOrderList";
import { Plus, HandMetal, RotateCcw, ListChecks, X } from "lucide-react";

const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function CaucusSpeakersList({
  eventId, sessionId, session, canControl, userId, onReviewSignups,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  canControl: boolean;
  /** Chair uid — stamped onto the request when it is granted. */
  userId: string;
  /**
   * Open the seat dialog now, without waiting for the window to lapse. The dialog is mounted by the
   * console (it has to survive whichever tool panel is open), so this panel only asks for it — and
   * it is also the way back in after the chair dismisses it.
   */
  onReviewSignups?: () => void;
}) {
  const caucus = session.caucus;
  const [requests, setRequests] = useState<FloorRequest[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeRequests(eventId, sessionId, setRequests), [eventId, sessionId]);

  // 1s ticker while the response window is open — the countdown chip and the copy switch to
  // "did not respond" both have to move without waiting for a snapshot.
  const [now, setNow] = useState(() => Date.now());
  const windowTicking = caucus?.kind === "moderated"
    && caucus.signupEndsAt != null && caucus.signupEndsAt > now;
  useEffect(() => {
    if (!windowTicking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [windowTicking]);

  const caucusId = caucus?.kind === "moderated" ? caucus.caucusId : undefined;
  const queue = useMemo(() => caucus?.queue || [], [caucus?.queue]);
  // While collecting, the seat dialog owns the queue — this panel reports, it does not place.
  const collecting = caucusListState(caucus) === "collecting";

  const mine = useMemo(() => allAnswers(requests, caucusId), [requests, caucusId]);
  /** Yes-answers the chair hasn't placed yet, in server order. Granting one removes it from here. */
  const waiting = useMemo(() => orderSignups(requests, caucusId), [requests, caucusId]);
  const declined = useMemo(() => mine.filter((r) => r.answer === "no").length, [mine]);

  const present = useMemo(
    () => Object.values(session.attendance || {})
      .filter((a) => a.status === "present" || a.status === "present_and_voting").length,
    [session.attendance]
  );
  const unanswered = Math.max(0, present - mine.length);

  if (!caucus || caucus.kind !== "moderated") return null;

  // Real procedure: a mod caucus motion fixes total time AND speaking time, so the list has a
  // natural length. Over-subscription is NORMAL — surface it, never cap it. The chair trims,
  // or the room motions to extend.
  const slots = caucusSlots(caucus);

  const addSome = async (reqs: FloorRequest[]) => {
    if (!canControl || busy || !reqs.length) return;
    setBusy(true);
    try {
      // ONE transaction for the whole batch: N separate ones would each retry against the
      // others and the later appends could lose.
      await enqueueSpeaker(eventId, sessionId, reqs.map(slotOfSignup), "caucus");
      await Promise.all(reqs.map((r) => resolveHand(eventId, sessionId, r, "granted", userId)));
    } catch (e) {
      console.error("addCaucusSpeakers", e);
    } finally { setBusy(false); }
  };

  const skip = async (r: FloorRequest) => {
    if (!canControl || busy) return;
    try { await resolveHand(eventId, sessionId, r, "dismissed", userId); }
    catch (e) { console.error("skipCaucusSignup", e); }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ── Speaking order ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <GroupLabel count={queue.length}>Speaking order</GroupLabel>
          {slots > 0 && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {slots} slot{slots === 1 ? "" : "s"} · {caucus.perSpeakerSecs}s each
            </span>
          )}
        </div>

        <SpeakerOrderList
          value={queue}
          onChange={(q) => setCaucusQueue(eventId, sessionId, q)}
          canControl={canControl && !collecting}
          slots={slots}
          droppableId="caucus-queue"
          emptyLabel={collecting
            ? "Collecting signups. The order dialog opens when the window closes."
            : "No one queued yet. Delegates are being asked who wants to speak."}
        />

        {slots > 0 && queue.length > slots && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 px-0.5">
            {queue.length - slots} more than the caucus has time for — trim the list, or extend the caucus.
          </p>
        )}
      </div>

      {/* ── Signed up (awaiting the chair) ─────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GroupLabel count={waiting.length}>Signed up</GroupLabel>
            {caucus.signupEndsAt != null && caucus.signupEndsAt > now && (
              <span className="text-[10px] tabular-nums font-semibold text-primary">
                {fmtCountdown(caucus.signupEndsAt - now)} to answer
              </span>
            )}
          </div>
          {/* While collecting, placing speakers is the seat dialog's job — two writers for a list
              that exists precisely to be frozen for review is the bug this flow fixes. The chair
              gets the door into that dialog here instead, which is also how they close the window
              early or get back in after dismissing it. */}
          {canControl && collecting && onReviewSignups && (
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11.5px]"
              onClick={onReviewSignups}>
              <ListChecks className="w-3.5 h-3.5" />
              {caucus.signupEndsAt != null && caucus.signupEndsAt > now
                ? "Close signups & set the order"
                : `Set the order${waiting.length ? ` (${waiting.length})` : ""}`}
            </Button>
          )}
          {canControl && !collecting && waiting.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11.5px]"
              disabled={busy} onClick={() => addSome(waiting)}>
              <Plus className="w-3.5 h-3.5" /> Add all
            </Button>
          )}
        </div>

        {waiting.length === 0 ? (
          <PanelEmpty icon={HandMetal}>
            {collecting ? "Nobody has answered yet." : "No one waiting to be added."}
          </PanelEmpty>
        ) : (
          <div className="space-y-1.5">
            {waiting.map((r, i) => (
              <QueueRow
                key={r.id}
                tone="emerald"
                coloredTitle
                icon={HandMetal}
                flag={r.country ? <CountryFlag code={r.country} size={20} /> : undefined}
                title={
                  collecting ? (
                    // Answer order IS the proposed speaking order, so show it while collecting —
                    // the chair is watching the list they are about to be handed take shape.
                    <span className="flex items-center gap-1.5">
                      <span className="tabular-nums text-muted-foreground/70 font-mono text-xs">{i + 1}.</span>
                      {getCountryName(r.country) || r.country || "Delegate"}
                    </span>
                  ) : (getCountryName(r.country) || r.country || "Delegate")
                }
                statusChip={r.proxyBy ? <ProxyChip name={r.proxyByName} /> : undefined}
                actions={canControl && !collecting ? (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" className="h-7 gap-1.5 text-[11.5px]" disabled={busy} onClick={() => addSome([r])}>
                      <Plus className="w-3.5 h-3.5" /> Add
                    </Button>
                    <IconBtn label="Skip" onClick={() => skip(r)}><X className="w-4 h-4" /></IconBtn>
                  </div>
                ) : undefined}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="text-[11px] text-muted-foreground">
            {caucus.signupEndsAt != null && caucus.signupEndsAt <= now && unanswered > 0
              ? `${unanswered} did not respond · treated as not speaking`
              : unanswered > 0
                ? `${unanswered} of ${present} yet to answer`
                : `All ${present} answered`}
            {declined > 0 && ` · ${declined} declined`}
          </p>
          {canControl && (
            <button type="button"
              onClick={() => reaskCaucusSignups(eventId, sessionId, caucus.signupWindowSecs, userId)}
              title="Clear every answer and ask the room again"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw className="w-3 h-3" /> Ask again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
