/**
 * Fixture table for the "it already happened" model.
 *
 * Seven of these are TRAPS marking rules that look obvious and are wrong — most importantly that a
 * caucus motion is NOT moot while a caucus runs (gateAdvice invites exactly those in the last 60
 * seconds), and that a PROCEDURAL vote does not moot a motion to move into voting procedure. They
 * are marked TRAP below; do not "simplify" them away.
 *
 * The invariant block is the one that matters most: auto-fall must never write over a motion the
 * committee actually decided. Every other guarantee in the feature leans on it.
 *
 * These also guard the module's purity: node environment, no Firebase config, so a value import of
 * `sessionService` would fail every case at import time.
 */
import { describe, it, expect } from "vitest";
import {
  supersededByExecution, mootByState, sweepMootMotions, readFloorFacts, gslIsOpen,
  gslSpokenThrough, motionTypeIsMoot, relevantMotionTypes,
  orphanedVoteMotions, motionOutcomeWord, AUTO_FALLABLE, ALL_MOTION_TYPES,
  type FloorFacts, type MootCode,
} from "./motionMootness";
import type {
  Motion, MotionType, MotionStatus, MotionParams, SessionAgenda, ActiveVote, CaucusState,
  TimerState, GslState, LiveSession, PublishedVoteResult, PublishedDocRef,
} from "./sessionService";

let seq = 0;
function motion(type: MotionType, over: Partial<Motion> = {}): Motion {
  seq += 1;
  return {
    id: `m${seq}`, type, params: {}, byDelegateId: `u${seq}`, byCountry: "fr",
    applicationId: `a${seq}`, status: "pending", ...over,
  };
}

const p = (params: MotionParams): Partial<Motion> => ({ params });

function facts(over: Partial<FloorFacts> = {}): FloorFacts {
  return {
    agendaAdopted: false, agendaTopic: null, caucusRunning: false, gslOpen: false,
    substantiveVoteLive: false, sessionAdjourned: false, sessionSuspended: false,
    introducedDocIds: new Set<string>(), rejectedDocIds: new Set<string>(),
    ...over,
  };
}

const agenda = (titles: string[], activeIndex: number): SessionAgenda => ({
  items: titles.map((title, i) => ({ id: `a${i}`, title, status: "pending" as const })),
  activeIndex,
});

const timer = (): TimerState =>
  ({ running: false, endsAt: null, pausedRemainingMs: 600_000, durationMs: 600_000 });

const gslState = (over: Partial<GslState> = {}): GslState =>
  ({ defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer(), ...over });

const caucus = (): CaucusState => ({
  caucusId: "c1", kind: "moderated", topic: "Sanctions",
  totalDurationSecs: 600, perSpeakerSecs: 45,
  totalTimer: timer(), speakerTimer: timer(), currentSpeaker: null, queue: [],
});

const vote = (voteType: ActiveVote["voteType"]): ActiveVote => ({
  voteId: "v1", motion: "DR 1.1", voteType, threshold: "two_thirds",
  scMode: false, p5: [], allowAbstain: true, round: 1, divisionOfQuestion: false,
  mode: "roll_call", ballots: {}, eligibleCount: 3, startedBy: "chair",
});

const published = (voteType: PublishedVoteResult["voteType"]): PublishedVoteResult => ({
  voteId: "v1", motion: "DR 1.1", result: "passed",
  affirmative: 2, negative: 1, abstentions: 0, eligibleCount: 3,
  voteType, threshold: "two_thirds", scMode: false, mode: "roll_call",
});

const publishedDoc = (docId: string): PublishedDocRef =>
  ({ docId, title: "Draft Resolution 1.1", docType: "draft-resolution", sponsors: [], signatories: [] });

const codes = (falls: { ruling: { code: MootCode } }[]) => falls.map((f) => f.ruling.code);
const ids = (falls: { motion: Motion }[]) => falls.map((f) => f.motion.id);

// ── Mechanism 1 ─────────────────────────────────────────────────────────────────

