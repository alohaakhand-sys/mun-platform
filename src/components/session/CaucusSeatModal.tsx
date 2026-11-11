"use client";

/**
 * "Who wishes to speak?" — the moment the chair reads the placards back and fixes the order.
 *
 * REAL PROCEDURE. A moderated caucus opens, the chair asks the question, placards go up, and the
 * order the chair reads them in BECOMES the speakers list. Debate starts after that, not during it.
 * This dialog is that moment: the whole batch at once, in the order the server received it, with
 * the chair free to reorder and trim before committing.
 *
 * WHY A DIALOG AND NOT THE PANEL. The panel is one of ten tools behind a launcher; the end of the
 * signup window is a hard beat in the sitting that the chair must not be able to miss because they
 * happened to be looking at Marking. It raises itself, and it is dismissible — the panel keeps a
 * door back in ("Set the order").
 *
 * SEATING DOES NOT START THE CAUCUS. Committing writes the order and hands the floor back to the
 * live bar, whose primary then reads "Start: <country>". Two decisions, two taps: a chair who wants
 * thirty seconds to read the room before the clock starts gets them.
 *
 * KNOWN GAP, inherited from `useCaucusAutoAdd` and `useVoteAutoClose`: nothing here fires without a
 * chair-tier browser open. If every chair closed their laptop at the window's end the caucus sits in
 * "collecting" with an expired gate until one comes back — at which point this dialog raises itself
 * on mount, because it is derived from state rather than from an edge. A real guarantee needs a
 * scheduled Cloud Function.
 */
import { useEffect, useMemo, useState } from "react";
import {
  seatCaucusList, reaskCaucusSignups, endCaucus,
  type FloorRequest, type LiveSession, type SpeakerSlot,
} from "@/lib/services/sessionService";
import { caucusSlots, orderSignups, allAnswers, mergeSignupOrder } from "@/lib/services/caucusList";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { ConsoleModal, GroupLabel, SubCard } from "./console/shared";
import { SpeakerOrderList } from "./SpeakerOrderList";
import { ListChecks, RotateCcw, Plus, Loader2 } from "lucide-react";

