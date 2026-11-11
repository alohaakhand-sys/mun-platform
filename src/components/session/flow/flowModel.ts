/**
 * Chair Flow Bar — the pure brain.
 *
 * Maps the live session state onto the MUN flow of debate
 *   Roll Call → set the agenda → open the GSL → speeches → motion → caucus → vote → next topic
 * and returns the step the committee is on plus the 1–4 actions that are in order right now.
 *
 * THREE INVARIANTS, in force for the life of this file:
 *
 *  1. ADVISORY ONLY. `deriveFlow` returns *suggestions*. There is no `blocked` / `required` /
 *     `illegal` field and adding one is the design smell to reject — the Flow Bar is a shortcut
 *     layer over the tool panels, never the sole path to any action, and it never disables an
 *     existing control *of the chair's*.
 *
 *  2. PURE. This module imports `type`-only from sessionService, so TypeScript erases the import
 *     entirely and the module never pulls in `@/lib/firebase/client` (which sessionService imports
 *     at module scope). That is load-bearing: a value import would make this unloadable outside a
 *     browser with Firebase env vars. Same shape as `video/tileLayout.ts`. `now` is injectable so
 *     the derivation is deterministic under test.
 *
 *  3. TOKENS, NOT CLOSURES. A suggestion carries `{action}` or `{panel}` — never a `run()`. Every
 *     write is therefore bound in exactly ONE place (`useFlowBar`), which is where the
 *     double-fire invariant against `useFloorController`'s latch is enforced.
 *
 *  4. SCOPE. Invariants 1–3 govern the CHAIR's bar. Delegate-side *admissibility* — "are motions
 *     in order right now?" — is a different concern and lives in `lib/services/motionFloor.ts`.
 *     `deriveFlow` may READ it to decide whether offering "open the floor to motions" is useful
 *     (the same way it reads `quorumMet`); it never returns it, and no delegate gate is ever
 *     derived from a `FlowSuggestion`. The chair stays unblocked either way: while an invite is
 *     live, `start_speaker` / `next_speaker` / `close_vote` remain fully offered.
 *
 * State precedence deliberately mirrors `useFloorController` (ChairSessionConsole.tsx:752-787):
 * concrete objects (activeVote / caucus / gsl.activeSpeaker) decide first, `phase` is consulted
 * only for lobby / roll_call / suspended / closed. `phase` drifts — `endCaucus` force-sets "gsl"
 * regardless of what was happening, and the Host panel can set it freely.
 */
import { getCountryName } from "@/lib/data/countries";
import { MOTION_META } from "@/lib/services/motionMeta";
// Read-only, per invariant 4 — used to rank the "open the floor to motions" suggestion. Also pure.
import { motionsInOrder } from "@/lib/services/motionFloor";
// Also pure — the normalizer for `caucus.listState`, absent on every pre-existing caucus.
import { caucusListState } from "@/lib/services/caucusList";
// Pure. THE only reader of `session.rollCall` — see its header for why the roll-call stage is a
// record rather than a derivation off `quorumMet` or the gate.
import { readRollCall, ROLL_CALL_DEFAULT_SECS } from "@/lib/services/rollCall";
// Pure. NOT `gateAdvice` — that module imports THIS one (`getAgenda`, `FlowStepId`), so the
// dependency only runs one way. Both files read `gslSpokenThrough` from here instead.
import { gslSpokenThrough, gslIsOpen } from "@/lib/services/motionMootness";
import type {
  LiveSession, Motion, MotionType, FloorRequest, SessionAgenda, AgendaItem,
} from "@/lib/services/sessionService";

// ── Steps ───────────────────────────────────────────────────────────────────────
export type FlowStepId =
  | "roll_call" | "agenda" | "gsl" | "motion" | "caucus" | "voting" | "closing";

export type FlowIconId =
  | "rollcall" | "agenda" | "mic" | "gavel" | "users" | "vote" | "lock"
  | "play" | "skip" | "check" | "plus" | "megaphone" | "pause" | "list" | "hand" | "report";

export interface FlowStep {
  id: FlowStepId;
  label: string;
  /** Shown instead of `label` on a narrow stage. */
  short: string;
  icon: FlowIconId;
  /**
   * Gateway steps complete once and stay done. Loop steps (gsl/motion/caucus/voting) cycle for
   * every agenda topic and are NEVER marked done — that is honest, and it removes the whole class
   * of "the rail thinks we're finished but we're not" bugs.
   */
  gateway: boolean;
}

