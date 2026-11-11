"use client";

/**
 * What the speaker does with the rest of their time — the one menu, three doors.
 *
 * Three of the four yields only change how their OWN speech runs, so they apply immediately.
 * Yielding to another delegation TRANSFERS time to someone else, so it asks the chair and waits —
 * see `requestYield`. That split is the whole reason this is not one uniform control.
 *
 * WHY IT LIVES OUTSIDE `FloorCard`. It used to be a private component there, reachable only by
 * noticing a small chevron row at the bottom of the card — which the delegate mid-speech, the one
 * person who can use it, kept missing. It is now rendered from three places (the Floor Card's
 * disclosure, a promoted button on that same card, and a round button in the video control bar)
 * and every one of them drives THIS component, so there is exactly one behaviour to reason about.
 *
 * Owns its own busy/error state rather than taking `run` from a host: two of the three hosts have
 * no card-level error surface to borrow.
 */
import { useMemo, useState } from "react";
import { Loader2, CornerUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoundBtn } from "./console/shared";
import { useBarMenu, BarMenuPopover } from "./console/barMenu";
import { useGateClock } from "./useGateClock";
import {
  declareOwnYield, requestYield, timerRemainingMs,
  type LiveSession, type ParticipationIdentity, type FloorRequest, type YieldKind,
  type ProxyAttribution,
} from "@/lib/services/sessionService";
import { holdsTheFloor, floorHolder, floorSpeechClock } from "@/lib/services/floorGate";
import { yieldGrantMs } from "@/lib/services/yieldClock";
import { getCountryName } from "@/lib/data/countries";

function mmss(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export interface YieldMenuProps {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  identity: ParticipationIdentity;
  /** The delegate's own requests — tells "already asked, waiting" from "not yet". */
  myHands: FloorRequest[];
  /** Called after a successful declare/request so a popover host can close itself. */
  onDone?: () => void;
  /**
   * Set when a vice-chair is yielding ON BEHALF of `identity`'s delegation from the Represent
   * panel. Two effects: the stamp rides down to the service, and the copy stops saying "you" —
   * the operator reading it is not the delegate whose time is being given away.
   */
  proxy?: ProxyAttribution;
}

/**
 * Is there a yield this delegate could still make right now? Drives whether a host renders at all.
 *
 * `floorHolder`, not `gsl.activeSpeaker`: in a moderated caucus the speaker lives on
 * `caucus.currentSpeaker` and the GSL slot is a stale leftover, so reading it directly both hid the
 * control from the actual speaker and read the WRONG delegate's `viaYield` flag.
 */
export function canYieldNow(session: LiveSession, delegateId: string): boolean {
  const holder = floorHolder(session);
  return !!holder && holder.delegateId === delegateId && !holder.viaYield;
}

export function YieldMenu({
  eventId, sessionId, session, identity, myHands, onDone, proxy,
}: YieldMenuProps) {
  const asProxy = !!proxy?.by;
  /** "You" for the delegate at their own console, the country for the vice-chair proxying. */
  const who = asProxy
    ? (getCountryName(identity.country) || identity.country || "This delegation")
    : "You";
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // WHICHEVER LIST IS SPEAKING. A moderated caucus runs on `caucus.speakerTimer` / `perSpeakerSecs`;
  // reading `gsl.*` here would count down a clock that is not running and promise the recipient a
  // speech length the caucus does not use.
  const clock = floorSpeechClock(session);
  const holder = floorHolder(session);
  // "They'd get M:SS" counts the live speech clock down, and no write drives that — the same
  // pure-clock gap the hook exists for. One interval, only while a speech is actually running.
  const now = useGateClock(clock.timer?.endsAt);

  const pendingYield = myHands.find((h) => h.kind === "yield" && h.status === "pending");

  // Everyone seated except me — you cannot yield to yourself, and the rule rejects it anyway.
  const targets = useMemo(
    () =>
      Object.values(session.attendance || {})
        .filter((a) => a.delegateId !== identity.delegateId)
        .filter((a) => a.status === "present" || a.status === "present_and_voting")
        .sort((a, b) => (getCountryName(a.country) || a.country).localeCompare(getCountryName(b.country) || b.country)),
    [session.attendance, identity.delegateId],
  );

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError("That didn't go through. The chair may have already moved the committee on.");
    } finally {
      setBusy(false);
    }
  };

  // The speech may have ended, or a caucus or vote started, since the host decided to render this.
  if (!holdsTheFloor(session, identity.delegateId)) {
    return <Note>{who} no longer {asProxy ? "holds" : "hold"} the floor.</Note>;
  }

  // A yield recipient's clock is their own allotment PLUS what was handed over, so a chain of
  // yields would compound without bound. Same sentence the chair's panels use — see FloorCard's
  // header note on the card, the chair preview and the rules all saying the same words.
  if (holder?.viaYield) {
    return (
      <Note>
        {who} received the floor by yield — {asProxy ? "it cannot" : "you cannot"} yield again.
      </Note>
    );
  }

  if (pendingYield) {
    const would = yieldGrantMs(clock.baseSecs, timerRemainingMs(clock.timer, now));
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 flex-wrap">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        Waiting for the chair to accept {asProxy ? "the" : "your"} yield to{" "}
        <b className="text-foreground">
          {getCountryName(pendingYield.yieldTargetCountry || "") || pendingYield.yieldTargetCountry}
        </b>{" "}
        — they&rsquo;d get <span className="tabular-nums font-semibold text-foreground">{mmss(would)}</span>.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!picking && (
        <div className="grid grid-cols-2 gap-1.5">
          <Ghost busy={busy} onClick={() => setPicking(true)}>To another delegation…</Ghost>
          <Ghost busy={busy} onClick={() => run(() => declareYield("questions"))}>To questions</Ghost>
          <Ghost busy={busy} onClick={() => run(() => declareYield("comments"))}>To comments</Ghost>
          <Ghost busy={busy} onClick={() => run(() => declareYield("none"))}>Back to the chair</Ghost>
        </div>
      )}

      {picking && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5">
            The chair has to accept before {asProxy ? "the time" : "your time"} transfers. They keep
            their own speaking time on top of whatever is left on the clock.
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5">
            {targets.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Nobody else is marked present.</p>
            )}
            {targets.map((t) => (
              <button
                key={t.delegateId}
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await requestYield(
                      eventId, sessionId, identity,
                      { country: t.country, delegateId: t.delegateId, applicationId: t.applicationId },
                      timerRemainingMs(clock.timer, Date.now()),
                      proxy,
                    );
                    setPicking(false);
                    onDone?.();
                  })
                }
                className="w-full text-left px-2.5 py-1.5 rounded-lg border border-border/60 text-xs text-foreground
                           hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50 transition-colors"
              >
                {getCountryName(t.country) || t.country}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
        </div>
      )}

      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
    </div>
  );

  async function declareYield(k: Exclude<YieldKind, "delegate">) {
    // `session` picks the field path — `gsl.activeSpeaker` or `caucus.currentSpeaker`. Both
    // branches exist in firestore.rules; writing the wrong one fails with "Missing or insufficient
    // permissions" in the BROWSER console only, which is what `run` turns into the error note.
    await declareOwnYield(eventId, sessionId, session, k, proxy);
    onDone?.();
  }
}

