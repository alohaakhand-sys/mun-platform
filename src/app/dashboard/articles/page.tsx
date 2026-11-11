"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { getAllArticles, deleteArticle, ArticleData } from "@/lib/services/articleService";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  FileText, PenLine, Trash2, Edit, Globe, FileStack, Eye, Clock, Newspaper,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type TabId = "published" | "drafts";

const CATEGORY_META: Record<string, { text: string; bg: string; border: string; grad: string }> = {
  Guide: { text: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", grad: "from-blue-500/25 to-blue-600/10" },
  Analysis: { text: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", grad: "from-purple-500/25 to-fuchsia-600/10" },
  Tips: { text: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", grad: "from-emerald-500/25 to-teal-600/10" },
  News: { text: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", grad: "from-orange-500/25 to-amber-600/10" },
};

const readingTime = (content: string) => {
  const words = (content || "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

export default function ArticlesPage() {
  const { user } = useAuth();
  const [articles, setArticles] = useState<ArticleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("published");
  const [deleteTarget, setDeleteTarget] = useState<ArticleData | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const all = await getAllArticles(false, user.uid);
      setArticles(all);
      setLoading(false);
    })();
  }, [user]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteArticle(deleteTarget.id);
    setArticles((prev) => prev.filter((a) => a.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  };

  const published = articles.filter((a) => a.published);
  const drafts = articles.filter((a) => !a.published);

  const tabs: { id: TabId; label: string; icon: typeof Globe; count: number }[] = [
    { id: "published", label: "Published", icon: Globe, count: published.length },
    { id: "drafts", label: "Drafts", icon: FileStack, count: drafts.length },
  ];

  const ArticleCard = ({ article, index }: { article: ArticleData; index: number }) => {
    const cat = CATEGORY_META[article.category] || CATEGORY_META.Guide;
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.06 }}
        className="glass-card group flex flex-col rounded-2xl overflow-hidden hover:border-primary/30 transition-colors"
      >
        {/* Cover */}
        <div className="relative h-36 shrink-0 overflow-hidden">
          {article.coverImage ? (
            <img src={article.coverImage} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full grid place-items-center bg-[var(--h-placard)] text-[var(--h-placard-ink)]">
              <FileText className={`w-9 h-9 ${cat.text} opacity-60`} />
            </div>
          )}
          <span className={`absolute top-3 left-3 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${cat.bg} ${cat.text} border ${cat.border}`}>
            {article.category}
          </span>
          {!article.published && (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-background text-muted-foreground border border-border/50">
              <FileStack className="w-3 h-3" /> Draft
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-col flex-1 p-5">
          <h3 className="font-bold tracking-tight line-clamp-2 group-hover:text-primary transition-colors">
            {article.title || "Untitled"}
          </h3>
          {article.excerpt && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2 flex-1">{article.excerpt}</p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-4">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {readingTime(article.content)} min</span>
            {article.createdAt?.toDate && (
              <span>· {formatDistanceToNow(article.createdAt.toDate(), { addSuffix: true })}</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 bg-transparent border-border/60"
              render={<Link href={`/dashboard/articles/${article.id}/edit`} />}
              nativeButton={false}
            >
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              render={<Link href={`/blogs/${article.id}`} />}
              nativeButton={false}
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteTarget(article)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  };

  const EmptyState = ({ type }: { type: TabId }) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="col-span-full flex flex-col items-center justify-center py-16 text-center glass-card rounded-2xl border-dashed"
    >
      <div className="grid place-items-center w-14 h-14 rounded-2xl bg-secondary text-muted-foreground mb-4">
        {type === "published" ? <Globe className="w-7 h-7" /> : <FileStack className="w-7 h-7" />}
      </div>
      <p className="text-lg font-semibold mb-1">No {type === "published" ? "published blogs" : "drafts"} yet</p>
      <p className="text-sm text-muted-foreground max-w-xs mb-5">
        {type === "published"
          ? "Share your Model UN expertise with the community."
          : "Blogs you're still working on will appear here."}
      </p>
      <Button className="gap-2 rounded-xl" render={<Link href="/dashboard/articles/new" />} nativeButton={false}>
        <PenLine className="w-4 h-4" /> Write your first blog
      </Button>
    </motion.div>
  );

  const list = activeTab === "published" ? published : drafts;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="grid place-items-center w-11 h-11 rounded-sm border border-border bg-secondary text-foreground shrink-0">
            <Newspaper className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">My Blogs</span></h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {articles.length} blog{articles.length !== 1 ? "s" : ""} · {published.length} published
            </p>
          </div>
        </div>
        <Button
          className="gap-2 rounded-xl shadow-sm shrink-0"
          render={<Link href="/dashboard/articles/new" />}
          nativeButton={false}
        >
          <PenLine className="w-4 h-4" /> Write New Blog
        </Button>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* Segmented tabs */}
          <div className="inline-flex items-center gap-1 p-1.5 rounded-2xl glass-card">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="relative px-4 sm:px-5 py-2 rounded-xl text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {active && (
                    <motion.div
                      layoutId="articleTabPill"
                      className="absolute inset-0 rounded-xl bg-primary shadow-sm"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className={`relative z-10 flex items-center gap-2 ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    <span className={`grid place-items-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {tab.count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Grid */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
            >
              {list.length === 0
                ? <EmptyState type={activeTab} />
                : list.map((a, i) => <ArticleCard key={a.id} article={a} index={i} />)}
            </motion.div>
          </AnimatePresence>
        </>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Blog</DialogTitle>
            <DialogDescription>
              "{deleteTarget?.title}" will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
