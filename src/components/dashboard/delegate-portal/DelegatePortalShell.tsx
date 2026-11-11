"use client";

import { useCallback, useRef, useState } from "react";
import { FloatingMessageButton } from "@/components/dashboard/FloatingMessageButton";
import { PortalEventContext, PortalEvent } from "./PortalEventContext";
import { PortalMessengerContext, PortalChatTarget } from "./PortalMessengerContext";
import { PortalTopBar } from "./PortalTopBar";
import { PortalLeftRail } from "./PortalLeftRail";
import { PortalRightRail } from "./PortalRightRail";

// Facebook-style 3-zone shell for the delegate event portal. Rendered by the dashboard
// layout in place of the standard chrome on /dashboard/conferences/[id], inside the same
// Sidebar/Notifications providers so the bell and messaging keep working.
export function DelegatePortalShell({
  children,
  isAppAdmin,
}: {
  children: React.ReactNode;
  isAppAdmin: boolean;
}) {
  const [event, setEvent] = useState<PortalEvent>(null);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<PortalChatTarget>(null);
  const nonceRef = useRef(0);

  const openChat = useCallback((m: { uid: string; name: string; photo: string }) => {
    nonceRef.current += 1;
    setChatTarget({ ...m, nonce: nonceRef.current });
    setMessagesOpen(true);
  }, []);

  return (
    <PortalEventContext.Provider value={{ event, setEvent }}>
      <PortalMessengerContext.Provider value={{ openChat }}>
      {/* Same `mun-paper` scope as the main dashboard shell — the palette and the 4px
          corner come from the token remap in globals.css. The ambient primary glow goes
          with it; this system has no glows. The LIVE route sits outside both shells. */}
      <div className="mun-paper min-h-screen bg-background text-foreground relative">
        <PortalTopBar messagesOpen={messagesOpen} onToggleMessages={() => setMessagesOpen((o) => !o)} />

        <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-6">
          <div className="flex gap-6 items-start">
            <PortalLeftRail />
            <main className="flex-1 min-w-0">{children}</main>
            <PortalRightRail />
          </div>
        </div>

        {!isAppAdmin && (
          <FloatingMessageButton
            open={messagesOpen}
            onOpenChange={setMessagesOpen}
            openWith={chatTarget}
          />
        )}
      </div>
      </PortalMessengerContext.Provider>
    </PortalEventContext.Provider>
  );
}
