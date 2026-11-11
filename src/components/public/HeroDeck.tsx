"use client";

import Link from "next/link";
import { useState } from "react";

export interface HeroAction {
  label: string;
  href: string;
  /** `light` is the filled white button; `onslab` the outlined one beside it. */
  tone?: "light" | "onslab";
}

export interface HeroSlide {
  /** Eyebrow above the headline — "Featured conference", "For organisers". */
  kind: string;
  title: string;
  copy: string;
  /** Fact chips under the copy (date, place, fee) — event slides only. */
  facts?: string[];
  image?: string;
  imageAlt?: string;
  /** Visual for the photo side when there is no image: stripes (default) or the organiser grid. */
  art?: "stripes" | "organiser";
  actions: HeroAction[];
}

/**
 * The navy hero slab (P01 split layout, P08 controls): text left, photo right; on
 * phones the photo sits on top. The dot rail and the numbered pager are built from the
 * slide array; ← → switch slides while focus is inside the deck.
 *
 * Deliberately NOT auto-advancing: the slides carry registration deadlines and a
 * carousel that moves on its own steals the one the reader was mid-sentence on.
 */
export function HeroDeck({ slides, loading = false }: { slides: HeroSlide[]; loading?: boolean }) {
  const [index, setIndex] = useState(0);

  // First load: hold the hero's exact footprint with a skeleton, so the deck doesn't
  // flash the organiser slide and then jump once events arrive. Nothing can change
  // `index` while this shows, so the real deck always opens on slide 1.
  if (loading) return <HeroDeckSkeleton />;
  if (slides.length === 0) return null;

  const show = (i: number) => setIndex((i + slides.length) % slides.length);

  return (
    <section className="mp-hero mp-shell" aria-label="Featured" aria-roledescription="carousel">
      <div
        className="mp-deck"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") show(index - 1);
          if (e.key === "ArrowRight") show(index + 1);
        }}
      >
        {slides.map((s, i) => (
          <article
            key={i}
            className={`mp-slide${i === index ? " is-on" : ""}`}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
            aria-hidden={i === index ? undefined : true}
          >
            <div className="mp-slide-text">
              <p className="mp-slide-kind">{s.kind}</p>
              <h1>{s.title}</h1>
              {s.copy && <p className="mp-slide-copy">{s.copy}</p>}
              {s.facts && s.facts.length > 0 && (
                <ul className="mp-slide-facts">
                  {s.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <div className="mp-actions">
                {s.actions.map((a) => (
                  <Link
                    key={a.href + a.label}
                    className={`mp-btn mp-btn-lg ${a.tone === "onslab" ? "mp-btn-onslab" : "mp-btn-light"}`}
                    href={a.href}
                    // A hidden slide is still in the DOM; keep its links out of the tab order.
                    tabIndex={i === index ? undefined : -1}
                  >
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className={`mp-slide-photo${!s.image && s.art === "organiser" ? " is-organiser" : ""}`}>
              {/* Striped (or organiser grid) fallback shows through when there is no cover. */}
              {s.image ? <img src={s.image} alt={s.imageAlt || ""} /> : null}
              {!s.image && s.art === "organiser" && (
                <>
                  <i className="mp-slide-dia" aria-hidden="true" />
                  <i className="mp-slide-dia2" aria-hidden="true" />
                </>
              )}
            </div>
          </article>
        ))}

        {slides.length > 1 && (
          <div className="mp-deck-nav">
            <div className="mp-dots" role="tablist" aria-label="Featured slides">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  className="mp-dot"
                  aria-selected={i === index}
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => show(i)}
                />
              ))}
            </div>
            <div className="mp-pager" role="tablist" aria-label="Slide number">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  className="mp-num"
                  aria-selected={i === index}
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => show(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Same size and split as the real hero; shimmer bars stand in for eyebrow, title, copy, chips, buttons. */
function HeroDeckSkeleton() {
  return (
    <section className="mp-hero mp-shell" aria-label="Featured" aria-busy="true">
      <div className="mp-deck mp-deck-skel" aria-hidden="true">
        <div className="mp-slide is-on">
          <div className="mp-slide-text">
            <span className="mp-skel" style={{ width: 150, height: 12 }} />
            <span className="mp-skel" style={{ width: "85%", height: 40 }} />
            <span className="mp-skel" style={{ width: "60%", height: 40 }} />
            <span className="mp-skel" style={{ width: "90%", height: 14 }} />
            <span className="mp-skel" style={{ width: "70%", height: 14 }} />
            <span style={{ display: "flex", gap: 8 }}>
              <span className="mp-skel" style={{ width: 110, height: 24, borderRadius: 12 }} />
              <span className="mp-skel" style={{ width: 80, height: 24, borderRadius: 12 }} />
              <span className="mp-skel" style={{ width: 60, height: 24, borderRadius: 12 }} />
            </span>
            <span className="mp-actions">
              <span className="mp-skel" style={{ width: 140, height: 48, borderRadius: 10 }} />
              <span className="mp-skel" style={{ width: 150, height: 48, borderRadius: 10 }} />
            </span>
          </div>
          <div className="mp-slide-photo mp-skel" style={{ borderRadius: 0 }} />
        </div>
      </div>
    </section>
  );
}