describe("supersededByExecution — one motion answers the question for everybody", () => {
  it("a set_agenda that executes drops every other live set_agenda", () => {
    // THE REPORTED BUG, verbatim: France's motion executed, the agenda is set, and the United
    // States' identical motion sat on the chair's floor demanding a vote on a settled question.
    const executed = motion("set_agenda", { ...p({ topic: "Maritime Security" }), status: "executed", byCountry: "fr" });
    const us = motion("set_agenda", { ...p({ topic: "Maritime Security" }), status: "recognized", byCountry: "us" });
    const other = motion("set_agenda", { ...p({ topic: "Something else" }), status: "pending" });

    const falls = supersededByExecution(executed, [executed, us, other]);

    expect(ids(falls).sort()).toEqual([other.id, us.id].sort());
    expect(codes(falls).every((c) => c === "agenda_superseded")).toBe(true);
  });

  it("names the adopted topic in the reason", () => {
    const executed = motion("set_agenda", { ...p({ topic: "Maritime Security" }), status: "executed" });
    const falls = supersededByExecution(executed, [executed, motion("set_agenda")]);
    expect(falls[0].ruling.reason).toContain("Maritime Security");
  });

  it("TRAP: never returns the motion that executed", () => {
    // The execute-time batch runs this ON the motion it is executing. If it could return itself the
    // batch would write status "executed" and "dropped" to the same doc in one commit.
    const executed = motion("set_agenda", { status: "recognized" });   // still AUTO_FALLABLE!
    expect(supersededByExecution(executed, [executed])).toEqual([]);
  });

  const decided: MotionStatus[] = ["passed", "voting", "executed", "failed", "dropped"];
  it.each(decided)("leaves a %s motion alone — the committee already decided it", (status) => {
    const executed = motion("set_agenda", { status: "executed" });
    const victim = motion("set_agenda", { status });
    expect(supersededByExecution(executed, [executed, victim])).toEqual([]);
  });

  it("a mod_caucus that executes drops competing mod, unmod AND extend motions", () => {
    const executed = motion("mod_caucus", { ...p({ topic: "Piracy" }), status: "executed" });
    const rivals = [motion("mod_caucus"), motion("unmod_caucus"), motion("extend_caucus")];
    const bystander = motion("open_gsl");

    const falls = supersededByExecution(executed, [executed, ...rivals, bystander]);

    expect(ids(falls).sort()).toEqual(rivals.map((m) => m.id).sort());
    expect(codes(falls).every((c) => c === "caucus_superseded")).toBe(true);
  });

  it("tells a superseded extension why, in its own words", () => {
    const executed = motion("unmod_caucus", { status: "executed" });
    const falls = supersededByExecution(executed, [executed, motion("extend_caucus")]);
    expect(falls[0].ruling.reason).toContain("would have extended");
  });

  it("TRAP: an extend_caucus that executes does NOT drop a motion for a new caucus", () => {
    // Asymmetric on purpose. The room may still want a different caucus once the extension lapses.
    const executed = motion("extend_caucus", { status: "executed" });
    const newCaucus = motion("mod_caucus");
    const rivalExtension = motion("extend_caucus");

    const falls = supersededByExecution(executed, [executed, newCaucus, rivalExtension]);

    expect(ids(falls)).toEqual([rivalExtension.id]);
  });

  it("introduce_document drops only motions naming the same documentId", () => {
    const executed = motion("introduce_document", { ...p({ documentId: "doc_a" }), status: "executed" });
    const same = motion("introduce_document", p({ documentId: "doc_a" }));
    const different = motion("introduce_document", p({ documentId: "doc_b" }));

    const falls = supersededByExecution(executed, [executed, same, different]);

    expect(ids(falls)).toEqual([same.id]);
  });

  it("an introduce_document carrying no documentId supersedes nothing", () => {
    const executed = motion("introduce_document", { status: "executed" });
    expect(supersededByExecution(executed, [executed, motion("introduce_document")])).toEqual([]);
  });

  it("adjourn drops every live motion, custom included", () => {
    const executed = motion("adjourn", { status: "executed" });
    const rest = [motion("custom"), motion("mod_caucus"), motion("introduce_document"), motion("open_gsl")];

    const falls = supersededByExecution(executed, [executed, ...rest]);

    expect(ids(falls).sort()).toEqual(rest.map((m) => m.id).sort());
    expect(codes(falls).every((c) => c === "adjourned_first")).toBe(true);
  });

  it("suspend drops only other suspend motions", () => {
    const executed = motion("suspend", { status: "executed" });
    const falls = supersededByExecution(executed, [executed, motion("suspend"), motion("mod_caucus")]);
    expect(codes(falls)).toEqual(["suspend_superseded"]);
  });

  it("custom supersedes nothing — its intent is unknowable", () => {
    const executed = motion("custom", { status: "executed" });
    expect(supersededByExecution(executed, [executed, motion("custom"), motion("open_gsl")])).toEqual([]);
  });

  it("returns [] on an empty queue", () => {
    expect(supersededByExecution(motion("set_agenda", { status: "executed" }), [])).toEqual([]);
  });
});

