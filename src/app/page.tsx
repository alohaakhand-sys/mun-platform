"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getEventStartMs, EventData } from "@/lib/services/eventService";
import { ArticleData } from "@/lib/services/articleService";
import { loadPublicFeed } from "@/lib/publicFeed";
import { HeroDeck, HeroSlide } from "@/components/public/HeroDeck";
import { EventCard, EventCardSkeleton } from "@/components/public/EventCard";
import { ArticleCard, ArticleCardSkeleton } from "@/components/public/ArticleCard";
import {
  closesLine,
  formatCardDate,
  formatFromPrice,
  formatSlideDate,
  locationLabel,
} from "@/components/public/cardFormat";
import { ArrowRight, CalendarDays, NotebookPen } from "lucide-react";

/**
 * How many documents the homepage is allowed to read. Firestore bills per document
 * returned and this is the busiest anonymous route on the platform, so the caps are
 * deliberately tight.
 *
 * CEILING WORTH KNOWING: the events query is an equality filter + limit with NO
 * `orderBy` (that would need a composite index), so ordering happens client-side on
 * the slice that comes back. Past roughly 40 published events the slice stops being
 * the whole picture and the six shown here could miss a sooner conference — at which
 * point this needs an `(status, date)` index, not a bigger number.
 */
// The caps (EVENT_READ_CAP = 40, ARTICLE_READ_CAP = 6) live in src/lib/publicFeed.ts,
// which this page shares with the footer so the footer lists cost no extra reads.

const EVENTS_SHOWN = 6;

/** The one slide that is always there, data or no data. */
const ORGANISER_SLIDE: HeroSlide = {
  kind: "For organisers",
  title: "Run your conference without the spreadsheets",
  copy: "Applications, allocations, payments, marking and certificates in one dashboard — plus a live committee floor your chairs actually want to use.",
  art: "organiser",
  actions: [{ label: "Start hosting", href: "/signup" }],
};

/** Trim a description to a slab-sized sentence without cutting a word in half. */
function trimCopy(text: string | undefined, max = 150): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, clean.lastIndexOf(" ", max)).trimEnd() + "…";
}

