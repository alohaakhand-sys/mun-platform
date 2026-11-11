"use client";

import { useEffect, useMemo, useRef } from "react";
import { runTransaction, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { CommitteeDoc } from "@/lib/services/committeeDocService";
import {
  makeSessionId, type LiveSession, type Motion, type MotionStatus,
} from "@/lib/services/sessionService";
import {
  readFloorFacts, sweepMootMotions, orphanedVoteMotions, AUTO_FALLABLE, ORPHAN_RESCUE_NOTE,
} from "@/lib/services/motionMootness";
import { getAgenda } from "./flow/flowModel";

/**
 * Take motions off the chair's floor once the committee has answered them.
 *
 * WHY A HOOK AND NOT JUST `executeMotion`. `executeMotion` already fells the motions its own
 * execution superseded, atomically, in the same batch — that covers the common case and costs
 * nothing. But mootness is also created by direct chair actions that touch no motion at all:
 * adopting the agenda from the Flow Bar, starting a caucus from the caucus panel, rejecting a paper
 * in the docs panel, closing the session from Host controls. Nothing in the motion pipeline observes
 * any of those. This is the half that does.
 *
 * WHO FIRES: chair-tier clients only (`canControl`). Forced, not a preference —
 * firestore.rules lets only a chair/admin update `motionQueue`, so a delegate attempting this is a
 * guaranteed permission-denied. Delegates simply see the result land.
 *
 * DOUBLE-WRITE: two chair tabs sweeping together is harmless — each write is a transaction that
 * re-reads the doc and commits only while the status is still auto-fallable, so the loser aborts
 * before writing. The jitter below only keeps them from contending in the first place. It also
 * closes the one genuine race in the feature: the panel's [Adopt] button runs `executeMotion` on a
 * *recognized* motion, i.e. one inside AUTO_FALLABLE, so between its effect landing and its status
 * flip another tab could in principle rule it out of order. `executeMotion` commits that flip in one
 * batch immediately after the effect, which puts the exposure well inside the 600ms jitter floor.
 *
 * THE INVARIANT it inherits: auto-fall never touches `passed` or `voting`. A passed motion embodies
 * a recorded vote and a voting one is mid-ballot; see `motionMootness.ts`. The orphan rescue below
 * is the ONLY thing here that writes a `voting` motion, and it puts it back on the floor for the
 * chair rather than deciding it.
 *
 * READ COST: zero new subscriptions. Everything comes from the console's existing session / motion
 * queue / docs listeners. A fallen motion leaves AUTO_FALLABLE, so it can never re-fire.
 *
 * KNOWN GAP (same as `useVoteAutoClose` and `useCaucusAutoAdd`): if no chair-tier browser is open,
 * nothing sweeps and the stale motions wait. They fall the moment a chair next opens the console,
 * which is also what makes this self-healing for sessions stranded before it shipped. A server-side
 * guarantee would need a scheduled Cloud Function, which the Spark tier does not allow.
 */
export function useMotionMootnessSweep({
  session, motions, docs, eventId, committeeId, dateStr, committeeAgendas, canControl, userId,
}: {
  session: LiveSession | null | undefined;
  /** The console's live `motionQueue` subscription — not re-subscribed here. */
  motions: Motion[];
  /** The console's live committee-docs subscription; drives the rejected-paper rule. */
  docs: CommitteeDoc[];
  eventId: string;
  committeeId: string;
  dateStr: string;
  /** Committee config topics — `getAgenda` needs them to synthesize a pre-agenda session's list. */
  committeeAgendas: string[];
  canControl: boolean;
  userId: string;
}) {
  const sessionId = useMemo(() => makeSessionId(committeeId, dateStr), [committeeId, dateStr]);
  const firing = useRef(false);
  // Fire-time snapshot: the timeout re-checks each motion against THIS, so a chair's Execute or
  // Dismiss during the jitter window can't be overridden by a stale closure.
  const latestMotions = useRef(motions);
  useEffect(() => { latestMotions.current = motions; }, [motions]);

  // Orphans must be seen on TWO consecutive snapshots before rescue. `finalizeVote` is briefly in a
  // state that looks identical — activeVote nulled by closeVoteAtomic, motion not yet reconciled —
  // and rescuing there would race the function about to resolve it properly. `pendingPublish`
  // catches most of that window; this catches the rest.
  const seenOrphans = useRef<Set<string>>(new Set());

  // A finalized session is history with its marks already written. Nothing to gain from rewriting
  // motion docs nobody will read, so bail before deriving anything.
  const live = session && !session.finalized ? session : null;

  const falls = useMemo(() => {
    if (!live) return [];
    const facts = readFloorFacts(live, getAgenda(live, committeeAgendas), motions, docs);
    return sweepMootMotions(motions, facts);
  }, [live, motions, docs, committeeAgendas]);

  const orphans = useMemo(
    () => (live ? orphanedVoteMotions(motions, live) : []),
    [live, motions],
  );

  // Stable fingerprint of the work — the effect re-runs only when the set actually changes.
  const fallKey = falls.map((f) => `${f.motion.id}:${f.ruling.code}`).sort().join("|");
  const orphanKey = orphans.map((m) => m.id).sort().join("|");

  useEffect(() => {
    if (!canControl || !live || firing.current) return;

    // Only orphans confirmed on a PREVIOUS snapshot are actionable this round.
    const confirmed = orphans.filter((m) => seenOrphans.current.has(m.id!));
    seenOrphans.current = new Set(orphans.map((m) => m.id!));

    if (!falls.length && !confirmed.length) return;

    const delay = 600 + Math.random() * 1400;
    const id = setTimeout(async () => {
      firing.current = true;
      try {
        const byId = new Map(latestMotions.current.map((m) => [m.id, m]));

        for (const { motion, ruling } of falls) {
          // Re-check against the fire-time snapshot: a chair may have acted during the jitter.
          if (!AUTO_FALLABLE.has(byId.get(motion.id)?.status ?? ("dropped" as MotionStatus))) continue;
          await ruleOutOfOrder(eventId, sessionId, motion.id!, ruling.reason, userId);
        }

        for (const motion of confirmed) {
          if (byId.get(motion.id)?.status !== "voting") continue;
          await rescueOrphan(eventId, sessionId, motion.id!, userId);
        }
      } catch (e) {
        console.error("motionMootnessSweep", e);
      } finally {
        // Always release: a written motion leaves the status set it was found in, so a re-fire only
        // ever sees genuinely new work; after an error the next snapshot retries.
        firing.current = false;
      }
    }, delay);
    return () => clearTimeout(id);
    // `falls`/`orphans` are derived; their keys are their identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canControl, eventId, sessionId, userId, fallKey, orphanKey, !!live]);
}

const motionRef = (eventId: string, sessionId: string, motionId: string) =>
  doc(db, "events", eventId, "sessions", sessionId, "motionQueue", motionId);

/**
 * Rule one motion out of order. Transactional and guarded on the status STILL being auto-fallable,
 * which is what makes two chair tabs firing together a no-op rather than a double write — and what
 * stops a sweep from clobbering a motion the chair executed a moment ago.
 *
 * Writes the stored status "dropped", not a new MotionStatus value: a new union member would strand
 * every motion already written as "dropped" and break the resolved filters. `autoResolved` is the
 * discriminator the consoles branch on to say "out of order" instead of "dismissed".
 */
async function ruleOutOfOrder(
  eventId: string, sessionId: string, motionId: string, reason: string, chairUid: string,
): Promise<void> {
  const ref = motionRef(eventId, sessionId, motionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    if (!AUTO_FALLABLE.has((snap.data() as Motion).status)) return;
    tx.update(ref, {
      status: "dropped" as MotionStatus,
      autoResolved: true,
      chairNote: reason,
      resolvedAt: serverTimestamp(),
      resolvedBy: chairUid,
    });
  });
}

/**
 * Put a motion abandoned mid-vote back on the floor.
 *
 * NOT an auto-fall — nothing is decided here. `recognized`, not `pending`: the chair had already
 * recognized it before putting it to a vote, and `pending` would re-offer [Recognize] and make them
 * redo a finished step. Guarded on "voting" so a `finalizeVote` that landed during the jitter keeps
 * its passed/failed ruling.
 */
async function rescueOrphan(
  eventId: string, sessionId: string, motionId: string, chairUid: string,
): Promise<void> {
  const ref = motionRef(eventId, sessionId, motionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    if ((snap.data() as Motion).status !== "voting") return;
    tx.update(ref, {
      status: "recognized" as MotionStatus,
      chairNote: ORPHAN_RESCUE_NOTE,
      resolvedBy: chairUid,
    });
  });
}