// ── Mechanism 2 ─────────────────────────────────────────────────────────────────

describe("mootByState — the ladder", () => {
  it("an adjourned session moots every type, custom included", () => {
    const f = facts({ sessionAdjourned: true });
    for (const type of ALL_MOTION_TYPES) {
      expect(mootByState(motion(type), f)?.code).toBe("session_adjourned");
    }
  });

  it("TRAP: a suspended session moots ONLY the suspend motion", () => {
    // The committee is on a break, not gone. Everything else is waiting for them to come back.
    const f = facts({ sessionSuspended: true });
    expect(mootByState(motion("suspend"), f)?.code).toBe("already_suspended");
    expect(mootByState(motion("mod_caucus"), f)).toBeNull();
    expect(mootByState(motion("set_agenda"), f)).toBeNull();
    expect(mootByState(motion("open_gsl"), f)).toBeNull();
  });

  it("extend_caucus with no caucus running → nothing_to_extend", () => {
    expect(mootByState(motion("extend_caucus"), facts())?.code).toBe("nothing_to_extend");
  });

  it("extend_caucus during a caucus is fine", () => {
    expect(mootByState(motion("extend_caucus"), facts({ caucusRunning: true }))).toBeNull();
  });

  it("set_agenda naming the adopted topic → agenda_already_set", () => {
    const f = facts({ agendaAdopted: true, agendaTopic: "Maritime Security" });
    expect(mootByState(motion("set_agenda", p({ topic: "Maritime Security" })), f)?.code)
      .toBe("agenda_already_set");
  });

  it("the topic match ignores case and surrounding whitespace", () => {
    const f = facts({ agendaAdopted: true, agendaTopic: "Maritime Security" });
    expect(mootByState(motion("set_agenda", p({ topic: "  maritime security " })), f)).not.toBeNull();
  });

  it("TRAP: set_agenda naming a DIFFERENT topic while one is adopted stays live", () => {
    // That is a motion to move to the NEXT agenda item, which is entirely legitimate.
    const f = facts({ agendaAdopted: true, agendaTopic: "Maritime Security" });
    expect(mootByState(motion("set_agenda", p({ topic: "Climate Finance" })), f)).toBeNull();
  });

  it("set_agenda with no topic at all is moot once anything is adopted", () => {
    const f = facts({ agendaAdopted: true, agendaTopic: "Maritime Security" });
    expect(mootByState(motion("set_agenda"), f)?.code).toBe("agenda_already_set");
  });

  it("set_agenda before anything is adopted stays live", () => {
    expect(mootByState(motion("set_agenda", p({ topic: "Anything" })), facts())).toBeNull();
  });

  it("open_gsl once the list is open → gsl_already_open", () => {
    expect(mootByState(motion("open_gsl"), facts({ gslOpen: true }))?.code).toBe("gsl_already_open");
  });

  it("open_gsl on a fresh session stays live", () => {
    expect(mootByState(motion("open_gsl"), facts())).toBeNull();
  });

  it("move_to_voting while a substantive vote is live → voting_underway", () => {
    expect(mootByState(motion("move_to_voting"), facts({ substantiveVoteLive: true }))?.code)
      .toBe("voting_underway");
  });

  it("TRAP: move_to_voting while only a PROCEDURAL vote is open stays live", () => {
    // A procedural vote is a vote on somebody else's motion. It says nothing about moving into
    // voting procedure on the draft resolution. `substantiveVoteLive` is false in that case.
    expect(mootByState(motion("move_to_voting"), facts())).toBeNull();
  });

  it("TRAP: mod and unmod caucus motions are NEVER state-moot", () => {
    // gateAdvice opens the `debate` preset — mod, unmod AND extend — in the caucus's last 60
    // seconds, precisely so the room can line up what follows. Falling them here would delete the
    // exact motions the platform just invited. DO NOT ADD A RULE HERE.
    const f = facts({ caucusRunning: true, gslOpen: true, agendaAdopted: true, agendaTopic: "X" });
    expect(mootByState(motion("mod_caucus"), f)).toBeNull();
    expect(mootByState(motion("unmod_caucus"), f)).toBeNull();
  });

  it("introduce_document whose paper is already introduced → already_introduced", () => {
    const f = facts({ introducedDocIds: new Set(["doc_a"]) });
    expect(mootByState(motion("introduce_document", p({ documentId: "doc_a" })), f)?.code)
      .toBe("already_introduced");
  });

  it("introduce_document whose paper the chair rejected → paper_rejected", () => {
    const f = facts({ rejectedDocIds: new Set(["doc_a"]) });
    expect(mootByState(motion("introduce_document", p({ documentId: "doc_a" })), f)?.code)
      .toBe("paper_rejected");
  });

  it("rejection outranks introduction when a paper is both", () => {
    const f = facts({ introducedDocIds: new Set(["doc_a"]), rejectedDocIds: new Set(["doc_a"]) });
    expect(mootByState(motion("introduce_document", p({ documentId: "doc_a" })), f)?.code)
      .toBe("paper_rejected");
  });

  it("TRAP: a merely 'approved' paper does not moot its introduce motion", () => {
    // `approved` is a normal review outcome — a chair pre-approving the day's papers in bulk would
    // otherwise silently eat every introduce motion in the committee. Only `rejected` is fatal, and
    // only actual introduction counts as introduced. Guarded at readFloorFacts, asserted below too.
    const f = readFloorFacts(
      { phase: "gsl", caucus: null, activeVote: null, pendingPublish: null, gsl: gslState(), publishedDoc: null },
      agenda([], -1), [], [{ id: "doc_a", status: "approved" }],
    );
    expect(mootByState(motion("introduce_document", p({ documentId: "doc_a" })), f)).toBeNull();
  });

  it("an introduce_document six hours old with nothing else changed is NOT moot", () => {
    // Age is not mootness. Nothing overtook it; the chair is behind. Fixed with visibility, not a write.
    const old = motion("introduce_document", {
      ...p({ documentId: "doc_z" }),
      createdAt: { seconds: 1_700_000_000 - 6 * 3600, nanoseconds: 0 },
    });
    expect(mootByState(old, facts())).toBeNull();
  });

  it("a motion to adjourn stands until it actually happens", () => {
    expect(mootByState(motion("adjourn"), facts({ caucusRunning: true, gslOpen: true }))).toBeNull();
  });
});

