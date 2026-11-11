"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { marked } from "marked";
import { useAuth } from "@/contexts/AuthContext";
import {
  getArticleById,
  getArticleComments,
  addComment,
  ArticleData,
  CommentData,
} from "@/lib/services/articleService";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import { initials, readingTime } from "@/components/public/cardFormat";

export default function BlogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const articleId = params.articleId as string;
  const { user, profile } = useAuth();

  const [article, setArticle] = useState<ArticleData | null>(null);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const [art, comms] = await Promise.all([
        getArticleById(articleId),
        getArticleComments(articleId),
      ]);
      setArticle(art);
      setComments(comms);
      setLoading(false);
    }
    load();
  }, [articleId]);

  async function handleComment() {
    if (!user || !commentText.trim()) return;
    setSubmitting(true);
    const newComment: Omit<CommentData, "id" | "createdAt"> = {
      articleId,
      authorId: user.uid,
      authorName: profile?.displayName || user.displayName || "Anonymous",
      authorPhotoURL: user.photoURL || undefined,
      text: commentText.trim(),
    };
    const id = await addComment(articleId, newComment);
    setComments((prev) => [...prev, { ...newComment, id, createdAt: undefined }]);
    setCommentText("");
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="mun-paper mp-page-end">
        <div className="mp-shell-narrow">
          <div style={{ paddingTop: 44 }}>
            <div className="mp-skel" style={{ height: 14, width: 120 }} />
            <div className="mp-skel" style={{ height: 40, width: "88%", marginTop: 20 }} />
            <div className="mp-skel" style={{ height: 40, width: "62%", marginTop: 10 }} />
            <div className="mp-skel" style={{ height: 58, width: "100%", marginTop: 26 }} />
            <div className="mp-skel" style={{ height: 300, width: "100%", marginTop: 24 }} />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="mp-skel" style={{ height: 14, width: i === 4 ? "55%" : "100%", marginTop: 12 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="mun-paper mp-page-end">
        <div className="mp-shell-narrow mp-notfound">
          <p className="mp-eyebrow">Not found</p>
          <h1>This article isn&apos;t here</h1>
          <p>It may have been deleted, or the link is wrong.</p>
          <Link className="mp-btn mp-btn-line" href="/blogs">
            Back to the handbook
          </Link>
        </div>
      </div>
    );
  }

  // Parse markdown synchronously; fall back to the raw body if it won't parse.
  let parsedContent = "";
  try {
    parsedContent = marked.parse(article.content) as string;
  } catch {
    parsedContent = article.content;
  }

  const subject = article.tags?.[0] || article.category;

  return (
    <div className="mun-paper mp-page-end">
      <div className="mp-shell-narrow">
        <button type="button" className="mp-back" onClick={() => router.back()}>
          ← Back to the handbook
        </button>

        <article>
          <header className="mp-article-head">
            <div className="mp-tags">
              <span className="mp-pill mp-pill-seal">{article.category}</span>
              {article.tags?.map((tag) => (
                <span key={tag} className="mp-tag">
                  #{tag}
                </span>
              ))}
            </div>

            <h1>{article.title}</h1>

            <div className="mp-article-byline">
              <span className="mp-byline">
                <span className="mp-avatar" aria-hidden="true">
                  {initials(article.authorName)}
                </span>
                <span className="mp-byline-text">
                  <strong>{article.authorName}</strong>
                  Author
                </span>
              </span>
              <span>
                {article.createdAt
                  ? format(article.createdAt.toDate(), "MMMM d, yyyy")
                  : "Draft"}
                {" · "}
                {readingTime(article.content)}
              </span>
            </div>
          </header>

          <div className="mp-article-cover">
            {article.coverImage ? (
              <img src={article.coverImage} alt="" />
            ) : (
              <span>{subject}</span>
            )}
          </div>

          <div
            className="markdown-content"
            style={{ marginTop: 28 }}
            dangerouslySetInnerHTML={{ __html: parsedContent }}
          />
        </article>

        {/* ======== Comments ======== */}
        <section className="mp-comments">
          <div className="mp-block-head">
            <h2 className="mp-block-title">Discussion</h2>
            <span>
              {comments.length} comment{comments.length === 1 ? "" : "s"}
            </span>
          </div>

          {user ? (
            <div style={{ display: "grid", gap: 10, marginBottom: 8 }}>
              <textarea
                className="mp-textarea"
                placeholder="Join the discussion…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={3}
              />
              <AiTextareaAssist
                value={commentText}
                onPick={setCommentText}
                surface="blog-comment"
                context={{ title: article.title }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="mp-btn mp-btn-solid"
                  onClick={handleComment}
                  disabled={submitting || !commentText.trim()}
                >
                  {submitting ? "Posting…" : "Post comment"}
                </button>
              </div>
            </div>
          ) : (
            <p className="mp-empty">
              <Link className="mp-see-all" href="/login">
                Log in
              </Link>{" "}
              to write a comment.
            </p>
          )}

          {comments.length === 0 ? (
            <p className="mp-empty" style={{ marginTop: 16 }}>
              No comments yet. Be the first.
            </p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {comments.map((comment) => (
                <div className="mp-comment" key={comment.id}>
                  <span className="mp-avatar" aria-hidden="true">
                    {initials(comment.authorName)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mp-comment-head">
                      <strong>{comment.authorName}</strong>
                      <time>
                        {comment.createdAt
                          ? format(comment.createdAt.toDate(), "MMM d, yyyy")
                          : "just now"}
                      </time>
                    </div>
                    <p>{comment.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
