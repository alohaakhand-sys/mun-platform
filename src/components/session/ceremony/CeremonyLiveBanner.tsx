"use client";

/**
 * "The opening ceremony is live — join" strip for the conference portals.
 *
 * The entry gate already offers a ceremony as the way in when committee sessions are shut, but
 * once the organizer opens sessions the two run in parallel — a delegate whose committee is in
 * session still needs a door into the closing ceremony. This is that door.
 *
 * ONE read on mount, no listener: a ceremony is a scheduled event, not something anyone is
 * waiting on this screen for, and every portal load already pays for several documents
 * ([[spark-plan-read-budget]]).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  getLiveControl, liveCeremony, ceremonyLabel, type CeremonyKind,
} from "@/lib/services/liveControlService";

export function CeremonyLiveBanner({ eventId }: { eventId: string }) {
  const [kind, setKind] = useState<CeremonyKind | null>(null);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    getLiveControl(eventId)
      .then((c) => {
        if (!active) return;
        const k = liveCeremony(c);
        setKind(k);
        setTitle(k ? (c?.[k]?.title || ceremonyLabel(k)) : "");
      })
      .catch(() => {});
    return () => { active = false; };
  }, [eventId]);

  if (!kind) return null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold flex items-center gap-2">
            {title}
            <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-red-500/12 text-red-600 text-[10px] font-bold uppercase tracking-wide">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500/70" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              Live
            </span>
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            The organizer is hosting right now. Join to watch.
          </p>
        </div>
      </div>
      <Link
        href={`/dashboard/ceremony/${eventId}?kind=${kind}`}
        className="inline-flex items-center justify-center gap-2 shrink-0 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        <Sparkles className="w-4 h-4" /> Join ceremony
      </Link>
    </div>
  );
}
