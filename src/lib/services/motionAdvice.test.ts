/**
 * Fixture table for `adviseMotions` — the delegate-side "which motion fits now" ladder.
 *
 * The three cases the feature exists for are marked THE ASK: the floor opening after the Speakers
 * List is spoken through, after a moderated caucus's own list is spoken through, and in a caucus's
 * final seconds. Do not "simplify" the invariant tests at the bottom away — invariant 2 (never
 * advise outside `allowed`) is the one that keeps advice from contradicting the gate.
 *
 * Also guards the module's purity: node environment, no Firebase config, so a value import of
 * `sessionService` would fail every case at import time.
 */
import { describe, it, expect } from "vitest";
import { adviseMotions, motionBlurb, type MotionAdviceContext } from "./motionAdvice";
import { ALL_DELEGATE_MOTION_TYPES } from "./floorGate";
import type {
  TimerState, CaucusState, GslState, SpeakerSlot, SessionAgenda, MotionType,
} from "./sessionService";

const NOW = 1_700_000_000_000;

const timer = (over: Partial<TimerState> = {}): TimerState => ({
  running: false, endsAt: null, pausedRemainingMs: 0, durationMs: 600_000, ...over,
});
const slot = (country: string): SpeakerSlot =>
  ({ delegateId: `u_${country}`, country, applicationId: `app_${country}` });

const gslState = (over: Partial<GslState> = {}): GslState => ({
  defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer(), ...over,
});

/** A running caucus with `leftMs` on the total clock. */
const caucus = (kind: "moderated" | "unmoderated", leftMs: number, over: Partial<CaucusState> = {}): CaucusState => ({
  caucusId: "c1", kind, topic: kind === "moderated" ? "Sanctions" : "",
  totalDurationSecs: 600, perSpeakerSecs: kind === "moderated" ? 45 : 0,
  totalTimer: timer({ running: true, endsAt: NOW + leftMs }),
  speakerTimer: timer(),
  currentSpeaker: null, queue: [],
  ...over,
});

const agendaAdopted: SessionAgenda = {
  items: [{ id: "a0", title: "Maritime Security", status: "active" }],
  activeIndex: 0, source: "committee",
};
const agendaPending: SessionAgenda = {
  items: [
    { id: "a0", title: "Maritime Security", status: "pending" },
    { id: "a1", title: "Arctic Shipping", status: "pending" },
  ],
  activeIndex: -1, source: "committee",
};

/** Topic adopted, list opened and spoken through, no caucus, floor clear. */
function ctx(over: Partial<MotionAdviceContext> = {}): MotionAdviceContext {
  return {
    session: {
      phase: "gsl", finalized: false,
      gsl: gslState({ spoken: 6 }),
      caucus: null, activeVote: null, pendingPublish: null, publishedDoc: null,
    },
    agenda: agendaAdopted,
    allowed: ALL_DELEGATE_MOTION_TYPES,
    now: NOW,
    ...over,
  };
}

const run = (over: Partial<MotionAdviceContext> = {}) => adviseMotions(ctx(over));
const withSession = (
  over: Partial<MotionAdviceContext["session"]>, rest: Partial<MotionAdviceContext> = {},
) => run({ session: { ...ctx().session, ...over }, ...rest });