describe("mootByState — THE INVARIANT", () => {
  const decided: MotionStatus[] = ["passed", "voting", "executed", "failed", "dropped"];
  const contradicting = facts({ sessionAdjourned: true });

  it.each(decided)("never touches a %s motion, even when the state flatly contradicts it", (status) => {
    expect(mootByState(motion("set_agenda", { status }), contradicting)).toBeNull();
    expect(sweepMootMotions([motion("set_agenda", { status })], contradicting)).toEqual([]);
  });

  it("a passed extend_caucus with the caucus gone stays for the chair to dismiss by hand", () => {
    const m = motion("extend_caucus", { status: "passed" });
    expect(mootByState(m, facts({ caucusRunning: false }))).toBeNull();
  });

  it.each([...AUTO_FALLABLE])("does act on a %s motion", (status) => {
    expect(mootByState(motion("set_agenda", { status }), contradicting)).not.toBeNull();
  });
});

describe("sweepMootMotions", () => {
  it("returns every fallen motion and skips the rest", () => {
    const f = facts({ agendaAdopted: true, agendaTopic: "T", gslOpen: true });
    const fallen = [motion("set_agenda", p({ topic: "T" })), motion("open_gsl")];
    const standing = [motion("mod_caucus"), motion("custom")];

    expect(ids(sweepMootMotions([...fallen, ...standing], f)).sort())
      .toEqual(fallen.map((m) => m.id).sort());
  });

  it("skips motions with no id — they cannot be written back", () => {
    const f = facts({ sessionAdjourned: true });
    expect(sweepMootMotions([{ ...motion("open_gsl"), id: undefined }], f)).toEqual([]);
  });
});

