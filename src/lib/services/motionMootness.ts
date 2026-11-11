/**
 * Is a queued motion still worth ruling on? — the "it already happened" model.
 *
 * THE PROBLEM THIS EXISTS FOR. Two delegations move to set the agenda. The chair executes one; the
 * agenda mounts. The other motion asks for something the committee has already done, and nothing in
 * the pipeline ever noticed — it sat on the chair's floor offering [Put to vote] [Adopt] [Dismiss]
 * on a question that is closed. Real procedure has an answer for this: a chair rules a motion out of
 * order based on the state of the committee, and a dilatory motion is treated as never made. This
 * module is that ruling, derived instead of typed.
 *
 * TWO MECHANISMS, DELIBERATELY SEPARATE. They answer different questions and take different inputs.
 *
 *   1. `supersededByExecution` — CAUSAL, queue-only. "Motion X just executed; what does that kill?"
 *      Needs no session state at all, only the type of the motion that ran and the queue beside it.
 *      Runs inside `executeMotion`, in the same batch as the status flip, so the fall is a PROPERTY
 *      of execution rather than a reaction to it. Self-excluding by construction — X is never in its
 *      own result — which is what makes it safe to run on a motion that is itself mid-execution.
 *
 *   2. `mootByState` — DECLARATIVE, session-only. "Given the floor as it stands, is this motion
 *      still answerable?" Needed because the chair creates mootness with direct panel actions that
 *      touch no motion at all: adopting the agenda from the Flow Bar, starting a caucus from the
 *      caucus panel, closing the session from Host controls. Mechanism 1 cannot see any of those.
 *
 * Folding them into one would break both: mechanism 1 would need session state it does not have,
 * and mechanism 2 would lose the self-exclusion that makes the execute-time batch race-free.
 *
 * THE INVARIANT — and it is the most important line in this file:
 *
 *      AUTO-FALL TOUCHES ONLY `pending` AND `recognized`.
 *
 * A `passed` motion embodies a recorded vote of the committee. Silently rewriting a vote result to
 * "out of order" destroys the record, which is a governance failure and not a UX improvement. A
 * `voting` motion is mid-ballot; the ballot decides it, not this file. `executed`/`failed`/`dropped`
 * are terminal. If a passed motion has become impossible — an extension that passed after the caucus
 * already ended — the chair dismisses it by hand with a reason. A human ruling on a human decision.
 * Everything downstream leans on this: it is why the execute-time batch cannot clobber a vote, and
 * why two chair tabs sweeping at once can at worst duplicate a harmless write.
 *
 * PURE. Type-only import from sessionService plus value imports of `motionMeta` (itself firebase-free
 * by design) — so this module never pulls in `@/lib/firebase/client`, whose `getDatabase()` throws
 * without env vars. `motionMootness.test.ts` runs it in a bare node environment; an accidental value
 * import of sessionService would fail every case at import time, which is the intended alarm. Same
 * arrangement as `motionFloor.ts`.
 *
 * NOT MODELLED: age. A motion that has sat for six hours is not moot — nothing overtook it, the chair
 * is simply behind. Auto-dropping on age would destroy a delegate's paper because their chair was
 * busy, and it is not a ruling any chair could defend. That one is fixed with visibility in the
 * panel, not with a write.
 */
import type {
  LiveSession, Motion, MotionStatus, MotionType, SessionAgenda,
} from "./sessionService";
import { MOTION_META } from "./motionMeta";

// ── Shared status sets ──────────────────────────────────────────────────────────

/**
 * The only statuses auto-fall may write over. See THE INVARIANT in the header — this constant is
 * the invariant, exported so the panel, the sweep hook and the tests cannot each invent their own.
 */
export const AUTO_FALLABLE: ReadonlySet<MotionStatus> = new Set<MotionStatus>(["pending", "recognized"]);

/**
 * Everything not yet terminal. Mirrors `gateAdvice.ts`'s local `LIVE_MOTION` — kept here as the
 * shared definition so the chair console's tab badge and the panel's own header count agree.
 */
