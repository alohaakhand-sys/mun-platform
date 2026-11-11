import { auth } from "@/lib/firebase/client";

export interface ConflictRecord {
  eventId: string;
  eventName: string;
  date: string;
  country: string;
}

/**
 * "Has this delegate already represented this country elsewhere?" — answered by
 * /api/conflicts, NOT from the client.
 *
 * The old implementation ran collectionGroup("applications") straight from the browser.
 * That reads applications belonging to other organizers' events, which no Firestore rule
 * can authorise, so every call was denied and the catch turned it into "no conflict" —
 * conflict detection had been silently dead. The route uses the Admin SDK after checking
 * the caller organizes THIS event.
 */
async function fetchConflicts(eventId: string, userIds: string[]): Promise<Map<string, ConflictRecord>> {
  const out = new Map<string, ConflictRecord>();
  const ids = userIds.filter(Boolean);
  if (!eventId || ids.length === 0) return out;
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return out;
    const res = await fetch("/api/conflicts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId, userIds: ids }),
    });
    if (!res.ok) {
      console.error("Error checking conflicts:", res.status, await res.text());
      return out;
    }
    const { conflicts } = await res.json();
    for (const [key, rec] of Object.entries(conflicts ?? {})) {
      out.set(key, rec as ConflictRecord);
    }
  } catch (error) {
    console.error("Error checking conflicts:", error);
  }
  return out;
}

export async function checkConflict(
  userId: string,
  country: string,
  excludeEventId: string
): Promise<ConflictRecord | null> {
  if (!userId || !country) return null;
  const map = await fetchConflicts(excludeEventId, [userId]);
  return map.get(`${userId}_${country}`) ?? null;
}

/**
 * Conflicts for a whole committee's applicants, keyed `${userId}_${country}`. One request
 * for the entire roster — the previous version fired one Firestore query per
 * applicant x country, which on a 40-delegate committee with 190 countries meant 7,600
 * reads against a 50k/day Spark quota.
 */
export async function batchCheckConflicts(
  applicants: any[],
  countries: string[],
  eventId: string
): Promise<Map<string, ConflictRecord>> {
  const all = await fetchConflicts(eventId, applicants.map(a => a.userId));
  if (countries.length === 0) return all;
  // Keep only the countries this committee actually offers.
  const wanted = new Set(countries);
  const filtered = new Map<string, ConflictRecord>();
  for (const [key, rec] of all) {
    if (wanted.has(rec.country)) filtered.set(key, rec);
  }
  return filtered;
}