export const FLOW_STEPS: readonly FlowStep[] = [
  { id: "roll_call", label: "Roll Call", short: "Roll",   icon: "rollcall", gateway: true  },
  { id: "agenda",    label: "Agenda",    short: "Agenda", icon: "agenda",   gateway: true  },
  { id: "gsl",       label: "Speakers",  short: "GSL",    icon: "mic",      gateway: false },
  { id: "motion",    label: "Motion",    short: "Motion", icon: "gavel",    gateway: false },
  { id: "caucus",    label: "Caucus",    short: "Caucus", icon: "users",    gateway: false },
  { id: "voting",    label: "Vote",      short: "Vote",   icon: "vote",     gateway: false },
  { id: "closing",   label: "Close",     short: "Close",  icon: "lock",     gateway: true  },
] as const;

/** The tool-panel ids. Single source of truth — `SubTab` in ChairSessionConsole aliases this. */
export type FlowPanelId =
  | "rollcall" | "voting" | "gsl" | "requests" | "caucus"
  | "motions" | "docs" | "marking" | "report" | "represent";

// ── Actions ─────────────────────────────────────────────────────────────────────
export type FlowActionId =
  | "start_roll_call" | "stop_roll_call" | "complete_roll_call" | "mark_all_present"
  | "seed_agenda" | "adopt_agenda_first" | "next_agenda_item"
  | "open_gsl" | "open_gsl_signup" | "complete_gsl_signup" | "complete_caucus_signup"
  | "start_speaker" | "next_speaker"
  | "recognize_motion" | "put_motion_to_vote" | "execute_motion"
  | "end_caucus" | "extend_caucus"
  | "close_vote" | "publish_result"
  | "open_motion_floor" | "close_motion_floor"
  | "resume" | "suspend" | "adjourn" | "reopen";

/**
 * Tokens whose write is ALREADY owned by `useFloorController`'s guard() latch.
 * `useFlowBar` MUST bind these to `floor.primary.onClick` verbatim and must never import
 * nextSpeaker / endCaucus / finalizeVote itself — that is what makes the Flow Bar and the
 * LiveStrip share one latch by construction rather than by coordination.
 */
export const DELEGATED_TO_FLOOR: readonly FlowActionId[] =
  ["start_speaker", "next_speaker", "end_caucus", "close_vote"] as const;

export type FlowTone = "primary" | "emerald" | "amber" | "red" | "muted";

export interface FlowSuggestion {
  /** Stable DOM key — includes the subject id where there is one, e.g. "execute_motion:abc123". */
  id: string;
  label: string;
  hint?: string;
  icon: FlowIconId;
  tone: FlowTone;
  kind: "service" | "panel";
  panel?: FlowPanelId;
  action?: FlowActionId;
  payload?: { motionId?: string; index?: number; secs?: number };
  /** Two-step confirm copy. The chip swaps to Confirm/Cancel on first tap. */
  confirm?: string;
  /** Country code for a leading flag (speaker / proposer). */
  flag?: string;
}

// ── Derivation I/O ──────────────────────────────────────────────────────────────
export interface FlowContext {
  session: LiveSession;
  /** Raw motionQueue — the fn filters. */
  motions: Motion[];
  /** Raw requests — the fn filters. */
  requests: FloorRequest[];
  /** Committee.agendas[] — the fallback when session.agenda is absent. */
  committeeAgendas: string[];
  canControl: boolean;
  /** Injectable clock. Defaults to Date.now(); pass it in tests. */
  now?: number;
}

export type FlowStepStatus = "done" | "current" | "upcoming";

export interface FlowState {
  currentStepId: FlowStepId;
  completedStepIds: FlowStepId[];
  stepStatus: Record<FlowStepId, FlowStepStatus>;
  /** One line of context, agenda-aware. The LiveStrip's own `liveLabel` is not reused. */
  headline: string;
  /** Active topic title, or null when nothing is adopted. */
  agendaLabel: string | null;
  /** Always normalized — never null, even on a pre-agenda session. */
  agenda: SessionAgenda;
  /** Things waiting on the chair: pending motions + speak/floor requests + an unpublished result. */
  attention: number;
  /** 1–4, most important first. */
  suggestions: FlowSuggestion[];
}

// ── Agenda normalizer — THE only reader of session.agenda ────────────────────────
/**
 * Returns the persisted agenda with `activeIndex` clamped, or synthesizes one in memory from the
 * committee config when the session predates `session.agenda`. This is why there is no backfill
 * migration and no dual-read branch anywhere else: every consumer goes through here.
 */
