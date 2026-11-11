"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUp, ArrowUpRight, ChevronDown, Moon, Smartphone, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Logo } from "@/components/brand/Logo";
import { GitHubIcon, InstagramIcon, LinkedInIcon, XIcon, YouTubeIcon } from "@/components/brand/SocialIcons";
import { FOOTER_GROUPS } from "./footerLinks";
import { getFooterFeed, type FooterFeed } from "@/lib/publicFeed";

/**
 * Real brand marks (P01 board). URLs are still placeholders — swap them here when the
 * real handles exist; nothing else references them.
 */
const SOCIALS: { label: string; href: string; icon: React.ReactNode }[] = [
  { label: "X", href: "https://twitter.com", icon: <XIcon /> },
  { label: "Instagram", href: "https://instagram.com", icon: <InstagramIcon /> },
  { label: "LinkedIn", href: "https://linkedin.com", icon: <LinkedInIcon /> },
  { label: "YouTube", href: "https://youtube.com", icon: <YouTubeIcon /> },
  { label: "GitHub", href: "https://github.com", icon: <GitHubIcon /> },
];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * The public mega footer (P01). Brand block (blurb, CTAs, Android app, socials), the
 * four link columns (an accordion on phones), live "Next conferences" / "From the
 * handbook" lists read through the shared public feed cache, then © · theme · Back to top.
 */
export function Footer() {
  const { theme, setTheme } = useTheme();
  // First group open on phones, like the board; desktop ignores this state.
  const [openGroup, setOpenGroup] = useState<string | null>(FOOTER_GROUPS[0].title);
  const [feed, setFeed] = useState<FooterFeed | null>(null);
  const [feedState, setFeedState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    // Resolves from sessionStorage without a read when this tab already has the lists.
    getFooterFeed()
      .then((f) => {
        if (!alive) return;
        setFeed(f);
        setFeedState("ready");
      })
      .catch(() => alive && setFeedState("error"));
    return () => {
      alive = false;
    };
  }, []);

  const year = new Date().getFullYear();
  const showEvents = feedState === "loading" || (feed?.events.length ?? 0) > 0;
  const showArticles = feedState === "loading" || (feed?.articles.length ?? 0) > 0;

  return (
    <footer className="mun-chrome mp-foot">
      <div className="mp-shell mp-foot-inner">
        <div className="mp-foot-top">
          <div className="mp-foot-brand">
            <Link href="/" className="mp-brand" aria-label="MUN Pilot home">
              <Logo height={40} title="" />
            </Link>
            <p className="mp-foot-blurb">
              The platform for running and attending Model UN conferences — from the first application to
              the last certificate.
            </p>
            <div className="mp-foot-ctas">
              <Link className="mp-btn mp-btn-solid mp-btn-sm" href="/dashboard/organizer/events">
                Start hosting
              </Link>
              <Link className="mp-btn mp-btn-sec mp-btn-sm" href="/events">
                Browse conferences
              </Link>
            </div>
            <a className="mp-foot-app" href="/download/android">
              <span className="mp-foot-app-icon">
                <Smartphone size={18} aria-hidden="true" />
              </span>
              <span>
                <small>Get the app</small>
                <b>MUN Pilot for Android</b>
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <div className="mp-foot-socials">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  className="mp-soc"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <nav className="mp-foot-cols" aria-label="Footer">
            {FOOTER_GROUPS.map((group) => {
              const isOpen = openGroup === group.title;
              const listId = `mp-foot-${group.title.replace(/\s+/g, "-").toLowerCase()}`;
              return (
                <div className={`mp-foot-col${isOpen ? " is-open" : ""}`} key={group.title}>
                  <h2>
                    <button
                      type="button"
                      className="mp-foot-col-h"
                      aria-expanded={isOpen}
                      aria-controls={listId}
                      onClick={() => setOpenGroup(isOpen ? null : group.title)}
                    >
                      {group.title}
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                  </h2>
                  <ul id={listId}>
                    {group.links.map((link) => (
                      <li key={link.label}>
                        <Link href={link.href}>{link.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        </div>

        {(showEvents || showArticles) && (
          <div className="mp-foot-feeds">
            {showEvents && (
              <section className="mp-foot-card" aria-labelledby="mp-foot-next">
                <div className="mp-foot-card-head">
                  <h2 id="mp-foot-next">Next conferences</h2>
                  <Link href="/events">See all</Link>
                </div>
                {feedState === "loading"
                  ? [0, 1].map((i) => <FeedSkeleton key={i} wide={48} />)
                  : feed!.events.map((e) => {
                      const d = e.startMs != null ? new Date(e.startMs) : null;
                      return (
                        <Link key={e.id} className="mp-foot-li" href={`/events/${e.id}`}>
                          <span className="mp-foot-date" aria-hidden={d ? true : undefined}>
                            {d ? (
                              <>
                                <b>{d.getDate()}</b>
                                {MONTHS[d.getMonth()]}
                              </>
                            ) : (
                              "TBA"
                            )}
                          </span>
                          <span className="mp-foot-li-text">
                            <span className="mp-foot-li-title">{e.title}</span>
                            <span className="mp-foot-li-meta">
                              {d && <span className="sr-only">{d.toDateString()} · </span>}
                              {[e.place, e.price].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
              </section>
            )}
            {showArticles && (
              <section className="mp-foot-card" aria-labelledby="mp-foot-handbook">
                <div className="mp-foot-card-head">
                  <h2 id="mp-foot-handbook">From the handbook</h2>
                  <Link href="/blogs">All articles</Link>
                </div>
                {feedState === "loading"
                  ? [0, 1].map((i) => <FeedSkeleton key={i} wide={64} />)
                  : feed!.articles.map((a) => (
                      <Link key={a.id} className="mp-foot-li" href={`/blogs/${a.id}`}>
                        <span className="mp-foot-art" aria-hidden="true">
                          {a.category}
                        </span>
                        <span className="mp-foot-li-text">
                          <span className="mp-foot-li-title mp-serif">{a.title}</span>
                          <span className="mp-foot-li-meta">{a.readTime}</span>
                        </span>
                      </Link>
                    ))}
              </section>
            )}
          </div>
        )}

        <div className="mp-foot-note">
          <span>© {year} MUN Pilot · Dhaka, Bangladesh</span>
          <div className="mp-foot-note-actions">
            <div className="mp-seg" role="group" aria-label="Theme">
              <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
                <Sun size={15} aria-hidden="true" />
                Light
              </button>
              <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
                <Moon size={15} aria-hidden="true" />
                Dark
              </button>
            </div>
            <button
              type="button"
              className="mp-btn mp-btn-sec mp-btn-sm"
              onClick={() =>
                window.scrollTo({
                  top: 0,
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                })
              }
            >
              <ArrowUp size={15} aria-hidden="true" />
              Back to top
            </button>
          </div>
        </div>
      </div>

      <div className="mp-shell mp-foot-mark" aria-hidden="true">
        <Logo tone="mono" title="" height={130} className="w-full h-auto" />
      </div>
    </footer>
  );
}

function FeedSkeleton({ wide }: { wide: number }) {
  return (
    <div className="mp-foot-li" aria-hidden="true">
      <span className="mp-skel" style={{ width: wide, height: 48, borderRadius: 12, flex: "none" }} />
      <span className="mp-foot-li-text" style={{ gap: 8 }}>
        <span className="mp-skel" style={{ width: "70%", height: 13 }} />
        <span className="mp-skel" style={{ width: "40%", height: 11 }} />
      </span>
    </div>
  );
}