// ── Facts ───────────────────────────────────────────────────────────────────────

describe("readFloorFacts", () => {
  const bare = {
    phase: "gsl" as const, caucus: null, activeVote: null, pendingPublish: null,
    gsl: gslState(), publishedDoc: null,
  };

  it("reads the adopted topic out of the normalized agenda it is handed", () => {
    const f = readFloorFacts(bare, agenda(["First", "Second"], 1), []);
    expect(f.agendaAdopted).toBe(true);
    expect(f.agendaTopic).toBe("Second");
  });

  it("a pre-agenda session (activeIndex -1) reads as nothing adopted", () => {
    const f = readFloorFacts(bare, agenda(["First"], -1), []);
    expect(f.agendaAdopted).toBe(false);
    expect(f.agendaTopic).toBeNull();
  });

  it("a substantive vote awaiting publication still counts as voting underway", () => {
    const pending = { ...bare, pendingPublish: published("substantive") };
    expect(readFloorFacts(pending, agenda([], -1), []).substantiveVoteLive).toBe(true);
  });

  it("TRAP: an open procedural vote does NOT count as voting underway", () => {
    const proc = { ...bare, activeVote: vote("procedural") };
    expect(readFloorFacts(proc, agenda([], -1), []).substantiveVoteLive).toBe(false);
  });

  it("adjourned reads phase 'closed', suspended reads phase 'suspended'", () => {
    expect(readFloorFacts({ ...bare, phase: "closed" }, agenda([], -1), []).sessionAdjourned).toBe(true);
    expect(readFloorFacts({ ...bare, phase: "suspended" }, agenda([], -1), []).sessionSuspended).toBe(true);
  });

  it("introducedDocIds unions executed motions with the published doc", () => {
    const q = [motion("introduce_document", { ...p({ documentId: "doc_a" }), status: "executed" })];
    const withPub = { ...bare, publishedDoc: publishedDoc("doc_b") };
    const f = readFloorFacts(withPub, agenda([], -1), q);
    expect([...f.introducedDocIds].sort()).toEqual(["doc_a", "doc_b"]);
  });

  it("a still-pending introduce motion does NOT mark its paper introduced", () => {
    const q = [motion("introduce_document", p({ documentId: "doc_a" }))];
    expect(readFloorFacts(bare, agenda([], -1), q).introducedDocIds.size).toBe(0);
  });

  it("caucusRunning follows the session's caucus object", () => {
    expect(readFloorFacts({ ...bare, caucus: caucus() }, agenda([], -1), []).caucusRunning).toBe(true);
  });
});

