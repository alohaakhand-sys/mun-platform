/**
 * Fixture table for `planMosaic`.
 *
 * THE LOCAL PIN IS THE POINT. Both tiering loops skip `camOff`, so before the pin a camera-off
 * local user was passed over twice and collapsed into "+N more". For a chair that also removed the
 * procedure bar, which renders INSIDE their own tile via LiveVideoRoom's `chairBar` — the control
 * vanished with the tile and nothing on screen said why. These cases exist so that cannot come back.
 *
 * Input order matters: `planMosaic` consumes an ALREADY-RANKED list, sorted by LiveVideoRoom as
 * floor → local → live cameras → audience flags. Fixtures mirror that.
 */
import { describe, it, expect } from "vitest";
import { planMosaic, shouldMosaic, MOSAIC_HEROES, MOSAIC_MID, type MosaicSubject } from "./tileLayout";

const p = (uid: string, over: Partial<MosaicSubject> = {}): MosaicSubject => ({
  uid, camOff: false, hasFloor: false, ...over,
});

const uids = (list: MosaicSubject[]) => list.map((x) => x.uid);

describe("planMosaic — the local user always gets a tile", () => {
  it("keeps a CAMERA-OFF local user out of overflow", () => {
    // The regression: local is camOff, and there are enough live cameras to fill every slot.
    const list = [
      p("floor", { hasFloor: true }),
      p("me", { camOff: true, isLocal: true }),
      p("a"), p("b"), p("c"), p("d"), p("e"),
    ];
    const plan = planMosaic(list);
    const shown = [...uids(plan.heroes), ...uids(plan.mid)];
    expect(shown).toContain("me");
  });

  it("keeps a camera-off local user even when every mid slot is already taken", () => {
    const list = [
      p("floor", { hasFloor: true }),
      p("me", { camOff: true, isLocal: true }),
      p("a"), p("b"), p("c"), p("d"),
    ];
    const plan = planMosaic(list);
    expect(uids(plan.mid)).toContain("me");
    expect(plan.mid.length).toBeLessThanOrEqual(MOSAIC_MID);
  });

  it("does not duplicate the local user when they already hold a hero slot", () => {
    const list = [p("me", { isLocal: true }), p("a"), p("b")];
    const plan = planMosaic(list);
    const shown = [...uids(plan.heroes), ...uids(plan.mid)];
    expect(shown.filter((u) => u === "me")).toHaveLength(1);
  });

  it("does not duplicate the local user when they are also the floor holder", () => {
    const list = [
      p("me", { hasFloor: true, isLocal: true }),
      p("a"), p("b"), p("c"), p("d"),
    ];
    const plan = planMosaic(list);
    const shown = [...uids(plan.heroes), ...uids(plan.mid)];
    expect(shown.filter((u) => u === "me")).toHaveLength(1);
    expect(uids(plan.heroes)[0]).toBe("me");
  });

  it("is a no-op when no participant is flagged local", () => {
    const list = [p("a"), p("b"), p("c"), p("d"), p("e"), p("f")];
    const plan = planMosaic(list);
    expect(plan.heroes).toHaveLength(MOSAIC_HEROES);
    expect(plan.heroes.length + plan.mid.length + plan.overflow).toBe(list.length);
  });
});

describe("planMosaic — existing tiering still holds", () => {
  it("the floor holder takes the first hero slot", () => {
    const plan = planMosaic([p("a"), p("floor", { hasFloor: true }), p("b")]);
    expect(uids(plan.heroes)[0]).toBe("floor");
  });

  it("the chair takes the second hero slot, by role", () => {
    const plan = planMosaic([
      p("floor", { hasFloor: true }), p("a"), p("chair", { role: "Chair" }), p("b"),
    ]);
    expect(uids(plan.heroes)).toEqual(["floor", "chair"]);
  });

  it("a VICE chair is not treated as the chair", () => {
    const plan = planMosaic([
      p("floor", { hasFloor: true }), p("a"), p("vc", { role: "Vice Chair" }),
    ]);
    expect(uids(plan.heroes)).toEqual(["floor", "a"]);
  });

  it("both hero slots fill even when the fillers are camera-off", () => {
    const plan = planMosaic([p("a", { camOff: true }), p("b", { camOff: true })]);
    expect(plan.heroes).toHaveLength(2);
    expect(plan.overflow).toBe(0);
  });

  it("every participant is accounted for exactly once", () => {
    const list = [
      p("floor", { hasFloor: true }), p("me", { camOff: true, isLocal: true }),
      p("a"), p("b"), p("c"), p("d"), p("e"), p("f"), p("g"),
    ];
    const plan = planMosaic(list);
    expect(plan.heroes.length + plan.mid.length + plan.overflow).toBe(list.length);
    const shown = [...uids(plan.heroes), ...uids(plan.mid)];
    expect(new Set(shown).size).toBe(shown.length);
  });
});

describe("shouldMosaic", () => {
  it("needs room across", () => {
    expect(shouldMosaic([p("a"), p("b"), p("c"), p("d"), p("e")], 700)).toBe(false);
    expect(shouldMosaic([p("a"), p("b"), p("c"), p("d"), p("e")], 1400)).toBe(true);
  });

  it("one camera-off attendee is enough to tier a small room", () => {
    expect(shouldMosaic([p("a"), p("b")], 1400)).toBe(false);
    expect(shouldMosaic([p("a"), p("b", { camOff: true })], 1400)).toBe(true);
  });
});
