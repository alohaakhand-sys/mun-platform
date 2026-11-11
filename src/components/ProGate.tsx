"use client";

import React, { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Crown } from "lucide-react";

interface ProGateProps {
  children: ReactNode;
  feature: string;
  lockedFallback?: ReactNode;
  /** The event's plan decides (eventPlan.ts: Pro is per event). */
  allowed: boolean;
}

export function ProGate({ children, feature, lockedFallback, allowed }: ProGateProps) {
  const isPro = allowed;

  if (isPro) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <Card className="p-6 border-amber-500/20 bg-amber-500/5 backdrop-blur-sm flex flex-col items-center justify-center text-center space-y-4 relative z-10 mb-4">
        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <Crown className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Unlock {feature}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            This comes with a Pro event. Upgrade this event, or ask for it, under Plan.
          </p>
        </div>
        <Button render={<Link href="/dashboard/organizer/pro" />} nativeButton={false} className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
          <Crown className="w-4 h-4" /> Upgrade to Pro
        </Button>
      </Card>
      
      {lockedFallback && (
        <div className="opacity-40 pointer-events-none grayscale">
          {lockedFallback}
        </div>
      )}
    </div>
  );
}
