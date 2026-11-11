/**
 * Gate Advice — which gate the flow says comes next, and why.
 *
 * `deriveFlow` answers "what should the CHAIR do next". This answers the different question the
 * gate chooser asks: "what should the chair OPEN next" — the delegate-facing permission window, its
 * motion list and its length. The two are derived from the same facts in the same precedence order
 * (see the ladder below, which deliberately mirrors `flowModel.ts:252-263`) so the stage bar and the
 * dialog can never disagree about where the sitting is.
 *
 * THE SAME THREE INVARIANTS AS `flowModel.ts`, and they matter more here because this module is
 * read as a recommendation:
 *
 *  1. ADVISORY ONLY. Nothing returned here disables, hides or preselects a control. There is no
 *     `blocked` / `required` / `illegal` field and adding one is the design smell to reject — the
 *     chair keeps every gate one tap away, exactly as they do today. A `kind: null` means "the flow
 *     has no opinion, or something live already owns the floor"; it is still not a prohibition.
 *
 *  2. PURE. Type-only import from sessionService, plus value imports of `motionMeta`, `floorGate`
 *     and `flowModel` — all three already firebase-free. That is load-bearing: a value import of
 *     sessionService would pull in `@/lib/firebase/client` at module scope and make this
 *     unloadable under vitest. `now` is injectable so the derivation is deterministic.
 *
 *  3. ONE MARK PER SECTION. The shape returns a single `kind`, a single `presetId` and a single
 *     `secs` on purpose. Three competing highlights in one dialog is the noise failure mode, and
 *     the UI is written against this shape so it cannot drift into that.
 *
 *  4. NEVER ADVISE A MOTION THE FLOOR HAS ALREADY ANSWERED. Every `motionTypes` returned here runs
 *     through `relevantMotionTypes`, so the advice cannot invite a `set_agenda` with a topic under
 *     debate or an `extend_caucus` with no caucus — motions `useMotionMootnessSweep` would rule out
 *     of order a snapshot later. This is a narrowing of the ADVICE, not of the chair's options;
 *     invariant 1 still holds and the chooser's own chip grid still offers all ten types.
 *
 * WHY THE MOTION QUEUE IS THE LOG. Row 7 needs to know whether `open_gsl` ever passed, and session
 * state alone cannot say: `executeMotion` only writes `gsl.defaultSpeakerSecs` when the motion
 * carried `perSpeakerSecs` (sessionService.ts:2165-2167), and `phase: "gsl"` is set by `set_agenda`
 * too. Executed motions keep `status: "executed"` in `motionQueue`, which the console already
 * subscribes to — so that array IS the log for this purpose, and the real `motions` log
 * subcollection stays unsubscribed (it is only live while the Motions panel is mounted, and adding
 * it at console level would buy Firestore reads for nothing).
 */
import { getCountryName } from "@/lib/data/countries";
import { MOTION_META } from "@/lib/services/motionMeta";
import { ALL_DELEGATE_MOTION_TYPES, type FloorGateKind } from "@/lib/services/floorGate";
import {
  gslIsOpen, gslSpokenThrough, readFloorFacts, relevantMotionTypes, type FloorFacts,
} from "@/lib/services/motionMootness";
import { caucusListState } from "@/lib/services/caucusList";
// Pure. Same normalizer `flowModel` reads, so the bar and the chooser cannot disagree about whether
// the roll has been taken.
import { readRollCall } from "@/lib/services/rollCall";
import type { LiveSession, Motion, MotionType, SpeakerSlot } from "@/lib/services/sessionService";
import { getAgenda, type FlowStepId } from "./flowModel";

// ── Presets ─────────────────────────────────────────────────────────────────────
/**
 * Motion bundles a chair actually reaches for, so the common cases are one tap, not nine.
 *
 * Lives here rather than in `GateBar` because the advice names a preset by id and the chip row
 * renders the same list — one array means the mark can never land on a chip whose contents have
 * quietly diverged from what was advised.
 */
export type GatePresetId = "agenda" | "gsl" | "debate" | "all";

