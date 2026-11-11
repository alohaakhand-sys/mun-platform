"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getUserApplications, ApplicationData } from "@/lib/services/applicationService";
import { getEventById, EventData } from "@/lib/services/eventService";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { effectiveCommittee } from "@/lib/utils/committee";
import {
  isObserverRole, isFacultyStaffRole, isFacultyRole, isObserverApp,
} from "@/lib/services/staffService";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderOpen, FileText, BookOpen, FileStack, Gavel, ChevronRight, Landmark, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { PositionPaperUpload } from "@/components/features/delegate/PositionPaperUpload";
import { StudyGuideViewer } from "@/components/features/delegate/StudyGuideViewer";
import { CommitteeDocsDelegate } from "@/components/features/delegate/CommitteeDocsDelegate";
import { CommitteeDocsChair } from "@/components/features/chair/CommitteeDocsChair";
import { StudyGuideEditor } from "@/components/features/chair/StudyGuideEditor";
import { RulesGuideViewer } from "@/components/features/shared/RulesGuideViewer";

export default function DocumentsHubPage() {
  const { user, profile } = useAuth();
  const [apps, setApps] = useState<ApplicationData[] | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserApplications(user.uid).then((list) => {
      // One card per conference; keep approved/staff seats (pending applicants have no
      // committee yet → no documents to act on).
      const byEvent = new Map<string, ApplicationData>();
      for (const a of list) {
        if (a.status !== "approved") continue;
        if (!byEvent.has(a.eventId)) byEvent.set(a.eventId, a);
      }
      setApps([...byEvent.values()]);
    });
  }, [user]);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
          <FolderOpen className="w-6 h-6 text-primary" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Every document across your conferences — submit and review in one place.
          </p>
        </div>
      </header>

      {apps === null ? (
        <div className="space-y-4">
          {[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : apps.length === 0 ? (
        <Card className="glass-card border-border/50">
          <CardContent className="py-16 text-center">
            <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/25" />
            <p className="font-semibold">No conferences yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Once you&apos;re accepted into a conference, your documents show up here.
            </p>
            <Link href="/dashboard/conferences" className="inline-flex items-center gap-1 text-sm text-primary mt-4 hover:underline">
              Browse my conferences <ChevronRight className="w-4 h-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {apps.map((app) => (
            <ConferenceDocsCard key={app.eventId} app={app} userName={profile?.displayName || user?.displayName || "Delegate"} />
          ))}
        </div>
      )}
    </div>
  );
}

type SubTab = { id: string; label: string; icon: React.ElementType; render: () => React.ReactNode };

function ConferenceDocsCard({ app, userName }: { app: ApplicationData; userName: string }) {
  const { user } = useAuth();
  const staffRole = useEventStaffRole(app.eventId);
  const [event, setEvent] = useState<EventData | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    getEventById(app.eventId).then((e) => setEvent(e as EventData));
  }, [app.eventId]);

  const isChair = staffRole.isChairTier;
  const isEB = staffRole.isExecBoard;
  const isOrgLevel = staffRole.isOrganizerLevel;
  const isReadonly =
    isObserverRole(staffRole.role) || isFacultyStaffRole(staffRole.role) ||
    isFacultyRole(app.role) || isObserverApp(app.role);
  const isManager = isChair || isEB; // committee-bound write authority (chair/EB)

  const committee = (isManager && staffRole.committeeId) || effectiveCommittee(app);

  const tabs = useMemo<SubTab[]>(() => {
    if (staffRole.loading || !event) return [];
    const uid = user?.uid || "";

    if (isManager) {
      const t: SubTab[] = [
        { id: "guide", label: "Study Guide", icon: BookOpen, render: () => (
          <StudyGuideEditor eventId={app.eventId} committee={committee} chairUid={uid} chairName={user?.displayName || undefined} />
        ) },
        { id: "committee", label: "Committee Docs", icon: FileStack, render: () => (
          <CommitteeDocsChair eventId={app.eventId} committee={committee} reviewerUid={uid} canReview />
        ) },
        { id: "papers", label: "Position Papers", icon: FileText, render: () => (
          <Card className="glass-card border-border/50">
            <CardContent className="py-8 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-sm">Grade position papers in the committee hub</p>
                <p className="text-xs text-muted-foreground mt-1">Open your committee to score and comment on each delegate&apos;s paper.</p>
              </div>
              <Link
                href={`/dashboard/chair/committee/${app.eventId}?tab=papers`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shrink-0"
              >
                <Gavel className="w-4 h-4" /> Open
              </Link>
            </CardContent>
          </Card>
        ) },
        { id: "rules", label: "Rules & Regs", icon: ScrollText, render: () => (
          <RulesGuideViewer eventId={app.eventId} />
        ) },
      ];
      return t;
    }

    if (isReadonly) {
      return [
        { id: "guide", label: "Study Guide", icon: BookOpen, render: () => (
          <StudyGuideViewer eventId={app.eventId} committeeName={committee} />
        ) },
        { id: "committee", label: "Committee Docs", icon: FileStack, render: () => (
          <CommitteeDocsChair eventId={app.eventId} committee={committee} reviewerUid={user?.uid || ""} canReview={false} />
        ) },
        { id: "rules", label: "Rules & Regs", icon: ScrollText, render: () => (
          <RulesGuideViewer eventId={app.eventId} />
        ) },
      ];
    }

    if (isOrgLevel) {
      return [
        { id: "manage", label: "Manage", icon: Landmark, render: () => (
          <Card className="glass-card border-border/50">
            <CardContent className="py-8 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-sm">Manage this event&apos;s documents from the event dashboard</p>
                <p className="text-xs text-muted-foreground mt-1">Study guides, certificates and committee tools live under Manage Events.</p>
              </div>
              <Link
                href={`/dashboard/organizer/events/${app.eventId}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shrink-0"
              >
                Open <ChevronRight className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        ) },
      ];
    }

    // Delegate (default)
    return [
      { id: "paper", label: "Position Paper", icon: FileText, render: () => (
        <PositionPaperUpload application={app} event={event} />
      ) },
      { id: "guide", label: "Study Guide", icon: BookOpen, render: () => (
        <StudyGuideViewer eventId={app.eventId} committeeName={committee} />
      ) },
      { id: "committee", label: "Committee Docs", icon: FileStack, render: () => (
        <CommitteeDocsDelegate
          eventId={app.eventId}
          committee={committee}
          eventTitle={event.title}
          submittedBy={user?.uid || ""}
          submittedByName={app.applicantName || userName}
          submittedCountry={app.assignedCountry}
        />
      ) },
      { id: "rules", label: "Rules & Regs", icon: ScrollText, render: () => (
        <RulesGuideViewer eventId={app.eventId} />
      ) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffRole.loading, event, isManager, isReadonly, isOrgLevel, committee, app]);

  const roleLabelText = app.role || "Participant";

  return (
    <Card className="glass-card border-border/50 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/50 bg-secondary">
        <div className="min-w-0">
          <p className="font-bold truncate">{event?.title || "Conference"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {roleLabelText}
            {committee ? ` · ${committee}` : ""}
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {staffRole.loading || !event ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : tabs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents available.</p>
        ) : (
          <>
            {tabs.length > 1 && (
              <div className="inline-flex p-1 rounded-xl bg-secondary border border-border/40 flex-wrap">
                {tabs.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActive(i)}
                    className={cn(
                      "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      active === i ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <t.icon className="w-4 h-4" /> {t.label}
                  </button>
                ))}
              </div>
            )}
            {tabs[Math.min(active, tabs.length - 1)]?.render()}
          </>
        )}
      </div>
    </Card>
  );
}
