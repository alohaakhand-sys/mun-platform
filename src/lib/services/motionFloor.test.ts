/**
 * Fixture table for `motionsInOrder`.
 *
 * Three of these cases are STALENESS TRAPS that a naive `!!gsl.activeSpeaker` check gets wrong —
 * they are the reason `live.stage` corroboration exists. They are marked TRAP below; do not
 * "simplify" them away.
 *
 * These also guard the module's purity: node environment, no Firebase config, so a value import
 * of `sessionService` would fail every case at import time.
 */
import { describe, it, expect } from "vitest";
import {
  motionsInOrder, motionInviteState, POINTS_STILL_OPEN,
  myLiveMotion, isLiveMotion, duplicateMotionNote,
  type MotionFloorInput,
} from "./motionFloor";
import type {
  TimerState, SpeakerSlot, CaucusState, ActiveVote, Motion, MotionStatus,
} from "./sessionService";


const NOW = 1_700_000_000_000;

const timer = (over: Partial<TimerState> = {}): TimerState => ({
  running: false, endsAt: null, pausedRemainingMs: 90_000, durationMs: 90_000, ...over,
});
const slot = (country: string): SpeakerSlot =>
  ({ delegateId: `u_${country}`, country, applicationId: `app_${country}` });

/** Everything clear: no speaker, no caucus, no vote, nobody on the mic. */
function base(over: Partial<MotionFloorInput> = {}): MotionFloorInput {
  return {
    phase: "gsl",
    finalized: false,
    gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: null, timer: timer() },
    caucus: null,
    activeVote: null,
    live: { stage: [] },
    attendance: {
      u_fr: { status: "present", country: "fr", delegateId: "u_fr", applicationId: "a1" },
      u_br: { status: "present", country: "br", delegateId: "u_br", applicationId: "a2" },
      u_ke: { status: "present", country: "ke", delegateId: "u_ke", applicationId: "a3" },
    },
    ...over,
  };
}

const modCaucus = (over: Partial<CaucusState> = {}): CaucusState => ({
  caucusId: "c1", kind: "moderated", topic: "Sanctions",
  totalDurationSecs: 600, perSpeakerSecs: 45,
  totalTimer: timer({ durationMs: 600_000, pausedRemainingMs: 600_000 }),
  speakerTimer: timer(), currentSpeaker: null, queue: [], ...over,
});

const unmodCaucus = (): CaucusState => ({
  caucusId: "c2", kind: "unmoderated", topic: "",
  totalDurationSecs: 600, perSpeakerSecs: 0,
  totalTimer: timer({ durationMs: 600_000, pausedRemainingMs: 600_000 }),
  speakerTimer: timer(),
});

const openVote = (): ActiveVote => ({
  voteId: "v1", motion: "DR 1.1", voteType: "substantive", threshold: "two_thirds",
  scMode: false, p5: [], allowAbstain: true, round: 1, divisionOfQuestion: false,
  mode: "roll_call", ballots: {}, eligibleCount: 3, startedBy: "chair",
});

const run = (s: MotionFloorInput) => motionsInOrder(s, NOW);

describe("motionsInOrder — the floor is clear", () => {
  it("plain GSL with nobody speaking → open", () => {
    expect(run(base()).code).toBe("open");
  });

  it("lobby → open (before quorum is NOT a block)", () => {
    expect(run(base({ phase: "lobby" })).code).toBe("open");
  });

  it("roll call with an empty roster → open (roll call is NOT a block)", () => {
    expect(run(base({ phase: "roll_call", attendance: {} })).code).toBe("open");
  });

  it("between speeches with a queue waiting → open (the classic motion moment)", () => {
    const s = base({
      gsl: { defaultSpeakerSecs: 90, queue: [slot("fr")], activeSpeaker: null, timer: timer() },
    });
    expect(run(s).code).toBe("open");
  });
});

describe("motionsInOrder — someone holds the floor", () => {
  it("GSL speaker with the mic → gsl_speaker, names the country", () => {
    const s = base({
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: ["u_fr"] },
    });
    const r = run(s);
    expect(r.inOrder).toBe(false);
    expect(r.code).toBe("gsl_speaker");
    if (!r.inOrder) expect(r.detail).toContain("France");
  });

  it("granted floor request — mic held with no GSL slot → floor_granted", () => {
    const s = base({ live: { stage: ["u_ke"] } });
    const r = run(s);
    expect(r.code).toBe("floor_granted");
    if (!r.inOrder) expect(r.detail).toContain("Kenya");
  });

  it("moderated caucus with a recognized speaker → caucus_speaker", () => {
    const s = base({
      phase: "mod_caucus",
      caucus: modCaucus({ currentSpeaker: slot("br") }),
      live: { stage: ["u_br"] },
    });
    expect(run(s).code).toBe("caucus_speaker");
  });

  it("the caucus speaker wins the label over a stale GSL speaker", () => {
    const s = base({
      phase: "mod_caucus",
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      caucus: modCaucus({ currentSpeaker: slot("br") }),
      live: { stage: ["u_br"] },
    });
    const r = run(s);
    expect(r.code).toBe("caucus_speaker");
    if (!r.inOrder) {
      expect(r.detail).toContain("Brazil");
      expect(r.detail).not.toContain("France");
    }
  });

  it("a point-of-order interrupt (chair spotlights someone else) stays closed", () => {
    // The chair addToStage'd the interrupter; the original speaker still holds the floor.
    const s = base({
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: ["u_ke"] },
    });
    expect(run(s).code).toBe("gsl_speaker");
  });
});

