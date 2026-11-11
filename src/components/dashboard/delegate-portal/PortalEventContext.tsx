"use client";

import { createContext, useContext } from "react";

// committeeId is the viewer's committee in this event (delegate's seat / chair's committee),
// used by the right-rail group chat to find the committee conversation. Empty/undefined for
// oversight viewers with no committee.
export type PortalEvent = { id: string; title: string; committeeId?: string } | null;

type PortalEventCtx = {
  event: PortalEvent;
  setEvent: (e: PortalEvent) => void;
};

// Lets the center page publish the resolved event (id + title) up to the shell so the
// top bar and right rail can show/fetch by it without a duplicate read. Survives ?tab=
// navigation because the provider lives in the shell, which the query change never remounts.
export const PortalEventContext = createContext<PortalEventCtx>({
  event: null,
  setEvent: () => {},
});

export const usePortalEvent = () => useContext(PortalEventContext);
