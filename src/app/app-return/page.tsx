"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Smartphone } from "lucide-react";

/**
 * The payment gateway's landing page for checkouts started in the phone app
 * (/api/payments/checkout with returnTo "app"). It reopens the app on its
 * "Confirming payment" screen through the munpro:// scheme, which re-verifies the
 * payment server-side itself. Only known destinations and plain ids are passed on,
 * so this can't be used to bounce someone to an arbitrary link.
 */
const DESTINATIONS = new Set(["payments", "plan"]);
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

function appLink(sp: URLSearchParams): string | null {
  const to = sp.get("to") || "";
  if (!DESTINATIONS.has(to)) return null;
  const out = new URLSearchParams();
  for (const key of ["app", "event", "payment", "gw"]) {
    const v = sp.get(key);
    if (v && SAFE.test(v)) out.set(key, v);
  }
  return `munpro://${to}?${out.toString()}`;
}

export default function AppReturnPage() {
  // useSearchParams on a route with no dynamic segment needs a boundary or `next build` fails.
  return (
    <Suspense fallback={<Shell><Loader2 className="h-8 w-8 animate-spin text-primary" /></Shell>}>
      <AppReturn />
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center space-y-4">{children}</div>
    </div>
  );
}

function AppReturn() {
  const sp = useSearchParams();
  const link = useMemo(() => appLink(new URLSearchParams(sp.toString())), [sp]);
  const paid = sp.get("payment") === "success";

  useEffect(() => {
    if (link) window.location.href = link;
  }, [link]);

  return (
    <Shell>
      <Smartphone className="mx-auto h-10 w-10 text-primary" />
      <h1 className="text-xl font-bold tracking-tight">
        {paid ? "Payment sent — back to MUN Pilot" : "Back to MUN Pilot"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {paid
          ? "The app confirms your payment and unlocks your conference."
          : "No payment was taken. You can try again from Payments in the app."}
      </p>
      {link && (
        <a href={link} className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground">
          Open the app
        </a>
      )}
      <p className="text-xs text-muted-foreground">
        Not on your phone?{" "}
        <Link href="/dashboard/payments" className="text-primary hover:underline">
          Open Payments on the website
        </Link>
      </p>
    </Shell>
  );
}
