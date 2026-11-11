"use client";

import { useState } from "react";
import { ArticleData, createArticle, updateArticle } from "@/lib/services/articleService";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertCircle, Loader2, Save, Globe } from "lucide-react";
import { ImageUploader } from "@/components/ui/ImageUploader";
import { RichTextEditor } from "@/components/features/shared/RichTextEditor";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import { motion, AnimatePresence } from "framer-motion";

interface ArticleEditorProps {
  initialArticle?: ArticleData;
  onSaved: (id: string) => void;
}

export function ArticleEditor({ initialArticle, onSaved }: ArticleEditorProps) {
  const { user, profile } = useAuth();
  const [title, setTitle] = useState(initialArticle?.title || "");
  const [category, setCategory] = useState<ArticleData["category"]>(initialArticle?.category || "Guide");
  const [tagsInput, setTagsInput] = useState(initialArticle?.tags?.join(", ") || "");
  const [coverImage, setCoverImage] = useState(initialArticle?.coverImage || "");
  const [excerpt, setExcerpt] = useState(initialArticle?.excerpt || "");
  const [content, setContent] = useState(initialArticle?.content || "");
  const [saving, setSaving] = useState<"idle" | "draft" | "publish">("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const buildPayload = (published: boolean): Omit<ArticleData, "id" | "createdAt" | "updatedAt"> => ({
    title: title.trim(),
    content,
    excerpt: excerpt.slice(0, 200),
    authorId: user!.uid,
    authorName: profile?.displayName || user?.displayName || user?.email || "Anonymous",
    category,
    tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    coverImage: coverImage.trim() || undefined,
    published,
  });

  const handleSave = async (published: boolean) => {
    if (!user) return;
    if (!title.trim()) { setError("Title is required."); return; }
    if (!content.trim()) { setError("Content cannot be empty."); return; }
    setError("");
    setSaving(published ? "publish" : "draft");
    try {
      let id: string;
      if (initialArticle?.id) {
        await updateArticle(initialArticle.id, { ...buildPayload(published) });
        id = initialArticle.id;
      } else {
        id = await createArticle(buildPayload(published));
      }
      setSuccess(true);
      setTimeout(() => onSaved(id), 800);
    } catch (e) {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving("idle");
    }
  };

  const tagsArray = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" /> 
            Saved successfully! Redirecting back...
          </motion.div>
        )}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium shadow-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0" /> 
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Title & Content Canvas (col-span-2) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border/50 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm relative overflow-hidden">
            {/* Decorative ambient background glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

            {/* Title field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Blog Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a compelling title..."
                className="w-full text-3xl font-extrabold tracking-tight bg-transparent border-0 border-b border-border/40 hover:border-border/80 focus:border-primary focus:ring-0 focus:outline-none pb-3 px-0 transition-all placeholder:text-muted-foreground/30 text-foreground"
              />
            </div>

            {/* Excerpt Summary */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Excerpt / Summary</label>
                <span className={`text-[11px] font-semibold ${excerpt.length > 180 ? "text-amber-500" : "text-muted-foreground/50"}`}>
                  {excerpt.length}/200
                </span>
              </div>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value.slice(0, 200))}
                placeholder="Provide a short summary that will catch readers' attention on listing pages..."
                rows={2}
                className="w-full bg-secondary border border-border/60 hover:border-border focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl py-3 px-4 text-sm focus:outline-none transition-all resize-none text-foreground placeholder:text-muted-foreground/55"
              />
              <AiTextareaAssist
                value={excerpt}
                onPick={(t) => setExcerpt(t.slice(0, 200))}
                surface="blog-excerpt"
                context={{ title }}
              />
            </div>

            {/* Editor Canvas — Word-style WYSIWYG, markdown under the hood */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Content</label>
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="Start writing your blog… use the toolbar or Ctrl+B / Ctrl+I / Ctrl+U"
                minHeightClass="min-h-[500px]"
                ai={{ surface: "blog-article", context: { title } }}
              />

              {/* Statistics Footer */}
              <div className="flex justify-between items-center text-xs text-muted-foreground/50 px-1 pt-1 font-medium">
                <span>{content.split(/\s+/).filter(Boolean).length} words</span>
                <span>{content.length} characters</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Settings Panel (col-span-1) */}
        <div className="space-y-6 lg:sticky lg:top-8">
          <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-6 shadow-sm relative overflow-hidden">
            {/* Decorative background glow */}
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 border-b border-border/45 pb-3">Blog Settings</h3>

            {/* Cover Image Upload (imgBB integration) */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Cover Image</label>
              <ImageUploader value={coverImage} onChange={setCoverImage} />
            </div>

            {/* Category Select */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as ArticleData["category"])}>
                <SelectTrigger className="w-full bg-secondary border-border/60 hover:bg-secondary transition-colors focus:ring-primary/20">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Guide">Guide</SelectItem>
                  <SelectItem value="Analysis">Analysis</SelectItem>
                  <SelectItem value="Tips">Tips</SelectItem>
                  <SelectItem value="News">News</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Tags</label>
                <span className="text-[10px] text-muted-foreground/50 font-medium">(comma separated)</span>
              </div>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. UNSC, diplomacy, guide"
                className="w-full bg-secondary border-border/60 focus:ring-primary/20"
              />
              {tagsArray.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 bg-secondary p-2.5 rounded-xl border border-border/20">
                  {tagsArray.map((tag, idx) => (
                    <span 
                      key={idx} 
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/25 shadow-sm"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Actions Panel */}
            <div className="pt-5 border-t border-border/40 space-y-3">
              <Button
                type="button"
                className="w-full gap-2 text-sm h-11 bg-primary hover:bg-primary/95 text-primary-foreground font-bold shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                onClick={() => handleSave(true)}
                disabled={saving !== "idle"}
              >
                {saving === "publish" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                Publish Blog
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 text-sm h-11 border-border/60 hover:bg-secondary font-bold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                onClick={() => handleSave(false)}
                disabled={saving !== "idle"}
              >
                {saving === "draft" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save as Draft
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
