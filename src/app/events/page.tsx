"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Search, SearchX, X } from "lucide-react";
import { getPublishedEvents, EventData } from "@/lib/services/eventService";
import { EVENTS_SEARCH_EVENT } from "@/components/public/eventsSearch";
import { Masthead } from "@/components/public/Masthead";
import { EventCard, EventCardSkeleton } from "@/components/public/EventCard";
/**
 * The starting `?q=` comes from `useSearchParams`, so the route needs a Suspense boundary
 * at build time. The fallback is the page's own loading view (no term, skeleton cards) —
 * exactly what the prerendered HTML showed before.
 */
export default function EventsPage() {
  return (
    <Suspense fallback={<EventsView q="" onQuery={() => {}} events={[]} loading />}>
      <EventsIndex />
    </Suspense>
  );
}

function EventsIndex() {
  // Initial term from the URL. After mount the page owns it: the on-page box writes
  // `?q=` itself, and the header search (which can fire while this page is open)
  // announces its term with a window event. Not re-derived from the URL on every
  // change, because our own replaceState writes reach useSearchParams a beat late and
  // would overwrite fast typing.
  const initialQ = useSearchParams().get("q") || "";
  const [q, setQ] = useState(initialQ);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onSearch = (e: Event) => setQ((e as CustomEvent<string>).detail || "");
    window.addEventListener(EVENTS_SEARCH_EVENT, onSearch);
    return () => window.removeEventListener(EVENTS_SEARCH_EVENT, onSearch);
  }, []);

  useEffect(() => {
    async function fetchEvents() {
      const data = await getPublishedEvents();
      setEvents(data);
      setLoading(false);
    }
    fetchEvents();
  }, []);

  // The on-page search drives the same `?q=` as the header (P02): keep the URL in step,
  // without a navigation (Next syncs replaceState into useSearchParams), so the result
  // is still shareable.
  const updateQuery = (value: string) => {
    setQ(value);
    const url = new URL(window.location.href);
    if (value.trim()) url.searchParams.set("q", value.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  };

  return <EventsView q={q} onQuery={updateQuery} events={events} loading={loading} />;
}

function EventsView({
  q,
  onQuery: updateQuery,
  events,
  loading,
}: {
  q: string;
  onQuery: (value: string) => void;
  events: EventData[];
  loading: boolean;
}) {

  // Title, venue and committee names — the three things someone types into the box.
  const term = q.trim().toLowerCase();
  const visible = term
    ? events.filter((e) =>
        [
          e.title,
          e.location,
          e.locationName,
          e.locationAddress,
          ...(e.committees || []).map((c) => c.name),
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term))
      )
    : events;

  return (
    <div className="mun-paper mp-page-end">
      <Masthead
        band
        eyebrow="Conferences"
        title="Model UN conferences"
        lede="Every conference currently taking delegates on MUN Pilot — committees, fees and dates, before you commit a weekend to one."
        count={loading ? undefined : visible.length}
        noun={visible.length === 1 ? "conference" : "conferences"}
      >
        <form className="mp-field-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search conferences"
            placeholder="Search by name, city or committee"
            value={q}
            onChange={(e) => updateQuery(e.target.value)}
          />
          {q && (
            <button
              type="button"
              className="mp-icon-btn mp-icon-btn-sm"
              aria-label="Clear search"
              onClick={() => updateQuery("")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </form>
      </Masthead>

      <div className="mp-shell mp-index-body">
        {term && !loading && (
          <div className="mp-resultbar">
            <span>
              Showing results for <strong>&ldquo;{q.trim()}&rdquo;</strong>
            </span>
            <button type="button" className="mp-see-all mp-link-btn" onClick={() => updateQuery("")}>
              Clear search
            </button>
          </div>
        )}

        {loading ? (
          <div className="mp-grid-events" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="mp-empty mp-empty-lg">
            <span className="mp-empty-icon mp-empty-icon-lg" aria-hidden="true">
              {term ? <SearchX size={24} /> : <CalendarDays size={24} />}
            </span>
            <h3>No conferences found</h3>
            <p>
              {term
                ? "Nothing matches that search. Try a city, a committee, or clear the search above."
                : "There are no conferences taking delegates right now. Check back soon — or host one yourself."}
            </p>
            {term ? (
              <button type="button" className="mp-btn mp-btn-sec mp-btn-sm" onClick={() => updateQuery("")}>
                Clear search
              </button>
            ) : (
              <Link className="mp-btn mp-btn-solid mp-btn-sm" href="/dashboard/organizer/events">
                Host a conference
              </Link>
            )}
          </div>
        ) : (
          <div className="mp-grid-events">
            {visible.map((event) => (
              <EventCard key={event.id} event={event} detailed />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
