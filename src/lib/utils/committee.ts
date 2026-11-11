/**
 * Committees are keyed by NAME across the app (markings.committeeId, staff.committeeId,
 * applications.assignedCommittee, studyGuides doc id). These helpers give a single,
 * consistent way to compare committee references so casing/whitespace differences don't
 * silently break roster/marking/study-guide lookups.
 */

export function normCommittee(name?: string | null): string {
  return (name || "").trim().toLowerCase();
}

export function sameCommittee(a?: string | null, b?: string | null): boolean {
  return normCommittee(a) === normCommittee(b) && normCommittee(a) !== "";
}

/**
 * The committee a delegate ACTUALLY sits in. `assignedCommittee` is authoritative
 * (set on approval, rewritten on migration); the original preference is only a
 * fallback for not-yet-assigned applicants. Never OR the two — after a migration the
 * preference still points at the OLD committee, so OR-ing places the delegate in two
 * committees at once (double counts, double-show on the country-assignment grid).
 */
export function effectiveCommittee(app: {
  assignedCommittee?: string | null;
  preferredCommittee?: string | null;
  choices?: { primary?: { committee?: string | null } | null } | null;
}): string {
  return app.assignedCommittee || app.preferredCommittee || app.choices?.primary?.committee || "";
}

/** True if the delegate's effective committee matches `committeeName`. */
export function belongsToCommittee(
  app: Parameters<typeof effectiveCommittee>[0],
  committeeName?: string | null
): boolean {
  return sameCommittee(effectiveCommittee(app), committeeName);
}
