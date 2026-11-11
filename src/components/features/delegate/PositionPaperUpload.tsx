"use client";

import { useState, useEffect } from "react";
import { ApplicationData } from "@/lib/services/applicationService";
import { EventData } from "@/lib/services/eventService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  UploadCloud, FileText, CheckCircle2, Loader2, AlertTriangle, Clock,
  Pencil, FileUp, FileType, Download, X
} from "lucide-react";
import { RichTextEditor } from "@/components/features/shared/RichTextEditor";
import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";
import { getDelegateMarking } from "@/lib/services/markingService";
import { notifyChairsPositionPaper } from "@/lib/services/notifyService";
import { pdfToMarkdown } from "@/lib/utils/pdfToMarkdown";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { marked } from "marked";

interface PositionPaperUploadProps {
  application: ApplicationData;
  event: EventData;
}

type Mode = "write" | "uploadMd" | "uploadPdf";

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

export function PositionPaperUpload({ application, event }: PositionPaperUploadProps) {
  const initial = (application as any).positionPaperContent || "";
  const [mode, setMode] = useState<Mode>("write");
  const [content, setContent] = useState<string>(initial);
  const [originalContent, setOriginalContent] = useState<string>(initial);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<any>(null);
  // Read-first once submitted; the editor only appears when the delegate chooses to edit.
  const [editing, setEditing] = useState<boolean>(!initial);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(
    toDate((application as any).positionPaperUpdatedAt)
  );

  const hasSubmitted = !!originalContent;

  useEffect(() => {
    async function loadMarking() {
      if (hasSubmitted) {
        const m = await getDelegateMarking((application as any).id, application.userId);
        setMarking(m);
      }
    }
    loadMarking();
  }, [application, hasSubmitted]);

  const handleMdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md") && file.type !== "text/markdown" && file.type !== "text/plain") {
      setError("Only .md or plain text files accepted.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("File must be under 2MB.");
      return;
    }
    setError(null);
    const text = await file.text();
    setContent(text);
    setMode("write");
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Only PDF files accepted.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("PDF must be under 20MB.");
      return;
    }
    setError(null);
    setExtracting(true);
    setProgress(20);
    try {
      const md = await pdfToMarkdown(file);
      setProgress(90);
      setContent(md);
      setProgress(100);
      setMode("write");
    } catch (err: any) {
      setError("Failed to extract PDF text: " + (err?.message || "unknown"));
    } finally {
      setExtracting(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      setError("Position paper is empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const appRef = doc(db, "applications", (application as any).id);
      const now = new Date();
      await updateDoc(appRef, {
        positionPaperContent: content,
        positionPaperFormat: "markdown",
        positionPaperUpdatedAt: now,
      });
      setOriginalContent(content);
      setSubmittedAt(now);
      setEditing(false);

      // Notify the committee chairs by email (fire-and-forget).
      const committee = application.assignedCommittee || application.choices?.primary?.committee || "";
      if (committee) {
        notifyChairsPositionPaper({
          eventId: event.id,
          committee,
          delegateName: application.assignedCountry
            ? `${application.applicantName || "A delegate"} (${application.assignedCountry})`
            : application.applicantName || "A delegate",
          eventTitle: event.title,
        });
      }
    } catch (err: any) {
      setError("Save failed: " + (err?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  const downloadPaper = () => {
    const blob = new Blob([originalContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${application.assignedCountry || "position"}-paper.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startEdit = () => {
    setContent(originalContent);
    setMode("write");
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setContent(originalContent);
    setError(null);
    setEditing(false);
  };

  // ── Review status banner ──────────────────────────────────────────────────
  const status: "review" | "approved" | "revision" | "flagged" =
    !marking ? "review"
      : marking.paperStatus === "approved" ? "approved"
        : marking.paperStatus === "revision" ? "revision"
          : marking.paperStatus === "flagged" ? "flagged"
            : "review";

  const statusConfig = {
    review: {
      Icon: Clock,
      label: "Under review by the Chairs",
      sub: "Your paper has been submitted. You can still edit it until it's graded.",
      ring: "border-blue-500/30 bg-blue-500/[0.07]",
      accent: "text-blue-600 dark:text-blue-400",
      dot: "bg-blue-500",
    },
    approved: {
      Icon: CheckCircle2,
      label: "Position paper approved",
      sub: "The Chairs approved your paper.",
      ring: "border-emerald-500/30 bg-emerald-500/[0.07]",
      accent: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
    revision: {
      Icon: AlertTriangle,
      label: "Revision requested",
      sub: "The Chairs asked for changes. Edit and resubmit.",
      ring: "border-amber-500/30 bg-amber-500/[0.07]",
      accent: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    flagged: {
      Icon: AlertTriangle,
      label: "Plagiarism concern flagged",
      sub: "The Chairs flagged a concern. Review the feedback and resubmit.",
      ring: "border-red-500/30 bg-red-500/[0.07]",
      accent: "text-red-600 dark:text-red-400",
      dot: "bg-red-500",
    },
  }[status];

  const { Icon: StatusIcon, label: statusLabel, sub: statusSub, ring: statusRing, accent: statusAccent } = statusConfig;
  const statusBanner = (
    <div className={cn("rounded-2xl border p-4 flex items-start gap-3", statusRing)}>
      <div className={cn("mt-0.5 shrink-0", statusAccent)}>
        <StatusIcon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className={cn("font-semibold text-sm", statusAccent)}>{statusLabel}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{statusSub}</p>
        {marking?.feedback && (
          <p className="text-sm mt-2 pl-3 border-l-2 border-current/30 text-foreground/80 italic">
            “{marking.feedback}”
          </p>
        )}
      </div>
    </div>
  );

  const description = editing
    ? hasSubmitted
      ? "Editing your submission — save to update what the Chairs see."
      : "Write in markdown, upload a .md file, or import a PDF (text is extracted; the file isn't stored)."
    : "Submitted. Only your committee Chairs can read this paper.";

  return (
    <Card className="glass-card border-border/50 overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </span>
          Position Paper
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="pt-6 space-y-5">
        {hasSubmitted && statusBanner}

        {!editing && hasSubmitted ? (
          /* ── Read view ─────────────────────────────────────────────────── */
          <div className="rounded-2xl border border-border/50 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 bg-secondary border-b border-border/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">Your submission</p>
                  <p className="text-xs text-muted-foreground">
                    {submittedAt ? `Submitted ${format(submittedAt, "MMM d, yyyy")} · ` : ""}
                    {wordCount(originalContent)} words
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadPaper}>
                  <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">.md</span>
                </Button>
                <Button size="sm" className="gap-1.5" onClick={startEdit}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
              </div>
            </div>
            <div
              className="markdown-content px-4 sm:px-6 py-5 max-h-[560px] overflow-auto"
              dangerouslySetInnerHTML={{ __html: marked.parse(originalContent) as string }}
            />
          </div>
        ) : (
          /* ── Editor ────────────────────────────────────────────────────── */
          <div className="space-y-4">
            {/* Input method — segmented selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex p-1 rounded-xl bg-secondary border border-border/40">
                {([
                  { m: "write", label: "Write", icon: Pencil },
                  { m: "uploadMd", label: "Upload .md", icon: FileType },
                  { m: "uploadPdf", label: "Import PDF", icon: FileUp },
                ] as { m: Mode; label: string; icon: typeof Pencil }[]).map(({ m, label, icon: Icon }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      mode === m
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Upload dropzones */}
            {mode === "uploadMd" && (
              <Label
                htmlFor="md-upload"
                className="cursor-pointer flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border/70 rounded-2xl p-8 bg-secondary hover:bg-secondary hover:border-primary/40 transition-colors"
              >
                <FileType className="w-8 h-8 text-muted-foreground/70" />
                <span className="text-sm font-medium">Click to upload a .md file</span>
                <span className="text-xs text-muted-foreground">Markdown or plain text · max 2MB</span>
                <Input id="md-upload" type="file" accept=".md,text/markdown,text/plain" onChange={handleMdUpload} className="hidden" />
              </Label>
            )}

            {mode === "uploadPdf" && (
              <div className="border-2 border-dashed border-border/70 rounded-2xl p-8 bg-secondary">
                <Label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                  <FileUp className="w-8 h-8 text-muted-foreground/70" />
                  <span className="text-sm font-medium">Click to import a PDF</span>
                  <span className="text-xs text-muted-foreground text-center">
                    Text is extracted to markdown. The PDF itself is discarded · max 20MB
                  </span>
                  <Input id="pdf-upload" type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" disabled={extracting} />
                </Label>
                {extracting && (
                  <div className="mt-4 space-y-2">
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-center text-muted-foreground">Extracting text…</p>
                  </div>
                )}
              </div>
            )}

            {/* WYSIWYG editor surface (markdown under the hood) */}
            {mode === "write" && (
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder={"Write your position paper… use the toolbar or Ctrl+B / Ctrl+I / Ctrl+U"}
                minHeightClass="min-h-[360px]"
                ai={{
                  surface: "position-paper",
                  context: {
                    committee: application.assignedCommittee || application.choices?.primary?.committee || "",
                    country: application.assignedCountry || "",
                  },
                }}
              />
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center gap-3 pt-1">
              <p className="text-xs text-muted-foreground flex-1">
                {content.length.toLocaleString()} chars · {wordCount(content)} words
              </p>
              {hasSubmitted && (
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={cancelEdit} disabled={saving}>
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving || !content.trim()} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                {hasSubmitted ? "Update Paper" : "Submit Paper"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
