/**
 * Which motion is the natural next one? — the DELEGATE-side advice model.
 *
 * THE GAP THIS FILLS. Three modules already answer a version of "what happens next", and all three
 * face the chair: `flowModel.ts` ("what should the chair do"), `gateAdvice.ts` ("what should the
 * chair OPEN"), `motionMootness.ts` ("is this motion still answerable"). The delegate had nothing.
 * The chair opens the floor after the Speakers List runs out, the delegate taps Propose, and gets
 * ten motion types in fixed order, every one of them subtitled "Goes to a procedural vote" — the
 * form knows the committee just spoke through its list and says nothing about it. A first-timer
 * reads that list and picks `custom`; an experienced delegate already knew it was caucus time. So
 * the surface teaches nobody and helps nobody.
 *
 * WHAT IT RETURNS. A short RANKED lead (usually one or two types), the FACT that produced it, and a
 * one-line reason per type. The form puts the lead on top under the fact and files the rest below.
 *
 * FOUR INVARIANTS.
 *
 *  1. ADVISORY ONLY — the same rule `flowModel` and `gateAdvice` carry, and it matters more here
 *     because this faces the person being governed. Nothing returned disables, hides or preselects
 *     anything. `types` is a RANKING, never a permission: `allowed` (the caller's gate result) is
 *     the permission, this only reorders inside it. An empty `types` means "no opinion", never "you
 *     may not move".
 *
 *  2. SUBSET OF `allowed`, ALWAYS. Every returned type is filtered through the caller's admissible
 *     set at the end, so advice can never surface a motion the gate would then refuse — the exact
 *     confusion the gate exists to remove.
 *
 *  3. SESSION-ONLY BY DEFAULT. `motions` (the motionQueue) is OPTIONAL and defaults to empty,
 *     because the delegate console deliberately does not subscribe to that subcollection — one
 *     listener per delegate per session is real money on a 50k-reads/day tier for advice that is
 *     cosmetic. Every row therefore has a session-doc-only answer, and the queue only SHARPENS
 *     it (see `gslEverOpened`). A row that cannot be answered from the session doc does not belong
 *     in this file.
 *
 *  4. PURE. Type-only import from sessionService plus three pure value imports, so this never pulls
 *     in `@/lib/firebase/client` (whose `getDatabase()` throws without env vars). `now` is
 *     injectable. `motionAdvice.test.ts` runs it in a bare node environment — an accidental value
 *     import of sessionService would fail every case at import time, which is the intended alarm.
 *     Same discipline as `motionFloor.ts` and `motionMootness.ts`.
 *
 * `agenda` arrives ALREADY NORMALIZED (from `getAgenda`, which `flowModel.ts` declares the only
 * legal reader of `session.agenda`). Taking it as a parameter rather than reaching into the session
 * doc is what keeps that invariant true and keeps this module out of `components/`.
 */
import { MOTION_META } from "./motionMeta";
import { caucusListState } from "./caucusList";
import { gslIsOpen, gslSpokenThrough, motionTypeIsMoot, type FloorFacts } from "./motionMootness";
import type {
  LiveSession, Motion, MotionType, SessionAgenda, TimerState,
} from "./sessionService";

// ── Shape ───────────────────────────────────────────────────────────────────────

export interface MotionAdvice {
  /**
   * Ranked, most apt first, ALWAYS a subset of `allowed`. Empty = no opinion (invariant 1).
   * Capped at 3: a "suggested" list of five is a list, and the whole point is to shorten one.
   */
  types: MotionType[];
  /**
   * The fact that produced the ranking. Past tense, cites session state — never a command, never
   * phrased as if the chair said it. Same register as `GateAdvice.because`. Empty when `types` is.
   */
  because: string;
  /** Why THIS motion fits right now. Present for every entry in `types`; may cover others too. */
  hint: Partial<Record<MotionType, string>>;
}

export interface MotionAdviceContext {
  session: Pick<LiveSession,
    "phase" | "finalized" | "gsl" | "caucus" | "activeVote" | "pendingPublish" | "publishedDoc">;
  /** Normalized agenda — see the header. */
  agenda: SessionAgenda;
  /**
   * What this delegate may actually propose right now: `capabilitiesFor().proposableMotionTypes`
   * on a gated session, the full delegate-proposable list on a legacy one. Invariant 2 filters
   * every row through it.
   */
  allowed: MotionType[];
  /** `motionQueue` when the caller already holds it. Optional by design — see invariant 3. */
  motions?: Motion[];
  now?: number;
}

