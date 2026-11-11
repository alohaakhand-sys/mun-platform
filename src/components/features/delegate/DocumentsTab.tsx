"use client";

import { useState } from "react";
import { FileText, BookOpen, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApplicationData } from "@/lib/services/applicationService";
import { EventData } from "@/lib/services/eventService";
import { PositionPaperUpload } from "./PositionPaperUpload";
import { StudyGuideViewer } from "./StudyGuideViewer";
import { RulesGuideViewer } from "@/components/features/shared/RulesGuideViewer";

// Documents tab = clearly separated sub-views (your paper, the chair's study guide, the
// conference rulebook) behind a segmented switcher, so none buries the others.
// The rulebook is here as well as in the central Documents hub on purpose: a code of
// conduct only works if it's where participants already are, and the portal is where
// delegates actually spend their time.
type Sub = "paper" | "guide" | "rules";

export function DocumentsTab({
  application,
  event,
  committeeName,
  initialSub,
}: {
  application: ApplicationData;
  event: EventData;
  committeeName: string;
  /** `?doc=` deep link — the acceptance email points straight at the rulebook. */
  initialSub?: Sub;
}) {
  const [sub, setSub] = useState<Sub>(initialSub ?? "paper");

  const tabs = [
    { id: "paper", label: "Position Paper", icon: FileText },
    { id: "guide", label: "Study Guide", icon: BookOpen },
    { id: "rules", label: "Rules & Regs", icon: ScrollText },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="inline-flex p-1 rounded-xl bg-secondary border border-border/40">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSub(id)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              sub === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {sub === "paper" && <PositionPaperUpload application={application} event={event} />}
      {sub === "guide" && <StudyGuideViewer eventId={event.id!} committeeName={committeeName} />}
      {sub === "rules" && <RulesGuideViewer eventId={event.id!} />}
    </div>
  );
}
