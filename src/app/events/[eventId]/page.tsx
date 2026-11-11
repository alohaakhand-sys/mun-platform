"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Globe, Mail, MapPin } from "lucide-react";
import {
  getEventById,
  EventData,
  getEnabledRoleTiers,
  getRolePriceInfo,
  getApplicationTimeline,
  getEventStartMs,
  getCommitteeAgendas,
  getCommitteeDifficulties,
  TEAM_ROLE,
} from "@/lib/services/eventService";
import { hasUserAppliedToEvent } from "@/lib/services/applicationService";
import { getEventPartners, Partner } from "@/lib/services/partnerService";
import { getCountry } from "@/lib/data/countries";
import { CountryFlag } from "@/components/ui/CountryFlag";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useAuth } from "@/contexts/AuthContext";
import { StaffApplyPanel } from "@/components/public/StaffApplyPanel";
import { FacebookIcon, InstagramIcon, LinkedInIcon, XIcon } from "@/components/brand/SocialIcons";
import { themeColor, inkOn } from "@/lib/data/eventLook";
import { formatEventWhen, formatLabel, locationLabel } from "@/components/public/cardFormat";

/** Difficulty pill (P03): Advanced = signal, Intermediate = neutral, Beginner = seal. */
function difficultyPill(d?: string) {
  if (d === "Advanced") return "mp-pill mp-pill-sig";
  if (d === "Intermediate") return "mp-pill mp-pill-mute";
  return "mp-pill mp-pill-ok";
}