describe("THE ASK — the Speakers List has been spoken through", () => {
  it("leads with the two caucus motions", () => {
    const a = run();
    expect(a.types).toEqual(["mod_caucus", "unmod_caucus"]);
  });

  it("cites the speech count and the topic, in the past tense", () => {
    expect(run().because).toBe(
      "The Speakers List has been spoken through — 6 speeches on “Maritime Security”."
    );
  });

  it("singularizes one speech", () => {
    expect(withSession({ gsl: gslState({ spoken: 1 }) }).because).toContain("1 speech on");
  });

  it("carries a distinct reason per motion", () => {
    const a = run();
    expect(a.hint.mod_caucus).toBeTruthy();
    expect(a.hint.unmod_caucus).toBeTruthy();
    expect(a.hint.mod_caucus).not.toBe(a.hint.unmod_caucus);
  });

  it("adds move_to_voting ONLY once a paper is on the floor", () => {
    expect(run().types).not.toContain("move_to_voting");
    const withPaper = withSession({
      publishedDoc: { docId: "d1", title: "Draft Resolution 1.1", docType: "draft_resolution", sponsors: [], signatories: [] },
    });
    expect(withPaper.types).toEqual(["mod_caucus", "unmod_caucus", "move_to_voting"]);
    expect(withPaper.hint.move_to_voting).toContain("Draft Resolution 1.1");
  });

  it("stays silent while the list still has speakers — a speech is next, not a motion", () => {
    expect(withSession({ gsl: gslState({ spoken: 2, queue: [slot("fr")] }) }).types).toEqual([]);
  });

  it("stays silent on an open list nobody has joined yet — that is a signup moment", () => {
    // spoken 0 with a live activeSpeaker is what makes the list "open" without being spoken through.
    expect(withSession({ gsl: gslState({ spoken: 0, activeSpeaker: slot("br") }) }).types).toEqual([]);
  });
});

describe("THE ASK — a moderated caucus whose speakers list is finished", () => {
  const finished = caucus("moderated", 240_000, { listState: "seated", queue: [] });

  it("leads with extend, then the caucus pair", () => {
    expect(withSession({ caucus: finished }).types)
      .toEqual(["extend_caucus", "mod_caucus", "unmod_caucus"]);
  });

  it("cites the caucus topic", () => {
    expect(withSession({ caucus: finished }).because)
      .toBe("Everybody on the caucus speakers list has spoken on “Sanctions”.");
  });

  it("TRAP — a caucus still COLLECTING placards also has an empty queue, and must stay silent", () => {
    const collecting = caucus("moderated", 240_000, { listState: "collecting", queue: [] });
    expect(withSession({ caucus: collecting }).types).toEqual([]);
  });

  it("stays silent while a caucus speaker holds the floor", () => {
    const speaking = caucus("moderated", 240_000, { listState: "seated", currentSpeaker: slot("ke") });
    expect(withSession({ caucus: speaking }).types).toEqual([]);
  });

  it("stays silent with speakers still queued", () => {
    const queued = caucus("moderated", 240_000, { listState: "seated", queue: [slot("fr")] });
    expect(withSession({ caucus: queued }).types).toEqual([]);
  });
});

describe("THE ASK — the caucus endgame", () => {
  it("leads with extend inside the 90s window", () => {
    const a = withSession({ caucus: caucus("moderated", 45_000) });
    expect(a.types).toEqual(["extend_caucus", "mod_caucus", "unmod_caucus"]);
    expect(a.because).toBe("This moderated caucus ends in 45s.");
  });

  it("fires for an unmoderated caucus too, and names it correctly", () => {
    expect(withSession({ caucus: caucus("unmoderated", 30_000) }).because)
      .toBe("This unmoderated caucus ends in 30s.");
  });

  it("is silent with plenty of clock left — replacing a live caucus is not the move", () => {
    expect(withSession({ caucus: caucus("unmoderated", 480_000) }).types).toEqual([]);
  });

  it("outranks the finished-list row when both are true", () => {
    const both = caucus("moderated", 20_000, { listState: "seated", queue: [] });
    expect(withSession({ caucus: both }).because).toContain("ends in 20s");
  });
});

describe("the gateway steps", () => {
  it("no topic adopted → set the agenda", () => {
    const a = run({ agenda: agendaPending });
    expect(a.types).toEqual(["set_agenda"]);
    expect(a.because).toBe("No topic has been adopted yet — 2 on the docket.");
  });

  it("topic adopted, list never opened → open the Speakers List", () => {
    const a = withSession({ gsl: gslState({ spoken: 0 }) });
    expect(a.types).toEqual(["open_gsl"]);
    expect(a.because).toBe("“Maritime Security” is adopted and the Speakers List is not open yet.");
  });

  it("TRAP — `spoken` alone proves the list was opened, with no motionQueue to consult", () => {
    // The delegate console never subscribes to motionQueue (invariant 3), so `gslIsOpen` cannot see
    // the executed open_gsl. Without the `spoken` fallback this would advise re-opening a list the
    // committee already worked through.
    expect(run({ motions: [] }).types).toEqual(["mod_caucus", "unmod_caucus"]);
  });

  it("a queue passed in sharpens the same answer rather than changing it", () => {
    const opened = [{ type: "open_gsl" as MotionType, status: "executed" as const, byDelegateId: "u", byCountry: "fr", applicationId: "a", params: {} }];
    expect(withSession({ gsl: gslState({ spoken: 0 }) }, { motions: opened }).types).toEqual([]);
  });
});

