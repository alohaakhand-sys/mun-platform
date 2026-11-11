"use client";

import { useEffect, useState } from "react";
import { MigrationRequests } from "@/components/features/organizer/MigrationRequests";
import { DirectMigration } from "@/components/features/organizer/DirectMigration";
import { Inbox, Shuffle } from "lucide-react";

const SUBTABS = [
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "direct", label: "Direct Migration", icon: Shuffle },
] as const;

type SubTab = (typeof SUBTABS)[number]["id"];

/** "Migration" tab: delegate requests + organizer direct moves, as two sub-tabs. */
export function MigrationHub() {
  const [sub, setSub] = useState<SubTab>("requests");

  // Honor ?sub=… (and legacy ?tab=direct) deep links.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = (p.get("sub") || p.get("tab")) as SubTab | null;
    if (s && SUBTABS.some((x) => x.id === s)) setSub(s);
  }, []);

  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 rounded-xl bg-secondary p-1">
        {SUBTABS.map((t) => {
          const Icon = t.icon;
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === "requests" && <MigrationRequests />}
      {sub === "direct" && <DirectMigration />}
    </div>
  );
}