const fmtStamp = (v?: string | number) => {
  if (v == null || v === "") return "";
  const dt = new Date(v);
  return Number.isNaN(dt.getTime())
    ? ""
    : dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const fmtDay = (v?: string | number) => {
  if (v == null || v === "") return "";
  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function EventDetailsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<EventData | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCommittee, setOpenCommittee] = useState<number | null>(null);
  // Per-committee seat availability (server-counted approved fills vs capacity).
  const [fullCommittees, setFullCommittees] = useState<Record<string, boolean>>({});
  // Uid that already applied to this event (blocks re-apply). Keyed by uid so a
  // sign-out / account switch reads as "not applied" without resetting state in an effect.
  const [appliedUid, setAppliedUid] = useState<string | null>(null);
  const hasApplied = !!user && appliedUid === user.uid;

  useEffect(() => {
    async function fetchEvent() {
      if (eventId) {
        const [data, partnersData] = await Promise.all([
          getEventById(eventId),
          getEventPartners(eventId),
        ]);
        setEvent(data);
        setPartners(partnersData);
        setLoading(false);
      }
    }
    fetchEvent();
  }, [eventId]);

  useEffect(() => {
    if (!eventId || !user) return;
    let active = true;
    const uid = user.uid;
    hasUserAppliedToEvent(uid, eventId)
      .then((applied) => { if (active) setAppliedUid(applied ? uid : null); })
      .catch(() => {});
    return () => { active = false; };
  }, [eventId, user]);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    fetch(`/api/events/${eventId}/availability`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.committees) return;
        const map: Record<string, boolean> = {};
        for (const [name, info] of Object.entries(data.committees as Record<string, { full: boolean }>)) {
          map[name] = !!info.full;
        }
        setFullCommittees(map);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [eventId]);

  if (loading || authLoading) {
    return (
      <div className="mun-paper mp-page-end mp-detail" aria-busy="true">
        <div className="mp-shell mp-detail-skel">
          <div className="mp-skel" style={{ height: 14, width: 160 }} />
          <div className="mp-skel mp-detail-skel-hero" />
          <div className="mp-detail-grid">
            <div className="mp-col">
              <div className="mp-skel" style={{ height: 170, borderRadius: 16 }} />
              <div className="mp-skel" style={{ height: 240, borderRadius: 16 }} />
            </div>
            <div className="mp-skel" style={{ height: 300, borderRadius: 16 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mun-paper mp-page-end mp-detail">
        <div className="mp-shell mp-notfound">
          <p className="mp-kick" style={{ color: "var(--h-muted)" }}>Not found</p>
          <h1>This conference isn&apos;t here</h1>
          <p>It may have been removed, or the link is wrong.</p>
          <Link className="mp-btn mp-btn-sec mp-btn-sm" href="/events">
            Back to conferences
          </Link>
        </div>
      </div>
    );
  }

  // Application timing is the shared event-level schedule: open from creation until
  // the effective close. No "upcoming" — apps are open the moment the event publishes.
  const timeline = getApplicationTimeline(event);
  const applicationsOpen = timeline.isOpen;
  // Early-bird badge: applications open AND the shared schedule is in its early phase.
  const earlyBirdOpen = applicationsOpen && timeline.phase === "early";
  const opensLabel = "Applications closed";

  const isOwnerOrAdmin = !!user && (user.uid === event.organizerId || (user as unknown as { isAdmin?: boolean }).isAdmin === true);
  if (event.status !== "published" && !isOwnerOrAdmin) {
    return (
      <div className="mun-paper mp-page-end mp-detail">
        <div className="mp-shell mp-notfound">
          <p className="mp-kick" style={{ color: "var(--h-amber)" }}>Unpublished</p>
          <h1>Not yet published</h1>
          <p>This conference is still being prepared. Check back soon.</p>
          <Link className="mp-btn mp-btn-sec mp-btn-sm" href="/events">
            Back to conferences
          </Link>
        </div>
      </div>
    );
  }

  const sched = event.applicationSchedule;
  const closeText = Number.isNaN(timeline.closeAt) ? "—" : fmtStamp(timeline.closeAt);
  const whenText = formatEventWhen(getEventStartMs(event), event.date);
  const whereText = locationLabel(event);

  const tiers = getEnabledRoleTiers(event);
  const priced = tiers.map((tier) => ({ tier, info: getRolePriceInfo(event, tier.role) }));

  // The organizer's theme colour (Tools › Theme): hero field, format pill, Apply button.
  const accent = themeColor(event.theme);
  const accentInk = accent ? inkOn(accent) : null;
  const accentStyle = accent ? { background: accent, borderColor: accent, color: accentInk! } : undefined;
  // On the hero the format pill flips: the accent becomes the text on a contrasting chip.
  const formatPillStyle: CSSProperties | undefined = accent
    ? { background: accentInk === "#ffffff" ? "#fff" : "#1b1f2a", color: accent }
    : undefined;
  const heroStyle = {
    ...(accent ? { background: accent } : {}),
    // Without a photo the copy sits straight on the field, so it takes the field's ink.
    ...(!event.coverUrl && accentInk ? { ["--mp-hero-ink" as string]: accentInk } : {}),
  } as CSSProperties;

  /** The rail's call to action; the phone apply bar reuses it so both always agree. */
  const applyAction = (size: "rail" | "bar"): ReactNode => {
    const block = size === "rail" ? "mp-btn-lg mp-btn-block" : "mp-btn-lg";
    if (!user) {
      return (
        <button
          type="button"
          className={`mp-btn ${block} ${applicationsOpen ? "mp-btn-solid" : "mp-btn-off"}`}
          onClick={() => router.push(`/login?redirect=/events/${eventId}`)}
          disabled={!applicationsOpen}
        >
          {applicationsOpen ? (earlyBirdOpen ? "Log in — early bird" : "Log in to apply") : opensLabel}
        </button>
      );
    }
    if (user.uid === event.organizerId) {
      return (
        <Link className={`mp-btn mp-btn-sec ${block}`} href={`/dashboard/organizer/events/${eventId}`}>
          Manage event
        </Link>
      );
    }
    if (hasApplied) {
      return (
        <button type="button" className={`mp-btn mp-btn-off ${block}`} disabled>
          Already applied
        </button>
      );
    }
    if (applicationsOpen) {
      return (
        <Link className={`mp-btn mp-btn-solid ${block}`} href={`/events/${eventId}/apply`} style={accentStyle}>
          {earlyBirdOpen ? "Apply now — early bird" : "Apply now"}
        </Link>
      );
    }
    return (
      <button type="button" className={`mp-btn mp-btn-off ${block}`} disabled>
        {opensLabel}
      </button>
    );
  };

  /** Phase label + until-date for the phone apply bar (the schedule is event-wide). */
  const phaseLine = (phase: string): ReactNode => {
    if (!applicationsOpen) return opensLabel;
    if (phase === "early" && timeline.earlyEndAt != null)
      return (
        <>
          <span className="mp-pill mp-pill-wait">Early bird</span> until {fmtDay(timeline.earlyEndAt)}
        </>
      );
    if (phase === "late" && timeline.lateEndAt != null)
      return (
        <>
          <span className="mp-pill mp-pill-sig">Late price</span> until {fmtDay(timeline.lateEndAt)}
        </>
      );
    return Number.isNaN(timeline.closeAt) ? null : `Closes ${fmtDay(timeline.closeAt)}`;
  };

  // Phone apply bar price (owner, P03): one role → its live price as on the board;
  // several → "From $lowest" with that role's phase line; all free → "Free".
  let barPrice: ReactNode = null;
  let barLine: ReactNode = applicationsOpen ? phaseLine(timeline.phase) : opensLabel;
  if (priced.length === 1) {
    const { tier, info } = priced[0];
    const strike = info.phase !== "regular" && info.unitPrice !== (tier.price || 0);
    barPrice = info.unitPrice > 0 ? (
      <>
        ${info.unitPrice}
        {strike && <s>${tier.price}</s>}
        {tier.role === TEAM_ROLE && <small>/ member</small>}
      </>
    ) : (
      "Free"
    );
    barLine = phaseLine(info.phase);
  } else if (priced.length > 1) {
    const paid = priced.filter((p) => p.info.unitPrice > 0);
    if (paid.length === 0) barPrice = "Free";
    else if (paid.length < priced.length) {
      // A free role exists alongside paid ones: never "From $0" (owner).
      barPrice = "Free";
      barLine = `Paid roles from $${Math.min(...paid.map((p) => p.info.unitPrice))}`;
    } else {
      const cheapest = priced.reduce((a, b) => (b.info.unitPrice < a.info.unitPrice ? b : a));
      barPrice = <>From ${cheapest.info.unitPrice}</>;
      barLine = phaseLine(cheapest.info.phase);
    }
  }
  // The role the phone bar quotes gets the board's green ring on desktop.
  const featuredRole = priced.length === 1 ? priced[0].tier.role : null;

  const sections = [
    { id: "about", label: "About" },
    ...(event.committees?.length ? [{ id: "committees", label: "Committees" }] : []),
    ...(tiers.length ? [{ id: "registration", label: "Registration" }] : []),
    ...(partners.length ? [{ id: "partners", label: "Partners" }] : []),
  ];

  const social = event.socialMedia;
  const hasSocial = !!(social && (social.instagram || social.twitter || social.facebook || social.linkedin));

  return (
    <div className="mun-paper mp-page-end mp-detail mp-detail-has-bar">
      <div className="mp-shell">
        <Link className="mp-back mp-detail-back" href="/events">
          <ArrowLeft size={16} aria-hidden="true" /> Back to conferences
        </Link>

        {/* ======== Hero banner ======== */}
        <div className={`mp-hero-banner${event.coverUrl ? " has-cover" : ""}`} style={heroStyle}>
          {event.coverUrl ? <img src={event.coverUrl} alt="" /> : <div className="mp-hero-fallback" />}
          {event.coverUrl && <div className="mp-hero-scrim" />}
          <div className="mp-hero-body">
            <div className="mp-hero-tags">
              <span className="mp-pill mp-hero-format" style={formatPillStyle}>{formatLabel(event)}</span>
              <span className="mp-pill mp-pill-glass mp-hero-kind">Conference</span>
              {earlyBirdOpen && <span className="mp-pill mp-hero-early">Early bird</span>}
            </div>
            <h1>{event.title}</h1>
            <p className="mp-hero-meta">
              <span><CalendarDays size={16} aria-hidden="true" />{whenText}</span>
              <span><MapPin size={16} aria-hidden="true" />{whereText}</span>
            </p>
          </div>
        </div>

        {/* ======== Phone: key facts + section jumps ======== */}
        <div className="mp-panel mp-keyfacts">
          <span><CalendarDays size={16} aria-hidden="true" />{whenText}</span>
          <span><MapPin size={16} aria-hidden="true" />{whereText}</span>
          <span>
            {applicationsOpen ? (
              <span className="mp-pill mp-pill-ok"><span className="mp-pill-dot" />Open now</span>
            ) : (
              <span className="mp-pill mp-pill-mute"><span className="mp-pill-dot" />Closed</span>
            )}
            {applicationsOpen && !Number.isNaN(timeline.closeAt) && (
              <em>Closes {fmtDay(timeline.closeAt)}</em>
            )}
          </span>
        </div>

        <div className="mp-detail-grid">
          {/* ======== Main column ======== */}
          <div className="mp-col">
            <section className="mp-panel mp-anchor" id="about">
              <h2 className="mp-detail-h2">About this conference</h2>
              <AboutText text={event.description || "No description provided for this event."} />
            </section>

            {sections.length > 1 && <JumpTabs sections={sections} />}

            <div className="mp-comgrid">
              <section className="mp-panel">
                <h2 className="mp-panel-kick">Conference</h2>
                <dl className="mp-dl">
                  {event.format && (
                    <>
                      <dt>Format</dt>
                      <dd>{formatLabel(event)}</dd>
                    </>
                  )}
                  {event.date && (
                    <>
                      <dt>Dates</dt>
                      <dd>{whenText}</dd>
                    </>
                  )}
                  {event.expectedDelegates && (
                    <>
                      <dt>Expected delegates</dt>
                      <dd>{event.expectedDelegates.toLocaleString()} delegates</dd>
                    </>
                  )}
                  {event.targetAudience && (
                    <>
                      <dt>Target audience</dt>
                      <dd>{event.targetAudience}</dd>
                    </>
                  )}
                </dl>
              </section>

              <section className="mp-panel">
                <h2 className="mp-panel-kick">Applications</h2>
                <dl className="mp-dl">
                  <dt>Status</dt>
                  <dd>
                    {applicationsOpen ? (
                      <span className="mp-pill mp-pill-ok"><span className="mp-pill-dot" />Open now</span>
                    ) : (
                      <span className="mp-pill mp-pill-mute"><span className="mp-pill-dot" />Closed</span>
                    )}
                  </dd>
                  {sched?.earlyBird?.enabled && sched.earlyBird.endAt && (
                    <>
                      <dt>Early bird until</dt>
                      <dd>{fmtStamp(sched.earlyBird.endAt)}</dd>
                    </>
                  )}
                  {sched?.lateComer?.enabled && sched.lateComer.startAt && (
                    <>
                      <dt>Late comer</dt>
                      <dd>
                        {fmtStamp(sched.lateComer.startAt)} – {fmtStamp(sched.lateComer.endAt)}
                      </dd>
                    </>
                  )}
                  <dt>Closes</dt>
                  <dd>{closeText}</dd>
                </dl>
              </section>
            </div>

            {/* ======== Committees ======== */}
            {event.committees && event.committees.length > 0 && (
              <section className="mp-anchor" id="committees">
                <div className="mp-block-head">
                  <h2 className="mp-detail-h2">Committees</h2>
                  <span>
                    {event.committees.length}{" "}
                    {event.committees.length === 1 ? "committee" : "committees"}
                  </span>
                </div>

                <div className="mp-comgrid">
                  {event.committees.map((com, idx) => {
                    const count = com.countries?.length || 0;
                    const cap = com.capacity || 0;
                    const diffs = getCommitteeDifficulties(com).length
                      ? getCommitteeDifficulties(com)
                      : ["Beginner"];
                    const agendas = getCommitteeAgendas(com);
                    const isFull = fullCommittees[com.name];

                    return (
                      <article className="mp-com" key={idx}>
                        <div className="mp-com-plate">
                          <h3>{com.name}</h3>
                          {isFull && <span className="mp-pill mp-pill-sig">Full</span>}
                        </div>

                        <div className="mp-com-body">
                          <div className="mp-tags">
                            {diffs.map((d) => (
                              <span key={d} className={difficultyPill(d)}>
                                {d}
                              </span>
                            ))}
                            <span className="mp-pill mp-pill-mute">{cap || count} spots</span>
                          </div>

                          {com.description && (
                            <div>
                              <p className="mp-com-label">Description</p>
                              <p className="mp-com-line mp-clamp2">{com.description}</p>
                            </div>
                          )}

                          {agendas.length > 0 && (
                            <div>
                              <p className="mp-com-label">{agendas.length > 1 ? "Agendas" : "Topic"}</p>
                              {agendas.length > 1 ? (
                                <ol className="mp-com-agendas">
                                  {agendas.map((a, i) => (
                                    <li key={i}>{a}</li>
                                  ))}
                                </ol>
                              ) : (
                                <p className="mp-com-topic">{agendas[0]}</p>
                              )}
                            </div>
                          )}

                          <div className="mp-com-foot">
                            <Dialog
                              open={openCommittee === idx}
                              onOpenChange={(o) => setOpenCommittee(o ? idx : null)}
                            >
                              <DialogTrigger className="mp-btn mp-btn-sec mp-btn-sm">
                                View members <ArrowRight size={16} aria-hidden="true" />
                              </DialogTrigger>

                              {/* A Dialog portals to the document root, outside `.mun-paper`
                                  — the class has to travel with it or the panel comes back
                                  wearing the app's indigo. */}
                              <DialogContent className="mun-paper mp-com-dialog sm:max-w-[620px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
                                <DialogHeader className="mp-com-dialog-head text-left">
                                  <p className="mp-kick" style={{ margin: 0 }}>
                                    Committee
                                  </p>
                                  <DialogTitle className="mp-com-dialog-title">{com.name}</DialogTitle>
                                  <DialogDescription className="sr-only">
                                    Details, countries and availability for {com.name}
                                  </DialogDescription>
                                  <div className="mp-tags">
                                    {diffs.map((d) => (
                                      <span key={d} className={difficultyPill(d)}>
                                        {d}
                                      </span>
                                    ))}
                                    <span className="mp-pill mp-pill-mute">
                                      {count} {count === 1 ? "position" : "positions"}
                                    </span>
                                    {cap > 0 && <span className="mp-pill mp-pill-mute">{cap} spots</span>}
                                    {isFull ? (
                                      <span className="mp-pill mp-pill-sig">
                                        <span className="mp-pill-dot" /> Full
                                      </span>
                                    ) : (
                                      <span className="mp-pill mp-pill-ok">
                                        <span className="mp-pill-dot" /> Open
                                      </span>
                                    )}
                                  </div>
                                </DialogHeader>

                                <div className="mp-com-dialog-body">
                                  {agendas.length > 0 && (
                                    <div>
                                      <p className="mp-com-label">
                                        {agendas.length > 1 ? "Agendas" : "Topic / agenda"}
                                      </p>
                                      {agendas.length > 1 ? (
                                        <ol className="mp-com-agendas">
                                          {agendas.map((a, i) => (
                                            <li key={i}>{a}</li>
                                          ))}
                                        </ol>
                                      ) : (
                                        <p className="mp-com-topic">{agendas[0]}</p>
                                      )}
                                    </div>
                                  )}

                                  {com.description && (
                                    <div>
                                      <p className="mp-com-label">Description</p>
                                      <p className="mp-body-copy" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
                                        {com.description}
                                      </p>
                                    </div>
                                  )}

                                  <div>
                                    <p className="mp-com-label">Countries / positions</p>
                                    {count > 0 ? (
                                      <div className="mp-flaggrid">
                                        {com.countries.map((code, cIdx) => {
                                          const country = getCountry(code);
                                          return (
                                            <div className="mp-flag" key={cIdx}>
                                              <CountryFlag code={code} size={22} />
                                              <span>{country?.name ?? code.toUpperCase()}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p className="mp-com-none">Positions to be announced.</p>
                                    )}
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ======== Registration ======== */}
            {tiers.length > 0 && (
              <section className="mp-anchor" id="registration">
                <div className="mp-block-head">
                  <h2 className="mp-detail-h2">Registration</h2>
                  <span>{tiers.length} {tiers.length === 1 ? "role" : "roles"}</span>
                </div>

                <div className="mp-tiergrid">
                  {priced.map(({ tier, info }) => {
                    // Effective price + active phase from the shared application schedule.
                    const price = info.unitPrice;
                    const showStrike = info.phase !== "regular" && price !== (tier.price || 0);

                    return (
                      <div className={`mp-tier${tier.role === featuredRole ? " is-on" : ""}`} key={tier.role}>
                        {info.phase === "early" && <span className="mp-pill mp-pill-ok">Early bird</span>}
                        {info.phase === "late" && <span className="mp-pill mp-pill-sig">Late price</span>}
                        <h3>{tier.label || tier.role}</h3>
                        <div className="mp-price">
                          {price > 0 ? (
                            <>
                              <b>${price}</b>
                              {showStrike && <s>${tier.price}</s>}
                              {tier.role === TEAM_ROLE && <small>/ member</small>}
                            </>
                          ) : (
                            <b>Free</b>
                          )}
                        </div>
                        {info.phase === "early" && sched?.earlyBird?.endAt && (
                          <p className="mp-tier-note">
                            Early-bird price until {fmtStamp(sched.earlyBird.endAt)}
                          </p>
                        )}
                        {info.phase === "regular" &&
                          sched?.lateComer?.enabled &&
                          sched.lateComer.startAt &&
                          tier.latePrice != null && (
                            <p className="mp-tier-note">
                              Price rises to ${tier.latePrice} on {fmtStamp(sched.lateComer.startAt)}
                            </p>
                          )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ======== Partners ======== */}
            {partners && partners.length > 0 && (
              <section className="mp-anchor" id="partners">
                <div className="mp-block-head">
                  <h2 className="mp-detail-h2">Event partners</h2>
                  <span>{partners.length}</span>
                </div>

                <div className="mp-panel mp-partners-panel">
                  <Carousel opts={{ align: "start", loop: true }} className="mp-partners-row">
                    <CarouselPrevious variant="ghost" className="mp-carousel-nav" aria-label="Previous partner" />
                    <CarouselContent className="-ml-3">
                      {partners.map((partner, idx) => (
                        <CarouselItem
                          key={`${partner.id || "p"}-${idx}`}
                          className="pl-3 basis-1/2 md:basis-1/3 lg:basis-1/4"
                        >
                          <Dialog>
                            <DialogTrigger className="mp-partner">
                              <span className="mp-partner-logo">
                                {partner.logoUrl ? (
                                  <img src={partner.logoUrl} alt={partner.name} />
                                ) : (
                                  <span>{partner.name}</span>
                                )}
                              </span>
                              {partner.tier && (
                                <span className="mp-partner-tier">{partner.tier} partner</span>
                              )}
                            </DialogTrigger>

                            <DialogContent className="mun-paper sm:max-w-[420px]">
                              <DialogHeader className="text-left">
                                <DialogTitle className="mp-partner-name">{partner.name}</DialogTitle>
                                <DialogDescription className="mp-partner-kind">
                                  {partner.tier ? `${partner.tier} partner` : "Event partner"}
                                </DialogDescription>
                              </DialogHeader>
                              <div style={{ display: "grid", gap: 14 }}>
                                {partner.logoUrl && (
                                  <div className="mp-partner-hero">
                                    <img src={partner.logoUrl} alt={partner.name} />
                                  </div>
                                )}
                                {partner.description && (
                                  <p className="mp-body-copy" style={{ fontSize: 14.5, lineHeight: 1.55 }}>
                                    {partner.description}
                                  </p>
                                )}
                                {partner.websiteUrl && (
                                  <a
                                    className="mp-btn mp-btn-sec mp-btn-sm"
                                    style={{ justifySelf: "start" }}
                                    href={partner.websiteUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Visit website <ArrowUpRight size={16} aria-hidden="true" />
                                  </a>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselNext variant="ghost" className="mp-carousel-nav" aria-label="Next partner" />
                  </Carousel>
                </div>
              </section>
            )}
          </div>

          {/* ======== Sticky rail ======== */}
          <div>
            <div className="mp-rail">
              {(event.website || event.contactEmail || hasSocial) && (
                <section className="mp-panel mp-rail-panel">
                  <h2 className="mp-panel-kick">Organiser</h2>

                  {(event.website || event.contactEmail) && (
                    <div className="mp-orglinks">
                      {event.website && (
                        <a className="mp-linkrow" href={event.website} target="_blank" rel="noopener noreferrer">
                          <Globe size={16} aria-hidden="true" />
                          <span>Website</span>
                          <ArrowUpRight size={16} aria-hidden="true" className="mp-linkrow-end" />
                        </a>
                      )}
                      {event.contactEmail && (
                        <a className="mp-linkrow" href={`mailto:${event.contactEmail}`}>
                          <Mail size={16} aria-hidden="true" />
                          <span>Contact</span>
                          <em>{event.contactEmail}</em>
                        </a>
                      )}
                    </div>
                  )}

                  {hasSocial && social && (
                    <div className="mp-sociallist">
                      {social.instagram && (
                        <a
                          className="mp-soc"
                          href={`https://instagram.com/${social.instagram.replace("@", "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`@${social.instagram.replace("@", "")}`}
                          aria-label={`Instagram @${social.instagram.replace("@", "")}`}
                        >
                          <InstagramIcon size={19} />
                        </a>
                      )}
                      {social.twitter && (
                        <a
                          className="mp-soc"
                          href={`https://twitter.com/${social.twitter.replace("@", "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`@${social.twitter.replace("@", "")}`}
                          aria-label="X"
                        >
                          <XIcon size={16} />
                        </a>
                      )}
                      {social.facebook && (
                        <a className="mp-soc" href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                          <FacebookIcon size={20} />
                        </a>
                      )}
                      {social.linkedin && (
                        <a className="mp-soc" href={social.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                          <LinkedInIcon size={19} />
                        </a>
                      )}
                    </div>
                  )}
                </section>
              )}

              <section className="mp-panel mp-rail-panel">
                <h2 className="mp-panel-kick">Application status</h2>
                <p className="mp-rail-lede">Apply as a delegate or observer to reserve your position.</p>

                <div className="mp-tags">
                  {applicationsOpen ? (
                    <>
                      <span className="mp-pill mp-pill-ok">
                        <span className="mp-pill-dot" /> Accepting applications
                      </span>
                      {earlyBirdOpen && <span className="mp-pill mp-pill-wait">Early bird</span>}
                    </>
                  ) : (
                    <span className="mp-pill mp-pill-mute">
                      <span className="mp-pill-dot" /> Applications closed
                    </span>
                  )}
                </div>

                {!user && <p className="mp-rail-note">Sign in to submit an application.</p>}
                {applyAction("rail")}
                {user && user.uid !== event.organizerId && hasApplied && (
                  <Link className="mp-rail-link" href="/dashboard/conferences">
                    View your application
                  </Link>
                )}
              </section>

              {event.allowPublicStaff && user && user.uid !== event.organizerId && (
                <StaffApplyPanel eventId={eventId} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ======== Phone: sticky apply bar (mirrors the rail action) ======== */}
      <div className="mp-applybar" role="region" aria-label="Apply">
        <div className="mp-applybar-price">
          {barPrice != null && <b>{barPrice}</b>}
          {barLine && <span>{barLine}</span>}
        </div>
        {applyAction("bar")}
      </div>
    </div>
  );
}

/** About copy: full on desktop; on phones clamped to 3 lines with Read more / Show less,
 *  the toggle shown only when the text actually runs past 3 lines. */
function AboutText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  return (
    <>
      <p ref={ref} className={`mp-body-copy mp-about${expanded ? " is-open" : ""}`}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button type="button" className="mp-about-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </>
  );
}

/** Phone section jumps; the section in view is highlighted. Hidden on desktop. */
function JumpTabs({ sections }: { sections: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(sections[0]?.id);
  const ids = sections.map((s) => s.id).join(" ");

  useEffect(() => {
    const els = ids
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setCurrent(seen[0].target.id);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  return (
    <nav className="mp-jumptabs" aria-label="On this page">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={current === s.id ? "true" : undefined}
          onClick={() => setCurrent(s.id)}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
