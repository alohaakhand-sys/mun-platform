"use client";

/**
 * The delegate's Floor Card — one card, one truth, exactly one live action.
 *
 * THE RULE THIS ENFORCES: whatever the chair has opened is the only thing clickable.
 *
 * WHY LOCKED THINGS ARE STILL LISTED, BUT COLLAPSED. In parliamentary procedure knowing WHY you
 * are out of order is the skill being taught, so the reasons stay reachable. The first cut printed
 * all seven capabilities as separate rows and repeated the identical sentence four times — that is
 * noise, not teaching, and it ate the whole card. Now they are GROUPED BY REASON (one sentence,
 * however many capabilities share it) and COLLAPSED behind a single line, because a delegate who
 * already knows the procedure should not pay for it in screen space. Reasons are never authored
 * here — each is a `lockReason` string off `capabilitiesFor`, so this card, the chair's gate
 * preview and the rules all say the same words.
 *
 * LEGACY: renders nothing when the session predates `floorGate`. Those sessions keep the old
 * `CaucusSignupBar` + `MotionFloorBar` pair, which the console swaps in instead.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Gavel, Hand, ListChecks, Vote, Lock, Loader2, ChevronDown, CornerUpRight,
  GripVertical, Undo2, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGateClock } from "./useGateClock";
import { useDockedCard } from "./useDockedCard";
// The provider is mounted by the console AROUND this card, not inside it: a component cannot read a
// context it renders itself, so an inner provider would leave this card's own disclosure ungrouped.
import { useExclusiveDisclosure } from "./useExclusiveDisclosure";
import {
  declareOwnAttendance, joinSignup, subscribeMyMotions,
  type LiveSession, type ParticipationIdentity, type FloorRequest, type YieldKind,
  type AttendanceStatus, type Motion,
} from "@/lib/services/sessionService";
import {
  capabilitiesFor, gateHeadline, holdsTheFloor, floorOccupancy, floorHolder,
  type CapabilityKey, type DelegateCapabilities,
} from "@/lib/services/floorGate";
// The "one live motion of a type per delegation" rule, shared with `ProposeMotionForm` — this card
// is where the delegate SEES it, the form is where it is enforced.
import { myLiveMotion, duplicateMotionNote } from "@/lib/services/motionFloor";
// The yield menu is shared with the video control bar — see YieldMenu.tsx on why it left this file.
import { YieldMenu, canYieldNow } from "./YieldMenu";
import { MOTION_META } from "@/lib/services/motionMeta";

/** Shown next to a struck-through capability. Short — the grouped reason carries the detail. */
const CAPABILITY_LABEL: Record<CapabilityKey, string> = {
  canProposeMotion: "Motions",
  canSecondMotion: "Second",
  canRaisePoint: "Points",
  canJoinSignup: "Speakers list",
  canCastBallot: "Vote",
  canRequestFloor: "Ask to speak",
  canDeclareAttendance: "Roll call",
};

/** Reading order: what a delegate reaches for most often, first. */
const CAPABILITY_ORDER: CapabilityKey[] = [
  "canProposeMotion", "canSecondMotion", "canRaisePoint",
  "canJoinSignup", "canCastBallot", "canRequestFloor", "canDeclareAttendance",
];