export const LIVE_MOTION_STATUSES: ReadonlySet<MotionStatus> =
  new Set<MotionStatus>(["pending", "recognized", "voting", "passed"]);

// ── The ruling ──────────────────────────────────────────────────────────────────

export type MootCode =
  // superseded-by-execution
  | "agenda_superseded" | "gsl_superseded" | "caucus_superseded" | "extension_superseded"
  | "voting_superseded" | "suspend_superseded" | "introduce_superseded" | "adjourned_first"
  // contradicted-by-state
  | "agenda_already_set" | "gsl_already_open" | "voting_underway" | "nothing_to_extend"
  | "already_introduced" | "paper_rejected" | "session_adjourned" | "already_suspended";

export interface MootRuling {
  code: MootCode;
  /**
   * The sentence a chair and the proposing delegate both read, stored as `chairNote`. Past tense,
   * cites the fact that produced it — the same register as `GateAdvice.because`. Never a command,
   * and never phrased as if a chair said it, because no chair did.
   */
  reason: string;
}

export type MootVerdict = MootRuling | null;

/** One motion and why it fell. What both mechanisms return, and what the writers consume. */
export interface MootFall {
  motion: Motion;
  ruling: MootRuling;
}

const rule = (code: MootCode, reason: string): MootRuling => ({ code, reason });

/** `"  Maritime Security  "` and `"maritime security"` are the same topic. */
const norm = (s: string | undefined | null): string => (s || "").trim().toLowerCase();

const quoted = (s: string) => `“${s}”`;

// ── Mechanism 1: superseded by execution ────────────────────────────────────────

/**
 * Which live motion types an executed motion of type `T` kills.
 *
 * NOTE THE ASYMMETRY between the caucus families, because it is not a typo and someone will try to
 * "fix" it: a NEW caucus supersedes a pending `extend_caucus` (that extension was proposed against
 * the caucus that just got replaced — it was live BEFORE this caucus existed, so it cannot have
 * meant this one), but an EXTENSION does not supersede a motion for a new caucus (the room may
 * still want a different caucus once the extension lapses).
 *
 * `adjourn` is handled outside this table — it kills everything, `custom` included.
 * `custom` supersedes nothing: its intent is unknowable, so nothing can be derived from it.
 */
const SUPERSEDES: Partial<Record<MotionType, readonly MotionType[]>> = {
  set_agenda:     ["set_agenda"],
  open_gsl:       ["open_gsl"],
  mod_caucus:     ["mod_caucus", "unmod_caucus", "extend_caucus"],
  unmod_caucus:   ["mod_caucus", "unmod_caucus", "extend_caucus"],
  extend_caucus:  ["extend_caucus"],
  move_to_voting: ["move_to_voting"],
  suspend:        ["suspend"],
  // `introduce_document` is documentId-scoped, not type-scoped — see the guard in the fn below.
  introduce_document: ["introduce_document"],
};

function supersessionReason(executed: Motion, victim: Motion): MootRuling {
  const p = executed.params || {};
  switch (executed.type) {
    case "set_agenda":
      return rule("agenda_superseded", p.topic
        ? `Overtaken — the agenda was set to ${quoted(p.topic)}.`
        : "Overtaken — the agenda was set.");
    case "open_gsl":
      return rule("gsl_superseded", "Overtaken — the Speakers List was opened.");
    case "mod_caucus":
    case "unmod_caucus": {
      const kind = executed.type === "mod_caucus" ? "moderated" : "unmoderated";
      const on = p.topic ? ` on ${quoted(p.topic)}` : "";
      // The victim's own type decides how the sentence reads — an extension did not lose a race,
      // it lost the thing it was extending.
      return victim.type === "extend_caucus"
        ? rule("caucus_superseded", `Overtaken — a new ${kind} caucus${on} replaced the one this would have extended.`)
        : rule("caucus_superseded", `Overtaken — a ${kind} caucus${on} was adopted.`);
    }
    case "extend_caucus":
      return rule("extension_superseded", "Overtaken — the caucus was already extended.");
    case "move_to_voting":
      return rule("voting_superseded", "Overtaken — the committee moved into voting procedure.");
    case "suspend":
      return rule("suspend_superseded", "Overtaken — the session was suspended.");
    case "introduce_document":
      return rule("introduce_superseded", "Overtaken — that paper has already been introduced.");
    default:
      return rule("agenda_superseded", "Overtaken by a motion the committee adopted.");
  }
}

