"use client";

import { useEffect, useState } from "react";
import { getRulesGuide, RulesGuide } from "@/lib/services/optionalModulesService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, Loader2, Download, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { marked } from "marked";

// Read-only view of the event-wide Rules & Regulations guide, shown to every role in
// the Documents hub. Renders the markdown the organizer authored.
export function RulesGuideViewer({ eventId }: { eventId: string }) {
  const [guide, setGuide] = useState<RulesGuide | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getRulesGuide(eventId).then(setGuide);
  }, [eventId]);

  if (guide === undefined) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center gap-3 text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading rules & regulations…</span>
        </CardContent>
      </Card>
    );
  }

  if (!guide || !guide.content) {
    return (
      <Card className="glass-card border-border/50">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ScrollText className="w-5 h-5 text-primary" />
            </span>
            Rules & Regulations
          </CardTitle>
          <CardDescription>The conference rulebook.</CardDescription>
        </CardHeader>
        <CardContent className="py-10 text-center">
          <ScrollText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/25" />
          <p className="font-medium text-sm">No rules published yet</p>
          <p className="text-xs text-muted-foreground mt-1">The organizer will publish the rulebook here — check back later.</p>
        </CardContent>
      </Card>
    );
  }

  const updated = guide.updatedAt?.toDate?.() || (guide.updatedAt instanceof Date ? guide.updatedAt : null);

  const handleDownloadMd = () => {
    const blob = new Blob([guide.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rules-and-regulations.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="glass-card border-border/50 overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-primary" />
          </span>
          Rules & Regulations
        </CardTitle>
        <CardDescription>Published by the conference organizers.</CardDescription>
      </CardHeader>

      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-secondary border border-border/40">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ScrollText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">Rules & Regulations</p>
            <p className="text-xs text-muted-foreground">
              Markdown
              {updated ? ` · updated ${formatDistanceToNow(updated, { addSuffix: true })}` : ""}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownloadMd}>
              <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">.md</span>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setOpen((o) => !o)}>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
              {open ? "Hide" : "Read"}
            </Button>
          </div>
        </div>

        {open && (
          <div
            className="markdown-content border border-border/40 rounded-2xl px-4 sm:px-6 py-5 bg-background max-h-[640px] overflow-auto"
            dangerouslySetInnerHTML={{ __html: marked.parse(guide.content) as string }}
          />
        )}
      </CardContent>
    </Card>
  );
}