describe("gslIsOpen — the definition gateAdvice shares", () => {
  const empty = gslState();

  it("an executed open_gsl motion opens it", () => {
    expect(gslIsOpen(empty, [motion("open_gsl", { status: "executed" })])).toBe(true);
  });

  it("a non-empty queue opens it", () => {
    const g = gslState({ queue: [{ delegateId: "u1", country: "fr", applicationId: "a1" }] });
    expect(gslIsOpen(g, [])).toBe(true);
  });

  it("an active speaker opens it", () => {
    const g = gslState({ activeSpeaker: { delegateId: "u1", country: "fr", applicationId: "a1" } });
    expect(gslIsOpen(g, [])).toBe(true);
  });

  it("a merely pending open_gsl motion does not", () => {
    expect(gslIsOpen(empty, [motion("open_gsl")])).toBe(false);
  });

  it("handles an absent gsl object", () => {
    expect(gslIsOpen(undefined, [])).toBe(false);
  });
});

describe("gslSpokenThrough — 'finished' vs 'nobody joined'", () => {
  const slot = { delegateId: "u1", country: "fr", applicationId: "a1" };

  it("a drained list with speeches behind it is spoken through", () => {
    expect(gslSpokenThrough(gslState({ spoken: 3 }))).toBe(true);
  });

  it("one speech is enough", () => {
    expect(gslSpokenThrough(gslState({ spoken: 1 }))).toBe(true);
  });

  it("an empty list nobody has joined is NOT — this is the whole distinction", () => {
    expect(gslSpokenThrough(gslState({ spoken: 0 }))).toBe(false);
  });

  it("absent `spoken` reads as zero, so pre-existing sessions keep asking for signups", () => {
    expect(gslSpokenThrough(gslState())).toBe(false);
  });

  it("a re-seeded queue is not spoken through, however many spoke before", () => {
    expect(gslSpokenThrough(gslState({ spoken: 4, queue: [slot] }))).toBe(false);
  });

  it("nor is a list with somebody still on the floor", () => {
    expect(gslSpokenThrough(gslState({ spoken: 4, activeSpeaker: slot }))).toBe(false);
  });

  it("handles an absent gsl object", () => {
    expect(gslSpokenThrough(undefined)).toBe(false);
    expect(gslSpokenThrough(null)).toBe(false);
  });
});

// ── Mechanism 2, asked ahead of time ────────────────────────────────────────────

describe("motionTypeIsMoot — the gate chooser's question", () => {
  it("agrees with the ladder on a clear floor: nothing is moot", () => {
    for (const t of ALL_MOTION_TYPES) {
      // extend_caucus is the one that falls on ABSENCE, so a clear floor already rules it out.
      const expected = t === "extend_caucus";
      expect(!!motionTypeIsMoot(t, facts()), t).toBe(expected);
    }
  });

  it("set_agenda falls once ANY topic is adopted — the parameter-free reading", () => {
    // `mootByState` spares a set_agenda naming a DIFFERENT topic; a gate opens the floor to the
    // type, carries no topic, and so gets the generic answer. Callers must treat this as
    // "already answered", never "forbidden" — which is why the chooser greys the chip, not hides it.
    const f = facts({ agendaAdopted: true, agendaTopic: "Topic One" });
    expect(motionTypeIsMoot("set_agenda", f)?.code).toBe("agenda_already_set");
    expect(mootByState(motion("set_agenda", p({ topic: "Topic Two" })), f)).toBeNull();
  });

  it("open_gsl falls once the list is open", () => {
    expect(motionTypeIsMoot("open_gsl", facts({ gslOpen: true }))?.code).toBe("gsl_already_open");
  });

  it("extend_caucus falls with no caucus and survives with one", () => {
    expect(motionTypeIsMoot("extend_caucus", facts())?.code).toBe("nothing_to_extend");
    expect(motionTypeIsMoot("extend_caucus", facts({ caucusRunning: true }))).toBeNull();
  });

  it("move_to_voting falls only while a SUBSTANTIVE vote is live", () => {
    expect(motionTypeIsMoot("move_to_voting", facts({ substantiveVoteLive: true }))?.code)
      .toBe("voting_underway");
    expect(motionTypeIsMoot("move_to_voting", facts())).toBeNull();
  });

  it("introduce_document survives — a gate cannot know WHICH paper", () => {
    const f = facts({ introducedDocIds: new Set(["d1"]), rejectedDocIds: new Set(["d2"]) });
    expect(motionTypeIsMoot("introduce_document", f)).toBeNull();
  });

  it("caucus motions are never state-moot", () => {
    const f = facts({ caucusRunning: true, agendaAdopted: true, gslOpen: true });
    expect(motionTypeIsMoot("mod_caucus", f)).toBeNull();
    expect(motionTypeIsMoot("unmod_caucus", f)).toBeNull();
  });

  it("adjournment moots everything, custom included", () => {
    const f = facts({ sessionAdjourned: true });
    for (const t of ALL_MOTION_TYPES) {
      expect(motionTypeIsMoot(t, f)?.code, t).toBe("session_adjourned");
    }
  });
});

