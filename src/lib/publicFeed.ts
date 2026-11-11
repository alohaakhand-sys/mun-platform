/**
 * Shared read of the public "feed" — published events + published articles — for the
 * homepage and the mega footer, so the footer's two lists cost nothing extra.
 *
 * Spark plan budget (50k reads/day): the footer renders on EVERY public page, so it must
 * not query per page view.
 *   - In-tab memo: one in-flight/settled promise per 10 minutes, shared by the homepage
 *     and the footer — client-side navigation never re-reads.
 *   - sessionStorage: the footer keeps only a tiny derived summary (plain JSON, no
 *     Firestore objects), so a hard reload of any public page reuses it too.
 * Same caps as the homepage always had; no new queries, no new indexes.
 */

import { getPublishedEvents, getEventStartMs, type EventData } from "@/lib/services/eventService";
import { getAllArticles, type ArticleData } from "@/lib/services/articleService";
import { formatFromPrice, locationLabel, readingTime } from "@/components/public/cardFormat";

/** Homepage caps — see the CEILING note in src/app/page.tsx. */
export const EVENT_READ_CAP = 40;
export const ARTICLE_READ_CAP = 6;

const TTL_MS = 10 * 60 * 1000;
const STORAGE_KEY = "mp-footer-feed-v1";

type Feed = { events: EventData[]; articles: ArticleData[] };

let memo: { at: number; promise: Promise<Feed> } | null = null;

export function loadPublicFeed(): Promise<Feed> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.promise;
  const promise = Promise.all([
    getPublishedEvents(EVENT_READ_CAP),
    getAllArticles(true, undefined, ARTICLE_READ_CAP),
  ]).then(([events, articles]) => ({ events, articles }));
  memo = { at: Date.now(), promise };
  // A failed read must not be cached for 10 minutes.
  promise.catch(() => {
    memo = null;
  });
  return promise;
}

export type FooterEvent = { id: string; title: string; startMs: number | null; place: string; price: string | null };
export type FooterArticle = { id: string; title: string; category: string; readTime: string };
export type FooterFeed = { events: FooterEvent[]; articles: FooterArticle[] };

/** Two soonest upcoming conferences + two newest handbook articles. */
export function summarizeForFooter(feed: Feed): FooterFeed {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const events = feed.events
    .map((e) => ({ e, ms: getEventStartMs(e) }))
    .filter(({ ms }) => Number.isFinite(ms) && ms >= startOfToday)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, 2)
    .map(({ e, ms }) => ({
      id: e.id,
      title: e.title,
      startMs: ms,
      place: locationLabel(e),
      price: formatFromPrice(e),
    }));
  const articles = feed.articles.slice(0, 2).map((a) => ({
    id: a.id,
    title: a.title,
    category: a.category,
    readTime: readingTime(a.content),
  }));
  return { events, articles };
}

function readStored(): FooterFeed | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; feed: FooterFeed };
    if (!parsed?.feed || Date.now() - parsed.at > TTL_MS) return null;
    return parsed.feed;
  } catch {
    return null;
  }
}

export async function getFooterFeed(): Promise<FooterFeed> {
  const stored = readStored();
  if (stored) return stored;
  const feed = summarizeForFooter(await loadPublicFeed());
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), feed }));
  } catch {
    // Private mode / storage full: the in-tab memo still prevents repeat reads.
  }
  return feed;
}
