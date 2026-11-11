/**
 * Who was in the room, for the session report.
 *
 * The report is built from `participation` docs, but those are not the attendance record:
 * a delegate who answers roll call themselves (`declareOwnAttendance`) writes only the
 * sitting's `attendance` map, and a delegate who never acts has no participation doc at all.
 * Reading participation alone showed self-declared delegates as "—", undercounted quorum,
 * and left silent-but-present delegates out of the report.
 *
 * So: the sitting's attendance map is the authority for attendance, and every delegation on
 * it gets a row. Pure, so the web and the Kotlin port can share one test table.
 */

export interface ReportParticipation {
  delegateId: string;
  country: string;
  applicationId: string;
  attendanceStatus?: string;
  speeches: number;
  speakingSeconds: number;
  caucusSpeeches: number;
  points: number;
  motions: number;
  votesCast: number;
}

export interface RollEntry { status?: string; country?: string; applicationId?: string }

export function withRollAttendance<P extends ReportParticipation>(
  participation: P[],
  attendance: Record<string, RollEntry | undefined> | undefined,
  base: Omit<P, keyof ReportParticipation> & Partial<P>,
): P[] {
  const roll = attendance || {};
  const out = participation.map((p) => {
    const status = roll[p.delegateId]?.status;
    return status ? { ...p, attendanceStatus: status } : p;
  });
  const seen = new Set(out.map((p) => p.delegateId));
  for (const [delegateId, entry] of Object.entries(roll)) {
    if (!entry || seen.has(delegateId)) continue;
    out.push({
      ...base,
      delegateId,
      country: entry.country || "",
      applicationId: entry.applicationId || "",
      attendanceStatus: entry.status,
      speeches: 0, speakingSeconds: 0, caucusSpeeches: 0, points: 0, motions: 0, votesCast: 0,
    } as P);
  }
  return out;
}