describe("relevantMotionTypes", () => {
  it("keeps order and drops only what the floor answered", () => {
    const f = facts({ agendaAdopted: true, agendaTopic: "Topic One", gslOpen: true });
    expect(relevantMotionTypes(
      ["set_agenda", "mod_caucus", "open_gsl", "unmod_caucus", "extend_caucus", "move_to_voting"], f,
    )).toEqual(["mod_caucus", "unmod_caucus", "move_to_voting"]);
  });

  it("is a no-op on a clear floor apart from extend_caucus", () => {
    expect(relevantMotionTypes(["mod_caucus", "set_agenda", "open_gsl"], facts()))
      .toEqual(["mod_caucus", "set_agenda", "open_gsl"]);
  });

  it("tolerates an empty list", () => {
    expect(relevantMotionTypes([], facts())).toEqual([]);
  });
});

// ── Stranding rescue ────────────────────────────────────────────────────────────

describe("orphanedVoteMotions", () => {
  const clear: Pick<LiveSession, "activeVote" | "pendingPublish"> = { activeVote: null, pendingPublish: null };

  it("a motion at voting with no vote behind it is rescued", () => {
    const m = motion("mod_caucus", { status: "voting" });
    expect(orphanedVoteMotions([m], clear).map((x) => x.id)).toEqual([m.id]);
  });

  it("TRAP: not rescued while its vote is still open", () => {
    const m = motion("mod_caucus", { status: "voting" });
    expect(orphanedVoteMotions([m], { activeVote: vote("procedural"), pendingPublish: null })).toEqual([]);
  });

  it("TRAP: not rescued while a closed result awaits publishing", () => {
    // That window is finalizeVote mid-flight between closeVoteAtomic and resolveMotionAfterVote.
    // Rescuing there would race the very function about to resolve the motion properly.
    const m = motion("mod_caucus", { status: "voting" });
    expect(orphanedVoteMotions([m], { activeVote: null, pendingPublish: published("procedural") })).toEqual([]);
  });

  it("leaves motions that are not at voting alone", () => {
    const rest: MotionStatus[] = ["pending", "recognized", "passed", "failed", "executed", "dropped"];
    expect(orphanedVoteMotions(rest.map((s) => motion("mod_caucus", { status: s })), clear)).toEqual([]);
  });
});

// ── Coverage + copy ─────────────────────────────────────────────────────────────

