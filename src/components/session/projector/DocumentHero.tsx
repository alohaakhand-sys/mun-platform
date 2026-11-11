"use client";

/**
 * Projector hero for a committee document the chair has published to the room — a draft
 * resolution / working paper "on the floor". Deliberately NOT in `SessionHeroes.tsx`:
 * those are pure session-doc-driven, while this one lazily fetches the document body
 * (the session doc carries only a `PublishedDocRef` — see sessionService).
 *
 * Reads at a distance: big title + type badge up top, sponsor/signatory flag chips, then
 * a scrollable body panel — rooms genuinely read operative clauses off the screen.
 */
import { useEffect, useState } from "react";
import { marked } from "marked";
import {
  getCommitteeDoc, committeeDocTypeLabel, type CommitteeDoc, type CommitteeDocType,
} from "@/lib/services/committeeDocService";
import type { PublishedDocRef } from "@/lib/services/sessionService";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { ScrollText, Loader2 } from "lucide-react";

function FlagChipRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  const shown = values.slice(0, 12);
  return (
    <div className="w-full">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
        {label} · {values.length}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {shown.map((c) => (
          <span key={c}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-secondary/20 border-border/40">
            <CountryFlag code={c} size={16} />
            {getCountryName(c) || c}
          </span>
        ))}
        {values.length > shown.length && (
          <span className="inline-flex items-center px-3 py-1.5 text-sm text-muted-foreground">
            +{values.length - shown.length} more
          </span>
        )}
      </div>
    </div>
  );
}

export function DocumentHero({ eventId, published }: { eventId: string; published: PublishedDocRef }) {
  const [docData, setDocData] = useState<CommitteeDoc | null | undefined>(undefined);

  // One fetch per published document — no listener; a re-publish changes docId and refetches.
  useEffect(() => {
    let cancelled = false;
    setDocData(undefined);
    getCommitteeDoc(eventId, published.docId).then((d) => {
      if (!cancelled) setDocData(d);
    });
    return () => { cancelled = true; };
  }, [eventId, published.docId]);

  let parsed = "";
  if (docData?.content) {
    try { parsed = marked.parse(docData.content) as string; }
    catch { parsed = docData.content; }
  }

  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border/50 bg-secondary/10">
        <div className="flex items-center gap-2 min-w-0">
          <ScrollText className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary truncate">Document on the Floor</span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground shrink-0">
          {committeeDocTypeLabel(published.docType as CommitteeDocType)}
        </span>
      </div>
      <div className="p-6 sm:p-8 flex flex-col items-center text-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <p className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">{published.title}</p>
          {published.submittedCountry && (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              Submitted by <CountryFlag code={published.submittedCountry} size={18} />
              <span className="font-semibold text-foreground">
                {getCountryName(published.submittedCountry) || published.submittedCountry}
              </span>
            </p>
          )}
        </div>

        <FlagChipRow label="Sponsors" values={published.sponsors || []} />
        <FlagChipRow label="Signatories" values={published.signatories || []} />

        {/* Body — scrollable so the room can read the clauses off the screen. */}
        <div className={cn(
          "w-full rounded-2xl bg-secondary/10 border border-border/40 text-left",
          "max-h-[48vh] overflow-y-auto p-6",
        )}>
          {docData === undefined ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : docData === null ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              The document could not be loaded. The chair can re-publish it from the Documents panel.
            </p>
          ) : (
            <div className="markdown-content" dangerouslySetInnerHTML={{ __html: parsed }} />
          )}
        </div>
      </div>
    </div>
  );
}
