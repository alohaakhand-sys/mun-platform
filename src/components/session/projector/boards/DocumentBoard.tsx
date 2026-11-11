"use client";

/**
 * A draft resolution on the floor, made readable from a seat.
 *
 * The old hero put the body in a `max-h-[48vh] overflow-y-auto` panel. On a projector that is a
 * dead end: the screen is on a wall, nobody in the room can scroll it, and the operator is looking
 * at a different window. Clauses below the fold simply never existed.
 *
 * So the document PAGES ITSELF. Two columns, `column-fill: auto`, fixed height — the text flows
 * into columns that continue rightward, and a page is one spread. It advances every 12 seconds and
 * loops, which is what a room reading operative clauses actually needs, and it uses the width of a
 * 16:9 screen instead of one narrow measure down the middle.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { marked } from "marked";
import {
  getCommitteeDoc, committeeDocTypeLabel,
  type CommitteeDoc, type CommitteeDocType,
} from "@/lib/services/committeeDocService";
import type { PublishedDocRef } from "@/lib/services/sessionService";
import { getCountryName } from "@/lib/data/countries";
import { BoardFlag, Eyebrow } from "../board";
import { Loader2 } from "lucide-react";

const PAGE_MS = 12000;

export function DocumentBoard({ eventId, published }: { eventId: string; published: PublishedDocRef }) {
  const [docData, setDocData] = useState<CommitteeDoc | null | undefined>(undefined);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);

  // One fetch per published document — no listener. Publishing a different document remounts this
  // component (keyed on docId in `SessionProjector`), so there is no stale body to clear here.
  useEffect(() => {
    let cancelled = false;
    getCommitteeDoc(eventId, published.docId).then((d) => { if (!cancelled) setDocData(d); });
    return () => { cancelled = true; };
  }, [eventId, published.docId]);

  let parsed = "";
  if (docData?.content) {
    try { parsed = marked.parse(docData.content) as string; }
    catch { parsed = docData.content; }
  }

  // Re-measure after the body lands and on any resize (the +/- keys change the type scale).
  useLayoutEffect(() => {
    const el = flow.current;
    const box = viewport.current;
    if (!el || !box) return;
    const measure = () => {
      const w = box.clientWidth || 1;
      setPages(Math.max(1, Math.round(el.scrollWidth / w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [parsed]);

  // `page` counts up forever and is taken modulo `pages` at render, so a re-measure (the +/- keys
  // change the type scale, which changes the page count) never has to reset it mid-flight.
  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(() => setPage((p) => p + 1), PAGE_MS);
    return () => clearInterval(id);
  }, [pages]);

  const spread = pages > 1 ? page % pages : 0;

  const endorsers = [
    { label: "Sponsors", values: published.sponsors || [] },
    { label: "Signatories", values: published.signatories || [] },
  ].filter((r) => r.values.length > 0);

  return (
    <div className="h-full flex flex-col gap-[0.7em] animate-proj-rise" style={{ fontSize: "var(--t-body)" }}>
      <div className="shrink-0 flex items-start justify-between gap-[1em]">
        <div className="min-w-0">
          <Eyebrow tone="accent" dim={false}>On the floor · {committeeDocTypeLabel(published.docType as CommitteeDocType)}</Eyebrow>
          <p className="font-display font-black uppercase leading-[0.88] mt-[0.2em] [text-wrap:balance]"
            style={{ fontSize: "var(--t-lead)", letterSpacing: "0.01em" }}>
            {published.title}
          </p>
          {published.submittedCountry && (
            <span className="inline-flex items-center gap-[0.45em] mt-[0.35em] text-proj-dim">
              <span className="overflow-hidden rounded-[0.15em]" style={{ width: "1.5em", height: "1.125em" }}>
                <BoardFlag code={published.submittedCountry} className="w-full h-full" />
              </span>
              <span className="font-semibold text-proj-ink">
                {getCountryName(published.submittedCountry) || published.submittedCountry}
              </span>
            </span>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-[0.4em]" style={{ maxWidth: "40%" }}>
          {endorsers.map((row) => (
            <div key={row.label} className="flex items-center justify-end gap-[0.4em] flex-wrap">
              <Eyebrow className="shrink-0">{row.label} · {row.values.length}</Eyebrow>
              {row.values.slice(0, 10).map((c) => (
                <span key={c} className="overflow-hidden rounded-[0.12em] shrink-0"
                  style={{ width: "1.4em", height: "1.05em" }} title={getCountryName(c) || c}>
                  <BoardFlag code={c} className="w-full h-full" />
                </span>
              ))}
              {row.values.length > 10 && (
                <span className="font-mono text-proj-dim" style={{ fontSize: "0.8em" }}>+{row.values.length - 10}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div ref={viewport} className="flex-1 min-h-0 overflow-hidden relative">
        {docData === undefined ? (
          <div className="h-full grid place-items-center"><Loader2 className="w-[2em] h-[2em] animate-spin text-primary" /></div>
        ) : docData === null ? (
          <div className="h-full grid place-items-center text-proj-dim font-semibold text-center px-[2em]">
            The document could not be loaded. The chair can publish it again from the Documents panel.
          </div>
        ) : (
          <div
            ref={flow}
            className="markdown-content h-full transition-transform duration-500 ease-out"
            style={{
              columnCount: 2,
              columnGap: "3em",
              columnFill: "auto",
              transform: `translateX(calc(${-spread} * (100% + 3em)))`,
            }}
            dangerouslySetInnerHTML={{ __html: parsed }}
          />
        )}
      </div>

      {pages > 1 && (
        <div className="shrink-0 flex items-center gap-[0.6em]">
          <div className="flex-1 rounded-full bg-proj-sunk overflow-hidden"
            style={{ height: "calc(clamp(4px, 0.35vw, 9px) * var(--proj-scale))" }}>
            <div className="h-full bg-primary rounded-full transition-[width] duration-500"
              style={{ width: `${((spread + 1) / pages) * 100}%` }} />
          </div>
          <Eyebrow className="shrink-0"><span className="font-mono">{spread + 1}</span> of <span className="font-mono">{pages}</span></Eyebrow>
        </div>
      )}
    </div>
  );
}