export const TYPE_PRESETS: { id: GatePresetId; label: string; types: MotionType[] }[] = [
  { id: "agenda", label: "Agenda only", types: ["set_agenda"] },
  { id: "gsl", label: "Open the list", types: ["open_gsl"] },
  {
    id: "debate", label: "Debate motions",
    types: ["mod_caucus", "unmod_caucus", "extend_caucus", "introduce_document", "move_to_voting"],
  },
  { id: "all", label: "Everything", types: ALL_DELEGATE_MOTION_TYPES },
];

/**
 * The presets as they apply to THIS floor — the authored bundles above with the motions the room has
 * already answered taken out, and any bundle that empties dropped entirely.
 *
 * WHY THE PRESETS PRUNE BUT THE FULL CHIP GRID DOES NOT. A preset is a convenience: "give me the
 * usual set for this moment". Handing a chair a bundle that silently includes `extend_caucus` with
 * no caucus running, or `set_agenda` with a topic already under debate, invites motions
 * `useMotionMootnessSweep` will rule out of order within a snapshot — the bundle is simply wrong for
 * the moment. Removing an individual chip would be a different act: that is the chooser telling the
 * chair what they may not open, which invariant 1 forbids. The grid keeps every type; see GateBar.
 */
export function gatePresets(
  f: FloorFacts,
): { id: GatePresetId; label: string; types: MotionType[] }[] {
  return TYPE_PRESETS
    .map((p) => ({ ...p, types: relevantMotionTypes(p.types, f) }))
    .filter((p) => p.types.length > 0);
}

const presetTypes = (id: GatePresetId, f: FloorFacts): MotionType[] =>
  relevantMotionTypes(TYPE_PRESETS.find((p) => p.id === id)!.types, f);

/**
 * The `motionTypes` + `presetId` half of a `kind: "motions"` advice, pruned to this floor.
 *
 * Each row below is guarded so its own preset cannot prune to nothing — row 6 only fires with no
 * topic adopted, row 7 only with the list shut, row 4 only inside a live caucus. The fallback is
 * there so a future row cannot quietly advise an EMPTY motion list, which is the one thing the
 * chooser refuses to submit (`invalid`) and would read to the chair as the flow having no answer.
 */
function motionsFor(
  id: GatePresetId, f: FloorFacts,
): { motionTypes: MotionType[]; presetId?: GatePresetId } {
  const types = presetTypes(id, f);
  if (types.length) return { motionTypes: types, presetId: id };
  const wide = relevantMotionTypes(ALL_DELEGATE_MOTION_TYPES, f);
  return { motionTypes: wide.length ? wide : ALL_DELEGATE_MOTION_TYPES };
}

// ── Shape ───────────────────────────────────────────────────────────────────────
export interface GateAdvice {
  /**
   * The gate to open. `null` = the flow has no opinion right now, usually because something live
   * (a vote, an unpublished result, a closed session) already owns the floor. Never a prohibition —
   * the chooser still lets the chair open anything.
   */
  kind: FloorGateKind | null;
  /** Only when `kind === "motions"`. */
  motionTypes?: MotionType[];
  /** Only when `kind === "signup"`. */
  signupFor?: "gsl" | "caucus";
  /** The `TYPE_PRESETS` entry the chip row should mark, when the advice matches one exactly. */
  presetId?: GatePresetId;
  /** Suggested window, seconds. `null` = no limit. `undefined` = no opinion. */
  secs?: number | null;
  /** The fact that produced this. Past tense, cites state or the queue — never a command. */
  because: string;
  /** What the chair should expect once this gate lapses. Forward-looking, one sentence. */
  next: string;
}

export interface GateAdviceContext {
  session: LiveSession;
  /** `motionQueue`, not the log subcollection. Executed motions must still be in it. */
  motions: Motion[];
  /** `flow.currentStepId` — read for the closing case only; the ladder derives the rest itself. */
  step?: FlowStepId;
  now?: number;
}

// ── Small pure helpers (mirrors of flowModel's, kept local so neither file exports plumbing) ─────
const LIVE_MOTION: ReadonlySet<string> = new Set(["pending", "recognized", "voting", "passed"]);

// `hasExecuted` lived here too, but its only caller was the Speakers-List check, which now shares
// `gslIsOpen` with the mootness model so the two cannot disagree about what "open" means.
const hasLive = (motions: Motion[], type: MotionType): boolean =>
  motions.some((m) => m.type === type && LIVE_MOTION.has(m.status));

