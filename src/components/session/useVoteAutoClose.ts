"use client";

import { useEffect, useRef } from "react";
import {
  finalizeVote,
  type FinishedVote, type LiveSession, type ParticipationIdentity,
} from "@/lib/services/sessionService";

/**
 * Close the active vote by itself once its countdown runs out.
 *
 * WHO FIRES: chair-tier clients only (`canControl`). This is forced, not a preference — the
 * delegate carve-out in firestore.rules only lets a delegate touch `activeVote.ballots`, so a
 * delegate writing `activeVote: null` is a guaranteed permission-denied. Delegates must never
 * attempt it; they just watch the same clock tick down.
 *
 * DOUBLE-CLOSE: prevented inside `closeVoteAtomic`, whose transaction only commits when
 * `activeVote.voteId` still matches. Every other caller (a co-chair's tab, a second chair
 * window, a manual tap racing the deadline) re-reads a null activeVote and gets back null, so
 * participation is never double-credited. The jitter below is only there to keep those clients
 * from contending in the first place.
 *
 * KNOWN GAP: if every chair-tier browser is closed or asleep past the deadline, nothing fires
 * and the vote stays open. The rules-side deadline clause still rejects late ballots, so the
 * result can't drift — but the vote needs a manual close. A server-side guarantee would need a
 * scheduled Cloud Function.
 */
export function useVoteAutoClose({
  session, eventId, sessionId, canControl, identityFor, onClosed,
}: {
  session: LiveSession | null | undefined;
  eventId: string;
  sessionId: string;
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  onClosed?: (v: FinishedVote) => void;
}) {
  // Latched per voteId so a re-render mid-close can't schedule a second attempt.
  const firing = useRef<string | null>(null);
  // Kept in a ref so a new `identityFor`/`onClosed` identity doesn't reschedule the timeout.
  const latest = useRef({ identityFor, onClosed });
  latest.current = { identityFor, onClosed };

  const vote = session?.activeVote;
  const voteId = vote?.voteId;
  const endsAt = vote?.timer?.endsAt;
  const running = vote?.timer?.running;

  useEffect(() => {
    if (!canControl || !voteId || !running || endsAt == null) return;
    if (firing.current === voteId) return;
    // Jitter past the deadline so co-chair/second-window clients rarely hit the transaction
    // at the same instant. Clamps to the jitter floor when a backgrounded tab wakes up late.
    const delay = Math.max(0, endsAt - Date.now()) + 600 + Math.random() * 1400;
    const id = setTimeout(async () => {
      firing.current = voteId;
      try {
        const finished = await finalizeVote(eventId, sessionId, voteId, latest.current.identityFor);
        if (finished) latest.current.onClosed?.(finished);
      } catch (e) {
        console.error("autoCloseVote", e);
        firing.current = null;   // let a later snapshot retry
      }
    }, delay);
    return () => clearTimeout(id);
  }, [canControl, eventId, sessionId, voteId, endsAt, running]);
}