/**
 * Mechanism 1. What `executed` kills in `queue`, the moment it executes.
 *
 * NEVER returns `executed` itself, whatever its own status — the caller is mid-execution on it, and
 * the whole execute-time batch is only safe because of that exclusion.
 */
export function supersededByExecution(executed: Motion, queue: Motion[]): MootFall[] {
  const live = (queue || []).filter(
    (m) => m.id && m.id !== executed.id && AUTO_FALLABLE.has(m.status),
  );
  if (!live.length) return [];

  // Adjournment is not a competition — the committee is gone. Everything still on the floor falls,
  // `custom` included, because nothing survives the session ending.
  if (executed.type === "adjourn") {
    return live.map((m) => ({
      motion: m,
      ruling: rule("adjourned_first", "The session adjourned before this was taken up."),
    }));
  }

  const kills = SUPERSEDES[executed.type];
  if (!kills) return [];

  // Papers are superseded per-document, not per-type: introducing draft resolution A says nothing
  // about a motion to introduce working paper B. With no documentId there is nothing to match on,
  // so it supersedes nothing rather than everything.
  if (executed.type === "introduce_document") {
    const docId = executed.params?.documentId;
    if (!docId) return [];
    return live
      .filter((m) => m.type === "introduce_document" && m.params?.documentId === docId)
      .map((m) => ({ motion: m, ruling: supersessionReason(executed, m) }));
  }

  return live
    .filter((m) => kills.includes(m.type))
    .map((m) => ({ motion: m, ruling: supersessionReason(executed, m) }));
}

// ── Mechanism 2: contradicted by state ──────────────────────────────────────────

/**
 * The exact read-set mechanism 2 depends on. Narrowing to a flat fact record (rather than passing
 * `LiveSession` around) keeps the ladder readable, keeps test fixtures to one line, and documents
 * that nothing else about the session can change the answer.
 */
export interface FloorFacts {
  /** A topic is under debate. */
  agendaAdopted: boolean;
  /** Its title, for the same-topic comparison. */
  agendaTopic: string | null;
  caucusRunning: boolean;
  gslOpen: boolean;
  /** A SUBSTANTIVE vote is live or awaiting publication. Procedural votes are about other things. */
  substantiveVoteLive: boolean;
  /** `phase === "closed"`. Deliberately NOT `finalized` — see readFloorFacts. */
  sessionAdjourned: boolean;
  sessionSuspended: boolean;
  /** documentIds already formally introduced. */
  introducedDocIds: ReadonlySet<string>;
  /** documentIds the chair rejected — those genuinely cannot be introduced. */
  rejectedDocIds: ReadonlySet<string>;
}

/**
 * Has the Speakers List been opened?
 *
 * THE definition, shared with `gateAdvice.ts` (which used to carry its own copy). There is no
 * `gsl.open` field — "opened" is the disjunction of the three things that can only be true after it
 * was: a motion executed it, somebody is queued on it, or somebody is speaking from it.
 */
export function gslIsOpen(gsl: LiveSession["gsl"] | undefined | null, queue: Motion[]): boolean {
  if ((queue || []).some((m) => m.type === "open_gsl" && m.status === "executed")) return true;
  return (gsl?.queue || []).length > 0 || !!gsl?.activeSpeaker;
}