function countryLabel(code: string | undefined): string {
  if (!code) return "A delegate";
  return getCountryName(code) || code;
}

function presentCount(session: LiveSession): number {
  return Object.values(session.attendance || {})
    .filter((a) => a.status === "present" || a.status === "present_and_voting").length;
}

function timerRemaining(
  t: { running: boolean; endsAt: number | null; pausedRemainingMs: number | null } | undefined,
  now: number,
): number {
  if (!t) return 0;
  if (t.running && t.endsAt != null) return Math.max(0, t.endsAt - now);
  return Math.max(0, t.pausedRemainingMs ?? 0);
}

/** Who is actually on the floor — the same three checks `floorOccupancy` makes, in the same order. */
function occupant(session: LiveSession): SpeakerSlot | null {
  if (session.caucus?.currentSpeaker) return session.caucus.currentSpeaker;
  if (session.gsl?.activeSpeaker && session.live?.stage?.[0]) return session.gsl.activeSpeaker;
  return null;
}

const quoted = (s: string) => `“${s}”`;

// ── The ladder ──────────────────────────────────────────────────────────────────
/**
 * First match wins. Read it top-down as the sitting: things that already own the floor, then the
 * caucus loop, then the gateway steps, then the speakers loop.
 */
export function adviseGate(ctx: GateAdviceContext): GateAdvice {
  const { session, motions } = ctx;
  const now = ctx.now ?? Date.now();
  const gate = session.floorGate ?? null;
  const agenda = getAgenda(session);
  const topic = agenda.activeIndex >= 0 ? agenda.items[agenda.activeIndex]?.title ?? null : null;
  // The same read-set the auto-fall sweep uses, so a motion this advice invites can never be the
  // motion the sweep rules out of order a snapshot later. Committee docs are not passed: the only
  // fact they carry is `rejectedDocIds`, which scopes `introduce_document` per document — and a
  // gate opens the floor to the TYPE, so there is nothing per-document to decide here.
  const facts: FloorFacts = readFloorFacts(session, agenda, motions);

  // 0 — nothing to open.
  if (session.finalized || session.phase === "closed") {
    return {
      kind: null,
      because: "The session is closed.",
      next: "Nothing follows. The session report is in the tool panels.",
    };
  }
  if (session.phase === "suspended") {
    return {
      kind: null,
      because: "The session is suspended.",
      next: "Resume from Chair override first — the gate stays shut until you do.",
    };
  }

  // 1-2 — a vote, or its result, already owns the floor.
  if (session.activeVote) {
    return {
      kind: null,
      because: `A vote is running${session.activeVote.motion ? ` on ${quoted(session.activeVote.motion)}` : ""}.`,
      next: "Close and record it, publish the result, then reopen the floor.",
    };
  }
  if (session.pendingPublish) {
    return {
      kind: null,
      because: `The result is in — ${session.pendingPublish.result} — and the room has not been told.`,
      next: "Publish it to the room, then open the next gate.",
    };
  }

  // 3 — someone is speaking. Points ride with a speech; motions do not.
  const speaking = occupant(session);
  if (speaking) {
    return {
      kind: "debate",
      secs: null,
      because: `${countryLabel(speaking.country)} has the floor.`,
      next: "Points only while they speak. Motions come back when the list runs out.",
    };
  }

  // 4 — a caucus is running with nobody speaking.
  const caucus = session.caucus;
  if (caucus) {
    const left = timerRemaining(caucus.totalTimer, now);
    const mod = caucus.kind === "moderated";
    if (left > 0 && left < 60_000) {
      return {
        kind: "motions",
        ...motionsFor("debate", facts),
        secs: 60,
        because: `The caucus ends in ${Math.ceil(left / 1000)}s.`,
        next: "Let the room line up what follows — an extension, another caucus, or back to the list.",
      };
    }
    // 4a — the signup window the caucus opened for itself. Advising the gate that is ALREADY live
    // is the point: `gateMatchesAdvice` then returns true and the stage bar's advice dot stays
    // quiet, instead of nagging the chair to change a window the motion just opened.
    if (mod && caucusListState(caucus) === "collecting") {
      const signupLeft = caucus.signupEndsAt != null ? Math.max(0, caucus.signupEndsAt - now) : 0;
      if (signupLeft > 0) {
        return {
          kind: "signup",
          signupFor: "caucus",
          secs: Math.ceil(signupLeft / 1000),
          because: `Asking the room who wishes to speak${caucus.topic ? ` on ${quoted(caucus.topic)}` : ""}.`,
          next: "The order dialog opens when the window closes. Sort it, then call the first speaker.",
        };
      }
      // Window lapsed, list not committed. The next move is not a gate at all — it is the chair
      // reading the placards back — so the chooser deliberately has no opinion.
      return {
        kind: null,
        because: "Signups have closed and the speaking order is not set.",
        next: "Set the speaking order from the Caucus panel, then call the first speaker.",
      };
    }
    if (mod && !(caucus.queue || []).length) {
      return {
        kind: "signup",
        signupFor: "caucus",
        secs: 60,
        because: `Moderated caucus${caucus.topic ? ` on ${quoted(caucus.topic)}` : ""} with nobody signed up.`,
        next: "Delegates opt in and see their position. Sort the list, then start calling speakers.",
      };
    }
    if (mod) {
      const nx = (caucus.queue || [])[0];
      return {
        kind: "debate",
        secs: null,
        because: `${(caucus.queue || []).length} signed up${nx ? ` — ${countryLabel(nx.country)} is next` : ""}.`,
        next: "Call the speaker. Points stay open, motions stay shut until the caucus ends.",
      };
    }
    return {
      kind: "locked",
      secs: null,
      because: "Unmoderated caucus — the floor belongs to the room, not the chair.",
      next: "Lock it while they talk. Reopen for motions when the clock runs out.",
    };
  }

  // 5 — roll call. The test is the roll-call RECORD, not quorum: a chair who ruled an un-quorate
  // roll complete has taken the roll, and re-advising it would put them straight back where they
  // started. `readRollCall` falls back to the old `quorumMet && phase !== "lobby"` on a session
  // with no record, so every pre-existing sitting reads exactly as it did.
  const present = presentCount(session);
  const quorum = session.quorumThreshold || 0;
  const quorumMet = present >= quorum && present > 0;
  const roll = readRollCall(session, now);
  if (!roll.done) {
    return {
      kind: "roll_call",
      secs: 90,
      because: `Quorum — ${present} of ${quorum} declared.`,
      next: "Delegates declare themselves; silence resolves on close. Then motions, agenda only.",
    };
  }
  // 5b — quorum LOST since the roll was taken. Deliberately keyed on the frozen snapshot, so it can
  // only fire when delegations that WERE counted have since left. A roll completed below quorum in
  // the first place never lands here: the chair already ruled on that, and re-advising it would be
  // a nag with no way to satisfy it.
  if (roll.snapshot?.quorumMet && !quorumMet) {
    return {
      kind: "roll_call",
      secs: 90,
      because: `Quorum lost — ${present} of ${quorum}, down from ${roll.snapshot.seated}.`,
      next: "Take the roll again; delegates re-declare. The committee cannot transact below quorum.",
    };
  }

  // 6 — the agenda. A committee configured with no topics skips straight to the list.
  if (agenda.activeIndex < 0 && agenda.items.length > 0) {
    if (hasLive(motions, "set_agenda")) {
      return {
        kind: null,
        because: "A motion to set the agenda is already on the floor.",
        next: "Recognize it and put it to a vote — the topic mounts itself when it passes.",
      };
    }
    return {
      kind: "motions",
      ...motionsFor("agenda", facts),
      secs: 90,
      because: `Quorum met, no topic adopted — ${agenda.items.length} on the docket.`,
      next: "A delegate moves to set the agenda, you vote it, the topic mounts. Then open the list.",
    };
  }

  // 7 — the Speakers List has to be OPENED by a motion before anyone can sign up for it.
  const gsl = session.gsl;
  // Shared with the mootness model rather than re-stated here — the two must agree on what "open"
  // means, or the gate advises opening a list the queue has already ruled redundant.
  const gslOpened = gslIsOpen(gsl, motions);
  if (!gslOpened) {
    if (hasLive(motions, "open_gsl")) {
      return {
        kind: null,
        because: "A motion to open the Speakers List is already on the floor.",
        next: "Vote it. The speaking time it carries applies itself when it passes.",
      };
    }
    return {
      kind: "motions",
      ...motionsFor("gsl", facts),
      secs: 90,
      because: topic
        ? `${quoted(topic)} adopted; the Speakers List is not open yet.`
        : "No agenda to set; the Speakers List is not open yet.",
      next: "The motion carries the speaking time. When it passes, take signups.",
    };
  }

  // 8 — the list is open and empty. WHY it is empty decides which way this goes, and the two
  // reasons want opposite gates: a list nobody has joined needs signups, a list the room has
  // worked through needs motions. Getting this wrong is not a cosmetic miss — it loops the chair
  // back into collecting signups for a list the committee already finished, which is the one place
  // the flow can strand a sitting.
  const queue = gsl?.queue || [];
  if (!queue.length) {
    // The durable fact (see gslSpokenThrough / GslState.spoken). `signupJustRan` stays as the
    // second test because it answers a case `spoken` cannot: a signup window that ran and drew
    // NOBODY, where the room's answer was silence rather than speeches. It is deliberately kept
    // narrow — it reads the LIVE gate, so it goes false the moment the chair opens anything else,
    // which is exactly why it could never carry the spoken-through case on its own.
    const spokenThrough = gslSpokenThrough(gsl);
    const signupJustRan = gate?.kind === "signup" && gate.signupFor === "gsl";
    if (spokenThrough || signupJustRan) {
      return {
        kind: "motions",
        ...motionsFor("debate", facts),
        secs: 90,
        because: spokenThrough
          ? `The Speakers List has been spoken through — ${gsl?.spoken} ${gsl?.spoken === 1 ? "speech" : "speeches"} on ${topic ? quoted(topic) : "the topic"}.`
          : "Signups ran and the list is still empty.",
        next: "Reopen wider — caucuses, documents and the move to voting all become available.",
      };
    }
    return {
      kind: "signup",
      signupFor: "gsl",
      secs: 60,
      because: "The Speakers List is open and empty.",
      next: "Delegates add themselves. Sort the list, then start the first speech.",
    };
  }

  // 9 — a queue exists; the next thing is a speech, not a gate.
  return {
    kind: "debate",
    secs: null,
    because: `${queue.length} on the list — ${countryLabel(queue[0].country)} is next.`,
    next: "Start the speech. Motions come back once the list is exhausted.",
  };
}