describe("motionsInOrder — the staleness traps", () => {
  it("TRAP: unmoderated caucus + stale gsl.activeSpeaker → open", () => {
    // startUnmodCaucus leaves gsl.activeSpeaker standing. A naive check would kill the
    // "extend the caucus" motion — the exact motion this case exists to protect.
    const s = base({
      phase: "unmod_caucus",
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      caucus: unmodCaucus(),
      live: { stage: [] },
    });
    expect(run(s).code).toBe("open");
  });

  it("TRAP: unmoderated caucus stays open even if someone is on the mic", () => {
    const s = base({ phase: "unmod_caucus", caucus: unmodCaucus(), live: { stage: ["u_ke"] } });
    expect(run(s).code).toBe("open");
  });

  it("TRAP: moderated caucus, nobody recognized yet, stale gsl.activeSpeaker → open", () => {
    const s = base({
      phase: "mod_caucus",
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      caucus: modCaucus({ currentSpeaker: null }),
      live: { stage: [] },
    });
    expect(run(s).code).toBe("open");
  });

  it("TRAP: post-endCaucus phantom speaker → open", () => {
    // endCaucus nulls the caucus, clears live.stage and force-sets phase "gsl", but LEAVES
    // gsl.activeSpeaker. An active speaker with an empty stage is stale by construction, because
    // nextSpeaker and clearActiveSpeaker always write the two together. Without this, motions
    // would be dead after EVERY caucus.
    const s = base({
      phase: "gsl",
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      caucus: null,
      live: { stage: [] },
    });
    expect(run(s).code).toBe("open");
  });

  it("TRAP: post-closeVoteAtomic — vote gone, stage empty, speaker still named → open", () => {
    const s = base({
      activeVote: null,
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: [] },
    });
    expect(run(s).code).toBe("open");
  });
});

describe("motionsInOrder — precedence", () => {
  it("an open vote outranks a live speaker", () => {
    const s = base({
      phase: "voting",
      activeVote: openVote(),
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: ["u_fr"] },
    });
    expect(run(s).code).toBe("vote_open");
  });

  it("an open vote outranks a live invite (the stale-invite case)", () => {
    const s = base({
      phase: "voting",
      activeVote: openVote(),
      motionInvite: { inviteId: "i1", endsAt: NOW + 60_000, windowSecs: 120, openedBy: "chair" },
    });
    expect(run(s).code).toBe("vote_open");
  });

  it("a live speaker outranks a live invite", () => {
    const s = base({
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: ["u_fr"] },
      motionInvite: { inviteId: "i1", endsAt: NOW + 60_000, windowSecs: 120, openedBy: "chair" },
    });
    expect(run(s).code).toBe("gsl_speaker");
  });

  it("finalized outranks a leftover caucus and vote", () => {
    const s = base({
      finalized: true,
      caucus: modCaucus({ currentSpeaker: slot("br") }),
      activeVote: openVote(),
    });
    expect(run(s).code).toBe("session_closed");
  });

  it("phase closed without finalized → session_closed", () => {
    expect(run(base({ phase: "closed" })).code).toBe("session_closed");
  });

  it("suspended → session_suspended", () => {
    expect(run(base({ phase: "suspended" })).code).toBe("session_suspended");
  });
});

describe("motionsInOrder — the invite window", () => {
  it("an unexpired invite → invited, with the remaining ms and the note", () => {
    const s = base({
      motionInvite: {
        inviteId: "i1", endsAt: NOW + 30_000, windowSecs: 120,
        openedBy: "chair", note: "funding topic only",
      },
    });
    const r = run(s);
    expect(r.code).toBe("invited");
    if (r.inOrder && r.code === "invited") {
      expect(r.endsInMs).toBe(30_000);
      expect(r.inviteId).toBe("i1");
      expect(r.note).toBe("funding topic only");
    }
  });

  it("an expired invite → open, with no write needed to expire it", () => {
    const s = base({
      motionInvite: { inviteId: "i1", endsAt: NOW - 1, windowSecs: 120, openedBy: "chair" },
    });
    expect(run(s).code).toBe("open");
  });

  it("absent motionInvite (pre-ship session) → open, NOT closed", () => {
    expect(run(base()).code).toBe("open");
  });

  it("null motionInvite (post closeMotionFloor) reads identically to absent", () => {
    expect(run(base({ motionInvite: null })).code).toBe("open");
  });

  it("an invite survives an unmoderated caucus (motions stay in order there)", () => {
    const s = base({
      phase: "unmod_caucus",
      caucus: unmodCaucus(),
      motionInvite: { inviteId: "i1", endsAt: NOW + 30_000, windowSecs: 120, openedBy: "chair" },
    });
    expect(run(s).code).toBe("invited");
  });
});