/**
 * Has the Speakers List been SPOKEN THROUGH — i.e. is it empty because the room finished it, rather
 * than because nobody has signed up yet?
 *
 * THE definition, shared by `gateAdvice.ts` (which decides what gate to advise next) and
 * `flowModel.ts` (which decides the headline and which suggestion leads). The distinction is the
 * whole difference between "take more signups" and "entertain caucus motions", and it is invisible
 * in the rest of the doc: `nextSpeaker` resets the timer either way and leaves `phase: "gsl"`
 * standing, so `gsl.spoken` is the only fact that separates them. See `GslState.spoken`.
 *
 * Deliberately does NOT consult the motion queue. `gslIsOpen` above answers "was the list ever
 * opened", which a motion can attest to; "was it worked through" is a property of the list itself.
 */
export function gslSpokenThrough(gsl: LiveSession["gsl"] | undefined | null): boolean {
  return (gsl?.spoken ?? 0) > 0 && !(gsl?.queue || []).length && !gsl?.activeSpeaker;
}

/**
 * Read the floor once, so the ladder below stays a pure function of plain booleans.
 *
 * `agenda` arrives ALREADY NORMALIZED (from `getAgenda`, which flowModel.ts declares the only legal
 * reader of `session.agenda`). Taking it as a parameter rather than reaching into the session doc is
 * what keeps that invariant true and keeps this module out of `components/`.
 *
 * `sessionAdjourned` reads `phase === "closed"`, NOT `finalized`: a finalized session is history
 * with its marks already written, and the sweep bails on it entirely rather than rewriting motion
 * docs nobody will read.
 */
export function readFloorFacts(
  session: Pick<LiveSession, "phase" | "caucus" | "activeVote" | "pendingPublish" | "gsl" | "publishedDoc">,
  agenda: SessionAgenda,
  queue: Motion[],
  docs: { id?: string; status: string }[] = [],
): FloorFacts {
  const activeItem = agenda.activeIndex >= 0 ? agenda.items[agenda.activeIndex] : undefined;

  const introduced = new Set<string>();
  for (const m of queue || []) {
    if (m.type === "introduce_document" && m.status === "executed" && m.params?.documentId) {
      introduced.add(m.params.documentId);
    }
  }
  if (session.publishedDoc?.docId) introduced.add(session.publishedDoc.docId);

  const rejected = new Set<string>();
  for (const d of docs) if (d.id && d.status === "rejected") rejected.add(d.id);

  return {
    agendaAdopted: !!activeItem,
    agendaTopic: activeItem?.title || null,
    caucusRunning: !!session.caucus,
    gslOpen: gslIsOpen(session.gsl, queue),
    // NEVER `phase === "voting"`: phase drifts (endCaucus force-sets "gsl"), and an open PROCEDURAL
    // vote is a vote on somebody else's motion — it says nothing about moving into voting procedure.
    substantiveVoteLive:
      session.activeVote?.voteType === "substantive"
      || session.pendingPublish?.voteType === "substantive",
    sessionAdjourned: session.phase === "closed",
    sessionSuspended: session.phase === "suspended",
    introducedDocIds: introduced,
    rejectedDocIds: rejected,
  };
}

/**
 * Mechanism 2. FIRST MATCH WINS — the ordering is load-bearing, read it top-down as the sitting.
 *
 * Returns null for any motion outside `AUTO_FALLABLE`: the invariant is enforced here, at the
 * predicate, so no caller can opt out of it by forgetting a filter.
 */
