"use client";

import Link from "next/link";
import { ArticleData } from "@/lib/services/articleService";
import { initials, readingTime } from "./cardFormat";
import { avatarGradient } from "@/lib/avatarColor";

/**
 * A handbook entry — text left, subject placard right, split 50/50. The placard word
 * is the article's first tag (what it is actually about) and only falls back to the
 * broad category when the author left tags empty.
 */
export function ArticleCard({ article }: { article: ArticleData }) {
  const subject = article.tags?.[0] || article.category;

  return (
    <Link className="mp-card mp-article mp-lift" href={`/blogs/${article.id}`}>
      <div className="mp-placard">
        {article.coverImage ? (
          <img src={article.coverImage} alt="" />
        ) : (
          <span>{subject}</span>
        )}
      </div>
      <div className="mp-card-body">
        <span className="mp-pill mp-pill-mute mp-article-tag">{subject}</span>
        <h3 className="mp-card-title mp-lift-title">{article.title}</h3>
        <div className="mp-byline">
          <span
            className="mp-avatar"
            aria-hidden="true"
            style={{ background: avatarGradient(article.authorId || article.authorName) }}
          >
            {initials(article.authorName)}
          </span>
          <span className="mp-byline-text">
            <strong>{article.authorName}</strong>
            {readingTime(article.content)}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Placeholder card held while the articles query is in flight. */
export function ArticleCardSkeleton() {
  return (
    <div className="mp-card mp-article" aria-hidden="true">
      <div className="mp-placard mp-skel" style={{ borderRadius: 0 }} />
      <div className="mp-card-body" style={{ gap: 10 }}>
        <div className="mp-skel" style={{ height: 18, width: "90%" }} />
        <div className="mp-skel" style={{ height: 18, width: "60%" }} />
        <div className="mp-byline">
          <span className="mp-skel" style={{ height: 28, width: 28, borderRadius: "50%", flex: "none" }} />
          <span className="mp-skel" style={{ height: 12, width: "40%" }} />
        </div>
      </div>
    </div>
  );
}