/** The slab sentence for an event: its own words when it has them, facts when it doesn't. */
function eventCopy(event: EventData): string {
  const own = trimCopy(event.description);
  if (own) return own;
  const committees = event.committees?.length || 0;
  const when = formatSlideDate(getEventStartMs(event));
  return [
    committees ? `${committees} committee${committees === 1 ? "" : "s"}` : null,
    locationLabel(event),
    when,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function Home() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [articles, setArticles] = useState<ArticleData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { events: ev, articles: ar } = await loadPublicFeed().catch(() => ({
        events: [] as EventData[],
        articles: [] as ArticleData[],
      }));
      if (!alive) return;
      setEvents(ev);
      setArticles(ar);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Upcoming conferences, soonest first — then the most recently concluded ones to
  // fill the row out. A homepage with an empty grid reads as a dead platform, and
  // until a conference season is fully booked the archive is the honest filler. An
  // event whose date won't parse is kept (it is still a published conference) and
  // sorted to the back of the upcoming group.
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const isUpcoming = (e: EventData) => {
    const ms = getEventStartMs(e);
    return !Number.isFinite(ms) || ms >= startOfToday;
  };

  const upcoming = events.filter(isUpcoming).sort((a, b) => {
    const x = getEventStartMs(a);
    const y = getEventStartMs(b);
    if (!Number.isFinite(x)) return 1;
    if (!Number.isFinite(y)) return -1;
    return x - y;
  });

  const past = events
    .filter((e) => !isUpcoming(e))
    .sort((a, b) => getEventStartMs(b) - getEventStartMs(a));

  const shownEvents = [...upcoming, ...past].slice(0, EVENTS_SHOWN);
  // "Recent conferences" only once loaded AND past events are what fill the grid (P08);
  // while loading, or with nothing at all, the section keeps its normal heading.
  const hasUpcoming = loading || upcoming.length > 0 || past.length === 0;

  // Conference, guide, conference, pitch — the same rhythm the reference deck uses.
  // The eyebrow and the buttons are derived from whether the conference has actually
  // happened yet, so a concluded event never gets a "Register now".
  const eventSlide = (event: EventData, featured: boolean): HeroSlide => {
    const open = isUpcoming(event);
    const start = getEventStartMs(event);
    const price = formatFromPrice(event);
    const closes = open ? closesLine(event) : null;
    return {
      kind: open ? (featured ? "Featured conference" : "Registration open") : "Recently concluded",
      title: event.title,
      copy: [eventCopy(event), closes].filter(Boolean).join(" "),
      facts: [
        Number.isFinite(start) ? formatCardDate(start) : null,
        locationLabel(event),
        price ? (price === "Free" ? "Free" : `From ${price}`) : null,
      ].filter((f): f is string => !!f),
      image: event.coverUrl,
      imageAlt: event.title,
      actions: open
        ? [
            { label: "Register now", href: `/events/${event.id}` },
            ...(featured
              ? [{ label: "See committees", href: `/events/${event.id}`, tone: "onslab" as const }]
              : []),
          ]
        : [{ label: "View conference", href: `/events/${event.id}` }],
    };
  };

  const slides: HeroSlide[] = [];
  if (shownEvents[0]) slides.push(eventSlide(shownEvents[0], true));
  if (articles[0]) {
    slides.push({
      kind: "From the handbook",
      title: articles[0].title,
      copy: trimCopy(articles[0].excerpt || articles[0].content),
      image: articles[0].coverImage,
      imageAlt: articles[0].title,
      actions: [{ label: "Read the guide", href: `/blogs/${articles[0].id}` }],
    });
  }
  if (shownEvents[1]) slides.push(eventSlide(shownEvents[1], false));
  slides.push(ORGANISER_SLIDE);

  return (
    <div className="mun-paper mp-page-end">
      <HeroDeck slides={slides} loading={loading} />

      {/* ======== Upcoming conferences (white band) ======== */}
      <section className="mp-band" id="conferences">
        <div className="mp-shell">
        <div className="mp-section-head">
          <div>
            <h2>{hasUpcoming ? "Upcoming conferences" : "Recent conferences"}</h2>
            <p>
              {hasUpcoming
                ? "Model UN opening its doors over the coming weeks."
                : "The last conferences to run on MUN Pilot."}
            </p>
          </div>
          <Link className="mp-see-all" href="/events">
            All conferences
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        {loading ? (
          <div className="mp-grid-events">
            {Array.from({ length: 3 }).map((_, i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
        ) : shownEvents.length > 0 ? (
          <div className="mp-grid-events">
            {shownEvents.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <div className="mp-empty mp-empty-panel">
            <span className="mp-empty-icon" aria-hidden="true">
              <CalendarDays size={22} />
            </span>
            <p>No conferences are open right now. Organisers — this is your slot.</p>
          </div>
        )}
        </div>
      </section>

      {/* ======== Delegate handbook ======== */}
      <section className="mp-section mp-shell" id="handbook">
        <div className="mp-section-head">
          <div>
            <h2>Delegate handbook</h2>
            <p>Preparation guides written by chairs and secretaries-general.</p>
          </div>
          <Link className="mp-see-all" href="/blogs">
            All articles
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        {loading ? (
          <div className="mp-grid-articles">
            {Array.from({ length: 2 }).map((_, i) => (
              <ArticleCardSkeleton key={i} />
            ))}
          </div>
        ) : articles.length > 0 ? (
          <div className="mp-grid-articles">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        ) : (
          <div className="mp-empty mp-empty-panel">
            <span className="mp-empty-icon" aria-hidden="true">
              <NotebookPen size={22} />
            </span>
            <p>The handbook is still being written. Check back soon.</p>
          </div>
        )}
      </section>

      {/* ======== Organiser call to action ======== */}
      <section className="mp-shell" id="organise">
        <div className="mp-organise">
          <div className="mp-organise-text">
            <span className="mp-kick">For organisers</span>
            <h2>Create your own MUN</h2>
            <p>
              Open applications, allocate countries, collect delegate fees, run the floor
              live and issue certificates — all from one dashboard.
            </p>
          </div>
          <ul className="mp-organise-tiles" aria-label="What you get">
            <li><b>Allocation</b>countries &amp; seats</li>
            <li><b>Live MUN</b>floor &amp; voting</li>
            <li><b>Certificates</b>after results</li>
          </ul>
          <Link className="mp-btn mp-btn-light mp-btn-lg" href="/signup">
            Start hosting
          </Link>
        </div>
      </section>
    </div>
  );
}
