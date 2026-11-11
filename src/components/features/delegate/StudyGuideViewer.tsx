"use client";

import { useEffect, useState } from "react";
import { getStudyGuide, StudyGuide } from "@/lib/services/optionalModulesService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ExternalLink, Loader2, Download, FileText, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { marked } from "marked";

interface StudyGuideViewerProps {
  eventId: string;
  committeeName: string;
}

export function StudyGuideViewer({ eventId, committeeName }: StudyGuideViewerProps) {
  const [guide, setGuide] = useState<StudyGuide | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getStudyGuide(eventId, committeeName).then(setGuide);
  }, [eventId, committeeName]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (guide === undefined) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center gap-3 text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading study guide…</span>
        </CardContent>
      </Card>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────
  if (!guide) {
    return (
      <Card className="glass-card border-border/50">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </span>
            Study Guide
          </CardTitle>
          <CardDescription>Background reading for your committee.</CardDescription>
        </CardHeader>
        <CardContent className="py-10 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground/25" />
          <p className="font-medium text-sm">No study guide yet</p>
          <p className="text-xs text-muted-foreground mt-1">Your chair will upload it here — check back later.</p>
        </CardContent>
      </Card>
    );
  }

  const uploadDate = guide.uploadedAt?.toDate?.() || (guide.uploadedAt instanceof Date ? guide.uploadedAt : null);
  const isMarkdown = !!guide.content;

  const handleDownloadMd = () => {
    if (!guide.content) return;
    const blob = new Blob([guide.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = guide.fileName || `${committeeName}-study-guide.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const a = document.createElement("a");
    a.href = guide.url!;
    a.download = guide.fileName || "study-guide.pdf";
    a.click();
  };

  return (
    <Card className="glass-card border-border/50 overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </span>
          Study Guide
        </CardTitle>
        <CardDescription>Shared by your committee chair.</CardDescription>
      </CardHeader>

      <CardContent className="pt-6 space-y-4">
        {/* File row */}
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-secondary border border-border/40">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{guide.fileName || `${committeeName} Study Guide`}</p>
            <p className="text-xs text-muted-foreground">
              {isMarkdown ? "Markdown" : "PDF"}
              {uploadDate ? ` · uploaded ${formatDistanceToNow(uploadDate, { addSuffix: true })}` : ""}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {isMarkdown ? (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownloadMd}>
                  <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">.md</span>
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => setOpen((o) => !o)}>
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
                  {open ? "Hide" : "Read"}
                </Button>
              </>
            ) : guide.url ? (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadPdf}>
                  <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Save</span>
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => window.open(guide.url, "_blank")}>
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* Collapsible rendered markdown — keeps the tab tidy until requested */}
        {isMarkdown && open && (
          <div
            className="markdown-content border border-border/40 rounded-2xl px-4 sm:px-6 py-5 bg-background max-h-[640px] overflow-auto"
            dangerouslySetInnerHTML={{ __html: marked.parse(guide.content!) as string }}
          />
        )}
      </CardContent>
    </Card>
  );
}
