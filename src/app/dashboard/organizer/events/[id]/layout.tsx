"use client";

import { ReactNode } from "react";

// Event sub-navigation lives in the collapsible left sidebar (EventSidebar),
// so no top tab bar here — just render the active page.
export default function OrganizerEventLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}
