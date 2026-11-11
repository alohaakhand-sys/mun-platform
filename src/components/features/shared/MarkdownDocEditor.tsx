"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, FileType, FileUp, AlertTriangle } from "lucide-react";
import { pdfToMarkdown } from "@/lib/utils/pdfToMarkdown";
import { RichTextEditor, type EditorAiConfig } from "@/components/features/shared/RichTextEditor";
import { cn } from "@/lib/utils";

type Mode = "write" | "uploadMd" | "uploadPdf";

// Shared document authoring surface — Word-style WYSIWYG (RichTextEditor) plus
// upload .md / import-PDF (text extracted, file discarded). Everything is markdown
// under the hood, so position papers, study guides and committee documents all
// author the same way and render identically downstream.
export function MarkdownDocEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = "min-h-[320px]",
  ai,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  /** Passed through to RichTextEditor — enables the AI menu + selection bubble. */
  ai?: EditorAiConfig;
}) {
  const [mode, setMode] = useState<Mode>("write");
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
    onChange(await file.text());
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
      onChange(md);
      setProgress(100);
      setMode("write");
    } catch (err: any) {
      setError("Failed to extract PDF text: " + (err?.message || "unknown"));
    } finally {
      setExtracting(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  return (
    <div className="space-y-4">
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
                mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "uploadMd" && (
        <Label
          htmlFor="mde-md-upload"
          className="cursor-pointer flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border/70 rounded-2xl p-8 bg-secondary hover:bg-secondary hover:border-primary/40 transition-colors"
        >
          <FileType className="w-8 h-8 text-muted-foreground/70" />
          <span className="text-sm font-medium">Click to upload a .md file</span>
          <span className="text-xs text-muted-foreground">Markdown or plain text · max 2MB</span>
          <Input id="mde-md-upload" type="file" accept=".md,text/markdown,text/plain" onChange={handleMdUpload} className="hidden" />
        </Label>
      )}

      {mode === "uploadPdf" && (
        <div className="border-2 border-dashed border-border/70 rounded-2xl p-8 bg-secondary">
          <Label htmlFor="mde-pdf-upload" className="cursor-pointer flex flex-col items-center justify-center gap-2">
            <FileUp className="w-8 h-8 text-muted-foreground/70" />
            <span className="text-sm font-medium">Click to import a PDF</span>
            <span className="text-xs text-muted-foreground text-center">
              Text is extracted to markdown. The PDF itself is discarded · max 20MB
            </span>
            <Input id="mde-pdf-upload" type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" disabled={extracting} />
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

      {mode === "write" && (
        <RichTextEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder || "Write your document…"}
          minHeightClass={minHeightClass}
          ai={ai}
        />
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
    </div>
  );
}