// ── Copy ────────────────────────────────────────────────────────────────────────

/**
 * What each motion IS, in the delegate's terms — not what the chair does with it.
 *
 * The form's existing subtitle ("Goes to a procedural vote" / "Chair acts directly") describes
 * PROCEDURE and is identical across seven of the ten types, so it distinguishes nothing at the
 * moment of choosing. These distinguish. A row may override any of them with something sharper.
 */
const DEFAULT_HINT: Partial<Record<MotionType, string>> = {
  mod_caucus: "Chaired speeches on one question.",
  unmod_caucus: "Informal negotiation — form blocs, draft together.",
  extend_caucus: "More time on the debate already running.",
  open_gsl: "Your motion sets the speaking time.",
  set_agenda: "Move the committee onto a topic.",
  introduce_document: "Put your paper formally before the committee.",
  move_to_voting: "Close debate and vote on what is on the floor.",
};

/** The two motions a room reaches for whenever formal debate pauses. Order is the usual preference. */
const DEBATE_LEAD: MotionType[] = ["mod_caucus", "unmod_caucus"];

const MAX_LEAD = 3;

/**
 * How long before a caucus expires the room should start lining up what follows — see row 1.
 * Exported so the test names the same number the ladder does.
 */
export const CAUCUS_ENDGAME_MS = 90_000;

const quoted = (s: string) => `“${s}”`;

// ── Small pure helpers (mirrors of flowModel's, kept local so neither file exports plumbing) ─────

function timerRemaining(t: TimerState | undefined, now: number): number {
  if (!t) return 0;
  if (t.running && t.endsAt != null) return Math.max(0, t.endsAt - now);
  return Math.max(0, t.pausedRemainingMs ?? 0);
}

/**
 * Has the Speakers List been opened at some point under the CURRENT topic?
 *
 * `gslIsOpen` is the shared definition and stays the primary test, but it needs the motion queue to
 * see an `open_gsl` that executed and then emptied — and invariant 3 says the delegate console has
 * no queue. `spoken > 0` closes exactly that hole from the session doc alone: speeches were called
 * from the list, so it was open. It is reset to 0 by every writer that mounts a new agenda topic
 * (see `GslState.spoken`), which is correct here rather than merely convenient — a fresh topic means
 * a fresh list, so "move to open the Speakers List" genuinely becomes the right advice again.
 */
function gslEverOpened(gsl: LiveSession["gsl"] | undefined, queue: Motion[]): boolean {
  return gslIsOpen(gsl, queue) || (gsl?.spoken ?? 0) > 0;
}

/**
 * A moderated caucus whose speaking order is finished — everybody the chair seated has spoken.
 *
 * Deliberately excludes "collecting": a caucus in its first ten seconds also has an empty queue,
 * and advising the room to replace the caucus it just voted for would be the same failure
 * `flowModel`'s placard branch exists to prevent.
 */
function caucusListFinished(caucus: LiveSession["caucus"], now: number): boolean {
  if (!caucus || caucus.kind !== "moderated") return false;
  if (caucusListState(caucus) === "collecting") return false;
  if (caucus.currentSpeaker) return false;
  if ((caucus.queue || []).length) return false;
  // A caucus with time still on the clock and nobody left to call is the moment; one that has run
  // out is the chair's to end, and the endgame row above already owns it.
  return timerRemaining(caucus.totalTimer, now) > 0;
}

/**
 * The delegate's read of the floor, for the mootness filter.
 *
 * NOT `readFloorFacts`: that reads the queue for `introducedDocIds` and takes a docs array this
 * side does not have. The facts below are the ones the ladder's own rows can act on, derived from
 * the session doc, with the queue used only where it sharpens (invariant 3).
 */