describe("motionInviteState", () => {
  it("reports active / remaining / windowSecs", () => {
    const st = motionInviteState(
      { motionInvite: { inviteId: "i1", endsAt: NOW + 45_000, windowSecs: 90, openedBy: "c" } }, NOW);
    expect(st).toEqual({ active: true, inviteId: "i1", endsInMs: 45_000, windowSecs: 90 });
  });

  it("clamps a lapsed window to zero and reports inactive", () => {
    const st = motionInviteState(
      { motionInvite: { inviteId: "i1", endsAt: NOW - 5_000, windowSecs: 90, openedBy: "c" } }, NOW);
    expect(st.active).toBe(false);
    expect(st.endsInMs).toBe(0);
  });

  it("handles absent and null alike", () => {
    expect(motionInviteState({}, NOW).active).toBe(false);
    expect(motionInviteState({ motionInvite: null }, NOW).active).toBe(false);
  });
});

describe("motionsInOrder — copy completeness", () => {
  const blockedCases: [string, MotionFloorInput][] = [
    ["gsl_speaker", base({
      gsl: { defaultSpeakerSecs: 90, queue: [], activeSpeaker: slot("fr"), timer: timer() },
      live: { stage: ["u_fr"] },
    })],
    ["floor_granted", base({ live: { stage: ["u_ke"] } })],
    ["caucus_speaker", base({ caucus: modCaucus({ currentSpeaker: slot("br") }) })],
    ["vote_open", base({ activeVote: openVote() })],
    ["session_suspended", base({ phase: "suspended" })],
    ["session_closed", base({ phase: "closed" })],
  ];

  it.each(blockedCases)("%s carries a non-empty title and detail", (_code, s) => {
    const r = run(s);
    expect(r.inOrder).toBe(false);
    if (!r.inOrder) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.title.length).toBeLessThanOrEqual(48);
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });

  it("every actionable block reassures the delegate that points still work", () => {
    for (const [code, s] of blockedCases) {
      const r = run(s);
      if (!r.inOrder && code !== "session_closed") {
        expect(r.detail, `${code} should mention points`).toContain(POINTS_STILL_OPEN);
      }
    }
  });

  it("session_closed does NOT promise points — nothing is actionable", () => {
    const r = run(base({ phase: "closed" }));
    if (!r.inOrder) expect(r.detail).not.toContain(POINTS_STILL_OPEN);
  });
});

// ── One live motion of a type, per delegation ───────────────────────────────────

const mot = (over: Partial<Motion> = {}): Motion => ({
  id: "m1", type: "open_gsl", params: {}, byDelegateId: "u_fr", byCountry: "fr",
  applicationId: "app1", status: "pending", ...over,
});

describe("myLiveMotion — the duplicate block", () => {
  it("finds the delegation's own live motion of that type", () => {
    expect(myLiveMotion([mot()], "open_gsl")?.id).toBe("m1");
  });

  it("does not match a different type", () => {
    expect(myLiveMotion([mot()], "mod_caucus")).toBeNull();
  });

  it.each<[MotionStatus, boolean]>([
    ["pending", true],
    ["recognized", true],
    ["voting", true],
    // Carried but not yet executed — moving it again is the same duplicate, one step later.
    ["passed", true],
    ["executed", false],
    ["failed", false],
    ["dropped", false],
  ])("%s counts as live: %s", (status, live) => {
    expect(isLiveMotion(mot({ status }))).toBe(live);
    expect(myLiveMotion([mot({ status })], "open_gsl") !== null).toBe(live);
  });

  it("a resolved motion frees the type again", () => {
    const mine = [mot({ id: "old", status: "executed" }), mot({ id: "older", status: "dropped" })];
    expect(myLiveMotion(mine, "open_gsl")).toBeNull();
  });

  it("names the motion and where it got to", () => {
    expect(duplicateMotionNote(mot())).toMatch(/already moved/i);
    expect(duplicateMotionNote(mot({ status: "voting" }))).toMatch(/voting on it/i);
    expect(duplicateMotionNote(mot({ status: "passed" }))).toMatch(/carried/i);
    expect(duplicateMotionNote(mot({ status: "recognized" }))).toMatch(/recognized/i);
  });
});