describe("nothing to advise", () => {
  it("empty `allowed` → no opinion", () => {
    expect(run({ allowed: [] })).toEqual({ types: [], because: "", hint: {} });
  });

  it("a live vote silences the ladder — the fallback must NOT fire", () => {
    const voting = withSession({
      activeVote: {
        voteId: "v1", motion: "DR 1.1", voteType: "substantive", threshold: "two_thirds",
        scMode: false, p5: [], allowAbstain: true, round: 1, divisionOfQuestion: false,
        mode: "roll_call", ballots: {}, eligibleCount: 3, startedBy: "chair",
      },
    });
    expect(voting.types).toEqual([]);
  });

  it("suspended / closed / finalized are silent", () => {
    expect(withSession({ phase: "suspended" }).types).toEqual([]);
    expect(withSession({ phase: "closed" }).types).toEqual([]);
    expect(withSession({ finalized: true }).types).toEqual([]);
  });
});

describe("invariant 2 — advice is always a subset of `allowed`", () => {
  it("never returns a type the gate withheld", () => {
    const a = run({ allowed: ["unmod_caucus"] });
    expect(a.types).toEqual(["unmod_caucus"]);
  });

  it("falls back to the debate pair when the ladder's pick is not admitted", () => {
    // Ladder says set_agenda; the chair opened a debate-motions gate instead.
    const a = run({ agenda: agendaPending, allowed: ["mod_caucus", "unmod_caucus", "extend_caucus"] });
    expect(a.types).toEqual(["mod_caucus", "unmod_caucus"]);
    expect(a.because).toBe("The chair has opened the floor to motions.");
  });

  it("the fallback is skipped when the ladder was DELIBERATELY silent", () => {
    // A caucus with 8 minutes left: the pair is admitted, but advising it would tell the room to
    // replace the caucus it just voted for.
    const a = withSession({ caucus: caucus("unmoderated", 480_000) }, { allowed: ["mod_caucus", "unmod_caucus"] });
    expect(a.types).toEqual([]);
  });

  it("never advises a motion the floor has already answered", () => {
    // extend_caucus with no caucus running is moot (motionMootness row 3), even though the endgame
    // row would otherwise be the one to offer it.
    const a = run({ allowed: ["extend_caucus"] });
    expect(a.types).toEqual([]);
  });

  it("caps the lead at three", () => {
    const a = withSession({
      caucus: caucus("moderated", 20_000),
      publishedDoc: { docId: "d1", title: "DR 1.1", docType: "draft_resolution", sponsors: [], signatories: [] },
    });
    expect(a.types.length).toBeLessThanOrEqual(3);
  });

  it("every advised type carries a hint", () => {
    for (const a of [run(), withSession({ caucus: caucus("moderated", 20_000) }), run({ agenda: agendaPending })]) {
      for (const t of a.types) expect(a.hint[t], t).toBeTruthy();
    }
  });
});

describe("motionBlurb — the non-advised rows", () => {
  it("describes what the motion IS where there is something to say", () => {
    expect(motionBlurb("mod_caucus")).toBe("Chaired speeches on one question.");
  });

  it("falls back to the procedure line for the three that have no useful blurb", () => {
    expect(motionBlurb("suspend")).toBe("Goes to a procedural vote");
    expect(motionBlurb("custom")).toBe("Chair acts directly");
  });

  it("covers every delegate-proposable type without throwing", () => {
    for (const t of ALL_DELEGATE_MOTION_TYPES) expect(motionBlurb(t)).toBeTruthy();
  });
});
