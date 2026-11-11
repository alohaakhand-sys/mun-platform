"use client";

import { createContext, useContext } from "react";

// A changing `nonce` lets the same member be reopened repeatedly (each click is distinct).
export type PortalChatTarget = { uid: string; name: string; photo: string; nonce: number } | null;

type PortalMessengerCtx = {
  openChat: (m: { uid: string; name: string; photo: string }) => void;
};

// Lets roster cards open the in-place messaging popup for a specific person instead of
// navigating away to the full /dashboard/messages page.
export const PortalMessengerContext = createContext<PortalMessengerCtx>({
  openChat: () => {},
});

export const usePortalMessenger = () => useContext(PortalMessengerContext);