describe("coverage and copy", () => {
  it("mootByState returns a verdict for every MotionType without throwing", () => {
    // Catches a new MotionType added to the union with no branch in the ladder.
    const f = facts({ agendaAdopted: true, agendaTopic: "T", gslOpen: true, substantiveVoteLive: true });
    for (const type of ALL_MOTION_TYPES) {
      expect(() => mootByState(motion(type), f)).not.toThrow();
    }
  });

  it("every ruling carries a sentence that fits the chairNote line", () => {
    const cases: MootVerdictCase[] = [
      [motion("set_agenda"), facts({ sessionAdjourned: true })],
      [motion("suspend"), facts({ sessionSuspended: true })],
      [motion("extend_caucus"), facts()],
      [motion("set_agenda", p({ topic: "T" })), facts({ agendaAdopted: true, agendaTopic: "T" })],
      [motion("open_gsl"), facts({ gslOpen: true })],
      [motion("move_to_voting"), facts({ substantiveVoteLive: true })],
      [motion("introduce_document", p({ documentId: "d" })), facts({ introducedDocIds: new Set(["d"]) })],
      [motion("introduce_document", p({ documentId: "d" })), facts({ rejectedDocIds: new Set(["d"]) })],
    ];
    for (const [m, f] of cases) {
      const r = mootByState(m, f);
      expect(r).not.toBeNull();
      expect(r!.reason.length).toBeGreaterThan(0);
      expect(r!.reason.length).toBeLessThanOrEqual(120);
      // Never phrased as if a chair said it — nothing here was a human ruling.
      expect(r!.reason.toLowerCase()).not.toContain("i rule");
    }
  });

  it("every state MootCode is produced by at least one fixture", () => {
    const produced = new Set<MootCode>();
    const cases: [Motion, FloorFacts][] = [
      [motion("custom"), facts({ sessionAdjourned: true })],
      [motion("suspend"), facts({ sessionSuspended: true })],
      [motion("extend_caucus"), facts()],
      [motion("set_agenda"), facts({ agendaAdopted: true, agendaTopic: "T" })],
      [motion("open_gsl"), facts({ gslOpen: true })],
      [motion("move_to_voting"), facts({ substantiveVoteLive: true })],
      [motion("introduce_document", p({ documentId: "d" })), facts({ introducedDocIds: new Set(["d"]) })],
      [motion("introduce_document", p({ documentId: "d" })), facts({ rejectedDocIds: new Set(["d"]) })],
    ];
    for (const [m, f] of cases) {
      const r = mootByState(m, f);
      if (r) produced.add(r.code);
    }
    expect([...produced].sort()).toEqual([
      "agenda_already_set", "already_introduced", "already_suspended", "gsl_already_open",
      "nothing_to_extend", "paper_rejected", "session_adjourned", "voting_underway",
    ]);
  });

  it("every supersession MootCode is produced by at least one fixture", () => {
    const produced = new Set<MootCode>();
    const pairs: [MotionType, MotionType][] = [
      ["set_agenda", "set_agenda"], ["open_gsl", "open_gsl"],
      ["mod_caucus", "unmod_caucus"], ["extend_caucus", "extend_caucus"],
      ["move_to_voting", "move_to_voting"], ["suspend", "suspend"], ["adjourn", "custom"],
    ];
    for (const [ran, victimType] of pairs) {
      const executed = motion(ran, { status: "executed" });
      for (const f of supersededByExecution(executed, [executed, motion(victimType)])) {
        produced.add(f.ruling.code);
      }
    }
    const docExec = motion("introduce_document", { ...p({ documentId: "d" }), status: "executed" });
    for (const f of supersededByExecution(docExec, [docExec, motion("introduce_document", p({ documentId: "d" }))])) {
      produced.add(f.ruling.code);
    }
    expect([...produced].sort()).toEqual([
      "adjourned_first", "agenda_superseded", "caucus_superseded", "extension_superseded",
      "gsl_superseded", "introduce_superseded", "suspend_superseded", "voting_superseded",
    ]);
  });
});

describe("motionOutcomeWord", () => {
  it("an auto-fallen motion reads 'out of order', not 'dismissed'", () => {
    expect(motionOutcomeWord({ status: "dropped", autoResolved: true })).toBe("out of order");
  });

  it("a chair's own dismissal still reads 'dismissed'", () => {
    expect(motionOutcomeWord({ status: "dropped" })).toBe("dismissed");
    expect(motionOutcomeWord({ status: "dropped", autoResolved: false })).toBe("dismissed");
  });

  it("passes every other status through unchanged", () => {
    expect(motionOutcomeWord({ status: "executed" })).toBe("executed");
    expect(motionOutcomeWord({ status: "failed" })).toBe("failed");
  });
});

type MootVerdictCase = [Motion, FloorFacts];