export function getAgenda(
  session: Pick<LiveSession, "agenda"> | null | undefined,
  committeeAgendas: string[] = [],
): SessionAgenda {
  const a = session?.agenda;
  if (a && Array.isArray(a.items) && a.items.length) {
    const activeIndex = typeof a.activeIndex === "number"
      ? Math.max(-1, Math.min(a.items.length - 1, a.activeIndex))
      : -1;
    return { items: a.items, activeIndex, source: a.source };
  }
  const items: AgendaItem[] = committeeAgendas
    .map((t) => (t || "").trim())
    .filter(Boolean)
    .map((title, i) => ({ id: `a${i}`, title, status: "pending" as const }));
  return { items, activeIndex: -1, source: "committee" };
}

/** The topic under debate, or null. */
export function activeAgendaTitle(agenda: SessionAgenda): string | null {
  const it = agenda.activeIndex >= 0 ? agenda.items[agenda.activeIndex] : undefined;
  return it?.title || null;
}

// ── Small pure helpers ──────────────────────────────────────────────────────────
const ACTIONABLE_MOTION: ReadonlySet<string> = new Set(["pending", "recognized", "passed"]);

/** MUN precedence, lower rank first; then longer duration; then oldest. Mirrors
 *  `compareMotionPrecedence` in sessionService — duplicated here to keep the module pure. */
function byPrecedence(a: Motion, b: Motion): number {
  const ra = MOTION_META[a.type]?.rank ?? 99;
  const rb = MOTION_META[b.type]?.rank ?? 99;
  if (ra !== rb) return ra - rb;
  const da = a.params?.totalDurationSecs || 0;
  const db = b.params?.totalDurationSecs || 0;
  if (da !== db) return db - da;
  const ta = a.createdAt?.toMillis?.() ?? 0;
  const tb = b.createdAt?.toMillis?.() ?? 0;
  return ta - tb;
}

function countryLabel(code: string | undefined): string {
  if (!code) return "Delegate";
  return getCountryName(code) || code;
}

function presentCount(session: LiveSession): number {
  return Object.values(session.attendance || {})
    .filter((a) => a.status === "present" || a.status === "present_and_voting").length;
}

function timerRemaining(t: { running: boolean; endsAt: number | null; pausedRemainingMs: number | null } | undefined, now: number): number {
  if (!t) return 0;
  if (t.running && t.endsAt != null) return Math.max(0, t.endsAt - now);
  return Math.max(0, t.pausedRemainingMs ?? 0);
}