export function CaucusSeatModal({
  eventId, sessionId, session, requests, userId, onClose,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  /** The console's live requests subscription — not re-subscribed here. */
  requests: FloorRequest[];
  userId: string;
  onClose: () => void;
}) {
  const caucus = session.caucus;
  const caucusId = caucus?.kind === "moderated" ? caucus.caucusId : undefined;
  const [draft, setDraft] = useState<SpeakerSlot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signups = useMemo(() => orderSignups(requests, caucusId), [requests, caucusId]);
  const answered = useMemo(() => allAnswers(requests, caucusId), [requests, caucusId]);

  /**
   * Seed once per caucus, queue first.
   *
   * Queue-first matters twice: the chair may have pre-seeded an order by hand, and "Ask again" on an
   * already-seated caucus reopens collecting over a queue that is still standing. Neither of those
   * speakers should lose their place to an answer that arrived later.
   */
  useEffect(() => {
    if (!caucusId) return;
    setDraft(mergeSignupOrder(caucus?.queue || [], orderSignups(requests, caucusId)));
    setError(null);
    // Deliberately keyed on the caucus alone. Re-seeding on every snapshot would yank the list out
    // from under a chair mid-drag; new answers surface as the explicit "add" row below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caucusId]);

  const order = draft ?? [];
  const inDraft = useMemo(() => new Set(order.map((s) => s.delegateId)), [order]);
  /**
   * Answers that landed after the dialog opened. Not spliced in automatically: the chair may be
   * mid-reorder, and a list that rearranges itself under the cursor is how you seat the wrong order.
   * This is a normal case, not an edge — the window's real deadline is enforced server-side with 2s
   * of grace against `request.time`, so a chair whose clock runs fast opens this while it is still
   * legal to sign up.
   */
  const late = useMemo(
    () => signups.filter((r) => !inDraft.has(r.delegateId)),
    [signups, inDraft],
  );

  if (!caucus || caucus.kind !== "moderated" || !caucusId) return null;

  const slots = caucusSlots(caucus);
  const present = Object.values(session.attendance || {})
    .filter((a) => a.status === "present" || a.status === "present_and_voting").length;
  const declined = answered.filter((r) => r.answer === "no").length;
  const silent = Math.max(0, present - answered.length);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      console.error("caucusSeat", e);
      setError("That didn't go through. The committee may have moved on — reopen and try again.");
      setBusy(false);
    }
  };

  const seat = () => run(async () => {
    const res = await seatCaucusList(eventId, sessionId, caucusId, order, userId, signups);
    // Guards inside the transaction (wrong caucus, already seated by another tab) return false
    // rather than throwing — say so instead of closing on a write that never happened.
    if (!res.seated) throw new Error("stale");
  });

  const first = order[0];

  return (
    <ConsoleModal
      wide
      icon={ListChecks}
      title="Set the speaking order"
      subtitle={caucus.topic ? `Moderated caucus · ${caucus.topic}` : "Moderated caucus"}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          {order.length === 0
            ? "Nobody put their placard up. Ask the room again, or end the caucus and return to the floor."
            : <>These delegations asked to speak, in the order they answered. Reorder or remove any of
              them — this becomes the caucus speakers list. Nobody takes the floor until you call the
              first speaker.</>}
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <GroupLabel count={order.length}>Speaking order</GroupLabel>
            {slots > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {slots} slot{slots === 1 ? "" : "s"} · {caucus.perSpeakerSecs}s each
              </span>
            )}
          </div>

          <SpeakerOrderList
            value={order}
            onChange={setDraft}
            canControl={!busy}
            slots={slots}
            droppableId="caucus-seat"
            emptyLabel="No signups. Ask again to reopen the window, or end the caucus."
          />

          {slots > 0 && order.length > slots && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 px-0.5">
              {order.length - slots} more than the caucus has time for — trim the list now, or let the
              room move to extend.
            </p>
          )}
        </div>

        {late.length > 0 && (
          <SubCard className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] text-muted-foreground">
                <b className="text-foreground">{late.length}</b> more{" "}
                {late.length === 1 ? "placard went" : "placards went"} up while you were reading:{" "}
                {late.map((r) => getCountryName(r.country) || r.country).join(", ")}
              </p>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11.5px] shrink-0"
                onClick={() => setDraft(mergeSignupOrder(order, late))}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
          </SubCard>
        )}

        <p className="text-[11px] text-muted-foreground px-0.5">
          {answered.length} of {present} present answered
          {declined > 0 && ` · ${declined} declined`}
          {silent > 0 && ` · ${silent} did not respond`}
        </p>

        {error && <p className="text-xs font-medium text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
          {order.length > 0 ? (
            <Button className="gap-2 flex-1 min-w-[200px]" disabled={busy} onClick={seat}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
              Set the order ({order.length})
              {first && (
                <span className="inline-flex items-center gap-1 opacity-80">
                  · {first.country && <CountryFlag code={first.country} size={16} />}
                  {getCountryName(first.country) || first.country} first
                </span>
              )}
            </Button>
          ) : (
            <Button variant="outline" className="gap-2 flex-1 min-w-[200px]" disabled={busy}
              onClick={() => run(() => endCaucus(eventId, sessionId))}>
              Nobody signed up — end the caucus
            </Button>
          )}
          <Button variant="ghost" className="gap-2" disabled={busy}
            onClick={() => run(() => reaskCaucusSignups(eventId, sessionId, caucus.signupWindowSecs, userId))}>
            <RotateCcw className="w-3.5 h-3.5" /> Ask again
          </Button>
        </div>
      </div>
    </ConsoleModal>
  );
}
