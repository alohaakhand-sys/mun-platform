/**
 * Published committee standings — `events/{eventId}/standings/{committeeId}`.
 *
 * WHY AN AGGREGATE DOC AND NOT A QUERY: a delegate can only read their OWN marking docs
 * (firestore.rules → markings: `request.auth.uid == resource.data.delegateId`). Ranking is
 * inherently a statement about other people's scores, so a delegate can never compute it
 * client-side, and loosening the markings rule to let them try would expose every peer's
 * raw marks. Instead the chair publishes one derived doc holding only what a board needs.
 *
 * Publishing is DELIBERATE, never automatic: it reveals scores to the room, and a chair
 * mid-conference usually does not want that. `visibility` narrows it further —
 * "rank_only" lets a delegate see where they placed without seeing anyone else's number.
 *
 * One doc per committee also means the organizer's cross-committee view costs one read per
 * committee instead of a scan over every marking doc in the event (Spark tier: 50k/day).
 */

import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { MarkingMode } from "./eventService";

export type StandingsVisibility = "full" | "rank_only";

export interface StandingsEntry {
  delegateId: string;
  applicationId: string;
  country: string;
  name: string;
  rank: number;
  finalScore: number;
  computedPct: number;
  chairOverall?: number | null;
  presentDays: number;
  dayCount: number;
}

export interface CommitteeStandings {
  id?: string;           // = committeeId
  eventId: string;
  committeeId: string;   // committee NAME, same identity convention as markings/sessions
  visibility: StandingsVisibility;
  markMode?: MarkingMode;
  dayCount: number;
  entries: StandingsEntry[];
  publishedBy: string;
  publishedAt?: any;
  updatedAt?: any;
}

const standingsCol = (eventId: string) => collection(db, "events", eventId, "standings");
/** Committee names can contain "/" — illegal in a document id, so sanitize the same way sessions do. */
export const standingsDocId = (committeeId: string) => (committeeId || "").replace(/\//g, "_");

export async function publishStandings(
  eventId: string, committeeId: string, entries: StandingsEntry[],
  opts: { publishedBy: string; visibility?: StandingsVisibility; dayCount?: number; markMode?: MarkingMode },
): Promise<{ success: boolean; error?: any }> {
  if (!eventId || !committeeId) return { success: false, error: "missing ids" };
  try {
    await setDoc(doc(standingsCol(eventId), standingsDocId(committeeId)), {
      eventId, committeeId,
      visibility: opts.visibility || "full",
      markMode: opts.markMode || "decimal",
      dayCount: opts.dayCount ?? 0,
      entries,
      publishedBy: opts.publishedBy,
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { success: true };
  } catch (error) {
    console.error("publishStandings", error);
    return { success: false, error };
  }
}

/** Withdraw a published board (the delegate view falls back to "not published yet"). */
export async function unpublishStandings(eventId: string, committeeId: string): Promise<void> {
  try {
    await deleteDoc(doc(standingsCol(eventId), standingsDocId(committeeId)));
  } catch (e) {
    console.error("unpublishStandings", e);
  }
}

/**
 * A denied read here means the `events/{id}/standings/{committee}` rules block is not on the
 * live project — the rules file deploys SEPARATELY from Vercel (`npm run deploy:rules`), and
 * a stale ruleset is invisible everywhere except the browser console. Say that, once, instead
 * of dumping a raw FirebaseError: the caller treats it as "no board published" either way, so
 * the only thing the message has to do is tell you which lever to pull.
 */
function reportStandingsRead(where: string, e: any): void {
  if (e?.code === "permission-denied") {
    console.warn(
      `${where}: denied by Firestore rules. The events/{eventId}/standings rules block is missing ` +
      `on this project — run \`npm run deploy:rules\` (rules deploy separately from the app build).`,
    );
    return;
  }
  console.error(where, e);
}

/** One committee's published board. Returns null when nothing is published (or read is denied). */
export async function getStandings(eventId: string, committeeId: string): Promise<CommitteeStandings | null> {
  if (!eventId || !committeeId) return null;
  try {
    const snap = await getDoc(doc(standingsCol(eventId), standingsDocId(committeeId)));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as CommitteeStandings) : null;
  } catch (e) {
    reportStandingsRead("getStandings", e);
    return null;
  }
}

/** Every published board in the event — the organizer's cross-committee view. */
export async function getEventStandings(eventId: string): Promise<CommitteeStandings[]> {
  if (!eventId) return [];
  try {
    const snap = await getDocs(standingsCol(eventId));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommitteeStandings));
  } catch (e) {
    reportStandingsRead("getEventStandings", e);
    return [];
  }
}

/** A delegate's own placement in a published board, or null when they aren't on it. */
export function myPlacement(s: CommitteeStandings | null, delegateId: string): StandingsEntry | null {
  if (!s || !delegateId) return null;
  return s.entries?.find((e) => e.delegateId === delegateId) || null;
}