function mmss(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

const TONE_WEIGHT: Record<FlowTone, number> = { primary: 0, emerald: 0, amber: 1, red: 2, muted: 3 };

// ── The derivation ──────────────────────────────────────────────────────────────
export function deriveFlow(ctx: FlowContext): FlowState {
  const { session, canControl } = ctx;
  const now = ctx.now ?? Date.now();
  const agenda = getAgenda(session, ctx.committeeAgendas);
  const agendaLabel = activeAgendaTitle(agenda);

  const vote = session.activeVote;
  const caucus = session.caucus;
  const gsl = session.gsl;
  const pendingPublish = session.pendingPublish || null;

  const present = presentCount(session);
  const quorum = session.quorumThreshold || 0;
  const quorumMet = present >= quorum && present > 0;
  // The gateway out of roll call. NOT `quorumMet` — a committee that answers 1 of 4 has finished
  // its roll and simply is not quorate, and conflating the two is what made "Mark all present"
  // compulsory. See rollCall.ts.
  const roll = readRollCall(session, now);

  const actionable = ctx.motions
    .filter((m) => ACTIONABLE_MOTION.has(m.status))
    .sort(byPrecedence);
  const topMotion = actionable[0] || null;

  const pendingSpeak = ctx.requests.filter(
    (r) => r.status === "pending" && (r.kind === "speak" || r.kind === "floor")
  ).length;
  const caucusId = caucus?.kind === "moderated" ? caucus.caucusId : null;
  const pendingSignups = !caucusId ? 0 : ctx.requests.filter(
    (r) => r.status === "pending" && r.kind === "caucus_signup" && r.caucusId === caucusId && r.answer === "yes"
  ).length;

  const attention = actionable.filter((m) => m.status === "pending" || m.status === "passed").length
    + pendingSpeak + (pendingPublish ? 1 : 0);

  const gate = session.floorGate;
  const motionsGateOpen =
    gate?.kind === "motions" && (gate.endsAt == null || now < gate.endsAt);

  // ── currentStepId ─────────────────────────────────────────────────────────────
  let currentStepId: FlowStepId;
  if (session.finalized || session.phase === "closed") currentStepId = "closing";
  else if (session.phase === "suspended") currentStepId = "closing";
  else if (vote || pendingPublish) currentStepId = "voting";
  else if (caucus) currentStepId = "caucus";
  // A motion before the roll is taken is out of order — it still shows in the Motions panel, the
  // bar just doesn't lead with it. set_agenda motions ARE how the agenda gets adopted, so this sits
  // above the agenda step but below the live floor.
  //
  // THE TEST IS `roll.done`, NOT `quorumMet`. A chair who completes an un-quorate roll has ruled;
  // holding the bar silent over the delegate's set_agenda motion afterwards would deliver half the
  // fix and leave them stranded again.
  else if (motionsGateOpen && roll.done) currentStepId = "motion";
  else if (topMotion && roll.done) currentStepId = "motion";
  // Neither is `phase` consulted here any more: nothing moves it off "roll_call" when the roll
  // finishes (the next setPhase comes from executeMotion, two steps later), so reading it would
  // loop the chair back into roll call forever with a full committee in the room.
  else if (!roll.done) currentStepId = "roll_call";
  else if (agenda.activeIndex < 0 && agenda.items.length > 0) currentStepId = "agenda";
  else currentStepId = "gsl";

  // ── stepStatus ────────────────────────────────────────────────────────────────
  const pastRollCall = roll.done;
  const stepStatus = {} as Record<FlowStepId, FlowStepStatus>;
  for (const s of FLOW_STEPS) {
    if (s.id === currentStepId) { stepStatus[s.id] = "current"; continue; }
    if (s.id === "roll_call") { stepStatus[s.id] = pastRollCall ? "done" : "upcoming"; continue; }
    if (s.id === "agenda") { stepStatus[s.id] = agenda.activeIndex >= 0 ? "done" : "upcoming"; continue; }
    if (s.id === "closing") { stepStatus[s.id] = session.finalized ? "done" : "upcoming"; continue; }
    stepStatus[s.id] = "upcoming"; // loop steps never latch to done — they recur per topic
  }
  const completedStepIds = FLOW_STEPS.filter((s) => stepStatus[s.id] === "done").map((s) => s.id);

  // ── headline + suggestions ────────────────────────────────────────────────────
  const topicPrefix = agendaLabel ? `${agendaLabel} · ` : "";
  let headline = "";
  const out: FlowSuggestion[] = [];
  const push = (s: FlowSuggestion) => { out.push(s); };

  /**
   * "Are there any points or motions on the floor?" — the chair's invitation.
   *
   * Offered at every step where the floor is genuinely clear, which is the agenda moment AND
   * between speeches: a delegate moving to set the agenda is the whole point of the first one.
   * `motionsInOrder` is the judge, so this can never invite motions that would then be refused —
   * while someone holds the floor it declines to offer anything at all.
   *
   * Invariant 4: this READS admissibility to rank a suggestion; it never returns it, and no
   * delegate gate is derived from a FlowSuggestion.
   */
  const pushMotionInvite = (openTone: FlowTone, openLabel?: string) => {
    const floor = motionsInOrder(session, now);
    if (!floor.inOrder) return;
    // TWO MECHANISMS ANSWER "HAS THE CHAIR ASKED?", and this has to honour both or the bar keeps
    // offering "open the floor" over a floor it already opened. `motionsInOrder` only knows the
    // legacy `motionInvite`; on a gated session the ask is a `floorGate` of kind "motions", which
    // that function deliberately does not read (see its header). Read directly rather than calling
    // `capabilitiesFor` — this asks whether the CHAIR asked, not what one delegate may do.
    const gate = session.floorGate;
    const motionsGateOpen =
      gate?.kind === "motions" && (gate.endsAt == null || now < gate.endsAt);
    if (floor.code === "invited" || motionsGateOpen) {
      push({ id: "close_motion_floor", label: "Close the floor to motions",
             hint: actionable.length ? `${actionable.length} proposed` : undefined,
             icon: "megaphone", tone: "amber",
             kind: "service", action: "close_motion_floor" });
    } else {
      // `openLabel` lets a step name the motion it is actually inviting — "Motion for agenda
      // setting" rather than the generic ask. It rides THIS token and not `adopt_agenda_first`
      // because the label has to be true: what the tap does is open the floor for that motion.
      push({ id: "open_motion_floor", label: openLabel || "Open the floor to motions",
             icon: "megaphone", tone: openTone, kind: "service", action: "open_motion_floor" });
    }
  };

  switch (currentStepId) {
    case "roll_call": {
      // ONE LIFECYCLE TOKEN, whichever stage the roll is at — start it, stop it, or rule it taken.
      // `done` is unreachable here (it is the gateway out of this step), so this is an if/else
      // chain rather than a switch TypeScript would demand be exhaustive.
      const { answered, total } = roll.tally;
      if (roll.stage === "running") {
        headline = `Roll call is open — ${answered} of ${total} answered`;
        push({ id: "stop_roll_call", label: "Stop roll call",
               hint: `${answered} of ${total} answered`,
               icon: "pause", tone: "amber", kind: "service", action: "stop_roll_call" });
      } else if (roll.stage === "ended") {
        headline = quorumMet
          ? `Roll call closed — quorum met, ${present} of ${quorum}`
          : `Roll call closed — ${present} of ${quorum} for quorum`;
        push({ id: "complete_roll_call", label: "Complete roll call",
               hint: quorumMet
                 ? `Quorum met — ${present} of ${quorum}`
                 : `Below quorum — ${present} of ${quorum}`,
               icon: "check", tone: "emerald", kind: "service", action: "complete_roll_call" });
      } else {
        headline = `Roll call — ${present} of ${quorum} needed for quorum`;
        push({ id: "start_roll_call", label: "Start roll call",
               hint: `${ROLL_CALL_DEFAULT_SECS}s for delegates to answer`,
               icon: "rollcall", tone: "primary", kind: "service", action: "start_roll_call",
               payload: { secs: ROLL_CALL_DEFAULT_SECS } });
      }
      // MUTED, AND ALWAYS OFFERED. Marking the room present without asking it is a chair override,
      // not the next step in procedure — it belongs in the override drawer, and it stopped being
      // compulsory the moment `roll.done` replaced `quorumMet` as the gateway. `TONE_WEIGHT` sorts
      // it below the lifecycle token, and GateBar picks the first SERVICE suggestion as its
      // primary, so a muted service token can never steal that slot.
      push({ id: "mark_all_present", label: "Mark all present",
             hint: `${present} of ${Object.keys(session.attendance || {}).length} marked`,
             icon: "check", tone: "muted", kind: "service", action: "mark_all_present" });
      push({ id: "p:rollcall", label: "Roll call", icon: "rollcall", tone: "muted",
             kind: "panel", panel: "rollcall" });
      break;
    }

    case "agenda": {
      // Note: a live set_agenda motion never lands here — an actionable motion outranks this step
      // (see the precedence chain), so the chair acts on it from the "motion" branch instead.
      headline = `Set the agenda — ${agenda.items.length} topic${agenda.items.length === 1 ? "" : "s"}`;
      if (agenda.items.length) {
        // MUTED, and that is the procedural correction: the chair mounting a topic by hand is the
        // override, and the room moving to set the agenda is the step. Under motion-first the
        // invite below leads.
        push({ id: "adopt_agenda_first", label: `Adopt: ${agenda.items[0].title}`,
               icon: "agenda", tone: "muted", kind: "service",
               action: "adopt_agenda_first", payload: { index: 0 } });
      } else if (ctx.committeeAgendas.length) {
        push({ id: "seed_agenda", label: `Load committee agenda (${ctx.committeeAgendas.length})`,
               icon: "agenda", tone: "primary", kind: "service", action: "seed_agenda" });
      }
      // The lead. "Motion to set the agenda" is a delegate motion and this is the moment for it —
      // the one tap opens the floor for exactly that type, because `adviseGate` advises the
      // `agenda` preset here and `motionGateSpec` takes the advice.
      pushMotionInvite("primary", "Motion for agenda setting");
      push({ id: "open_gsl", label: "Skip — open the Speakers List", icon: "mic", tone: "muted",
             kind: "service", action: "open_gsl" });
      break;
    }

    case "gsl": {
      const active = gsl?.activeSpeaker || null;
      const queue = gsl?.queue || [];
      if (active) {
        headline = `${topicPrefix}Speaking · ${countryLabel(active.country)}`;
        const nx = queue[0];
        push({ id: "next_speaker",
               label: nx ? `Next: ${countryLabel(nx.country)}` : "Finish speech",
               flag: nx?.country, icon: "skip", tone: "emerald",
               kind: "service", action: "next_speaker" });
      } else if (queue.length) {
        headline = `${topicPrefix}Floor open — ${queue.length} on the list`;
        push({ id: "start_speaker", label: `Start: ${countryLabel(queue[0].country)}`,
               flag: queue[0].country, icon: "play", tone: "emerald",
               kind: "service", action: "start_speaker" });
      } else if (gslSpokenThrough(gsl)) {
        // The room WORKED THROUGH the list — a different moment from a list nobody joined, and the
        // next move is the opposite one. "Add speakers" stops leading here; motions do, via the
        // `primary` tone `pushMotionInvite` gets below.
        headline = `${topicPrefix}Speakers List exhausted · ${gsl?.spoken} spoke`;
        push({ id: "p:gsl", label: "Reopen the list", icon: "list", tone: "muted",
               kind: "panel", panel: "gsl" });
      } else {
        headline = `${topicPrefix}Speakers List is empty`;
        const opened = gslIsOpen(gsl, ctx.motions);
        const gate = session.floorGate;
        const gslSignupOpen = gate?.kind === "signup" && gate.signupFor === "gsl" && (gate.endsAt == null || now < gate.endsAt);
        if (gslSignupOpen) {
          push({ id: "complete_gsl_signup", label: "Complete signups", icon: "hand", tone: "primary",
                 kind: "service", action: "complete_gsl_signup" });
          push({ id: "p:gsl", label: "Add speakers", icon: "list", tone: "muted",
                 kind: "panel", panel: "gsl" });
        } else if (opened) {
          push({ id: "open_gsl_signup", label: "Open floor for speakers signup", icon: "hand", tone: "primary",
                 kind: "service", action: "open_gsl_signup" });
          push({ id: "p:gsl", label: "Add speakers", icon: "list", tone: "muted",
                 kind: "panel", panel: "gsl" });
        } else {
          push({ id: "p:gsl", label: "Add speakers", icon: "list", tone: "primary",
                 kind: "panel", panel: "gsl" });
        }
      }
      const opened = gslIsOpen(gsl, ctx.motions);
      const gate = session.floorGate;
      const gslSignupOpen = gate?.kind === "signup" && gate.signupFor === "gsl" && (gate.endsAt == null || now < gate.endsAt);
      if (!active) pushMotionInvite((queue.length || opened || gslSignupOpen) ? "muted" : "primary");
      if (pendingSpeak > 0) {
        push({ id: "p:requests", label: `${pendingSpeak} want to speak`, icon: "hand", tone: "amber",
               kind: "panel", panel: "requests" });
      }
      push({ id: "p:caucus", label: "Motion a caucus", icon: "users", tone: "muted",
             kind: "panel", panel: "caucus" });
      break;
    }

    case "motion": {
      if (motionsGateOpen) {
        headline = `Motion window open · ${actionable.length} proposed`;
        push({ id: "close_motion_floor", label: "Complete Motions",
               hint: actionable.length ? `${actionable.length} proposed` : "Close window to review motions",
               icon: "pause", tone: "primary", kind: "service", action: "close_motion_floor" });
        push({ id: "p:motions", label: `Motions${actionable.length ? ` (${actionable.length})` : ""}`,
               icon: "gavel", tone: "muted", kind: "panel", panel: "motions" });
        break;
      }
      const m = topMotion!;
      const competingAgenda = m.type === "set_agenda"
        ? actionable.filter((x) => x.type === "set_agenda").length
        : 0;
      if (competingAgenda > 1) {
        // Real MUN: several delegations move competing agendas and the first to pass wins.
        // `adoptAgendaTopic` is last-write-wins, so a one-tap here could silently overwrite the
        // topic that actually carried. Send the chair to the panel, where the full slate is visible.
        headline = `${competingAgenda} competing motions to set the agenda`;
        push({ id: "p:motions:competing", label: `${competingAgenda} competing agenda motions`,
               icon: "gavel", tone: "amber", kind: "panel", panel: "motions" });
        break;
      }
      headline = `${topicPrefix}${countryLabel(m.byCountry)} · ${MOTION_META[m.type]?.label || m.type}`;
      push(motionSuggestion(m));
      if (m.status === "pending") {
        push({ id: `put_motion_to_vote:${m.id}`, label: "Put to vote", icon: "vote", tone: "amber",
               kind: "service", action: "put_motion_to_vote", payload: { motionId: m.id } });
      } else if (m.status === "recognized" && MOTION_META[m.type]?.needsVote) {
        push({ id: `execute_motion:${m.id}`, label: "Adopt without a vote", icon: "check", tone: "muted",
               kind: "service", action: "execute_motion", payload: { motionId: m.id } });
      }
      // Dismiss is deliberately panel-only: DismissWithReason is a two-step ruling with a reason
      // field, and a one-tap dismiss on a video overlay is a mistap waiting to happen.
      push({ id: "p:motions", label: `Motions${actionable.length > 1 ? ` (${actionable.length})` : ""}`,
             icon: "gavel", tone: "muted", kind: "panel", panel: "motions" });
      break;
    }

    case "caucus": {
      const c = caucus!;
      const mod = c.kind === "moderated";
      const cq = (mod && c.queue) || [];
      const totalLeft = timerRemaining(c.totalTimer, now);
      const endingSoon = totalLeft > 0 && totalLeft < 60_000;
      headline = `${topicPrefix}${mod ? "Moderated" : "Unmoderated"} caucus${c.topic ? ` · ${c.topic}` : ""}`;

      // The placard moment, before anything else this step could say. A caucus that has just opened
      // has an empty queue and no granted signups, which used to fall all the way through to
      // "End caucus" as the ONE suggestion — the bar telling the chair to abandon the caucus the
      // committee voted for, in its first ten seconds.
      if (mod && caucusListState(c) === "collecting") {
        const signupLeft = c.signupEndsAt != null ? Math.max(0, c.signupEndsAt - now) : 0;
        const open = signupLeft > 0;
        headline = `${topicPrefix}${c.topic ? `${c.topic} · ` : ""}${
          open ? "asking who wishes to speak" : "signups closed"}`;
        push({
          id: "complete_caucus_signup",
          label: open ? "Complete signups" : "Set speaking order",
          hint: open ? `${pendingSignups} signed up` : undefined,
          icon: open ? "hand" : "list",
          tone: open ? "primary" : "amber",
          kind: "service", action: "complete_caucus_signup",
        });
        if (endingSoon) {
          push({ id: "extend_caucus", label: "Extend +5 min", icon: "plus", tone: "amber",
                 kind: "service", action: "extend_caucus", payload: { secs: 300 } });
        }
        push({ id: "end_caucus", label: "End caucus", icon: "pause", tone: "muted",
               kind: "service", action: "end_caucus" });
        break;
      }

      if (endingSoon) {
        push({ id: "extend_caucus", label: "Extend +5 min", icon: "plus", tone: "amber",
               kind: "service", action: "extend_caucus", payload: { secs: 300 } });
      }
      if (mod && cq.length) {
        push({ id: "next_speaker", label: `Next: ${countryLabel(cq[0].country)}`, flag: cq[0].country,
               icon: "skip", tone: "emerald", kind: "service", action: "next_speaker" });
      } else if (mod && pendingSignups > 0) {
        push({ id: "p:caucus:signups", label: `${pendingSignups} signup${pendingSignups === 1 ? "" : "s"} — add speakers`,
               icon: "hand", tone: "amber", kind: "panel", panel: "caucus" });
      } else {
        push({ id: "end_caucus", label: "End caucus", icon: "pause", tone: "muted",
               kind: "service", action: "end_caucus" });
      }
      const ext = actionable.find((m) => m.type === "extend_caucus");
      if (ext) {
        push({ id: `put_motion_to_vote:${ext.id}`, label: "Put extension to vote", icon: "vote",
               tone: "amber", kind: "service", action: "put_motion_to_vote", payload: { motionId: ext.id } });
      } else if (!endingSoon) {
        push({ id: "extend_caucus", label: "Extend +5 min", icon: "plus", tone: "muted",
               kind: "service", action: "extend_caucus", payload: { secs: 300 } });
      }
      push({ id: "p:caucus", label: "Caucus", icon: "users", tone: "muted",
             kind: "panel", panel: "caucus" });
      break;
    }

    case "voting": {
      if (vote) {
        const cast = vote.mode === "roll_call"
          ? Object.keys(vote.ballots || {}).length
          : (vote.tally?.yes || 0) + (vote.tally?.no || 0) + (vote.tally?.abstain || 0);
        headline = `${topicPrefix}Vote · ${vote.motion || "in progress"}`;
        push({ id: "close_vote", label: "Close & record",
               hint: `${cast} of ${vote.eligibleCount} cast`,
               icon: "gavel", tone: "amber", kind: "service", action: "close_vote" });
      } else if (pendingPublish) {
        headline = `${topicPrefix}Result ready — ${pendingPublish.result}`;
        push({ id: "publish_result", label: "Publish to the room", icon: "megaphone", tone: "emerald",
               kind: "service", action: "publish_result" });
      }
      push({ id: "p:voting", label: "Voting", icon: "vote", tone: "muted",
             kind: "panel", panel: "voting" });
      break;
    }

    case "closing": {
      // BOTH STOPS OFFER THE WAY BACK. Finalize and adjourn are reversible — a chair who gavelled
      // early would otherwise be stranded: `finalized` outranks the phase everywhere, and
      // `ensureSession` returns the existing doc, so there is no "start" left to press either.
      if (session.finalized || session.phase === "closed") {
        headline = session.finalized ? "Session finalized" : "Session closed";
        push({ id: "reopen", label: "Reopen the session", icon: "play", tone: "primary",
               kind: "service", action: "reopen",
               confirm: "Reopen the session? The day's marks stay saved." });
        push({ id: "p:report", label: "Session report", icon: "report", tone: "primary",
               kind: "panel", panel: "report" });
        break;
      }
      if (session.phase === "suspended") {
        headline = "Session suspended";
        push({ id: "resume", label: "Resume — back to Speakers", icon: "play", tone: "primary",
               kind: "service", action: "resume" });
      } else {
        headline = agendaLabel ? `${agendaLabel} · wrapping up` : "Wrapping up";
        const nextIdx = agenda.activeIndex + 1;
        if (nextIdx > 0 && nextIdx < agenda.items.length) {
          push({ id: "next_agenda_item", label: `Next topic: ${agenda.items[nextIdx].title}`,
                 icon: "agenda", tone: "primary", kind: "service",
                 action: "next_agenda_item", payload: { index: nextIdx } });
        }
        push({ id: "suspend", label: "Suspend the session", icon: "pause", tone: "amber",
               kind: "service", action: "suspend", confirm: "Suspend the session?" });
        push({ id: "adjourn", label: "Adjourn", icon: "lock", tone: "red",
               kind: "service", action: "adjourn", confirm: "Adjourn — this closes the session." });
      }
      push({ id: "p:report", label: "Session report", icon: "report", tone: "muted",
             kind: "panel", panel: "report" });
      break;
    }
  }

  // Observers (vice-chairs without control) keep navigation, lose every write.
  const filtered = canControl ? out : out.filter((s) => s.kind === "panel");

  const suggestions = filtered
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (TONE_WEIGHT[a.s.tone] - TONE_WEIGHT[b.s.tone]) || (a.i - b.i))
    .map((x) => x.s)
    .slice(0, 4);

  return {
    currentStepId, completedStepIds, stepStatus,
    headline, agendaLabel, agenda, attention, suggestions,
  };
}

