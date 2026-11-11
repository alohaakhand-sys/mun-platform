"use client";

/**
 * Chair Gate Bar — the procedure console on the video stage. Replaces `ChairFlowBar`.
 *
 * THREE FIXED ZONES, and the middle one is the whole point:
 *
 *   STEP   where the sitting is. Ordinal, persistent, never hidden.
 *   GATE   what the chair has ALLOWED — the countdown, the live counts, and the way to change it.
 *   NEXT   exactly one primary action, not four competing chips.
 *
 * WHY IT REPLACED THE SUGGESTION BAR. The old bar answered "what could you do next" and auto-
 * collapsed after six seconds. It never answered "what have I let the room do", because nothing on
 * the chair's screen did — that state did not exist. Now it does (`session.floorGate`), so the bar
 * is a gate console rather than a suggestion list, and it does not collapse: a chair who cannot see
 * the gate cannot run motion-first procedure.
 *
 * WHAT SURVIVED, DELIBERATELY. `flowModel`'s step derivation and `useFlowBar`'s bindings are
 * reused verbatim — both are pure, both are unit-tested, and the DELEGATION RULE (four tokens bound
 * to `floor.primary.onClick` so the LiveStrip and this bar share one latch) still holds because
 * this component never rebinds an action itself. The old suggestion chips are not deleted; they are
 * DEMOTED into "Chair override", which is exactly their status under motion-first.
 *
 * Layout notes inherited from the bar this replaces, and just as easy to break:
 *   • `bottom-[76px]` clears the ControlBar (`bottom-5` + 48px tall) by 8px.
 *   • `z-[6]`, and it must be a SIBLING rendered last by StageOverlays — a z-6 child of a z-3
 *     parent still loses to the z-4 LiveStrip.
 *   • `suppressed` hides it while a ControlBar popover is open. Those popovers open upward through
 *     this band, and at z-6 the bar would paint over the menu the chair just opened. The old bar
 *     collapsed instead; this one cannot collapse, so it hides outright.
 */
import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Lock, MoreHorizontal, Loader2, Gavel, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCountryName } from "@/lib/data/countries";
import { ConsoleModal } from "../console/shared";
import {
  openGate, gateEndsAt, eligibleVoterCount, startRollCall,
  type LiveSession, type Motion, type MotionType, type GateSpec,
} from "@/lib/services/sessionService";
import {
  capabilitiesFor, gateHeadline, ALL_DELEGATE_MOTION_TYPES,
  type FloorGateKind,
} from "@/lib/services/floorGate";
import { MOTION_META } from "@/lib/services/motionMeta";
import {
  readFloorFacts, motionTypeIsMoot, type FloorFacts,
} from "@/lib/services/motionMootness";
import { useGateClock } from "../useGateClock";
import { useExclusiveDisclosure, type DisclosureSetter } from "../useExclusiveDisclosure";
import { FLOW_STEPS, getAgenda } from "./flowModel";
import {
  adviseGate, offFlowNote, gateMatchesAdvice, gatePresets, type GateAdvice,
} from "./gateAdvice";
import type { BoundFlowState, BoundSuggestion } from "./useFlowBar";

const GLASS = "bg-black/70 backdrop-blur-md border border-white/10 shadow-xl shadow-black/40";

/** Default window per gate, in seconds. `null` = stays open until the chair moves. */
const DEFAULT_WINDOW: Record<FloorGateKind, number | null> = {
  locked: null,
  roll_call: 90,
  motions: 90,
  signup: 60,
  debate: null,
  voting: null,
};

const KIND_LABEL: Record<FloorGateKind, string> = {
  locked: "Nothing",
  roll_call: "Roll call",
  motions: "Motions",
  signup: "Speakers signup",
  debate: "Points only",
  voting: "Voting",
};

const KIND_NOTE: Record<FloorGateKind, string> = {
  locked: "Locks the floor. Use it while you think.",
  roll_call: "Delegates declare their own status. No answer resolves on close.",
  motions: "Tick the types that are in order right now.",
  signup: "Delegates add themselves. Ignoring keeps them off the list.",
  debate: "For while a delegate holds the floor.",
  voting: "Ballots only, while a vote runs.",
};

/** Chooser order: what a chair reaches for, roughly in the order a sitting needs it. */
const CHOOSER_KINDS: FloorGateKind[] = ["motions", "signup", "roll_call", "debate", "locked"];

