"use client";

import { useEffect, useState } from "react";
import { getAllArticles, ArticleData } from "@/lib/services/articleService";
import { Masthead } from "@/components/public/Masthead";
import { PostCard, PostCardSkeleton } from "@/components/public/PostCard";

const CATEGORIES = ["All", "Guide", "Analysis", "Tips", "News"] as const;
type Category = (typeof CATEGORIES)[number];

export default function BlogsPage() {
  const [articles, setArticles] = useState<ArticleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category>("All");

  useEffect(() => {
    getAllArticles().then((data) => {
      setArticles(data);
      setLoading(false);
    });
  }, []);

  const filtered =
    filter === "All" ? articles : articles.filter((a) => a.category === filter);

  return (
    <div className="mun-paper mp-page-end">
      <div className="mp-shell">
        <Masthead
          eyebrow="Delegate handbook"
          title="Guides and study material"
          lede="Preparation written by chairs and secretaries-general — procedure, position papers, research and the things nobody tells a first-timer."
          tally={
            loading ? undefined : `${filtered.length} article${filtered.length === 1 ? "" : "s"}`
          }
        />

        <div className="mp-filters" role="group" aria-label="Filter by category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className="mp-chip"
              aria-pressed={filter === cat}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mp-grid-posts">
            {[0, 1, 2].map((i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mp-empty mp-empty-lg">
            <h3>No articles found</h3>
            <p>
              {filter === "All"
                ? "The handbook is still being written. Check back soon."
                : `Nothing filed under “${filter}” yet. Try another category.`}
            </p>
          </div>
        ) : (
          <div className="mp-grid-posts">
            {filtered.map((article) => (
              <PostCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
