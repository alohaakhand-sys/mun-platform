"use client";

/**
 * Live "are motions in order?" for the delegate console — one call, one ticker, one prop.
 *
 * Everything that opens or closes the floor (nextSpeaker, startModCaucus, nextCaucusSpeaker,
 * openVote, closeVoteAtomic, endCaucus, suspend) writes the session doc, so it arrives on its own
 * through `subscribeSession` and re-derives for free. The single exception is the chair's INVITE
 * WINDOW expiring — that is pure clock, with no write behind it, which is the same gap
 * `CaucusSignupBar` documents. So the interval runs ONLY while an invite is still unexpired, and
 * stops the moment it lapses.
 */
import { useEffect, useState } from "react";
import { motionsInOrder, type MotionFloorStatus } from "@/lib/services/motionFloor";
import type { LiveSession } from "@/lib/services/sessionService";

/**
 * `session` is nullable because the consoles call this above their loading early-returns (hooks
 * cannot run conditionally). While it is null the result is unused — nothing that can propose a
 * motion has rendered yet — so "open" is the honest placeholder rather than a fake block.
 */
export function useMotionFloor(session: LiveSession | null | undefined): MotionFloorStatus {
  const endsAt = session?.motionInvite?.endsAt ?? null;
  const [now, setNow] = useState(() => Date.now());

  // Re-arms whenever a new invite lands; self-stops once this one has run out.
  const pending = endsAt != null && endsAt > now;
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pending, endsAt]);

  if (!session) return { inOrder: true, code: "open" };
  return motionsInOrder(session, now);
}
