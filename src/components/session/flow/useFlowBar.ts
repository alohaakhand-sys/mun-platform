"use client";

/**
 * Flow Bar binding layer — the ONE place a flow suggestion becomes a write.
 *
 * `deriveFlow` returns action *tokens*; this hook turns them into callables. Splitting it that
 * way means the pure model can be reasoned about (and tested) without Firestore, and it means
 * there is exactly one site where the double-fire invariant has to hold:
 *
 *   THE DELEGATION RULE — every token in `DELEGATED_TO_FLOOR` is bound to `floor.primary.onClick`
 *   VERBATIM. This hook never imports nextSpeaker / endCaucus / finalizeVote.
 *
 * Those four actions (start speaker, next speaker, end caucus, close vote) are the same
 * transaction the LiveStrip's primary button fires. Reusing its handler means both surfaces share
 * `useFloorController`'s in-flight latch *by construction* — a double-tap across the two can't fire
 * `nextSpeaker` twice — and the Flow Bar inherits the participation bump and the post-speech
 * scoring prompt that `handleNext` already does. Rebinding them to a fresh service call would
 * silently lose all three properties, so a dev-mode assertion below fails loudly if anyone tries.
 *
 * Everything else gets its own `useActionLatch`, and every chip is disabled while EITHER latch is
 * busy, so the two cross-disable.
 */
import { useCallback, useMemo, useState } from "react";
import {
  setPhase, setAttendanceBulk, setAgendaItems, setActiveAgenda, advanceAgenda,
  recognizeMotion, putMotionToVote, executeMotion, extendCaucus, publishVoteResult,
  openMotionFloor, closeMotionFloor, suspendSession, resumeSession, reopenSession,
  openGate, closeGate, gateEndsAt,
  startRollCall, stopRollCall, completeRollCall,
  type LiveSession, type Motion, type FloorRequest, type ParticipationIdentity,
} from "@/lib/services/sessionService";
import { MOTION_META } from "@/lib/services/motionMeta";
import { ALL_DELEGATE_MOTION_TYPES } from "@/lib/services/floorGate";
import { readFloorFacts, relevantMotionTypes } from "@/lib/services/motionMootness";
import { readRollCall, ROLL_CALL_DEFAULT_SECS } from "@/lib/services/rollCall";
import {
  deriveFlow, DELEGATED_TO_FLOOR, getAgenda,
  type FlowState, type FlowSuggestion, type FlowPanelId, type FlowActionId,
} from "./flowModel";
import { adviseGate } from "./gateAdvice";
import { useActionLatch } from "./useActionLatch";
import { useGateClock } from "../useGateClock";

/** Fallback window for a one-tap motions gate when the advice has no opinion on length. */
const MOTION_GATE_DEFAULT_SECS = 90;

/**
 * The motion types a one-tap "open the floor to motions" should admit, and the window to give them.
 *
 * Takes the advice when the flow actually advises motions — that is the whole point of the one tap,
 * the chair gets the recommended set without opening the dialog. Falls back to every type the floor
 * has not already answered when the flow is advising something else (the chair tapped it anyway,
 * which is their prerogative), so the gate is never opened empty.
 */
function motionGateSpec(session: LiveSession, motions: Motion[]) {
  const advice = adviseGate({ session, motions });
  const onMotions = advice.kind === "motions" && !!advice.motionTypes?.length;
  const motionTypes = onMotions
    ? advice.motionTypes!
    : relevantMotionTypes(
        ALL_DELEGATE_MOTION_TYPES,
        readFloorFacts(session, getAgenda(session), motions),
      );
  const secs = onMotions && advice.secs !== undefined ? advice.secs : MOTION_GATE_DEFAULT_SECS;
  return {
    // A fully-pruned list would make the gate unproposable, so keep the authored set as the floor.
    motionTypes: motionTypes.length ? motionTypes : ALL_DELEGATE_MOTION_TYPES,
    secs,
  };
}

/** A suggestion with its handler resolved. */
export interface BoundSuggestion extends FlowSuggestion {
  onRun: () => void;
  disabled: boolean;
}

export interface BoundFlowState extends Omit<FlowState, "suggestions"> {
  suggestions: BoundSuggestion[];
  busy: boolean;
  error: string | null;
  clearError: () => void;
}

/** The slice of `FloorState` the Flow Bar consumes. Kept structural to avoid a circular import. */
export interface FloorHandoff {
  busy: boolean;
  primary: { onClick: () => void; disabled?: boolean } | null;
}

