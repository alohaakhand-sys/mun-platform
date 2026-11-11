"use client";

import { useEffect, useRef } from "react";
import {
  enqueueSpeaker, resolveHand,
  type FloorRequest, type LiveSession, type SpeakerSlot,
} from "@/lib/services/sessionService";
import { caucusListState, slotOfSignup } from "@/lib/services/caucusList";

/**
 * Auto-admit caucus signups: a delegate's "yes" flows straight into the moderated caucus's
 * speaking order, in answer order, with no chair tap.
 *
 * WHO FIRES: chair-tier clients only (`canControl`) — the sibling of `useVoteAutoClose`, for
 * the same reason. Delegates cannot write `caucus.queue` (rules), and letting them would
 * resurrect both problems the requests-based design exists to kill: order forged by a doctored
 * client clock, and N delegates contending with the chair's own transactions on the session doc.
 *
 * ORDER: only docs whose `createdAt` has been server-acked are processed (the optimistic local
 * snapshot reads null). That makes the admitted order the serverTimestamp order — a signup
 * simply waits one snapshot longer before it hops from "Signed up" into the queue.
 *
 * DOUBLE-ADD: two chair tabs firing together is harmless — `enqueueSpeaker` is a transaction
 * that dedups by delegateId, and `resolveHand` swallows a not-found. The jittered delay only
 * keeps them from contending in the first place.
 *
 * NOT WHILE THE LIST IS BEING COLLECTED. The opening window of a moderated caucus belongs to the
 * seat dialog: the chair is handed the whole batch at once, in answer order, to reorder and trim
 * before committing — which is the actual procedure, where the order the chair reads the placards
 * back in IS the speakers list. Draining signups into `caucus.queue` underneath that dialog would
 * mean the chair reorders a list something else is concurrently appending to. So this hook stands
 * down until `listState` is "seated", and then resumes for exactly the case it was written for: the
 * late placard between speeches, which flows onto the end of the order with no chair tap.
 *
 * Legacy (pre-`floorGate`) sessions never carry a `listState` at all, so they read as "seated" and
 * keep today's behaviour end to end.
 *
 * KNOWN GAP (same as useVoteAutoClose): if no chair-tier browser is open, nothing auto-adds;
 * signups wait under "Signed up" until one is, where the manual Add buttons still work.
 */
export function useCaucusAutoAdd({
  session, requests, eventId, sessionId, canControl, userId,
}: {
  session: LiveSession | null | undefined;
  /** The console's live `requests` subscription — not re-subscribed here. */
  requests: FloorRequest[];
  eventId: string;
  sessionId: string;
  canControl: boolean;
  userId: string;
}) {
  const firing = useRef(false);
  // Fire-time snapshot of the subscription: the timeout re-checks each doc is STILL pending
  // against this, so a chair's "Skip" in the jitter window can't be overridden by a stale
  // closure re-admitting the doc.
  const latestRequests = useRef(requests);
  useEffect(() => { latestRequests.current = requests; }, [requests]);

  const caucus = session?.caucus;
  const caucusId = caucus?.kind === "moderated" ? caucus.caucusId : undefined;
  // The collecting window belongs to the seat dialog — see the header.
  const seated = caucusListState(caucus) === "seated";

  // A stable fingerprint of what's admittable — the effect re-runs only when it changes.
  const ready = caucusId
    ? requests.filter((r) =>
        r.kind === "caucus_signup" && r.status === "pending" && r.answer === "yes"
          && r.caucusId === caucusId && r.createdAt != null)
    : [];
  const readyKey = ready.map((r) => r.id).sort().join("|");

  useEffect(() => {
    if (!canControl || !caucusId || !seated || !readyKey || firing.current) return;
    const delay = 600 + Math.random() * 1400;
    const id = setTimeout(async () => {
      firing.current = true;
      try {
        const stillPending = new Set(
          latestRequests.current.filter((r) => r.status === "pending").map((r) => r.id)
        );
        const batch = ready.filter((r) => stillPending.has(r.id)).sort(
          (a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)
            || (a.createdAt?.nanoseconds ?? 0) - (b.createdAt?.nanoseconds ?? 0)
        );
        if (!batch.length) return;
        const slots: SpeakerSlot[] = batch.map(slotOfSignup);
        await enqueueSpeaker(eventId, sessionId, slots, "caucus");
        await Promise.all(batch.map((r) => resolveHand(eventId, sessionId, r, "granted", userId)));
      } catch (e) {
        console.error("caucusAutoAdd", e);
      } finally {
        // Always release: resolved docs leave `pending`, so a re-fire only sees genuinely
        // new signups; after an error the next snapshot retries.
        firing.current = false;
      }
    }, delay);
    return () => clearTimeout(id);
    // `ready` is derived from `requests`; readyKey is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canControl, eventId, sessionId, userId, caucusId, seated, readyKey]);
}