/** The one chair action a motion is waiting for, given its status. */
function motionSuggestion(m: Motion): FlowSuggestion {
  const meta = MOTION_META[m.type as MotionType];
  const who = countryLabel(m.byCountry);
  if (m.status === "passed") {
    return { id: `execute_motion:${m.id}`, label: `Execute: ${meta?.short || m.type}`,
             hint: who, flag: m.byCountry, icon: "check", tone: "emerald",
             kind: "service", action: "execute_motion", payload: { motionId: m.id } };
  }
  if (m.status === "recognized" || !meta?.needsVote) {
    return meta?.needsVote
      ? { id: `put_motion_to_vote:${m.id}`, label: `Put to vote: ${meta.short}`,
          hint: who, flag: m.byCountry, icon: "vote", tone: "primary",
          kind: "service", action: "put_motion_to_vote", payload: { motionId: m.id } }
      : { id: `execute_motion:${m.id}`, label: `Execute now: ${meta?.short || m.type}`,
          hint: who, flag: m.byCountry, icon: "check", tone: "primary",
          kind: "service", action: "execute_motion", payload: { motionId: m.id } };
  }
  return { id: `recognize_motion:${m.id}`, label: `Recognize: ${meta?.short || m.type}`,
           hint: who, flag: m.byCountry, icon: "gavel", tone: "primary",
           kind: "service", action: "recognize_motion", payload: { motionId: m.id } };
}
