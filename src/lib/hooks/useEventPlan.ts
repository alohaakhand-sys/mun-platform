"use client";

import { useEffect, useState } from "react";
import { getEventById } from "@/lib/services/eventService";
import { getSystemSettings } from "@/lib/services/systemSettingsService";
import { resolvePlan, type ResolvedPlan } from "@/lib/data/eventPlan";

/** An event's resolved plan (src/lib/data/eventPlan.ts): its features and caps. Pro is per event. */
export function useEventPlan(eventId: string | undefined) {
  const [plan, setPlan] = useState<ResolvedPlan | null>(null);
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    Promise.all([getEventById(eventId), getSystemSettings().catch(() => null)])
      .then(([ev, s]) => { if (live) setPlan(resolvePlan(ev, s)); })
      .catch(() => { if (live) setPlan(resolvePlan(null)); });
    return () => { live = false; };
  }, [eventId]);
  return { plan, loading: plan === null };
}
