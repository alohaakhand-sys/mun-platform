"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

export function AppWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Routes that should NOT show the global Navbar and Footer
  const isDashboard = pathname?.startsWith("/dashboard");
  const isOnboarding = pathname?.startsWith("/onboarding");
  const isAuth = pathname === "/login" || pathname === "/signup";
  
  // We want to hide the global navbar/footer on dashboard and onboarding
  // Often login/signup have their own minimal layout or the global one.
  // Based on the user's screenshot, the global navbar is overlapping the dashboard.
  const hideGlobalLayout = isDashboard || isOnboarding;

  // The `.mun-paper` routes paint their own canvas edge to edge, so the shared bottom
  // gutter would show a strip of app background between the page and the footer. They
  // carry their own end padding instead (`.mp-page-end`).
  const isPaper =
    pathname === "/" ||
    pathname === "/events" ||
    pathname === "/blogs" ||
    // The DETAIL routes, but not their children: `/events/<id>/apply` is still on the
    // app's own design system and wants the shared gutter.
    /^\/events\/[^/]+$/.test(pathname || "") ||
    /^\/blogs\/[^/]+$/.test(pathname || "");

  // Dialogs, popovers, selects, toasts and sheets PORTAL to <body>, outside every
  // `.mun-paper` wrapper, so on their own they come back in the app's indigo. Putting the
  // scope on <body> itself hands them the paper tokens. LIVE MUN routes (console,
  // projector, ceremony, ghost observer) keep their own design system and are excluded.
  const isLiveMun =
    /^\/dashboard\/(conferences\/[^/]+|chair\/committee\/[^/]+)\/live\/?$/.test(pathname || "") ||
    /^\/dashboard\/admin\/live-sessions\/observe\/?$/.test(pathname || "") ||
    /^\/dashboard\/ceremony\/[^/]+\/?$/.test(pathname || "");
  const paperBody = !isLiveMun && (isPaper || !!isDashboard);
  useEffect(() => {
    document.body.classList.toggle("mun-paper", paperBody);
  }, [paperBody]);

  return (
    <>
      {!hideGlobalLayout && <Navbar />}
      <main id="main" className={`flex-1 ${!hideGlobalLayout && !isPaper ? "pb-16 md:pb-24" : ""}`}>
        {children}
      </main>
      {!hideGlobalLayout && <Footer />}
    </>
  );
}
