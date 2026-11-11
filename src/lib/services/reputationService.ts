import { collection, doc, getDoc, getDocs, query, where, limit as qlimit } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/client";

// Client side of the peer-reputation feature. Reads hit Firestore directly (gated
// by rules); writes POST to /api/reputation/* with a Bearer id token, where the
// server verifies eligibility and maintains the aggregate counters.

export interface Rating {
  raterUid: string;
  raterName?: string;
  raterPhotoURL?: string;
  toUid: string;
  stars: number;
}

export interface Recommendation {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL?: string;
  authorHeadline?: string;
  toUid: string;
  relationship?: string;
  body: string;
  status: "pending" | "approved" | "hidden";
  createdAt?: any;
}

export interface SkillEndorser {
  uid: string;
  name: string;
  photoURL: string;
}

/** Mirror of the server slug so the client can query/read by skillSlug. */
export function slugifySkill(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ms = (v: any) => v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0);
const byNewest = (items: Recommendation[]) => items.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));

// ─────────────────────────────── reads ────────────────────────────────────────

export async function getMyRatingFor(raterUid: string, toUid: string): Promise<Rating | null> {
  try {
    const s = await getDoc(doc(db, "ratings", `${raterUid}_${toUid}`));
    return s.exists() ? (s.data() as Rating) : null;
  } catch {
    return null;
  }
}

export async function getApprovedRecommendations(toUid: string): Promise<Recommendation[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "recommendations"), where("toUid", "==", toUid), where("status", "==", "approved"))
    );
    return byNewest(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Recommendation));
  } catch {
    return [];
  }
}

export async function getPendingRecommendations(toUid: string): Promise<Recommendation[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "recommendations"), where("toUid", "==", toUid), where("status", "==", "pending"))
    );
    return byNewest(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Recommendation));
  } catch {
    return [];
  }
}

export async function getGivenRecommendations(authorUid: string): Promise<Recommendation[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "recommendations"), where("authorUid", "==", authorUid), where("status", "==", "approved"))
    );
    return byNewest(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Recommendation));
  } catch {
    return [];
  }
}

export async function getSkillEndorsers(toUid: string, skillSlug: string, max = 3): Promise<SkillEndorser[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, "endorsements"),
        where("toUid", "==", toUid),
        where("skillSlug", "==", skillSlug),
        qlimit(max)
      )
    );
    return snap.docs.map((d) => {
      const e = d.data() as any;
      return { uid: e.endorserUid, name: e.endorserName || "", photoURL: e.endorserPhotoURL || "" };
    });
  } catch {
    return [];
  }
}

export async function hasEndorsed(endorserUid: string, toUid: string, skillSlug: string): Promise<boolean> {
  try {
    const s = await getDoc(doc(db, "endorsements", `${endorserUid}_${toUid}_${skillSlug}`));
    return s.exists();
  } catch {
    return false;
  }
}

// ───────────────────────────── writes (server) ────────────────────────────────

async function post(path: string, body: unknown): Promise<any> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in to continue.");
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed. Please try again.");
  return data;
}

export function rateUser(toUid: string, stars: number) {
  return post("/api/reputation/rate", { toUid, stars });
}

export function submitRecommendation(toUid: string, body: string, relationship?: string) {
  return post("/api/reputation/recommend", { toUid, body, relationship });
}

export function decideRecommendation(recId: string, action: "approve" | "hide") {
  return post("/api/reputation/recommend/decide", { recId, action });
}

export function toggleEndorsement(toUid: string, skill: string): Promise<{ ok: boolean; endorsed: boolean; skillSlug: string }> {
  return post("/api/reputation/endorse", { toUid, skill });
}

export async function checkEligibility(targetUid: string): Promise<{ eligible: boolean; reason?: string }> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { eligible: false, reason: "auth" };
    const res = await fetch(`/api/profile/${targetUid}/eligibility`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return await res.json();
  } catch {
    return { eligible: false };
  }
}
