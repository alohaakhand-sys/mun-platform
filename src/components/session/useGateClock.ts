"use client";

/**
 * Ticking `now` for a floor-gate window — one interval, and only while there is something to count.
 *
 * Everything that opens or closes a gate writes the session doc, so it arrives through
 * `subscribeSession` and re-renders for free. The single exception is a WINDOW EXPIRING, which is
 * pure clock with no write behind it — the same gap `useMotionFloor` and `CaucusSignupBar`
 * document. So the interval runs only while `expiresAt` is still ahead and stops the moment it
 * lapses, which matters on a 50k-reads/day tier where every avoidable render is worth avoiding.
 *
 * Shared by the chair's `GateBar` and the delegate's `FloorCard` so the two countdowns cannot drift
 * apart by a second and disagree about whether the window is still open.
 */
import { useEffect, useState } from "react";

export function useGateClock(expiresAt: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  const pending = expiresAt != null && expiresAt > now;

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pending, expiresAt]);

  return now;
}
