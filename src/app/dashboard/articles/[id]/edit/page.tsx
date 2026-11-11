"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { getArticleById, ArticleData } from "@/lib/services/articleService";
import { ArticleEditor } from "@/components/features/articles/ArticleEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function EditArticlePage() {
  const params = useParams();
  const id = params?.id as string;
  const { user, profile } = useAuth();
  const router = useRouter();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      const data = await getArticleById(id);
      if (!data) { router.replace("/dashboard/articles"); return; }
      const isAdmin = (profile as any)?.isAdmin || (profile as any)?.role === "admin";
      if (data.authorId !== user.uid && !isAdmin) {
        setAuthError(true);
        setLoading(false);
        return;
      }
      setArticle(data);
      setLoading(false);
    })();
  }, [user, id, profile, router]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px] rounded-2xl" />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="max-w-5xl mx-auto py-20 text-center space-y-4">
        <p className="text-lg font-medium">Not authorized to edit this blog.</p>
        <Link href="/dashboard/articles">
          <Button>Back to My Blogs</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Link href="/dashboard/articles">
          <Button variant="ghost" size="sm" className="gap-2 mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4" /> Back to My Blogs
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Edit Blog</h1>
        <p className="text-muted-foreground mt-1">{article?.title}</p>
      </motion.div>
      {article && (
        <ArticleEditor
          initialArticle={article}
          onSaved={() => router.push("/dashboard/articles")}
        />
      )}
    </div>
  );
}
