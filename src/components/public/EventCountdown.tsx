"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * Live countdown to an event's start, stamped on the card placard. Ticks each minute
 * — the shortest unit it ever prints is a minute, so a faster interval would only
 * re-render for nothing.
 *
 * Lifted out of the events page unchanged when that page moved onto the `.mun-paper`
 * design system, so the arithmetic here is the same one that shipped before.
 */
export function EventCountdown({ startMs, endMs }: { startMs: number; endMs?: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!Number.isFinite(startMs)) return null;

  // Over: a neutral "Ended" stamp, the same grey as the cards' neutral status chip.
  if (endMs != null && Number.isFinite(endMs) && now > endMs) {
    return <span className="mp-stamp mp-stamp-right is-ended">Ended</span>;
  }

  const diff = startMs - now;
  let text: string;
  if (diff <= 0) {
    text = "Happening now";
  } else {
    const mins = Math.floor(diff / 60000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    text = d > 0 ? `in ${d}d ${h}h` : h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  }

  // Live now: signal red with a dot (P02); otherwise a clock and the time left.
  if (diff <= 0) {
    return (
      <span className="mp-stamp mp-stamp-right is-now">
        <i className="mp-pill-dot" aria-hidden="true" />
        {text}
      </span>
    );
  }
  return (
    <span className="mp-stamp mp-stamp-right">
      <Clock size={13} aria-hidden="true" />
      {text}
    </span>
  );
}
