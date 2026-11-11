import { adminDb } from "@/lib/firebase/admin";
import { emailOf } from "@/lib/server/userContact";

// Server-only helpers for peer reputation (ratings / recommendations / endorsements).
// Every mutating route runs eligibility here, then writes with the admin SDK so it
// can touch OTHER users' reputation collections + the denormalized counters that
// clients are not allowed to write. Mirrors the migration flow in migrationServer.ts.

/** Route-friendly error carrying an HTTP status. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

/** Normalize a skill label into a stable doc-id-safe key. */
export function slugifySkill(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface UserBrief {
  uid: string;
  name: string;
  photoURL: string;
  email: string;
  headline: string;
  skills: string[];
}

/** Snapshot of a user for denormalized display + notification addressing. */
export async function getUserBrief(uid: string): Promise<UserBrief> {
  const snap = await adminDb.collection("users").doc(uid).get();
  const d = (snap.data() as any) || {};
  const name =
    d.displayName ||
    [d.firstName, d.lastName].filter(Boolean).join(" ").trim() ||
    "Someone";
  return {
    uid,
    name,
    photoURL: d.photoURL || "",
    email: await emailOf(uid, d),
    headline: d.headline || "",
    skills: Array.isArray(d.skills) ? d.skills : [],
  };
}

async function areConnected(a: string, b: string): Promise<boolean> {
  // Connections are mirrored both ways; a single-doc get is enough. "blocked" status
  // is treated as not-connected (the blocks check below is the hard gate).
  const s = await adminDb.doc(`users/${a}/connections/${b}`).get();
  return s.exists && (s.data() as any)?.status !== "blocked";
}

async function areSharedConferencePeers(a: string, b: string): Promise<boolean> {
  // Two single-field queries + in-code status filter (no composite index needed —
  // same convention as findOccupant / the members routes).
  const [snapA, snapB] = await Promise.all([
    adminDb.collection("applications").where("userId", "==", a).get(),
    adminDb.collection("applications").where("userId", "==", b).get(),
  ]);
  const eventsA = new Set(
    snapA.docs
      .filter((d) => (d.data() as any).status === "approved")
      .map((d) => (d.data() as any).eventId)
      .filter(Boolean)
  );
  return snapB.docs.some(
    (d) => (d.data() as any).status === "approved" && eventsA.has((d.data() as any).eventId)
  );
}

/**
 * Throw unless `caller` may leave reputation on `target`: not self, neither has
 * blocked the other, and they are connected OR share an approved conference.
 */
export async function assertEligible(callerUid: string, targetUid: string): Promise<void> {
  if (!callerUid) throw new HttpError(401, "Sign in required.");
  if (!targetUid) throw new HttpError(400, "Missing target.");
  if (callerUid === targetUid) throw new HttpError(400, "You can't do this on your own profile.");

  const [blockedByTarget, blockedByCaller] = await Promise.all([
    adminDb.doc(`users/${targetUid}/blocks/${callerUid}`).get(),
    adminDb.doc(`users/${callerUid}/blocks/${targetUid}`).get(),
  ]);
  if (blockedByTarget.exists || blockedByCaller.exists) throw new HttpError(403, "Not allowed.");

  if (await areConnected(callerUid, targetUid)) return; // cheap single-doc check first
  if (await areSharedConferencePeers(callerUid, targetUid)) return;

  throw new HttpError(
    403,
    "You can only rate, recommend, or endorse people you've shared a conference with or are connected to."
  );
}
