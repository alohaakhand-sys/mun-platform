import { describe, expect, it } from "vitest";
import { withRollAttendance, type ReportParticipation } from "./reportAttendance";

const part = (delegateId: string, extra: Partial<ReportParticipation> = {}): ReportParticipation => ({
  delegateId, country: delegateId, applicationId: `app-${delegateId}`,
  speeches: 0, speakingSeconds: 0, caucusSpeeches: 0, points: 0, motions: 0, votesCast: 0, ...extra,
});

describe("withRollAttendance", () => {
  it("takes attendance from the roll, not the participation doc", () => {
    const [fr] = withRollAttendance([part("fr", { speeches: 3 })], { fr: { status: "present" } }, {});
    expect(fr.attendanceStatus).toBe("present");
    expect(fr.speeches).toBe(3);
  });

  it("the roll wins when both have a status", () => {
    const [us] = withRollAttendance([part("us", { attendanceStatus: "present" })], { us: { status: "present_and_voting" } }, {});
    expect(us.attendanceStatus).toBe("present_and_voting");
  });

  it("keeps the doc's status when the roll has no entry", () => {
    const [cn] = withRollAttendance([part("cn", { attendanceStatus: "late" })], {}, {});
    expect(cn.attendanceStatus).toBe("late");
  });

  it("adds a zero row for a delegation on the roll that never acted", () => {
    const rows = withRollAttendance([part("fr")], { fr: { status: "present" }, br: { status: "present", country: "br", applicationId: "a1" } }, {});
    expect(rows.map((r) => r.delegateId)).toEqual(["fr", "br"]);
    expect(rows[1]).toMatchObject({ country: "br", applicationId: "a1", attendanceStatus: "present", speeches: 0, votesCast: 0 });
  });

  it("no roll at all leaves participation untouched", () => {
    const p = [part("fr", { attendanceStatus: "present" })];
    expect(withRollAttendance(p, undefined, {})).toEqual(p);
  });
});