export function mootByState(m: Motion, f: FloorFacts): MootVerdict {
  if (!AUTO_FALLABLE.has(m.status)) return null;

  // 1. Adjournment outranks everything, `custom` included. The committee is gone; there is no floor
  //    left to be in order on. This is the one branch `custom` can match.
  if (f.sessionAdjourned) {
    return rule("session_adjourned", "The session adjourned before this was taken up.");
  }

  switch (m.type) {
    // 2. Near-unreachable (a suspended console is inert) but free, and the ladder should be total.
    case "suspend":
      return f.sessionSuspended ? rule("already_suspended", "The session is already suspended.") : null;

    // 3. The inverse rule, and the only one that fires on ABSENCE. Today `extendCaucus` silently
    //    returns when there is no caucus while `executeMotion` marks the motion EXECUTED anyway —
    //    so the motion claims to have done something it did not. Falling it is strictly honester.
    case "extend_caucus":
      return f.caucusRunning ? null : rule("nothing_to_extend", "There is no caucus running to extend.");

    // 4. Same-topic only. A `set_agenda` naming a DIFFERENT topic while one is under debate is a
    //    motion to move to the next agenda item, which is entirely legitimate and must survive.
    //    The comparison matches `adoptAgendaTopic`'s own trim/lowercase test, so "already set" here
    //    and "already on the docket" there can never disagree.
    //    A motion carrying no topic at all is asking for the generic act, which is done.
    case "set_agenda": {
      if (!f.agendaAdopted) return null;
      const want = norm(m.params?.topic);
      if (want && want !== norm(f.agendaTopic)) return null;
      return rule("agenda_already_set", f.agendaTopic
        ? `The agenda is already set to ${quoted(f.agendaTopic)}.`
        : "The agenda is already set.");
    }

    case "open_gsl":
      return f.gslOpen ? rule("gsl_already_open", "The Speakers List is already open.") : null;

    case "move_to_voting":
      return f.substantiveVoteLive
        ? rule("voting_underway", "The committee is already in voting procedure.")
        : null;

    // 5. Rejected first: it is the stronger fact, and a paper can be both introduced and later
    //    rejected. "The chair rejected this" is the more useful sentence of the two.
    case "introduce_document": {
      const docId = m.params?.documentId;
      if (!docId) return null;
      if (f.rejectedDocIds.has(docId)) {
        return rule("paper_rejected", "The chair rejected this paper — it cannot be introduced.");
      }
      if (f.introducedDocIds.has(docId)) {
        return rule("already_introduced", "That paper has already been introduced.");
      }
      return null;
    }

    // 6. CAUCUS MOTIONS ARE NEVER STATE-MOOT. Do not "fix" this by falling them while a caucus runs:
    //    gateAdvice.ts opens the `debate` preset — mod, unmod AND extend — in the caucus's last 60
    //    seconds, precisely so the room can line up what follows. A rule that fell them would delete
    //    the exact motions the platform just invited. Their only death is mechanism 1.
    case "mod_caucus":
    case "unmod_caucus":
      return null;

    // 7. Unknowable intent — nothing may be derived from it short of adjournment (branch 1).
    case "custom":
      return null;

    // adjourn: a motion to adjourn is answered by branch 1 once it happens; before that it stands.
    case "adjourn":
      return null;
  }
}

// ── Mechanism 2, asked ahead of time ────────────────────────────────────────────

/**
 * Would a motion of this TYPE already be out of order, before anybody proposes it?
 *
 * WHY THIS EXISTS. The chair's gate chooser decides which motion types delegates may move next, and
 * without this it happily invites the ones the floor has already answered — `set_agenda` with a
 * topic under debate, `open_gsl` with the list open, `extend_caucus` with no caucus. A delegate
 * takes the invitation, and `useMotionMootnessSweep` drops the motion as out of order within a
 * snapshot. Asking the ladder first is the fix, and asking THE SAME ladder is the point: a second
 * hand-written "is this relevant" table would drift from the ruling that actually fires.
 *
 * The synthetic motion carries `status: "pending"` (inside `AUTO_FALLABLE`, so the ladder engages)
 * and empty `params`. That parameter-free reading is exactly right for a gate: the chair is opening
 * the floor to a KIND of motion, not to one delegate's wording. It does mean the answer is the
 * generic one — a `set_agenda` reads moot once any topic is adopted, even though a delegate moving a
 * DIFFERENT topic would survive `mootByState` (see its branch 4). So callers must treat a ruling
 * here as "already answered", never as "forbidden": the chooser greys the chip and keeps it
 * clickable rather than removing it.
 */
