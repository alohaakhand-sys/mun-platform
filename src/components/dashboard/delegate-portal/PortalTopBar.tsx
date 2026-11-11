"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Menu, MessageSquare, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarContext } from "@/contexts/SidebarContext";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { ProfileMenu } from "@/components/dashboard/ProfileMenu";
import { DelegateConferenceSidebar, ChairConferenceSidebar } from "@/components/dashboard/Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useLiveMunGate } from "@/components/session/gate/LiveGateDialog";
import { usePortalEvent } from "./PortalEventContext";

// Persistent Facebook-style top bar: logo + event name on the left; Messages, Notifications
// and Profile on the right. On < lg the hamburger opens the conference menu as a drawer.
export function PortalTopBar({
  messagesOpen,
  onToggleMessages,
}: {
  messagesOpen: boolean;
  onToggleMessages: () => void;
}) {
  const { user, profile } = useAuth();
  const { event } = usePortalEvent();
  const params = useParams();
  const pathname = usePathname();
  const conferenceId = params.id as string;
  const isChair = pathname.startsWith("/dashboard/chair/committee/");
  const liveHref = isChair
    ? `/dashboard/chair/committee/${conferenceId}/live`
    : `/dashboard/conferences/${conferenceId}/live`;

  // The pill checks the ORGANIZER's switch only (one read) — it has no session date to check
  // the chair's, since the portal context carries no event timezone. That second gate is caught
  // by the live route itself, which watches both.
  const { launch, checking, gate } = useLiveMunGate();

  const name = profile?.displayName || user?.displayName || "User";
  const photo = profile?.photoURL || user?.photoURL || "";

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border/40 bg-background">
      <div className="h-full max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" />}>
              <Menu className="w-5 h-5" />
              <span className="sr-only">Open conference menu</span>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 bg-background border-r-border/40">
              <SheetTitle className="sr-only">Conference menu</SheetTitle>
              <div className="flex h-full flex-col pt-4">
                <SidebarContext.Provider value={{ collapsed: false, toggle: () => {}, setCollapsed: () => {} }}>
                  {isChair ? (
                    <ChairConferenceSidebar conferenceId={conferenceId} pathname={pathname} />
                  ) : (
                    <DelegateConferenceSidebar conferenceId={conferenceId} pathname={pathname} />
                  )}
                </SidebarContext.Provider>
              </div>
            </SheetContent>
          </Sheet>

          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm shrink-0">
              M
            </div>
            <div className="min-w-0 hidden sm:block">
              {event ? (
                <p className="font-semibold text-sm truncate max-w-[38vw]" title={event.title}>
                  {event.title}
                </p>
              ) : (
                <Skeleton className="h-4 w-32" />
              )}
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 shadow-sm"
            title="Launch Live MUN"
            disabled={checking || !event?.id}
            onClick={() => event && launch({
              eventId: event.id,
              href: liveHref,
              role: isChair ? "chair" : "delegate",
              committee: event.committeeId,
              eventTitle: event.title,
            })}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground/70" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground" />
            </span>
            <span className="hidden sm:inline">Live MUN</span>
            <Radio className="w-4 h-4 sm:hidden" />
          </Button>
          {gate}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMessages}
            title="Messages"
            className={cn(
              "relative text-muted-foreground hover:text-foreground",
              messagesOpen && "text-primary bg-secondary"
            )}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="sr-only">Messages</span>
          </Button>
          <NotificationBell align="end" />
          <ProfileMenu
            align="end"
            trigger={
              <Button variant="ghost" className="p-1 rounded-full hover:bg-secondary">
                <span className="sr-only">Open profile menu</span>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={photo} alt={name} />
                  <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                    {name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            }
          />
        </div>
      </div>
    </header>
  );
}