function facts(ctx: MotionAdviceContext, queue: Motion[]): FloorFacts {
  const { session, agenda } = ctx;
  const item = agenda.activeIndex >= 0 ? agenda.items[agenda.activeIndex] : undefined;
  return {
    agendaAdopted: !!item,
    agendaTopic: item?.title || null,
    caucusRunning: !!session.caucus,
    gslOpen: gslEverOpened(session.gsl, queue),
    substantiveVoteLive:
      session.activeVote?.voteType === "substantive"
      || session.pendingPublish?.voteType === "substantive",
    sessionAdjourned: session.phase === "closed",
    sessionSuspended: session.phase === "suspended",
    // Per-document facts need the queue AND the committee docs; neither is on this side, and no row
    // here is document-scoped. Empty is the honest answer, not a stub.
    introducedDocIds: new Set<string>(),
    rejectedDocIds: new Set<string>(),
  };
}

// ── The ladder ──────────────────────────────────────────────────────────────────

interface Row {
  types: MotionType[];
  because: string;
  hint?: Partial<Record<MotionType, string>>;
  /**
   * DELIBERATE SILENCE, not absence of an answer. A caucus with eight minutes left, a delegate
   * mid-speech, a list waiting on signups — in each the right advice is none, and the generic
   * fallback must NOT fire. That distinction is the whole reason this flag exists.
   */
  quiet?: boolean;
}

const SILENT: Row = { types: [], because: "", quiet: true };

/**
 * FIRST MATCH WINS. Read it top-down as the sitting. Mirrors `gateAdvice`'s ladder order — things
 * that already own the floor, then the caucus loop, then the gateway steps, then the speakers loop
 * — so the chair's "open this next" and the delegate's "move this next" can never describe
 * different moments of the same session.
 */
function ladder(ctx: MotionAdviceContext, queue: Motion[], now: number): Row {
  const { session, agenda } = ctx;
  const topic = agenda.activeIndex >= 0 ? agenda.items[agenda.activeIndex]?.title ?? null : null;
  const onTopic = topic ? ` on ${quoted(topic)}` : "";

  // 0 — the committee is not sitting, or something already owns the floor. `allowed` is empty in
  //     all of these anyway (capabilitiesFor says so); the row exists so the fallback cannot fire
  //     on a stale gate that outlived its moment.
  if (session.finalized || session.phase === "closed" || session.phase === "suspended") return SILENT;
  if (session.activeVote || session.pendingPublish) return SILENT;

  const caucus = session.caucus;
  if (caucus) {
    const kind = caucus.kind === "moderated" ? "moderated" : "unmoderated";
    const left = timerRemaining(caucus.totalTimer, now);

    // 1 — the endgame. The window where lining up what follows is the whole job, and the one the
    //     chair's own gate advice opens the debate preset for. 90s rather than gateAdvice's 60:
    //     a delegate's motion still has to be recognized and voted before it can take effect, so
    //     the delegate needs more lead time than the chair does, not the same.
    if (left > 0 && left <= CAUCUS_ENDGAME_MS) {
      return {
        types: ["extend_caucus", ...DEBATE_LEAD],
        because: `This ${kind} caucus ends in ${Math.ceil(left / 1000)}s.`,
        hint: {
          extend_caucus: "Keep this debate going — same topic, more time.",
          mod_caucus: "Line up what follows the caucus.",
          unmod_caucus: "Line up what follows the caucus.",
        },
      };
    }

    // 2 — the caucus speakers list is spoken through with time still on the clock. The delegate
    //     equivalent of the exhausted GSL below, and the second case a chair hits every session.
    if (caucusListFinished(caucus, now)) {
      // The CAUCUS's topic, not the agenda's — a mod caucus narrows the agenda item to one
      // question, and that question is what the room just finished speaking on. Falls back to the
      // agenda topic only for a caucus that carries none.
      const on = caucus.topic ? ` on ${quoted(caucus.topic)}` : onTopic;
      return {
        types: ["extend_caucus", ...DEBATE_LEAD],
        because: `Everybody on the caucus speakers list has spoken${on}.`,
        hint: {
          extend_caucus: "More time, so more delegations can be heard.",
          mod_caucus: "A fresh caucus on a narrower question.",
          unmod_caucus: "Break for informal negotiation instead.",
        },
      };
    }

    // 3 — a caucus with time left and speakers to hear. Replacing it is not the move.
    return SILENT;
  }

  // 4 — no topic adopted. A delegate moving to set the agenda is how the sitting starts.
  if (agenda.activeIndex < 0 && agenda.items.length > 0) {
    return {
      types: ["set_agenda"],
      because: `No topic has been adopted yet — ${agenda.items.length} on the docket.`,
      hint: { set_agenda: "Move the committee onto one of the committee's topics." },
    };
  }

  const gsl = session.gsl;

  // 5 — the Speakers List has to be OPENED by a motion before anyone can sign up for it.
  if (!gslEverOpened(gsl, queue)) {
    return {
      types: ["open_gsl"],
      because: topic
        ? `${quoted(topic)} is adopted and the Speakers List is not open yet.`
        : "The Speakers List is not open yet.",
      hint: { open_gsl: "Your motion carries the speaking time — say how long each delegate gets." },
    };
  }

  // 6 — THE CASE THIS FILE WAS WRITTEN FOR. The room worked through the list; formal debate has
  //     nothing left to call, and a caucus is what follows. `move_to_voting` joins the lead only
  //     once a paper is actually on the floor — offering it over an empty floor is how a committee
  //     ends up voting on nothing.
  if (gslSpokenThrough(gsl)) {
    const n = gsl?.spoken ?? 0;
    const paperOnFloor = !!session.publishedDoc?.docId;
    return {
      types: paperOnFloor ? [...DEBATE_LEAD, "move_to_voting"] : DEBATE_LEAD,
      because: `The Speakers List has been spoken through — ${n} ${n === 1 ? "speech" : "speeches"}${onTopic}.`,
      hint: {
        mod_caucus: "The usual next step once the list runs out.",
        unmod_caucus: "Leave your seat and negotiate before the next paper.",
        ...(paperOnFloor
          ? { move_to_voting: `${quoted(session.publishedDoc!.title || "The paper")} is on the floor.` }
          : {}),
      },
    };
  }

  // 7 — a speaker is up, or a queue is waiting, or the list is open and taking signups. In all
  //     three the next thing is a speech, not a motion.
  return SILENT;
}