/**
 * The control-bar door: a round button over the video that opens the same menu upward.
 *
 * Renders NOTHING unless this delegate can actually yield, so hosts can drop it in unconditionally.
 * Deliberately NOT gated on `session.floorGate`: holding the floor is a fact of the speaker slot
 * (see `floorHolder`) and predates the gate, and the rules key the yield permission on the speaker
 * + attendance, never on the gate. On a legacy session (where `FloorCard` renders nothing at all)
 * this is therefore the ONLY yield surface — a strict improvement over none. Do not "fix" that
 * with a gate check.
 *
 * `useBarMenu`, NOT `useExclusiveDisclosure` — two different groups, and the distinction is the
 * point. `useExclusiveDisclosure` stops INLINE disclosures from fighting over vertical space
 * inside a video tile, and this floats, so it is still not a member of that one. `useBarMenu` is
 * the control bar's own group: this popover opens into the same band above the bar as the layout
 * switcher's, and each owning a private boolean is exactly what let the two stack.
 */
export function YieldMenuButton(props: Omit<YieldMenuProps, "onDone">) {
  const [open, setOpen] = useBarMenu("yield");
  const { session, identity, myHands } = props;
  const pending = myHands.some((h) => h.kind === "yield" && h.status === "pending");

  if (!canYieldNow(session, identity.delegateId) && !pending) return null;

  return (
    <div className="relative">
      <RoundBtn
        title="Yield my time"
        icon={CornerUpRight}
        onClick={() => setOpen((v) => !v)}
        active={open || pending}
        activeTone={pending ? "amber" : "primary"}
        haspopup
        expanded={open}
      />
      {/* The surface's `text-foreground` lives in `BarMenuPopover` and is load-bearing: this
          popover is mounted in the video control bar, i.e. INSIDE the always-`.dark` stage. */}
      <BarMenuPopover open={open} onClose={() => setOpen(false)} className="w-[280px] p-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
          Yield your remaining time
        </p>
        <YieldMenu {...props} onDone={() => setOpen(false)} />
      </BarMenuPopover>
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────────

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>;
}

/** Shared with FloorCard, which imports it back — the two must stay visually identical. */
export function Ghost({
  children, onClick, busy,
}: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        // Explicit `text-foreground`: this button is rendered both in the light console (Floor Card)
        // and inside the dark video stage (control-bar popover), and inherited colour is wrong in
        // one of those two. The token is right in both once it is actually stated.
        "px-2.5 py-2 rounded-lg border border-border bg-background/60 text-[11.5px] font-medium text-foreground",
        "hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50 transition-colors",
      )}
    >
      {children}
    </button>
  );
}
