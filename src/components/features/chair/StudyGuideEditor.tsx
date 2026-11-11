"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, Loader2, UploadCloud, Pencil, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MarkdownDocEditor } from "@/components/features/shared/MarkdownDocEditor";
import { getStudyGuide, StudyGuide } from "@/lib/services/optionalModulesService";
import { publishStudyGuide } from "@/lib/services/studyGuidePublish";

// Chair-side study guide authoring, surfaced in the central Documents hub. Publishing
// goes through the shared publishStudyGuide so it fans out exactly like the committee
// hub's Study Guide tab — delegate emails AND the in-app room alert. (It used to send
// only the alert, so which screen the chair published from silently changed who heard
// about it.) The roster isn't loaded here, so the helper resolves it.
export function StudyGuideEditor({
  eventId,
  committee,
  chairUid,
  chairName,
}: {
  eventId: string;
  committee: string;
  chairUid: string;
  /** Shown as the sender in the delegate notification email. */
  chairName?: string;
}) {
  const [guide, setGuide] = useState<StudyGuide | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No committee → render returns the notice below before `guide` is read.
    if (!committee) return;
    getStudyGuide(eventId, committee).then((g) => {
      setGuide(g);
      setContent(g?.content || "");
      setFileName(g?.fileName || "");
      setEditing(!g);
    });
  }, [eventId, committee]);

  const handleSave = async () => {
    if (!content.trim()) return setError("Study guide is empty.");
    setSaving(true);
    setError(null);
    const data: StudyGuide = {
      content,
      fileName: fileName || `${committee}-study-guide.md`,
      format: "markdown",
      uploadedAt: new Date(),
      uploadedBy: chairUid,
    };
    const res = await publishStudyGuide({
      eventId,
      committee,
      data,
      isUpdate: !!guide,
      chairUid,
      chairName,
    });
    if (!res.success) {
      setError("Save failed: " + (res.error?.message || res.error?.code || "permission or network error"));
      setSaving(false);
      return;
    }
    setGuide(data);
    setEditing(false);
    setSaving(false);
  };

  if (!committee) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No committee in scope — assign yourself a committee to publish a study guide.
        </CardContent>
      </Card>
    );
  }

  if (guide === undefined) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center gap-3 text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm">Loading study guide…</span>
        </CardContent>
      </Card>
    );
  }

  const uploadDate = guide?.uploadedAt?.toDate?.() || (guide?.uploadedAt instanceof Date ? guide.uploadedAt : null);

  return (
    <Card className="glass-card border-border/50 overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2.5 text-lg">
              <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary" />
              </span>
              Study Guide
            </CardTitle>
            <CardDescription>Publish the background guide for your committee.</CardDescription>
          </div>
          {!editing && (
            <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setEditing(true)}>
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-4">
        {!editing && guide ? (
          <div className="rounded-2xl border border-border/50 px-4 py-4 bg-secondary">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Published
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {guide.fileName || `${committee} Study Guide`}
              {uploadDate ? ` · updated ${formatDistanceToNow(uploadDate, { addSuffix: true })}` : ""}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>File name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={`${committee}-study-guide.md`} />
            </div>
            <MarkdownDocEditor
              value={content}
              onChange={setContent}
              placeholder={"# Study Guide\n\n## Topic\n\n## Background\n\n## Questions a Resolution Must Answer"}
              ai={{ surface: "study-guide", context: { committee } }}
            />
            <div className="flex items-center gap-3 pt-1">
              {guide && (
                <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => { setEditing(false); setContent(guide.content || ""); setError(null); }} disabled={saving}>
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving || !content.trim()} className={guide ? "gap-2" : "ml-auto gap-2"}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                {guide ? "Update Guide" : "Publish Guide"}
              </Button>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
