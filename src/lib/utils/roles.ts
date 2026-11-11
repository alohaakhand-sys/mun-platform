/**
 * Role checks on a users/{uid} profile, case-insensitive ("Organizer" and "organizer" are the same
 * role; "admin" is the legacy alias of "App Admin"). The server and the rules check the same doc.
 */
export function isAppAdminProfile(p: { role?: string; isAdmin?: boolean } | null | undefined): boolean {
  const r = String(p?.role || "").toLowerCase();
  return r === "app admin" || r === "admin" || p?.isAdmin === true;
}

export function isOrganizerProfile(p: { role?: string } | null | undefined): boolean {
  return String(p?.role || "").toLowerCase() === "organizer";
}

/** The roles an App Admin can give (Users page, /api/admin/users/role). */
export const ASSIGNABLE_ROLES = ["user", "Organizer", "App Admin"] as const;
