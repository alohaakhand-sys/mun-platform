"use client";

/**
 * The section front for a public index page: eyebrow, large serif line, lede.
 * Deliberately not another navy slab — the hero slab is the homepage's one big
 * gesture, and reusing it on every index would spend it.
 *
 * `band` (P02) renders it as a full-width white band with its own shell, a big serif
 * tally on the right (`count` + `noun`; "6 found" on phones) and an optional `children`
 * slot under the copy (the on-page search). Without `band` it keeps the older inline
 * form, still used by /blogs until board P05.
 */
export function Masthead({
  eyebrow,
  title,
  lede,
  tally,
  band = false,
  count,
  noun,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  /** Inline form: the "N articles" line on the right edge. */
  tally?: string;
  band?: boolean;
  /** Band form: tally number; omit while loading. */
  count?: number;
  /** Band form: plural noun under the number, e.g. "conferences". */
  noun?: string;
  children?: React.ReactNode;
}) {
  if (!band) {
    return (
      <div className="mp-masthead">
        <div className="mp-masthead-row">
          <div>
            <p className="mp-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="mp-lede">{lede}</p>
          </div>
          {tally ? <span className="mp-tally">{tally}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mp-masthead-band">
      <div className="mp-shell mp-masthead-inner">
        <div className="mp-masthead-row">
          <div className="mp-masthead-copy">
            <p className="mp-kick">{eyebrow}</p>
            <div className="mp-masthead-title">
              <h1>{title}</h1>
              {count != null && <span className="mp-tally-phone">{count} found</span>}
            </div>
            <p className="mp-lede">{lede}</p>
          </div>
          {count != null && (
            <p className="mp-tally-big" aria-live="polite">
              <span className="mp-serif">{count}</span>
              {noun}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
