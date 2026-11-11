"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, Loader2, UploadCloud, Pencil, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MarkdownDocEditor } from "@/components/features/shared/MarkdownDocEditor";
import { getRulesGuide, saveRulesGuide, RulesGuide } from "@/lib/services/optionalModulesService";

// Organizer-side authoring for the event-wide Rules & Regulations guide. One guide per
// event, shown to every role in the Documents hub. Markdown under the hood via the shared
// WYSIWYG editor; persisted to settings/rulesRegulations (org/co-org write per rules).
export function RulesGuideEditor({
  eventId,
  editorUid,
}: {
  eventId: string;
  editorUid: string;
}) {
  const [guide, setGuide] = useState<RulesGuide | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRulesGuide(eventId).then((g) => {
      setGuide(g);
      setContent(g?.content || "");
      setEditing(!g);
    });
  }, [eventId]);

  const handleSave = async () => {
    if (!content.trim()) return setError("Rules & Regulations guide is empty.");
    setSaving(true);
    setError(null);
    const data: RulesGuide = {
      content,
      updatedAt: new Date(),
      updatedBy: editorUid,
    };
    const res = await saveRulesGuide(eventId, data);
    if (!res.success) {
      setError("Save failed: " + (res.error?.message || res.error?.code || "permission or network error"));
      setSaving(false);
      return;
    }
    setGuide(data);
    setEditing(false);
    setSaving(false);
  };

  if (guide === undefined) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center gap-3 text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm">Loading rules & regulations…</span>
        </CardContent>
      </Card>
    );
  }

  const updated = guide?.updatedAt?.toDate?.() || (guide?.updatedAt instanceof Date ? guide.updatedAt : null);

  return (
    <Card className="glass-card border-border/50 overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2.5 text-lg">
              <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <ScrollText className="w-5 h-5 text-primary" />
              </span>
              Rules & Regulations
            </CardTitle>
            <CardDescription>The conference rulebook — visible to every role (chairs, delegates, and staff).</CardDescription>
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
              Rules & Regulations guide
              {updated ? ` · updated ${formatDistanceToNow(updated, { addSuffix: true })}` : ""}
            </p>
          </div>
        ) : (
          <>
            <MarkdownDocEditor
              value={content}
              onChange={setContent}
              placeholder={"# Rules & Regulations\n\n## Code of Conduct\n\n## Rules of Procedure\n\n## Awards & Recognition\n\n## Disciplinary Policy"}
              ai={{ surface: "rules-guide" }}
            />
            <div className="flex items-center gap-3 pt-1">
              {guide && (
                <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => { setEditing(false); setContent(guide.content || ""); setError(null); }} disabled={saving}>
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving || !content.trim()} className={guide ? "gap-2" : "ml-auto gap-2"}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                {guide ? "Update Rules" : "Publish Rules"}
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
