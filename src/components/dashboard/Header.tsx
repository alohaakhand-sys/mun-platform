"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent } from "./Sidebar";
import { SidebarContext } from "@/contexts/SidebarContext";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";

// Mobile-only top bar. On desktop the sidebar carries notifications + profile.
export function Header() {
  const { user, profile, logout } = useAuth();

  const getInitials = (name?: string | null) => (name ? name.charAt(0).toUpperCase() : "U");

  return (
    <header className="dash-topbar sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-x-2 px-4 sm:px-6 lg:hidden">
      <Sheet>
        <SheetTrigger render={<Button variant="ghost" size="icon" />}>
          <span className="sr-only">Open sidebar</span>
          <Menu className="h-6 w-6" aria-hidden="true" />
        </SheetTrigger>
        <SheetContent side="left" className="mun-paper dash-rail p-0 w-64">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <div className="flex h-full flex-col">
            <div className="p-6 flex items-center space-x-3 border-b border-border/40">
              <span className="mp-brand-mark">MP</span>
              <span className="mp-brand" style={{ fontSize: "var(--h-md)" }}>MUN PRO</span>
            </div>

            <SidebarContext.Provider value={{ collapsed: false, toggle: () => {}, setCollapsed: () => {} }}>
              <SidebarContent />
            </SidebarContext.Provider>

            <div className="p-4 border-t border-border/40">
              <button
                onClick={logout}
                className="flex w-full items-center space-x-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-x-1">
        <NotificationBell align="end" />
        <ProfileMenu
          align="end"
          trigger={
            <Button variant="ghost" className="flex items-center gap-2 p-1.5 hover:bg-secondary rounded-full">
              <span className="sr-only">Open user menu</span>
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.photoURL || user?.photoURL || ""} alt={user?.displayName || "User"} />
                <AvatarFallback className="bg-primary/20 text-primary">{getInitials(user?.displayName)}</AvatarFallback>
              </Avatar>
            </Button>
          }
        />
      </div>
    </header>
  );
}