function mmss(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function FloorCard({
  eventId, sessionId, session, identity, myHands,
  onProposeMotion, onRaisePoint, onOpenVote,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  identity: ParticipationIdentity;
  /** The delegate's own requests — tells "already signed up / already asked" from "not yet". */
  myHands: FloorRequest[];
  onProposeMotion: () => void;
  onRaisePoint: () => void;
  onOpenVote: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The one moment this card celebrates. Roll call is the only action a delegate takes that the
  // room cannot echo back at them — no speakers list to appear on, no tally to watch — so it is the
  // one that needs saying out loud. Holds the status just declared; a timer clears it.
  const [celebrated, setCelebrated] = useState<"present" | "present_and_voting" | null>(null);
  // Exclusive with the yield picker below — the card is small and two open lists overflow it.
  const [showLocked, setShowLocked] = useExclusiveDisclosure("locked-actions");
  // Same id as YieldControl's own call. `useExclusiveDisclosure` derives `open` from the group's
  // single `openId`, so the promoted button and the disclosure row are the SAME boolean with no
  // prop drilling — one menu, whichever door opened it.
  const [, setYieldOpen] = useExclusiveDisclosure("yield");
  // Where the delegate parked it, and whether they folded it away. Both persist — see useDockedCard.
  // Destructured, NOT held as `dock.*`: passing the object's callback straight into `ref=` makes
  // the compiler lint treat the whole object as a ref, and then every other field reads as a
  // ref access during render.
  const {
    attach: attachCard, style: cardStyle, handleProps: gripProps,
    dragging, collapsed, toggleCollapsed, moved, reset: resetPosition,
  } = useDockedCard("mun-floor-card");

  const gate = session.floorGate ?? null;
  const now = useGateClock(gate?.endsAt ?? null);
  const caps = useMemo(
    () => capabilitiesFor(session, identity.delegateId, now),
    [session, identity.delegateId, now],
  );

  // Both shapes `joinSignup` writes: a GSL signup is a `speak`, a caucus signup is a
  // `caucus_signup` (see the note there on why they are different documents). Deliberately not
  // status-filtered — seating the list resolves the request to `granted`, and the delegate should
  // keep reading "you're on the list" through that frame rather than watching the button come back.
  const signedUp = useMemo(() => {
    const id = gate?.signupId;
    if (!id) return false;
    return myHands.some(
      (h) => h.signupId === id && (h.kind === "speak" || h.kind === "caucus_signup"),
    );
  }, [myHands, gate?.signupId]);

  /**
   * The delegation's own motions — so this card can say "you have already moved this" ON the button
   * instead of handing the delegate a live button that the propose form will then refuse.
   *
   * ONE LISTENER, and it is the same query `ProposeMotionForm` and `MyMotionsList` already run, so
   * the SDK multiplexes all three onto a single stream. A delegate's own motion queue is a handful
   * of documents that change only when they or the chair act on one — no polling, nothing
   * collection-group-wide. See the Spark read budget.
   */
  const [myMotions, setMyMotions] = useState<Motion[]>([]);
  useEffect(
    () => subscribeMyMotions(eventId, sessionId, identity.delegateId, setMyMotions),
    [eventId, sessionId, identity.delegateId],
  );

  // Long enough to read, short enough that it is gone before the chair says the next thing. The
  // card's own confirmed line is what carries the fact from here on — this only marks the landing.
  useEffect(() => {
    if (!celebrated) return;
    const t = setTimeout(() => setCelebrated(null), 2000);
    return () => clearTimeout(t);
  }, [celebrated]);

  // Legacy sessions keep the pre-gate bars. Rendering both would double every prompt.
  if (caps.legacy) return null;

  const run = async (fn: () => Promise<void>, onOk?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onOk?.();
    } catch {
      setError("That didn't go through. The chair may have already moved the committee on.");
    } finally {
      setBusy(false);
    }
  };

  const kind = caps.effectiveKind;
  const open = kind !== "locked";
  const remaining = caps.expiresAt != null ? caps.expiresAt - now : null;
  // `holdsTheFloor`, not a bare id comparison: a caucus or a vote leaves `gsl.activeSpeaker`
  // standing, and this card kept offering the last speaker a yield for the whole caucus.
  const iHoldTheFloor = holdsTheFloor(session, identity.delegateId);
  const pendingYield = myHands.some((h) => h.kind === "yield" && h.status === "pending");
  // Read off the session, not off local state: reload mid-roll-call and the confirmation must still
  // be there, and a chair who moves you back to absent must hand the buttons back.
  const declaredStatus = session.attendance?.[identity.delegateId]?.status ?? null;

  return (
    <>
    {/* OUTSIDE the docked wrapper, on purpose. `useDockedCard` puts the drag offset in `cardStyle`,
        and a transform on an ancestor becomes the containing block for `position: fixed` — nested,
        this would centre itself on the dragged card instead of the screen. Not portalled to
        `document.body` either: the live console carries its own token scope, and `body` is where
        those tokens are not. */}
    {celebrated && <RollCallConfirm status={celebrated} />}

    <div
      ref={attachCard}
      style={cardStyle}
      className={cn(
        "pointer-events-auto px-3 sm:px-4 pt-2 w-full max-w-2xl mx-auto",
        // While dragging, the card must not be the thing the browser hit-tests for text selection.
        dragging && "select-none",
      )}
    >
      <div
        className={cn(
          // WHY THE FILL IS OPAQUE. This card floats over the video stage, and that stage is ALWAYS
          // `.dark` — but the card itself sits OUTSIDE it (see DelegateSessionConsole: it is a
          // sibling overlay of `main.dark`), so its tokens follow the console's own light/dark
          // choice. The first cut filled it with `bg-primary/10`, i.e. ~90% see-through: in light
          // theme that painted light-theme ink (muted-foreground 0.55) straight onto near-black
          // footage, and in dark theme the moving video showed through the type. Neither was
          // readable. The card now carries its OWN surface — `bg-card` at 96% behind the blur — so
          // foreground/muted-foreground land on the surface they were tuned against in both themes.
          // The glass stays: the blur still settles the footage, the fill just stops leaking it.
          "relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-colors",
          "bg-card/96 shadow-lg shadow-black/10",
          collapsed ? "px-3 py-2" : "px-4 py-3",
          open ? "border-primary/45" : "border-border",
        )}
      >
        {/* The open/locked tint rides ON TOP of the opaque fill instead of being the fill, so the
            state stays legible as colour without costing contrast. */}
        <div
          aria-hidden
          className={cn("absolute inset-0 pointer-events-none", open ? "bg-primary/[0.06]" : "bg-muted/50")}
        />

        <div className="relative">
          {/* HEADER = DRAG HANDLE. Only this strip grabs the pointer: the body is full of buttons
              and a scrollable yield list, and making the whole card draggable would turn every
              mis-aimed tap into a nudge. The headline stays the headline — it just also happens to
              be the thing you hold. Double-click puts the card back where the layout wants it. */}
          <div
            {...gripProps}
            title="Drag to move · double-click to reset"
            className={cn(
              "flex items-center gap-2 rounded-lg -mx-1 px-1",
              dragging && "bg-primary/10",
            )}
          >
            <GripVertical className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
            <span
              className={cn(
                "text-[13.5px] font-bold tracking-tight min-w-0 truncate",
                open ? "text-primary" : "text-foreground",
              )}
            >
              {/* See GateBar: a gate that occupancy overrode must not keep its old label. */}
              {gateHeadline(caps.gateOverridden ? null : gate, kind)}
            </span>

            {/* Folded away, the headline is all that is left — so an action waiting behind it needs
                a tell, or the delegate misses their window without knowing there was one. */}
            {collapsed && open && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-pulse" aria-hidden />
            )}

            <div className="ml-auto flex items-center gap-1 shrink-0">
              {remaining != null && (
                <span
                  className={cn(
                    "text-sm font-bold tabular-nums px-2 py-0.5 rounded-md border bg-background/70",
                    remaining <= 15_000
                      ? "text-destructive border-destructive/45"
                      : "text-foreground border-border",
                  )}
                >
                  {mmss(remaining)}
                </span>
              )}
              {moved && (
                <IconBtn label="Move back to its default position" onClick={resetPosition}>
                  <Undo2 className="w-3.5 h-3.5" />
                </IconBtn>
              )}
              <IconBtn
                label={collapsed ? "Expand the floor card" : "Collapse to the headline"}
                expanded={!collapsed}
                onClick={toggleCollapsed}
              >
                <ChevronDown
                  className={cn("w-4 h-4 transition-transform", !collapsed && "rotate-180")}
                />
              </IconBtn>
            </div>
          </div>

          {!collapsed && (
          <>
          <GateBody
            kind={kind}
            caps={caps}
            // A `debate` gate outlives the speech that justified it: `secs: null` is what the flow
            // advises for one, so it never lapses on its own, and once the Speakers List drains the
            // gate still SAYS "debate" with nobody on the mic. Passing real occupancy is what keeps
            // the card from telling a room of nine delegates that somebody holds the floor.
            floorHeld={floorOccupancy(session) === "debate"}
            // On `live.stage` without holding a speech: the chair's "Give the floor" from a video
            // tile. The token server makes them a broadcaster, so the card must not say "nothing
            // to do" while their camera is live.
            onAir={(session.live?.stage || []).includes(identity.delegateId) &&
              floorHolder(session)?.delegateId !== identity.delegateId}
            signedUp={signedUp}
            declaredStatus={declaredStatus}
            myMotions={myMotions}
            busy={busy}
            onDeclare={(s) => run(
              () => declareOwnAttendance(eventId, sessionId, identity, s),
              () => setCelebrated(s),
            )}
            // The gate and the live caucus id together decide WHICH list this joins — passing the
            // bare signupId is what used to file every caucus signup onto the GSL.
            onJoin={() => run(() => joinSignup(
              eventId, sessionId, identity, gate, session.caucus?.caucusId,
            ))}
            onProposeMotion={onProposeMotion}
            onRaisePoint={onRaisePoint}
            onOpenVote={onOpenVote}
          />

          {/* The promoted door. `GateBody` above may have rendered "Raise a point" at this same
              weight, and that ordering is the correct hierarchy for a speaker: a point interrupts,
              a yield ends. Toggling the shared `"yield"` disclosure rather than opening a modal —
              this card already floats over the video, and stacking a full-screen dialog on it to
              show four buttons is heavier than the interaction deserves. */}
          {canYieldNow(session, identity.delegateId) && !pendingYield && (
            <div className="mt-2.5">
              <Primary busy={busy} icon={CornerUpRight} onClick={() => setYieldOpen((v) => !v)}>
                Yield my time
              </Primary>
            </div>
          )}

          {iHoldTheFloor && (
            <YieldControl
              eventId={eventId} sessionId={sessionId} session={session}
              identity={identity} myHands={myHands}
            />
          )}

          {error && <p className="text-xs font-medium text-destructive mt-2.5">{error}</p>}

          <LockedSummary caps={caps} open={showLocked} onToggle={() => setShowLocked((v) => !v)} />
          </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ── The landing, said out loud ──────────────────────────────────────────────────

/**
 * Two seconds of "yes, that registered", centred on the screen.
 *
 * WHY A POPUP AND NOT A LINE IN THE CARD. The card is a floating panel the delegate may have
 * dragged to a corner and half-collapsed; a state change inside it is exactly the thing they were
 * already failing to notice. Roll call happens once, it is the delegate's first act of the session,
 * and getting it wrong means being marked absent for the day — so it earns the interruption. No
 * other action in this card does, which is why nothing else calls this.
 *
 * `pointer-events-none` throughout: it overlaps the video stage and the chair's own controls, and
 * it must never swallow a tap meant for either. It leaves on a timer, not on a click.
 */
function RollCallConfirm({ status }: { status: "present" | "present_and_voting" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[70] grid place-items-center pointer-events-none px-6"
    >
      <div
        className="flex flex-col items-center gap-3 rounded-3xl border border-emerald-500/40
                   bg-card/95 backdrop-blur-xl px-8 py-7 text-center shadow-xl shadow-black/15
                   animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        <span
          aria-hidden
          className="grid place-items-center w-14 h-14 rounded-full bg-emerald-500/12
                     ring-1 ring-emerald-500/35"
        >
          <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </span>
        <div>
          <p className="text-base font-bold tracking-tight text-foreground">
            Marked {status === "present_and_voting" ? "present and voting" : "present"}
          </p>
          <p className="text-[12.5px] text-muted-foreground mt-1">
            The chair has your answer.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── The live action, per gate ───────────────────────────────────────────────────

function GateBody({
  kind, caps, floorHeld, onAir, signedUp, declaredStatus, myMotions, busy,
  onDeclare, onJoin, onProposeMotion, onRaisePoint, onOpenVote,
}: {
  kind: DelegateCapabilities["effectiveKind"];
  caps: DelegateCapabilities;
  /** Is a delegate ACTUALLY on the mic — as opposed to a `debate` gate still standing? */
  floorHeld: boolean;
  /** On the video stage by the chair's hand, without a running speech. */
  onAir: boolean;
  signedUp: boolean;
  /** What the roll sheet already says about this delegate — `null` on a session with no attendance. */
  declaredStatus: AttendanceStatus | null;
  /** The delegation's own motions, for the already-moved state on the propose button. */
  myMotions: Motion[];
  busy: boolean;
  onDeclare: (s: "present" | "present_and_voting") => void;
  onJoin: () => void;
  onProposeMotion: () => void;
  onRaisePoint: () => void;
  onOpenVote: () => void;
}) {
  // ENTERED ON `kind` ALONE, not on `canDeclareAttendance` — that flag now goes false the moment the
  // delegate answers, and falling through to the generic locked copy would erase the confirmation
  // one frame after they earned it. The already-answered state is the terminal one, same as the
  // signup branch below.
  if (kind === "roll_call") {
    if (declaredStatus === "present" || declaredStatus === "present_and_voting") {
      return (
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed mt-1.5">
          <CheckCircle2
            className="w-4 h-4 shrink-0 mt-px text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <span className="text-muted-foreground">
            You are marked{" "}
            <b className="text-foreground">
              {declaredStatus === "present_and_voting" ? "present and voting" : "present"}
            </b>
            . The chair has your answer — only the chair can change it now.
          </span>
        </p>
      );
    }
    if (caps.canDeclareAttendance) {
      return (
        <>
          <Line>Declare your status before the timer ends. Say nothing and you stay marked absent.</Line>
          <div className="grid grid-cols-2 gap-2">
            <Primary busy={busy} onClick={() => onDeclare("present")}>Present</Primary>
            <Primary busy={busy} onClick={() => onDeclare("present_and_voting")}>Present and voting</Primary>
          </div>
        </>
      );
    }
  }

  if (kind === "motions" && caps.canProposeMotion) {
    const types = caps.proposableMotionTypes;
    /**
     * ALREADY MOVED — the terminal state, same shape as the roll-call and signup branches above.
     *
     * The card's whole promise is that the one clickable thing is the one thing you may do. A
     * delegation that has already moved every motion the gate admits may do NOTHING here, and
     * leaving a live button there is what produced three identical motions in one chair's queue:
     * no confirmation came back, so the delegate pressed it again. The button now carries the
     * answer instead of the form having to refuse it one screen later.
     *
     * Keyed on EVERY admitted type, not just the first: a gate admitting three motions is not
     * spent because one of them is on the floor.
     */
    const moved = types.map((t) => myLiveMotion(myMotions, t));
    const allMoved = types.length > 0 && moved.every(Boolean);
    if (allMoved) {
      return (
        <>
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed mt-1.5">
            <CheckCircle2
              className="w-4 h-4 shrink-0 mt-px text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            <span className="text-muted-foreground">
              {types.length === 1
                ? duplicateMotionNote(moved[0]!)
                : "You have already moved every motion the chair has opened the floor for."}
            </span>
          </p>
          <Primary busy={busy} disabled onClick={onProposeMotion} icon={Lock}>
            You have already moved this
          </Primary>
        </>
      );
    }
    return (
      <>
        <Line>
          {types.length === 1
            ? <>Only one motion is in order: <b className="text-foreground">{MOTION_META[types[0]].label}</b>.</>
            : <>{types.length} motions are in order: {types.map((t) => MOTION_META[t].short).join(" · ")}.</>}
        </Line>
        <Primary busy={busy} onClick={onProposeMotion} icon={Gavel}>
          {types.length === 1 ? `Move to ${MOTION_META[types[0]].short.toLowerCase()}` : "Propose a motion"}
        </Primary>
      </>
    );
  }

  if (kind === "signup" && caps.canJoinSignup) {
    // A caucus signup is the digital placard raise, and it says so: the delegate is answering
    // "who wishes to speak in this caucus", not adding a slot to the General Speakers List.
    const caucus = caps.canJoinSignup === "caucus";
    if (signedUp) {
      return (
        <Line last>
          {caucus
            ? "You're on the caucus speakers list. The chair sets the order when the window closes."
            : "You are on the list. The chair sets the order when signup closes."}
        </Line>
      );
    }
    return (
      <>
        <Line>
          {caucus
            ? "The chair is asking who wishes to speak in this caucus. Ignore this to stay off the list."
            : "Add yourself to speak, or ignore this to stay off the list."}
        </Line>
        <Primary busy={busy} onClick={onJoin} icon={ListChecks}>
          {caucus ? "Add me to the caucus speakers list" : "Add me to the list"}
        </Primary>
      </>
    );
  }

  if (kind === "voting" && caps.canCastBallot) {
    return (
      <>
        <Line>A vote is open. You get one ballot.</Line>
        <Primary busy={busy} onClick={onOpenVote} icon={Vote}>Cast your ballot</Primary>
      </>
    );
  }

  if (caps.canRaisePoint) {
    return (
      <>
        <Line>
          {onAir ? "You're on air: the chair gave you the floor. Your camera and mic are live."
            : kind === "debate"
            // "A delegate holds the floor" has to be true when it is printed. Under a `debate` gate
            // with the mic empty — the state the Speakers List leaves behind when it runs dry — the
            // honest sentence is that the chair is between speakers, and it doubles as the delegate's
            // cue that motions are about to come back.
            ? floorHeld
              ? "A delegate holds the floor. You may interrupt only with a point."
              : "The chair is between speakers. Points are open."
            : "Points are open."}
        </Line>
        <Primary busy={busy} onClick={onRaisePoint} icon={Hand}>Raise a point</Primary>
      </>
    );
  }

  if (onAir) {
    return <Line last>You&rsquo;re on air: the chair gave you the floor. Your camera and mic are live.</Line>;
  }
  return (
    <Line last>
      <Lock className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
      The chair has the floor. Nothing to do right now.
    </Line>
  );
}

// ── Yield ───────────────────────────────────────────────────────────────────────
/**
 * The card's disclosure door onto `YieldMenu` — a status line the speaker can expand.
 *
 * This is the ORIGINAL yield surface and it stays, because a delegate who already knows where it
 * is should keep finding it there. It is no longer the only one: the promoted button above it and
 * the control-bar button over the video open the same menu, and all three share the `"yield"`
 * disclosure id so opening from any of them collapses the locked-actions list and never leaves two
 * copies of the menu on screen at once.
 */
function YieldControl({
  eventId, sessionId, session, identity, myHands,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  identity: ParticipationIdentity;
  myHands: FloorRequest[];
}) {
  const [open, setOpen] = useExclusiveDisclosure("yield");

  const pendingYield = myHands.find((h) => h.kind === "yield" && h.status === "pending");
  // The holder's slot, not `gsl.activeSpeaker` — mid-caucus the latter is a stale leftover, so this
  // read both showed the wrong `yieldTo` chip and tested the wrong delegate's `viaYield`.
  const holder = floorHolder(session);
  const activeYield: YieldKind = holder?.yieldTo ?? "none";

  // A yield already waiting on the chair is a STATUS, not an action, and so is "you got here by a
  // yield and cannot pass it on". Neither is worth hiding behind a chevron labelled as an action —
  // and a trigger that says "yield your remaining time" to someone who cannot is a lie. `YieldMenu`
  // authors both sentences, so the card never states a rule in its own words.
  if (pendingYield || holder?.viaYield) {
    return (
      <div className="mt-3 pt-3 border-t border-border/50">
        <YieldMenu
          eventId={eventId} sessionId={sessionId} session={session}
          identity={identity} myHands={myHands}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-xs font-semibold text-foreground/90 hover:text-foreground"
      >
        <CornerUpRight className="w-3.5 h-3.5 text-primary shrink-0" />
        You have the floor — yield your remaining time
        {activeYield !== "none" && (
          <span className="text-[10px] uppercase tracking-wide text-primary font-bold">
            {activeYield}
          </span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 ml-auto transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2.5">
          <YieldMenu
            eventId={eventId} sessionId={sessionId} session={session}
            identity={identity} myHands={myHands} onDone={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Absence, made legible — but grouped and collapsed ───────────────────────────

function LockedSummary({
  caps, open, onToggle,
}: { caps: DelegateCapabilities; open: boolean; onToggle: () => void }) {
  // Group by the SENTENCE. Four capabilities sharing "the chair has not opened the floor for this"
  // is one fact, not four, and printing it four times is what made the first version unreadable.
  const groups = useMemo(() => {
    const by = new Map<string, CapabilityKey[]>();
    for (const k of CAPABILITY_ORDER) {
      const why = caps.lockReason[k];
      if (!why) continue;
      by.set(why, [...(by.get(why) ?? []), k]);
    }
    return [...by.entries()];
  }, [caps]);

  const count = groups.reduce((n, [, keys]) => n + keys.length, 0);
  if (count === 0) return null;

  return (
    <div className="mt-3 pt-2.5 border-t border-border/50">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Lock className="w-3 h-3 shrink-0" />
        {count} {count === 1 ? "action is" : "actions are"} locked
        <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5">
          {groups.map(([why, keys]) => (
            <li key={why} className="text-[11.5px] leading-snug">
              {/* Label and reason must stay tellable apart, but the dimmer of the two was at /70 of
                  an already-muted token — below 3:1 in both themes. Separation is now weight, not
                  a second round of fading. */}
              <span className="font-semibold text-foreground/75 line-through">
                {keys.map((k) => CAPABILITY_LABEL[k]).join(" · ")}
              </span>
              <span className="text-muted-foreground"> — {why}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────────

function Line({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <p className={cn("text-[12.5px] text-muted-foreground leading-relaxed mt-1.5", !last && "mb-2.5")}>
      {children}
    </p>
  );
}

/** Header control. `aria-label` only — the strip has no room for a second word of text. */
function IconBtn({
  children, onClick, label, expanded,
}: { children: React.ReactNode; onClick: () => void; label: string; expanded?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/10
                 transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

function Primary({
  children, onClick, busy, icon: Icon, disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  icon?: React.ElementType;
  /**
   * Dead on purpose, and still rendered. A terminal state ("you have already moved this") reads as
   * an answer where the action was; hiding the button would leave the delegate hunting for one.
   */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        "w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold",
        "transition-colors",
        disabled
          // Not `opacity-60` on the primary fill: a dimmed blue slab still reads as the live action
          // at a glance, and this one must read as spent.
          ? "bg-muted text-muted-foreground cursor-not-allowed"
          : "bg-primary text-primary-foreground disabled:opacity-60 hover:bg-primary/90",
      )}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon ? <Icon className="w-4 h-4" /> : null}
      {children}
    </button>
  );
}

/** Re-exported for the chair's "what can the room do" preview, which renders the same list. */
export { CAPABILITY_LABEL, CAPABILITY_ORDER };
