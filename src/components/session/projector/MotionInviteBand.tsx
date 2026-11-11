"use client";

/**
 * "Are there any points or motions on the floor?" — as a band the whole room can see.
 *
 * `session.motionInvite` has always been on the snapshot and has never been rendered here, so the
 * window opened and closed entirely inside the chair's rail and each delegate's own device. A
 * delegate looking up at the screen had no way to know the floor was open, or for how long.
 *
 * The window closes ITSELF with no write (`endsAt` is epoch ms from the chair's clock), so this
 * ticks locally and unmounts on its own — exactly like `CaucusState.signupEndsAt`.
 */
import { useEffect, useState } from "react";
import type { MotionInvite } from "@/lib/services/sessionService";
import { Hand } from "lucide-react";

export function MotionInviteBand({ invite }: { invite?: MotionInvite | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!invite?.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [invite?.endsAt]);

  if (!invite?.endsAt) return null;
  const remaining = invite.endsAt - now;
  if (remaining <= 0) return null;

  const total = Math.ceil(remaining / 1000);
  const mm = Math.floor(total / 60);
  const ss = (total % 60).toString().padStart(2, "0");

  return (
    <div
      className="bg-primary text-white flex items-center gap-[0.8em] animate-proj-rise"
      style={{ padding: "calc(var(--proj-pad) * 0.3) var(--proj-pad)", fontSize: "var(--t-rail)" }}
    >
      <Hand style={{ width: "1.15em", height: "1.15em" }} className="shrink-0" />
      <span
        className="font-heading font-extrabold uppercase leading-none shrink-0"
        style={{ letterSpacing: "0.14em", fontSize: "var(--t-eyebrow)" }}
      >
        Floor open for points &amp; motions
      </span>
      {invite.note && <span className="truncate opacity-90 min-w-0">{invite.note}</span>}
      <span className="ml-auto font-mono font-bold tabular-nums leading-none shrink-0"
        style={{ fontSize: "calc(var(--t-rail) * 1.4)", letterSpacing: "-0.02em" }}>
        {mm}:{ss}
      </span>
    </div>
  );
}
