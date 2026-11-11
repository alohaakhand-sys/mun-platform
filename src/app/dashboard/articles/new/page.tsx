"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArticleEditor } from "@/components/features/articles/ArticleEditor";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NewArticlePage() {
  const router = useRouter();
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Link href="/dashboard/articles">
          <Button variant="ghost" size="sm" className="gap-2 mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4" /> Back to My Blogs
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">New Blog</h1>
        <p className="text-muted-foreground mt-1">Write and publish on Model UN topics.</p>
      </motion.div>
      <ArticleEditor onSaved={() => router.push("/dashboard/articles")} />
    </div>
  );
}