export function useFlowBar({
  session, motions, requests, committeeAgendas, floor,
  eventId, sessionId, userId, identityFor, delegates, canControl, onOpenTool,
  onReviewGslSignups, onReviewCaucusSignups,
}: {
  session: LiveSession;
  motions: Motion[];
  requests: FloorRequest[];
  committeeAgendas: string[];
  floor: FloorHandoff;
  eventId: string;
  sessionId: string;
  userId: string;
  identityFor: (delegateId: string) => ParticipationIdentity;
  /** Roll-call roster, for "Mark all present". Only `userId` is read off each entry. */
  delegates: { userId?: string }[];
  canControl: boolean;
  onOpenTool: (panel: FlowPanelId) => void;
  onReviewGslSignups?: () => void;
  onReviewCaucusSignups?: () => void;
}): BoundFlowState {
  const latch = useActionLatch("flow action");
  // Destructured so the binding memo depends on stable primitives, not the latch object.
  const { busy: latchBusy, guard, error, clearError } = latch;
  // Two-step confirm state: the id of the suggestion currently awaiting confirmation.
  const [armed, setArmed] = useState<string | null>(null);

  /**
   * THE ONE CLOCK EVENT THIS MODEL HAS TO SEE. Every other input to `deriveFlow` arrives through
   * `subscribeSession` and re-renders for free; a roll-call window LAPSING is pure clock with no
   * write behind it, and without this the bar would sit on "Stop roll call" long after the
   * countdown hit zero — until some unrelated snapshot happened along.
   *
   * The ticking `now` is handed down ONLY while the window is genuinely ahead. `useGateClock`
   * freezes at its mount value once nothing is pending, and feeding `deriveFlow` a frozen clock
   * would rot every other time-dependent branch in it (the caucus `endingSoon` test, the motion
   * invite's expiry). `undefined` lets it read a fresh `Date.now()` itself. At the crossing second
   * `now` flips number → undefined, which re-runs the memo — which is the whole point.
   */
  const rollWindowEndsAt = readRollCall(session).windowEndsAt;
  const rollTick = useGateClock(rollWindowEndsAt);
  const now = rollWindowEndsAt != null && rollWindowEndsAt > rollTick ? rollTick : undefined;

  const flow = useMemo(
    () => deriveFlow({ session, motions, requests, committeeAgendas, canControl, now }),
    [session, motions, requests, committeeAgendas, canControl, now],
  );

  const runService = useCallback((s: FlowSuggestion) => {
    const action = s.action!;
    const motionOf = (id?: string) => motions.find((m) => m.id === id) || null;
    switch (action) {
      // Three writes, one lifecycle — see the block header in sessionService. `startRollCall` is
      // deliberately NOT the old `setPhase(…, "roll_call")`: on a gated session the phase grants
      // delegates nothing, which is why pressing "Open roll call" used to appear to do nothing at
      // all. It opens the gate and mints the record in the same patch.
      case "start_roll_call":
        return startRollCall(eventId, sessionId, userId, s.payload?.secs ?? ROLL_CALL_DEFAULT_SECS);
      case "stop_roll_call":
        return stopRollCall(eventId, sessionId, userId);
      // The summary modal is NOT raised from here. It is derived in ChairSessionConsole from the
      // `completedAt` this write stamps, so it fires after the write lands, fires for the co-chair
      // too, and survives a reload — see the CaucusSeatModal note there.
      case "complete_roll_call":
        return completeRollCall(eventId, sessionId, userId).then(() => {});
      case "mark_all_present": {
        const ids = delegates
          .map((d) => d.userId)
          .filter((u): u is string => !!u)
          .map((u) => identityFor(u));
        return setAttendanceBulk(eventId, sessionId, ids, "present");
      }
      case "seed_agenda":
        return setAgendaItems(
          eventId, sessionId,
          committeeAgendas.map((t) => t.trim()).filter(Boolean)
            .map((title, i) => ({ id: `a${i}`, title, status: "pending" as const })),
          "committee",
        );
      case "adopt_agenda_first":
        return setActiveAgenda(eventId, sessionId, s.payload?.index ?? 0);
      case "next_agenda_item":
        return advanceAgenda(eventId, sessionId);
      case "open_gsl":
        return setPhase(eventId, sessionId, "gsl");
      case "open_gsl_signup":
        return openGate(eventId, sessionId, userId, {
          kind: "signup",
          signupFor: "gsl",
          allowsPoints: true,
          endsAt: gateEndsAt(60),
          windowSecs: 60,
          signupId: `sg_${Date.now().toString(36)}`,
        });
      case "complete_gsl_signup":
        onReviewGslSignups?.();
        return Promise.resolve();
      case "complete_caucus_signup":
        onReviewCaucusSignups?.();
        return Promise.resolve();
      // resume/suspend are NOT setPhase — they must bank the break into session.clock atomically.
      case "resume":
        return resumeSession(eventId, sessionId);
      case "suspend":
        return suspendSession(eventId, sessionId);
      case "adjourn":
        return setPhase(eventId, sessionId, "closed");
      // The inverse of BOTH stops: lifts `finalized`, banks the stopped stretch into the clock,
      // restarts the video and re-registers the session in the live index.
      case "reopen":
        return reopenSession(eventId, sessionId);
      case "recognize_motion": {
        const m = motionOf(s.payload?.motionId);
        return m ? recognizeMotion(eventId, sessionId, m, userId) : undefined;
      }
      case "put_motion_to_vote": {
        const m = motionOf(s.payload?.motionId);
        return m ? putMotionToVote(eventId, sessionId, m, userId) : undefined;
      }
      case "execute_motion": {
        const m = motionOf(s.payload?.motionId);
        // identityFor credits the proposer's `motions` counter via the motion log — same as the
        // Motions panel does, so marking autofill stays consistent whichever surface executed.
        return m ? executeMotion(eventId, sessionId, m, userId, identityFor(m.byDelegateId)) : undefined;
      }
      case "extend_caucus":
        return extendCaucus(eventId, sessionId, s.payload?.secs ?? 300);
      case "publish_result":
        return publishVoteResult(eventId, sessionId, userId);
      /**
       * TWO MECHANISMS, AND THE GATE IS THE ONE THAT BINDS. `openMotionFloor` writes
       * `session.motionInvite`, which is the PRE-GATE ask: `motionsInOrder` reads it, so it reaches
       * the delegate's `MotionFloorBar` — a bar the console renders only when `!session.floorGate`.
       * On a gated session `capabilitiesFor` never looks at `motionInvite`, so writing it left the
       * chair believing they had opened the floor while every delegate's Floor Card still read
       * "the chair has not opened the floor for this". Open the real gate instead, with the set the
       * flow advises, and keep the legacy write for the sessions that still depend on it.
       */
      case "open_motion_floor": {
        if (!session.floorGate) return openMotionFloor(eventId, sessionId, userId);
        const { motionTypes, secs } = motionGateSpec(session, motions);
        return openGate(eventId, sessionId, userId, {
          kind: "motions",
          motionTypes,
          // Matches the chooser's own default for this kind (GateBar's previewSpec) — points ride
          // with motions, so a one-tap open must not quietly mute them.
          allowsPoints: true,
          endsAt: gateEndsAt(secs),
          ...(secs != null ? { windowSecs: secs } : {}),
        });
      }
      case "close_motion_floor":
        return session.floorGate
          ? closeGate(eventId, sessionId, userId)
          : closeMotionFloor(eventId, sessionId);
      // The four delegated tokens never reach here — bind() routes them to floor.primary.
      case "start_speaker":
      case "next_speaker":
      case "end_caucus":
      case "close_vote":
        return undefined;
    }
  }, [eventId, sessionId, userId, identityFor, delegates, committeeAgendas, motions, session]);

  /**
   * What one tap on "Open the floor to motions" will actually admit, spelled out.
   *
   * The bar's primary button changes what every delegate can do, and `deriveFlow` cannot name the
   * set because it is pure and gate-blind (see its invariant 4). Naming it here is the difference
   * between a chair opening a window they chose and one they guessed at.
   */
  const motionGateHint = useMemo(() => {
    if (!session.floorGate) return null;
    const { motionTypes } = motionGateSpec(session, motions);
    return motionTypes.map((t) => MOTION_META[t]?.short || t).join(" · ");
  }, [session, motions]);

  const suggestions = useMemo<BoundSuggestion[]>(() => flow.suggestions.map((s) => {
    const disabled = floor.busy || latchBusy;

    if (s.kind === "panel") {
      return { ...s, disabled: false, onRun: () => onOpenTool(s.panel!) };
    }

    if (s.action === "open_motion_floor" && motionGateHint) {
      s = { ...s, hint: motionGateHint };
    }

    // On a gated session this token calls `closeGate`, and the gate model has no "motions off,
    // points on" state to fall back to — `locked` is the honest target, because `debate` would tell
    // the room a delegate holds the floor when nobody does. So say LOCK, and say what it costs.
    // Relabelled here rather than in `deriveFlow` because the pure model is gate-blind by contract.
    if (s.action === "close_motion_floor" && session.floorGate) {
      s = { ...s, label: "Lock the floor", hint: "Points close with it" };
    }

    const delegated = DELEGATED_TO_FLOOR.includes(s.action as FlowActionId);
    const fire = delegated
      ? (floor.primary?.onClick ?? (() => {}))
      : guard(() => runService(s) as Promise<void> | void);

    if (process.env.NODE_ENV !== "production" && delegated && !floor.primary) {
      console.warn(
        `[flow] "${s.action}" is delegated to useFloorController but floor.primary is null — ` +
        "the chip will no-op. deriveFlow and useFloorController have drifted.",
      );
    }

    // Two-step confirm (suspend / adjourn): first tap arms, second runs.
    if (s.confirm) {
      const isArmed = armed === s.id;
      return {
        ...s,
        label: isArmed ? "Confirm" : s.label,
        hint: isArmed ? s.confirm : s.hint,
        disabled,
        onRun: () => { if (isArmed) { setArmed(null); fire(); } else setArmed(s.id); },
      };
    }
    return { ...s, disabled, onRun: () => { setArmed(null); fire(); } };
  }), [flow.suggestions, floor.busy, floor.primary, latchBusy, guard, runService, onOpenTool, armed,
       motionGateHint, session.floorGate]);

  return { ...flow, suggestions, busy: floor.busy || latchBusy, error, clearError };
}