export function motionTypeIsMoot(type: MotionType, f: FloorFacts): MootVerdict {
  return mootByState(
    { type, params: {}, status: "pending", byDelegateId: "", byCountry: "", applicationId: "" },
    f,
  );
}

/** The subset of `types` the floor has not already answered. Order preserved. */
export function relevantMotionTypes(types: MotionType[], f: FloorFacts): MotionType[] {
  return (types || []).filter((t) => !motionTypeIsMoot(t, f));
}

/** Every motion in the queue the floor has overtaken. Same invariant, applied in bulk. */
export function sweepMootMotions(queue: Motion[], f: FloorFacts): MootFall[] {
  const out: MootFall[] = [];
  for (const m of queue || []) {
    if (!m.id) continue;
    const ruling = mootByState(m, f);
    if (ruling) out.push({ motion: m, ruling });
  }
  return out;
}

// ── The stranding rescue ────────────────────────────────────────────────────────

/**
 * Motions abandoned at `"voting"` with no vote behind them.
 *
 * Two code paths produce these and both are real: `cancelVote` nulls `activeVote` without
 * reconciling the motion, and `finalizeVote` can throw in its participation loop before it reaches
 * `resolveMotionAfterVote`. The result renders in the chair's panel with NO buttons at all — only
 * "In vote — waiting on the result" — so it is unrecoverable from the UI. This finds them.
 *
 * Deliberately NOT part of auto-fall: `voting` is outside `AUTO_FALLABLE` and stays outside it. A
 * rescue puts the motion BACK on the floor for the chair to decide; it never decides for them.
 *
 * `pendingPublish` is the load-bearing half of the guard: between `closeVoteAtomic` and
 * `resolveMotionAfterVote`, `activeVote` is already null while the result waits to be published.
 * That window is `finalizeVote` mid-flight, not an orphan, and rescuing it would race the very
 * function about to resolve the motion properly. The caller adds a two-snapshot delay on top.
 */
export function orphanedVoteMotions(
  queue: Motion[],
  session: Pick<LiveSession, "activeVote" | "pendingPublish">,
): Motion[] {
  if (session.activeVote || session.pendingPublish) return [];
  return (queue || []).filter((m) => m.id && m.status === "voting");
}

/** What a rescued motion's `chairNote` says. Exported so the hook and the tests agree on the words. */
export const ORPHAN_RESCUE_NOTE =
  "The vote ended without a recorded result — back on the floor.";

// ── Display ─────────────────────────────────────────────────────────────────────

/**
 * What a resolved motion is CALLED.
 *
 * "Out of order" for an auto-fall, not "dismissed": a chair rules a motion out of order based on the
 * state of the committee, and that is exactly what happened here. "Dismissed" implies a judgement
 * some chair made, and printing it would have delegates arguing with their chair about a ruling the
 * chair never issued. `dismissMotion` keeps "dismissed" — the two are genuinely different acts now.
 *
 * The STORED status stays "dropped" for both. A new `MotionStatus` value would strand every motion
 * already written as "dropped" and break the `["executed","failed","dropped"]` resolved filters —
 * see the warning on `dismissMotion`. `autoResolved` is the discriminator instead.
 */
export const OUT_OF_ORDER_WORD = "out of order";

export function isAutoResolved(m: Pick<Motion, "autoResolved">): boolean {
  return m.autoResolved === true;
}

/** Label + short chip text for any motion, resolved or not. Used by both consoles. */
export function motionOutcomeWord(m: Pick<Motion, "status" | "autoResolved">): string {
  if (isAutoResolved(m) && m.status === "dropped") return OUT_OF_ORDER_WORD;
  if (m.status === "dropped") return "dismissed";
  return m.status;
}

/** Type coverage guard — every MotionType must be reachable by the ladder. Read by the tests. */
export const ALL_MOTION_TYPES = Object.keys(MOTION_META) as MotionType[];
