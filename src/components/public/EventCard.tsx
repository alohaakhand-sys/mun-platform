"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EventData, getEventStartMs } from "@/lib/services/eventService";
import { EventCountdown } from "./EventCountdown";
import {
  applicationTag,
  eventEndMs,
  formatCardDate,
  formatFromPrice,
  formatLabel,
  locationLabel,
  placardLabel,
} from "./cardFormat";

/**
 * One conference card. The placard carries the committee acronym when the event has
 * no cover image — a stamped placard beats a grey box, and it tells the reader what
 * is actually being simulated.
 *
 * `detailed` is the /events index: it adds the format and countdown stamps and a
 * "View details" footer. The homepage strip leaves it off and stays quiet.
 */
export function EventCard({
  event,
  detailed = false,
}: {
  event: EventData;
  detailed?: boolean;
}) {
  const price = formatFromPrice(event);
  // The quiet homepage card says whether applications are open (P01); the detailed
  // /events card keeps its format + countdown stamps instead.
  const tag = detailed ? null : applicationTag(event);

  return (
    <Link className={`mp-card mp-lift${detailed ? "" : " mp-card-quiet"}`} href={`/events/${event.id}`}>
      <div className="mp-placard">
        {tag && (
          <span className={`mp-pill mp-pill-${tag.tone} mp-card-tag`}>
            {tag.tone !== "mute" && <i className="mp-pill-dot" aria-hidden="true" />}
            {tag.label}
          </span>
        )}
        {detailed && <span className="mp-stamp">{formatLabel(event)}</span>}
        {detailed && <EventCountdown startMs={getEventStartMs(event)} endMs={eventEndMs(event)} />}
        {event.coverUrl ? (
          <img src={event.coverUrl} alt="" />
        ) : (
          <span>{placardLabel(event)}</span>
        )}
      </div>

      <div className={`mp-card-body${detailed ? " has-foot" : ""}`}>
        <p className={`mp-card-date${Number.isFinite(getEventStartMs(event)) ? "" : " is-tba"}`}>
          {formatCardDate(getEventStartMs(event))}
        </p>
        <h3 className={`mp-card-title mp-lift-title${detailed ? " mp-clamp2" : ""}`}>{event.title}</h3>
        <p className="mp-card-meta">
          {locationLabel(event)}
          {price ? (
            <>
              {" · "}
              <span className="mp-card-price">{price}</span>
            </>
          ) : null}
        </p>

      </div>
      {detailed && (
        <div className="mp-card-ft">
          <span className="mp-card-action">View details</span>
          <ArrowRight size={16} aria-hidden="true" />
        </div>
      )}
    </Link>
  );
}

/** Placeholder card held while the events query is in flight. */
export function EventCardSkeleton() {
  return (
    <div className="mp-card" aria-hidden="true">
      <div className="mp-placard mp-skel" style={{ borderRadius: 0 }} />
      <div className="mp-card-body" style={{ gap: 10 }}>
        <div className="mp-skel" style={{ height: 18, width: "75%" }} />
        <div className="mp-skel" style={{ height: 12, width: "55%" }} />
        <div className="mp-skel" style={{ height: 12, width: "40%" }} />
      </div>
    </div>
  );
}