function mmss(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function GateBar({
  flow, session, motions, eventId, sessionId, userId, suppressed, compact, className,
}: {
  flow: BoundFlowState;
  session: LiveSession;
  motions: Motion[];
  eventId: string;
  sessionId: string;
  userId: string;
  suppressed?: boolean;
  /**
   * Docked inside the chair's own video tile instead of floating over the stage — the tiles-mode
   * placement. The three zones become three ROWS: a tile is ~526px wide in the normal mosaic and
   * its root is `overflow-hidden`, so the 736px three-across layout would simply be cut off.
   */
  compact?: boolean;
  className?: string;
}) {
  const [chooserOpen, setChooserOpen] = useState(false);
  // Exclusive with the in-tile marking rubric — both live in the chair's stage and overlap.
  const [overrideOpen, setOverrideOpen] = useExclusiveDisclosure("gate-override");

  const gate = session.floorGate ?? null;
  // Shared with the delegate's FloorCard, so the two countdowns cannot disagree about the deadline.
  const now = useGateClock(gate?.endsAt ?? null);
  // The chair's own view of the room's permission — the same resolver every delegate runs, so the
  // preview cannot drift from what delegates actually see.
  const caps = useMemo(
    () => capabilitiesFor(session, "__chair_preview__", now),
    [session, now],
  );
  const kind = caps.effectiveKind;
  const remaining = caps.expiresAt != null ? caps.expiresAt - now : null;

  const stepIndex = Math.max(0, FLOW_STEPS.findIndex((s) => s.id === flow.currentStepId));
  const step = FLOW_STEPS[stepIndex];

  // One primary. A service suggestion outranks a "go look at this panel" one — the chair wants the
  // thing that moves the committee, not a navigation hint.
  const primary: BoundSuggestion | null =
    flow.suggestions.find((s) => s.kind === "service") ?? flow.suggestions[0] ?? null;
  const overflow = flow.suggestions.filter((s) => s.id !== primary?.id);

  const counts = useGateCounts(session, motions, kind);

  /**
   * Committing the chooser. Hoisted so BOTH mounts (compact and floating) share one implementation —
   * they were two inline copies, and a roll-call gate opened from one of them had to behave like a
   * roll-call gate opened from the other.
   *
   * A ROLL-CALL GATE IS NEVER JUST A GATE. It starts the roll, and the roll's RECORD is what the
   * bar, `adviseGate` and the summary all read — see `rollCall.ts`. Routing it here is also what
   * makes "retake the roll" work from the chooser without inventing a second control: `startRollCall`
   * rewrites the record whole, so a stale `completedAt` clears with it.
   */
  const openSpec = useCallback(async (spec: GateSpec) => {
    if (spec.kind === "roll_call") {
      await startRollCall(eventId, sessionId, userId, spec.windowSecs ?? null);
    } else {
      await openGate(eventId, sessionId, userId, spec);
    }
    setChooserOpen(false);
  }, [eventId, sessionId, userId]);

  // Derived ONCE here and handed down: the bar's dot and the dialog's marks must be the same
  // opinion, and deriving it twice is how they would come to disagree by a render.
  const advice = useMemo(
    () => adviseGate({ session, motions, step: flow.currentStepId, now }),
    [session, motions, flow.currentStepId, now],
  );
  // Only ever a dot. The bar cannot say WHAT to change without becoming a second chooser, and the
  // chair is mid-sitting — a badge with a count here reads as an error state.
  const adviceDot = !gateMatchesAdvice(gate, advice);

  // The same read-set the auto-fall sweep and `adviseGate` use, so the chooser can mark the motion
  // types the floor has already answered with the sweep's OWN sentence rather than a second opinion.
  // Deliberately not clock-dependent — none of these facts turn over on a timer.
  const facts = useMemo(
    () => readFloorFacts(session, getAgenda(session), motions),
    [session, motions],
  );

  const shell = cn(
    "transition-opacity duration-150",
    suppressed && "opacity-0 pointer-events-none",
    className,
  );

  if (compact) {
    return (
      <div
        // Inside the chair's own tile. `bottom-[76px]` is NOT arbitrary: the chair's tile is a
        // full-height hero, so its bottom edge IS the stage's, and the ControlBar sits there at
        // `bottom-5` + 48px tall (occupying 20–68px). At `bottom-9` this bar landed on top of the
        // mic/camera buttons and swallowed their clicks. Same clearance the floating variant uses.
        // `z-[6]` keeps it above the LiveStrip (z-4) and LiveMarkStrip (z-5) it shares a tile with
        // when the chair is also the speaker.
        className={cn("absolute inset-x-2 bottom-[76px] z-[6] @container", shell)}
      >
        <CompactBar
          step={step} stepIndex={stepIndex} kind={kind} gate={gate} caps={caps}
          remaining={remaining} counts={counts} primary={primary} overflow={overflow}
          overrideOpen={overrideOpen} setOverrideOpen={setOverrideOpen}
          advice={advice} adviceDot={adviceDot}
          onChangeGate={() => setChooserOpen(true)}
        />
        {chooserOpen && (
          <GateChooser
            session={session} current={gate} advice={advice} facts={facts}
            onCancel={() => setChooserOpen(false)}
            onOpen={openSpec}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        // Floating over the stage (spotlight). Left-anchored and CAPPED, never full-bleed:
        // edge-to-edge painted across the tile strip, and the `1fr` gate zone ballooned into the
        // dead space that left between GATE and NEXT.
        "absolute left-3 bottom-[76px] z-[6] w-[min(46rem,calc(100%-1.5rem))]",
        shell,
      )}
    >
      <div className={cn("rounded-xl overflow-hidden relative", GLASS)}>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto]">

          {/* ── STEP ─────────────────────────────────────────────────────── */}
          <div className="px-4 py-3 sm:min-w-[132px] border-b sm:border-b-0 sm:border-r border-white/10">
            <Eyebrow>Step</Eyebrow>
            <div className="text-[15px] font-bold leading-tight mt-1">{step.label}</div>
            <div className="text-[10px] text-white/45 tabular-nums tracking-wide">
              {stepIndex + 1} of {FLOW_STEPS.length}
            </div>
          </div>

          {/* ── GATE — the zone that did not exist before ─────────────────── */}
          <div
            className={cn(
              "px-4 py-3 border-b sm:border-b-0 sm:border-r border-white/10 min-w-0",
              kind !== "locked" && "bg-primary/[0.08] shadow-[inset_3px_0_0] shadow-primary",
            )}
          >
            <Eyebrow>Gate · what delegates can do</Eyebrow>
            <div className="flex items-baseline gap-2.5 flex-wrap mt-1">
              <span
                className={cn(
                  "text-[15px] font-bold",
                  kind !== "locked" ? "text-primary" : "text-white/80",
                )}
              >
                {/* Null the gate once occupancy overrode it — its label describes a window that is
                    no longer what is happening, which is how the bar came to read "the floor is
                    closed" over a running speech. */}
                {gateHeadline(caps.gateOverridden ? null : gate, kind)}
              </span>
              {remaining != null && (
                <span
                  className={cn(
                    "text-[13px] font-bold tabular-nums px-1.5 rounded border",
                    remaining <= 15_000 ? "text-red-300 border-red-400/50" : "text-white/80 border-white/20",
                  )}
                >
                  {mmss(remaining)}
                </span>
              )}
            </div>
            {counts.length > 0 && (
              <div className="flex flex-wrap gap-4 text-[11px] text-white/50 mt-1">
                {counts.map(([k, v]) => (
                  <span key={k}>{k} <b className="text-white/85 font-semibold">{v}</b></span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setChooserOpen(true)}
              title={adviceDot ? advice.because : "Change what delegates can do"}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/60 hover:text-white
                         border border-white/15 hover:border-white/35 rounded-md px-2 py-1 transition-colors"
            >
              {adviceDot && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden />
              )}
              Change gate <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* ── NEXT ─────────────────────────────────────────────────────── */}
          <div className="px-4 py-3 sm:min-w-[196px] flex flex-col gap-1.5 justify-center">
            <Eyebrow>Next</Eyebrow>
            {primary ? (
              <button
                type="button"
                onClick={primary.onRun}
                disabled={primary.disabled}
                className="w-full text-left px-3 py-2 rounded-lg bg-primary text-primary-foreground
                           text-[12px] font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {primary.label}
              </button>
            ) : (
              <span className="text-[11px] text-white/40">Nothing waiting.</span>
            )}
            {overflow.length > 0 && (
              <button
                type="button"
                onClick={() => setOverrideOpen((v) => !v)}
                className="w-full text-left px-3 py-1.5 rounded-lg border border-dashed border-white/20
                           text-[11px] text-white/50 hover:text-red-300 hover:border-red-400/40 transition-colors
                           inline-flex items-center gap-1.5"
              >
                <MoreHorizontal className="w-3 h-3" /> Chair override
              </button>
            )}
          </div>
        </div>

        {/* Demoted, not deleted: the old suggestion chips live here now. */}
        {overrideOpen && overflow.length > 0 && (
          <div className="border-t border-white/10 px-4 py-2.5 flex flex-wrap gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/35 self-center mr-1">
              Acting outside procedure
            </span>
            {overflow.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { s.onRun(); setOverrideOpen(false); }}
                disabled={s.disabled}
                className="text-[11px] px-2.5 py-1.5 rounded-md border border-white/15 text-white/70
                           hover:text-white hover:border-white/35 disabled:opacity-40 transition-colors"
                title={s.hint}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Rendered OUTSIDE the bar. `ConsoleModal` is fixed/inset-0, so it escapes the stage's
          overflow-hidden and gets the full viewport — the previous `absolute inset-0` crammed a
          500px form into the bar's own ~110px box, which is what produced the scrollbar. */}
      {chooserOpen && (
        <GateChooser
          session={session}
          current={gate}
          advice={advice}
          facts={facts}
          onCancel={() => setChooserOpen(false)}
          onOpen={openSpec}
        />
      )}
    </div>
  );
}

/**
 * The in-tile variant — a vision mixer's status strip, not a stacked form.
 *
 * A production switcher shows what is ON AIR beside what is CUED, with a tally light for the live
 * state. That is exactly this bar's job: the gate is what the room can do right now, the primary is
 * what happens next, and the step is context. Reading it that way collapses three boxed zones into
 * one horizontal strip, which is what a tile has room for.
 *
 * `@container`, not viewport breakpoints: the tile is sized by measured pixels (`useElementSize` /
 * `tileLayout`), so the viewport says nothing about how wide this actually is. A hero tile is
 * ~780px and gets one row; a mid tile is ~240px and wraps to two. Same reasoning as `QueueRow` in
 * console/shared.tsx.
 *
 * The whole gate block IS the "change gate" trigger — a separate button was a third competing
 * target in a strip that only has room for one primary.
 */
function CompactBar({
  step, stepIndex, kind, gate, caps, remaining, counts, primary, overflow,
  overrideOpen, setOverrideOpen, advice, adviceDot, onChangeGate,
}: {
  step: (typeof FLOW_STEPS)[number];
  stepIndex: number;
  kind: FloorGateKind;
  gate: LiveSession["floorGate"];
  caps: { gateOverridden: boolean };
  remaining: number | null;
  counts: [string, string][];
  primary: BoundSuggestion | null;
  overflow: BoundSuggestion[];
  overrideOpen: boolean;
  setOverrideOpen: DisclosureSetter;
  advice: GateAdvice;
  adviceDot: boolean;
  onChangeGate: () => void;
}) {
  const live = kind !== "locked";
  return (
    <div className={cn("rounded-xl relative", GLASS)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-2">

        {/* STEP — context. Quiet on purpose; it is the least actionable thing here. */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-[18px] h-[18px] rounded-md bg-white/10 text-white/70 text-[10px]
                           font-bold tabular-nums grid place-items-center">
            {stepIndex + 1}
          </span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/60">
            {step.label}
          </span>
        </div>

        <span className="hidden @xl:block w-px h-5 bg-white/12 shrink-0" />

        {/* GATE — the tally light. Lit = delegates can act; dark = the floor is shut. */}
        <button
          type="button"
          onClick={onChangeGate}
          title={adviceDot ? advice.because : "Change what delegates can do"}
          className="group flex items-center gap-2 min-w-0 flex-1 basis-full @xl:basis-0
                     rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-white/[0.06] transition-colors text-left"
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full shrink-0 transition-colors",
              live ? "bg-primary shadow-[0_0_0_3px] shadow-primary/25" : "bg-white/25",
            )}
          />
          <span className={cn("text-[12.5px] font-semibold truncate", live ? "text-primary" : "text-white/75")}>
            {gateHeadline(caps.gateOverridden ? null : gate, kind)}
          </span>
          {remaining != null && (
            <span
              className={cn(
                "text-[11.5px] font-bold tabular-nums shrink-0",
                remaining <= 15_000 ? "text-red-300" : "text-white/70",
              )}
            >
              {mmss(remaining)}
            </span>
          )}
          {/* One number, not four — the strip has room for the count that tells the chair to move on. */}
          {counts.length > 0 && (
            <span className="hidden @2xl:inline text-[11px] text-white/40 truncate shrink-0">
              · {counts[0][0]} <b className="text-white/70 font-semibold">{counts[0][1]}</b>
            </span>
          )}
          <span className="flex items-center gap-1.5 shrink-0 ml-auto @xl:ml-0">
            {/* Distinct from the tally light on the left: that one says the gate is LIT, this one
                says the gate no longer matches the flow. Never both meanings on one dot. */}
            {adviceDot && <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden />}
            <ChevronDown className="w-3.5 h-3.5 text-white/35 group-hover:text-white/70 transition-colors" />
          </span>
        </button>

        {/* NEXT — the one cued action. */}
        <div className="flex items-center gap-1.5 shrink-0 basis-full @xl:basis-auto">
          {primary ? (
            <button
              type="button"
              onClick={primary.onRun}
              disabled={primary.disabled}
              className="flex-1 @xl:flex-none min-w-0 truncate px-3 py-1.5 rounded-lg bg-primary
                         text-primary-foreground text-[11.5px] font-bold disabled:opacity-50
                         hover:bg-primary/90 transition-colors"
            >
              {primary.label}
            </button>
          ) : (
            <span className="text-[11px] text-white/35 px-1">Nothing waiting</span>
          )}
          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => setOverrideOpen((v) => !v)}
              title="Chair override"
              aria-label="Chair override"
              aria-expanded={overrideOpen}
              className={cn(
                "w-7 h-7 grid place-items-center rounded-lg border border-dashed shrink-0 transition-colors",
                overrideOpen
                  ? "border-red-400/50 text-red-300"
                  : "border-white/20 text-white/50 hover:text-red-300 hover:border-red-400/40",
              )}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {overrideOpen && overflow.length > 0 && (
        <div className="border-t border-white/10 px-2.5 py-2 flex flex-wrap gap-1.5">
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-white/35 self-center mr-0.5">
            Outside procedure
          </span>
          {overflow.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { s.onRun(); setOverrideOpen(() => false); }}
              disabled={s.disabled}
              title={s.hint}
              className="text-[11px] px-2 py-1 rounded-md border border-white/15 text-white/70
                         hover:text-white hover:border-white/35 disabled:opacity-40 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] uppercase tracking-[0.18em] text-white/40 font-semibold">
      {children}
    </span>
  );
}

// ── The dynamic menu, rebuilt ───────────────────────────────────────────────────
/**
 * Choosing a gate IS choosing delegate permission, so the chooser says so in those words rather
 * than naming internal phases. It opens showing what is actually in force — it edits state, it does
 * not author it fresh each time.
 */
/** `TYPE_PRESETS` lives in `gateAdvice.ts` — the advice names a preset by id, so one array. */
const WINDOW_PRESETS: { label: string; secs: number | null }[] = [
  { label: "30s", secs: 30 },
  { label: "60s", secs: 60 },
  { label: "90s", secs: 90 },
  { label: "2m", secs: 120 },
  { label: "No limit", secs: null },
];

function GateChooser({
  session, current, advice, facts, onOpen, onCancel,
}: {
  session: LiveSession;
  current: { kind: FloorGateKind; motionTypes?: MotionType[]; signupFor?: "gsl" | "caucus" } | null;
  /**
   * What the flow says comes next. MARKING ONLY — nothing here is preselected from it and nothing
   * is disabled by it. Every design system that badges a recommended radio (Carbon, Braid, Helios)
   * stops short of preselecting for the same reason a chair would want it to: a gate that arrives
   * already ticked gets committed without being read, and this dialog is the one place the room's
   * permissions are decided.
   */
  advice: GateAdvice;
  /** The floor as the auto-fall sweep reads it — see `mootTypes` below. */
  facts: FloorFacts;
  onOpen: (spec: GateSpec) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<FloorGateKind>(current?.kind ?? "motions");
  const [types, setTypes] = useState<MotionType[]>(current?.motionTypes ?? []);
  const [signupFor, setSignupFor] = useState<"gsl" | "caucus">(current?.signupFor ?? "gsl");
  const [secs, setSecs] = useState<number | null>(DEFAULT_WINDOW[current?.kind ?? "motions"]);
  const [busy, setBusy] = useState(false);

  const toggleType = (t: MotionType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const pickKind = (k: FloorGateKind) => {
    setKind(k);
    setSecs(DEFAULT_WINDOW[k]);
  };

  // Stable across renders on purpose. The clock and the signup id are NOT part of what a delegate
  // may DO, and minting them here would hand the preview a fresh object every render — and, worse,
  // start the window when this dialog opened rather than when the chair pressed the button.
  const previewSpec = useMemo<GateSpec>(() => ({
    kind,
    // Points ride with debate and motions; a vote or a locked floor mutes them by default.
    allowsPoints: kind === "debate" || kind === "motions",
    endsAt: null,
    ...(kind === "motions" ? { motionTypes: types } : {}),
    ...(kind === "signup" ? { signupFor } : {}),
  }), [kind, types, signupFor]);

  const invalid = kind === "motions" && types.length === 0;

  // ── Marking ───────────────────────────────────────────────────────────────────
  // Each mark is scoped so an unrelated section can never light up: the motion, list and duration
  // marks only appear once the chair is standing on the gate the flow actually advised. Otherwise
  // a chair who picked "Roll call" would still see a dot on "Agenda only", which is nonsense.
  const onAdvisedKind = advice.kind != null && kind === advice.kind;
  const advisedTypes = advice.kind === "motions" ? advice.motionTypes ?? [] : [];
  const offFlow = offFlowNote(advice, { kind, motionTypes: types }, (k) => KIND_LABEL[k]);

  /**
   * The motion types the floor has already answered, with the sweep's own reason.
   *
   * NOT REMOVED FROM THE GRID, and that is the deliberate half. `useMotionMootnessSweep` will rule
   * any of these out of order the moment a delegate proposes one, so a chair ticking them is opening
   * a window onto a closed question — worth saying plainly. But the ladder answers the GENERIC form
   * of the question (`motionTypeIsMoot` passes empty params), and a delegate moving to set a
   * DIFFERENT agenda topic survives `mootByState` on its own merits. Hiding the chip would take that
   * legitimate move away, so the chip greys, sorts last, carries the reason, and stays clickable.
   * The presets prune (a bundle can be wrong for the moment); the grid does not (invariant 1).
   */
  const { liveTypes, mootTypes } = useMemo(() => {
    const live: MotionType[] = [];
    const moot: { type: MotionType; reason: string }[] = [];
    for (const t of ALL_DELEGATE_MOTION_TYPES) {
      const ruling = motionTypeIsMoot(t, facts);
      if (ruling) moot.push({ type: t, reason: ruling.reason });
      else live.push(t);
    }
    return { liveTypes: live, mootTypes: moot };
  }, [facts]);

  const presets = useMemo(() => gatePresets(facts), [facts]);

  const submit = async () => {
    setBusy(true);
    try {
      await onOpen({
        ...previewSpec,
        // Minted now, at the moment the floor actually opens.
        endsAt: gateEndsAt(secs),
        ...(secs != null ? { windowSecs: secs } : {}),
        ...(kind === "signup" ? { signupId: `sg_${Date.now().toString(36)}` } : {}),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsoleModal
      wide
      icon={Gavel}
      title="Open the floor for…"
      subtitle="Whatever you pick is what every delegate sees. Nothing else is clickable for them."
      onClose={onCancel}
    >
      {/* Why-line. Plain text, not a third tinted box — the preview panel below already owns that
          treatment, and two primary slabs in one dialog cancel each other out.
          It carries `because` ONLY: the fact that produced the marks, past tense. `next` is
          forward-looking, so it belongs in the preview panel beside the other forward-looking
          sentences, and printing it in both places turns guidance into repetition. */}
      <p id="gate-advice-why" className="flex items-start gap-1.5 text-[12px] leading-snug -mt-1 mb-4">
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-[1.5px]" aria-hidden />
        <span className="text-foreground">
          <span className="text-primary font-semibold">Where the sitting is:</span>{" "}
          {advice.because}
        </span>
      </p>

      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">

        {/* ── What to open ─────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          {CHOOSER_KINDS.map((k) => {
            const sel = k === kind;
            const sug = k === advice.kind;
            return (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                aria-pressed={sel}
                aria-describedby={sug ? "gate-advice-why" : undefined}
                // `bg-card2`, not `bg-secondary/20`. Secondary-over-card is dark-room logic: on a
                // 0.16 card it lifts, on a white one it just paints grey, and a grey fill on white
                // reads as DISABLED — the unselected options ended up heavier than the selected one.
                // `card2` is the token that steps the right way in both themes.
                className={cn(
                  "w-full text-left rounded-xl border px-3.5 py-3 transition-colors",
                  sel
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card2 hover:border-primary/40 hover:bg-primary/[0.04]",
                  // The pull only exists while the advice is UNPICKED. Once it is selected the card
                  // is already primary-bordered, and stacking a ring on that is the shout the
                  // "one mark per section" rule exists to prevent. Amber glow, not primary — it
                  // needs to read as "look here" against a primary-bordered selection elsewhere
                  // on screen, not blend into it.
                  sug && !sel && "ring-1 ring-amber-400/50 animate-flow-advice-glow",
                )}
              >
                <span className="flex items-center gap-2.5 text-sm font-bold">
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded-full border-2 shrink-0",
                      sel ? "border-primary bg-primary ring-2 ring-inset ring-card" : "border-muted-foreground/50",
                    )}
                  />
                  {KIND_LABEL[k]}
                  {sug && (
                    // Carries the WORD, not just the colour — the mark has to survive a screen
                    // reader and a colour-blind chair, and it is the only thing that does.
                    <span
                      className={cn(
                        "ml-auto shrink-0 text-[9px] uppercase tracking-[0.12em] font-bold",
                        "rounded-full border px-1.5 py-[1px]",
                        sel
                          ? "border-transparent text-primary/70"
                          // Amber + a breathing glow once picked it goes calm (see the `sel` branch
                          // above) — the glow's whole job is to pull the eye BEFORE the chair acts.
                          : "border-amber-400/40 bg-amber-400/15 text-amber-700 dark:text-amber-400 animate-flow-advice-glow",
                      )}
                    >
                      {sel ? "✓ matches the flow" : "Suggested"}
                    </span>
                  )}
                </span>
                <span className="block text-[11.5px] text-muted-foreground mt-1 ml-[26px] leading-snug">
                  {KIND_NOTE[k]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── How it is configured ─────────────────────────────────────── */}
        <div className="space-y-4">
          {kind === "motions" && (
            <section>
              <SectionLabel>Which motions are in order</SectionLabel>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {presets.map((p) => (
                  <Chip
                    key={p.id}
                    on={p.types.length === types.length && p.types.every((t) => types.includes(t))}
                    // Matched by id, not by set equality — a preset whose contents were edited
                    // should still light up as the thing the advice named.
                    suggested={onAdvisedKind && advice.presetId === p.id ? "ring" : undefined}
                    onClick={() => setTypes(p.types)}
                  >
                    {p.label}
                  </Chip>
                ))}
                {types.length > 0 && (
                  <Chip on={false} onClick={() => setTypes([])}>Clear</Chip>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {liveTypes.map((t) => (
                  <Chip
                    key={t}
                    on={types.includes(t)}
                    // Dot, never a ring: the wide presets advise five of these at once, and five
                    // rings in a 2-column grid is a light show, not a recommendation.
                    suggested={onAdvisedKind && advisedTypes.includes(t) ? "dot" : undefined}
                    onClick={() => toggleType(t)}
                    block
                  >
                    {MOTION_META[t].label}
                  </Chip>
                ))}
              </div>
              {mootTypes.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-border/60">
                  <p className="text-[10.5px] text-muted-foreground mb-1.5 leading-snug">
                    Already answered by the floor. Still yours to open — a delegate moving something
                    genuinely new is judged on its own merits.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {mootTypes.map(({ type: t, reason }) => (
                      <Chip
                        key={t}
                        on={types.includes(t)}
                        muted
                        // The sweep's own sentence, not a second wording of it.
                        title={reason}
                        onClick={() => toggleType(t)}
                        block
                      >
                        {MOTION_META[t].label}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {kind === "signup" && (
            <section>
              <SectionLabel>Which list</SectionLabel>
              <div className="flex gap-1.5">
                {(["gsl", "caucus"] as const).map((f) => (
                  <Chip
                    key={f}
                    on={signupFor === f}
                    suggested={onAdvisedKind && advice.signupFor === f ? "ring" : undefined}
                    onClick={() => setSignupFor(f)}
                  >
                    {f === "gsl" ? "Speakers List" : "Caucus"}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionLabel>How long it stays open</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {WINDOW_PRESETS.map((w) => (
                <Chip
                  key={w.label}
                  on={secs === w.secs}
                  suggested={onAdvisedKind && advice.secs !== undefined && advice.secs === w.secs ? "dot" : undefined}
                  onClick={() => setSecs(w.secs)}
                >
                  {w.label}
                </Chip>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
              The window closes itself. Once it lapses the gate locks on every screen and late
              writes are refused — you do not have to be watching.
            </p>
          </section>

          <GatePreview session={session} spec={previewSpec} invalid={invalid} nextLine={advice.next} />
        </div>
      </div>

      <div className="flex items-center gap-2.5 mt-5 pt-4 border-t border-border/60">
        {invalid ? (
          <p className="text-[11.5px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            Pick at least one motion, or delegates get an empty menu.
          </p>
        ) : offFlow ? (
          // Says so, and stops there. `invalid` remains the ONLY thing in this dialog that can
          // disable the button — a chair who wants an out-of-order gate has a reason for it, and
          // second-guessing that is how a procedure console becomes a procedure obstacle.
          <p className="text-[11.5px] text-muted-foreground inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary/60" aria-hidden />
            {offFlow}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto px-3.5 py-2 rounded-lg text-[12.5px] font-medium text-muted-foreground
                     hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || invalid}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary
                     text-primary-foreground text-[12.5px] font-bold disabled:opacity-50
                     hover:bg-primary/90 transition-colors"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {kind === "locked" ? "Lock the floor" : "Open the floor"}
        </button>
      </div>
    </ConsoleModal>
  );
}

/**
 * What the room will actually get, before the chair commits.
 *
 * Runs the REAL resolver over a hypothetical session carrying the pending gate, against a seated
 * stand-in delegate. So this cannot drift from the delegate's Floor Card — it is the same function
 * producing the same sentences, which is the whole reason `capabilitiesFor` is pure.
 */
function GatePreview({
  session, spec, invalid, nextLine,
}: { session: LiveSession; spec: GateSpec; invalid: boolean; nextLine?: string }) {
  // Frozen at mount. `spec.endsAt` is null for the preview, so nothing here expires and a ticking
  // clock would only cause pointless re-renders.
  const now = useGateClock(null);
  const preview = useMemo(() => {
    const uid = "__gate_preview__";
    return capabilitiesFor(
      {
        ...session,
        floorGate: { ...spec, openedBy: uid },
        attendance: {
          ...session.attendance,
          [uid]: { status: "present", country: "", delegateId: uid, applicationId: "" },
        },
      },
      uid,
      now,
    );
  }, [session, spec, now]);

  const live: string[] = [];
  if (preview.canDeclareAttendance) live.push("Declare their attendance");
  if (preview.canProposeMotion) {
    live.push(
      preview.proposableMotionTypes.length === 1
        ? `Move to ${MOTION_META[preview.proposableMotionTypes[0]].short.toLowerCase()}`
        : `Propose ${preview.proposableMotionTypes.length} motion types`,
    );
  }
  if (preview.canJoinSignup) live.push("Add themselves to the list");
  if (preview.canCastBallot) live.push("Cast a ballot");
  if (preview.canRaisePoint) live.push("Raise a point");
  if (preview.canRequestFloor) live.push("Ask to speak");

  return (
    // Primary tint, matching `panelTone("primary").tint` in console/shared.tsx. This is the answer
    // to "what will the room actually get" — the one block the chair reads before committing — and
    // on the grey `bg-secondary/20` it was the most disabled-looking thing on screen.
    <section className="rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 py-3">
      <SectionLabel>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Delegates will be able to
        </span>
      </SectionLabel>
      {invalid ? (
        <p className="text-[12px] text-amber-600 dark:text-amber-400">Nothing — the motion list is empty.</p>
      ) : live.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Nothing. The floor is shut.</p>
      ) : (
        <ul className="space-y-1">
          {live.map((l) => (
            <li key={l} className="text-[12px] text-foreground flex gap-2">
              <span className="text-primary" aria-hidden>·</span>{l}
            </li>
          ))}
        </ul>
      )}
      {/* The loop, one step further out. The list above is what this gate grants; this is what the
          committee does with it — which is the half a chair running motion-first has to hold in
          their head, and the half nothing on screen used to say. */}
      {nextLine && (
        <p className="text-[11px] text-muted-foreground leading-snug mt-2.5 pt-2.5 border-t border-primary/15">
          <span className="font-semibold text-foreground/70">After this: </span>{nextLine}
        </p>
      )}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    // Full-strength muted, not /70 — at 10px and this letter-spacing the dimmed variant sat near
    // 3:1 on a white panel, which is under the floor for a label that names the section.
    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-2">
      {children}
    </p>
  );
}

function Chip({
  children, on, onClick, block, suggested, muted, title,
}: {
  children: React.ReactNode;
  on: boolean;
  onClick: () => void;
  block?: boolean;
  /**
   * How the flow's advice marks this chip. `"ring"` pulls the eye (one per section at most);
   * `"dot"` only confirms membership. Both keep the leading dot in the selected state — without it
   * a chair cannot tell whether the thing they already picked is the advised one.
   */
  suggested?: "ring" | "dot";
  /**
   * Recedes without disabling. For a choice the floor has already answered: the chip must stop
   * competing with the ones that are live, and must still be one tap away — see `mootTypes`. NOT
   * `disabled`, which would be the chooser overruling the chair.
   */
  muted?: boolean;
  /** Why it is muted. Lands on both the tooltip and the accessible name. */
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      aria-describedby={suggested ? "gate-advice-why" : undefined}
      className={cn(
        // Off-state carries the same `card2` surface as the option cards on the left. It used to be
        // fully transparent, so the dialog showed two surface languages at once — bare outlines
        // beside filled slabs — and the chips read as disabled rather than tappable.
        "text-[11.5px] px-2.5 py-1.5 rounded-lg border transition-colors text-left",
        block && "w-full",
        on
          ? "border-primary text-primary bg-primary/10 font-semibold"
          : muted
            // Bare outline on purpose — dropping the `card2` fill is what makes it recede from the
            // live chips above without reaching for an opacity that would fail contrast.
            ? "border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:border-primary/40"
            : "border-border bg-card2 text-foreground/75 hover:text-foreground hover:border-primary/40 hover:bg-primary/[0.04]",
        suggested === "ring" && !on && "ring-1 ring-amber-400/50 animate-flow-advice-glow",
      )}
    >
      {suggested && <span className="text-primary/70 mr-1" aria-hidden>•</span>}
      {children}
    </button>
  );
}

// ── Live counts per gate ────────────────────────────────────────────────────────
/**
 * What the chair needs to watch WHILE a gate is open — the numbers that tell them when to move on.
 * Deliberately per-kind: a roll-call count during a vote is noise.
 */
function useGateCounts(
  session: LiveSession,
  motions: Motion[],
  kind: FloorGateKind,
): [string, string][] {
  return useMemo(() => {
    const attendance = Object.values(session.attendance || {});
    switch (kind) {
      case "roll_call": {
        const answered = attendance.filter((a) => a.status !== "absent").length;
        return [
          ["Answered", `${answered} / ${attendance.length}`],
          ["Present", String(attendance.filter((a) => a.status === "present").length)],
          ["& voting", String(attendance.filter((a) => a.status === "present_and_voting").length)],
        ];
      }
      case "motions": {
        const live = motions.filter((m) => m.status === "pending");
        return [
          ["Proposed", String(live.length)],
          ["Seconded", String(live.filter((m) => m.secondedBy).length)],
        ];
      }
      case "signup":
        return [["Speaking time", `${session.gsl?.defaultSpeakerSecs ?? 90}s`]];
      case "voting": {
        const v = session.activeVote;
        if (!v) return [];
        const cast = Object.keys(v.ballots || {}).length;
        return [
          ["Cast", `${cast} / ${v.eligibleCount || eligibleVoterCount(session.attendance)}`],
          ["Threshold", v.threshold.replace(/_/g, " ")],
        ];
      }
      case "debate": {
        const who = session.caucus?.currentSpeaker?.country || session.gsl?.activeSpeaker?.country;
        // The country NAME, not the ISO code — "Speaking CN" told the chair nothing at a glance.
        return who ? [["Speaking", getCountryName(who) || who.toUpperCase()]] : [];
      }
      default:
        return [["Present", String(eligibleVoterCount(session.attendance))]];
    }
  }, [session, motions, kind]);
}
