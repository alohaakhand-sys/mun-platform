"use client";

import { Preloader } from "@/components/brand/Preloader";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { FloatingMessageButton } from "@/components/dashboard/FloatingMessageButton";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { DelegatePortalShell } from "@/components/dashboard/delegate-portal/DelegatePortalShell";
import { cn } from "@/lib/utils";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { isAppAdminProfile } from "@/lib/utils/roles";

function DashboardShell({ children, isAppAdmin }: { children: React.ReactNode; isAppAdmin: boolean }) {
  const { collapsed } = useSidebar();
  return (
    // `mun-paper` puts the whole dashboard on the public press-sheet palette: the token
    // remap in globals.css rewrites --background / --primary / --border / --radius, so
    // every shadcn component inside adopts it without a per-file edit. The ambient
    // primary glow that used to sit behind the shell is gone with it — this system has
    // no glows.
    <div className="mun-paper min-h-screen bg-background text-foreground relative">
      <Sidebar />
      <div className={cn("flex flex-col min-h-screen transition-[padding] duration-300 ease-in-out", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        <Header />
        <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
      {!isAppAdmin && <FloatingMessageButton />}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  const isAppAdmin = isAppAdminProfile(profile as any);
  // Maintenance mode (Admin → Settings → Maintenance): everyone but the App Admin sees a notice.
  const [maintenance, setMaintenance] = useState<{ on: boolean; message: string } | null>(null);
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "systemSettings", "global"))
      .then((s) => setMaintenance({ on: s.data()?.maintenanceMode === true, message: String(s.data()?.maintenanceMessage || "") }))
      .catch(() => setMaintenance({ on: false, message: "" }));
  }, [user]);

  // The event portal gets a bespoke Facebook-style shell; everything else keeps the standard
  // sidebar + header chrome. Both the delegate conference portal and the chair committee hub
  // share this shell — the left rail swaps its nav by route (see PortalLeftRail / PortalTopBar).
  const isDelegatePortal = /^\/dashboard\/conferences\/[^/]+\/?$/.test(pathname);
  const isChairPortal = /^\/dashboard\/chair\/committee\/[^/]+\/?$/.test(pathname);
  const isPortal = isDelegatePortal || isChairPortal;
  // Live MUN is a full-screen, chromeless route — the console, the projector board and the
  // App Admin ghost observer each own the whole viewport themselves. The observer MUST live
  // under /dashboard/admin or the redirect below bounces it on every render; `usePathname()`
  // excludes the query string, so its ?eventId=… params need no pattern here.
  const isLiveMun =
    /^\/dashboard\/(conferences\/[^/]+|chair\/committee\/[^/]+)\/live\/?$/.test(pathname) ||
    /^\/dashboard\/admin\/live-sessions\/observe\/?$/.test(pathname) ||
    // The conference-wide ceremony room — one shared route for organizer, chairs and delegates
    // alike, so it sits at the top level rather than under any one role's tree. `?kind=` is a
    // query string and needs no pattern here.
    /^\/dashboard\/ceremony\/[^/]+\/?$/.test(pathname);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && mounted) {
      if (!user) {
        router.push("/login");
      } else if (!profile || profile.onboardingComplete !== true) {
        router.push("/onboarding");
      } else if (isAppAdmin && !pathname.startsWith("/dashboard/admin")) {
        // App Admin has no delegate dashboard — keep them inside the admin area.
        router.replace("/dashboard/admin");
      }
    }
  }, [user, profile, loading, router, mounted, isAppAdmin, pathname]);

  // Whole-app boot (auth check / about to redirect): the MUN Pilot logo preloader. Live MUN
  // routes keep their original spinner — that surface is outside the redesign.
  const bootScreen = isLiveMun ? (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
  ) : (
    <Preloader />
  );

  if (!mounted || loading) return bootScreen;

  // Prevent flashing content if we are about to redirect
  if (!user || !profile || profile.onboardingComplete !== true) return bootScreen;

  if (maintenance?.on && !isAppAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-bold tracking-tight">We&apos;ll be right back</h1>
          <p className="text-muted-foreground">{maintenance.message || "MUN Pilot is under maintenance. Please check back soon."}</p>
        </div>
      </div>
    );
  }

  // Live MUN renders chromeless — no sidebar/header shell, the page owns the viewport.
  if (isLiveMun) {
    return (
      <NotificationsProvider>{children}</NotificationsProvider>
    );
  }

  return (
    <SidebarProvider>
      <NotificationsProvider>
        {isPortal ? (
          <DelegatePortalShell isAppAdmin={isAppAdmin}>{children}</DelegatePortalShell>
        ) : (
          <DashboardShell isAppAdmin={isAppAdmin}>{children}</DashboardShell>
        )}
      </NotificationsProvider>
    </SidebarProvider>
  );
}