// ── Off-flow note ───────────────────────────────────────────────────────────────
/**
 * One muted sentence when the chair's current picks contradict the advice. Purely informational —
 * `invalid` (an empty motion list) stays the only thing that ever disables the submit button.
 *
 * `label` is injected rather than imported so the gate vocabulary the chair reads stays owned by
 * the component that renders it.
 */
export function offFlowNote(
  advice: GateAdvice,
  picked: { kind: FloorGateKind; motionTypes: MotionType[] },
  label: (k: FloorGateKind) => string,
): string | null {
  if (!advice.kind) return null;

  // Deliberately short in both branches: the dialog already prints `because` at the top, and
  // repeating it here turns one sentence of guidance into two of nagging.
  if (picked.kind !== advice.kind) return `The flow expects ${quoted(label(advice.kind))} here.`;
  if (picked.kind !== "motions" || !advice.motionTypes) return null;

  const extra = picked.motionTypes.filter((t) => !advice.motionTypes!.includes(t));
  if (!extra.length) return null;
  const names = extra.map((t) => MOTION_META[t]?.short || t).join(", ");
  return `${names} ${extra.length === 1 ? "is" : "are"} wider than the flow expects here.`;
}

// ── Matchers used by the marking UI ─────────────────────────────────────────────
/** Does the live gate already match what the flow advises? Drives the stage-bar dot. */
export function gateMatchesAdvice(
  gate: LiveSession["floorGate"] | null | undefined,
  advice: GateAdvice,
): boolean {
  if (!advice.kind) return true; // no opinion — never nag
  if (!gate || gate.kind !== advice.kind) return false;
  if (advice.kind === "signup") return gate.signupFor === advice.signupFor;
  if (advice.kind !== "motions" || !advice.motionTypes) return true;
  const have = gate.motionTypes || [];
  return have.length === advice.motionTypes.length
    && advice.motionTypes.every((t) => have.includes(t));
}
