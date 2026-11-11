"use client";

/**
 * GSL Speakers List Seating Modal — "Who wishes to speak on the GSL?"
 *
 * Appears when the GSL signup window finishes or when the chair taps "Complete signups".
 * Displays all delegations that signed up for the GSL, in the order received.
 * The chair can reorder, trim, add late signups, and click "Set order & start GSL".
 */
import { useEffect, useMemo, useState } from "react";
import {
  seatGslList, openGate, gateEndsAt,
  type FloorRequest, type LiveSession, type SpeakerSlot,
} from "@/lib/services/sessionService";
import { orderGslSignups, mergeSignupOrder } from "@/lib/services/caucusList";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { ConsoleModal, GroupLabel, SubCard } from "./console/shared";
import { SpeakerOrderList } from "./SpeakerOrderList";
import { ListChecks, RotateCcw, Plus, Loader2 } from "lucide-react";

export function GslSeatModal({
  eventId, sessionId, session, requests, userId, onClose,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  requests: FloorRequest[];
  userId: string;
  onClose: () => void;
}) {
  const gate = session.floorGate;
  const signupId = gate?.kind === "signup" && gate.signupFor === "gsl" ? gate.signupId : null;

  const [draft, setDraft] = useState<SpeakerSlot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signups = useMemo(() => orderGslSignups(requests, signupId), [requests, signupId]);

  useEffect(() => {
    setDraft(mergeSignupOrder(session.gsl?.queue || [], signups));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupId]);

  const order = draft ?? [];
  const inDraft = useMemo(() => new Set(order.map((s) => s.delegateId)), [order]);
  const late = useMemo(
    () => signups.filter((r) => !inDraft.has(r.delegateId)),
    [signups, inDraft],
  );

  const present = Object.values(session.attendance || {})
    .filter((a) => a.status === "present" || a.status === "present_and_voting").length;

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      console.error("gslSeat", e);
      setError("That didn't go through. Please try again.");
      setBusy(false);
    }
  };

  const seatAndStart = () => run(async () => {
    const res = await seatGslList(eventId, sessionId, order, userId, signups, true);
    if (!res.seated) throw new Error("stale");
  });

  const reopen = () => run(async () => {
    const windowSecs = 60;
    await openGate(eventId, sessionId, userId, {
      kind: "signup",
      signupFor: "gsl",
      signupId: `sg_${Date.now().toString(36)}`,
      allowsPoints: true,
      endsAt: gateEndsAt(windowSecs),
      windowSecs,
    });
  });

  const first = order[0];

  return (
    <ConsoleModal
      wide
      icon={ListChecks}
      title="Set General Speakers List Order"
      subtitle="General Speakers List"
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          {order.length === 0
            ? "Nobody added themselves to the Speakers List during signup. Re-open signups or add speakers manually."
            : <>Delegates added themselves to the Speakers List in the order received. Reorder or remove any of
              them, then set the order to start GSL speeches.</>}
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <GroupLabel count={order.length}>Speaking order</GroupLabel>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {session.gsl?.defaultSpeakerSecs ?? 90}s per speaker
            </span>
          </div>

          <SpeakerOrderList
            value={order}
            onChange={setDraft}
            canControl={!busy}
            droppableId="gsl-seat"
            emptyLabel="No signups received. Re-open signups to ask again."
          />
        </div>

        {late.length > 0 && (
          <SubCard className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] text-muted-foreground">
                <b className="text-foreground">{late.length}</b> more{" "}
                {late.length === 1 ? "delegate signed" : "delegates signed"} up:{" "}
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
          {signups.length} of {present} present delegations signed up
        </p>

        {error && <p className="text-xs font-medium text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
          {order.length > 0 ? (
            <Button className="gap-2 flex-1 min-w-[200px]" disabled={busy} onClick={seatAndStart}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
              Set order & start GSL ({order.length})
              {first && (
                <span className="inline-flex items-center gap-1 opacity-80">
                  · {first.country && <CountryFlag code={first.country} size={16} />}
                  {getCountryName(first.country) || first.country} first
                </span>
              )}
            </Button>
          ) : (
            <Button variant="outline" className="gap-2 flex-1 min-w-[200px]" disabled={busy} onClick={reopen}>
              Re-open signups
            </Button>
          )}
          <Button variant="ghost" className="gap-2" disabled={busy} onClick={reopen}>
            <RotateCcw className="w-3.5 h-3.5" /> Re-open signups
          </Button>
        </div>
      </div>
    </ConsoleModal>
  );
}
