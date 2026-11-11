"use client";

import { useParams, usePathname } from "next/navigation";
import { DelegateConferenceSidebar, ChairConferenceSidebar } from "@/components/dashboard/Sidebar";
import { SidebarContext } from "@/contexts/SidebarContext";

// Left menu rail (desktop). Reuses the existing conference sidebars, forced to their expanded
// state via a local SidebarContext override (same trick the mobile Header uses). The chair
// committee hub gets the chair nav; everything else (delegate portal) gets the delegate nav.
export function PortalLeftRail() {
  const params = useParams();
  const pathname = usePathname();
  const conferenceId = params.id as string;
  const isChair = pathname.startsWith("/dashboard/chair/committee/");

  return (
    <aside className="hidden lg:block w-60 shrink-0 sticky top-[5.5rem] self-start">
      <div className="glass-card rounded-2xl border border-border/50 flex flex-col overflow-hidden py-2 max-h-[calc(100vh-7rem)]">
        <SidebarContext.Provider value={{ collapsed: false, toggle: () => {}, setCollapsed: () => {} }}>
          {isChair ? (
            <ChairConferenceSidebar conferenceId={conferenceId} pathname={pathname} />
          ) : (
            <DelegateConferenceSidebar conferenceId={conferenceId} pathname={pathname} />
          )}
        </SidebarContext.Provider>
      </div>
    </aside>
  );
}
