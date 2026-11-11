"use client";

import { useEffect, useState } from "react";
import { ApplicationsTable } from "@/components/features/organizer/ApplicationsTable";
import { MigrationHub } from "@/components/features/organizer/MigrationHub";
import CountryManagementPage from "../countries/page";
import CapacityManagementPage from "../capacity/page";
import StaffManagementPage from "../staff/page";
import { ClipboardList, Globe2, Gauge, Users, ArrowRightLeft } from "lucide-react";

const TABS = [
  { id: "applications", label: "Applications", icon: ClipboardList },
  { id: "countries", label: "Country Assignment", icon: Globe2 },
  { id: "migration", label: "Migration", icon: ArrowRightLeft },
  { id: "capacity", label: "Capacity & Waitlist", icon: Gauge },
  { id: "staff", label: "Invitation", icon: Users },
] as const;

// The manual "test allocation" tool is App Admin only: dashboard/admin/events/[id]/test-allocate.
type TabId = (typeof TABS)[number]["id"];

// "Allocation" menu: everything about placing people — review applications, assign
// countries, manage committee capacity/waitlist, and staff. (Pricing lives in Financials.)
export default function AllocationPage() {
  const [tab, setTab] = useState<TabId>("applications");

  // Honor a ?tab=… deep link (e.g. the overview "assign countries" CTA).
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    let t = search.get("tab");
    // Legacy links: the old separate migration tabs now live under one "Migration" tab.
    if (t === "migrations" || t === "direct") t = "migration";
    if (t && TABS.some((x) => x.id === t)) setTab(t as TabId);
  }, []);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">Allocation</span></h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Review applications, assign countries, and manage committee capacity &amp; staff.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border/40 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "applications" && <ApplicationsTable />}
      {tab === "countries" && <CountryManagementPage />}
      {tab === "migration" && <MigrationHub />}
      {tab === "capacity" && <CapacityManagementPage />}
      {tab === "staff" && <StaffManagementPage />}
    </div>
  );
}