// ── The entry point ─────────────────────────────────────────────────────────────

const NO_ADVICE: MotionAdvice = { types: [], because: "", hint: {} };

/**
 * Rank the motions this delegate may propose, and say why.
 *
 * The order of the last three steps is load-bearing:
 *   ladder → prune what the floor already answered → intersect with `allowed` → fall back.
 * Pruning BEFORE the intersection means a moot type cannot survive by being in the gate, and
 * intersecting last is what makes invariant 2 true by construction rather than by review.
 */
export function adviseMotions(ctx: MotionAdviceContext): MotionAdvice {
  const now = ctx.now ?? Date.now();
  const allowed = ctx.allowed || [];
  const queue = ctx.motions || [];
  if (!allowed.length) return NO_ADVICE;

  const row = ladder(ctx, queue, now);
  const f = facts(ctx, queue);
  const keep = (t: MotionType) => allowed.includes(t) && !motionTypeIsMoot(t, f);

  const types = row.types.filter(keep).slice(0, MAX_LEAD);
  if (types.length) {
    return { types, because: row.because, hint: hintsFor(types, row.hint) };
  }

  // The ladder had no opinion it could spend here. Silence is an answer (see `Row.quiet`); anything
  // else means the chair opened a window at a moment this file does not model, and leading with the
  // debate pair is both the commonest right answer and an honest one — the sentence cites the chair
  // opening the floor, not a fact about the floor itself.
  if (row.quiet) return NO_ADVICE;
  const fallback = DEBATE_LEAD.filter(keep).slice(0, MAX_LEAD);
  if (!fallback.length) return NO_ADVICE;
  return {
    types: fallback,
    because: "The chair has opened the floor to motions.",
    hint: hintsFor(fallback),
  };
}

function hintsFor(
  types: MotionType[],
  over: Partial<Record<MotionType, string>> = {},
): Partial<Record<MotionType, string>> {
  const out: Partial<Record<MotionType, string>> = {};
  for (const t of types) {
    const h = over[t] ?? DEFAULT_HINT[t];
    if (h) out[t] = h;
  }
  return out;
}

/**
 * The one-liner for a motion the advice did NOT lead with — the generic "what it is" line, so the
 * rest of the list stops reading as ten identical rows. Falls back to the procedure line, which is
 * still the only useful thing to say about `suspend`, `adjourn` and `custom`.
 */
export function motionBlurb(t: MotionType): string {
  return DEFAULT_HINT[t]
    ?? (MOTION_META[t]?.needsVote ? "Goes to a procedural vote" : "Chair acts directly");
}
