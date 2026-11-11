"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ArticleData } from "@/lib/services/articleService";
import { initials, readingTime } from "./cardFormat";

/**
 * A handbook entry in the /blogs index — vertical, with an excerpt. The homepage uses
 * the split `ArticleCard` instead: that strip shows six titles at a glance, this grid
 * is where someone is actually choosing what to read, so it pays for the summary.
 */
export function PostCard({ article }: { article: ArticleData }) {
  const subject = article.tags?.[0] || article.category;
  const excerpt = article.excerpt || article.content.slice(0, 220);

  return (
    <Link className="mp-card" href={`/blogs/${article.id}`}>
      <div className="mp-placard">
        <span className="mp-stamp">{article.category}</span>
        {article.coverImage ? (
          <img src={article.coverImage} alt="" />
        ) : (
          <span>{subject}</span>
        )}
      </div>

      <div className="mp-card-body has-foot">
        <p className="mp-card-date">
          {article.createdAt ? format(article.createdAt.toDate(), "MMM d, yyyy") : "Draft"}
        </p>
        <h3 className="mp-card-title mp-clamp2">{article.title}</h3>
        <p className="mp-card-excerpt">{excerpt}</p>

        <div className="mp-card-foot">
          <span className="mp-byline">
            <span className="mp-avatar" aria-hidden="true">
              {initials(article.authorName)}
            </span>
            <span className="mp-byline-text">
              <strong>{article.authorName}</strong>
              {readingTime(article.content)}
            </span>
          </span>
          <span className="mp-card-action">Read →</span>
        </div>
      </div>
    </Link>
  );
}

/** Placeholder card held while the articles query is in flight. */
export function PostCardSkeleton() {
  return (
    <div className="mp-card" aria-hidden="true">
      <div className="mp-placard" />
      <div className="mp-card-body has-foot">
        <div className="mp-skel" style={{ height: 12, width: "40%" }} />
        <div className="mp-skel" style={{ height: 17, width: "90%", marginTop: 6 }} />
        <div className="mp-skel" style={{ height: 13, width: "100%", marginTop: 10 }} />
        <div className="mp-skel" style={{ height: 13, width: "75%", marginTop: 6 }} />
        <div className="mp-card-foot">
          <span className="mp-skel" style={{ height: 30, width: 30, borderRadius: "50%" }} />
          <span className="mp-skel" style={{ height: 14, flex: 1 }} />
        </div>
      </div>
    </div>
  );
}
