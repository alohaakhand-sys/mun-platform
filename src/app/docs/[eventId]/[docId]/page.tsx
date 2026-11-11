"use client";

/**
 * Standalone committee-document reader — the "open as a single document" window for
 * draft resolutions / working papers. Opened as a named popup from the live consoles
 * (see src/components/session/docs/openDocReader.ts) but works as a plain URL too.
 *
 * Blog-reader layout (see /blogs/[articleId]): eyebrow meta → title → sponsors /
 * signatories flag rows → `.markdown-content` body. Light "paper" look on purpose —
 * this window is for reading, not for the dark console room.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { marked } from "marked";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCommitteeDoc, committeeDocTypeLabel, CommitteeDoc, CommitteeDocStatus,
} from "@/lib/services/committeeDocService";
import { getCountryName } from "@/lib/data/countries";
import { FileText, Printer, Calendar, Landmark, Lock } from "lucide-react";

const STATUS_META: Record<CommitteeDocStatus, { label: string; cls: string }> = {
  "collecting-endorsements": { label: "Collecting endorsements", cls: "bg-violet-500/10 border-violet-500/30 text-violet-600" },
  submitted: { label: "Submitted", cls: "bg-amber-500/10 border-amber-500/30 text-amber-600" },
  approved: { label: "Approved", cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" },
  rejected: { label: "Rejected", cls: "bg-red-500/10 border-red-500/30 text-red-600" },
};

function CountryChips({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {label} <span className="font-normal normal-case">({values.length})</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border/50 bg-secondary/25 text-[12.5px] font-medium"
          >
            <CountryFlag code={c} size={14} />
            {getCountryName(c) || c}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CommitteeDocReaderPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const docId = params.docId as string;
  const { user, loading: authLoading } = useAuth();

  const [docData, setDocData] = useState<CommitteeDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      const d = await getCommitteeDoc(eventId, docId);
      if (!cancelled) {
        setDocData(d);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, eventId, docId]);

  if (authLoading) {
    return (
      <div className="container mx-auto py-10 px-4 sm:px-6 max-w-3xl space-y-6">
        <Skeleton className="h-10 w-3/4 rounded-lg" />
        <Skeleton className="h-4 w-1/3 rounded-lg" />
        <div className="space-y-3 mt-8">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto py-20 px-4 text-center text-muted-foreground max-w-md">
        <div className="space-y-4">
          <Lock className="w-14 h-14 mx-auto text-muted-foreground/40" />
          <h2 className="text-2xl font-bold text-foreground">Sign in to read this document</h2>
          <p className="text-sm">Committee documents are only visible to signed-in participants.</p>
          <Link href="/login" className="inline-block mt-2 text-primary underline hover:text-primary/90 font-medium">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto py-10 px-4 sm:px-6 max-w-3xl space-y-6">
        <Skeleton className="h-10 w-3/4 rounded-lg" />
        <Skeleton className="h-4 w-1/3 rounded-lg" />
        <div className="space-y-3 mt-8">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      </div>
    );
  }

  if (!docData) {
    return (
      <div className="container mx-auto py-20 px-4 text-center text-muted-foreground max-w-md">
        <div className="space-y-4">
          <FileText className="w-14 h-14 mx-auto text-muted-foreground/40" />
          <h2 className="text-2xl font-bold text-foreground">Document not found</h2>
          <p className="text-sm">It may have been deleted, or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  let parsed = "";
  try {
    parsed = marked.parse(docData.content) as string;
  } catch {
    parsed = docData.content;
  }

  const status = STATUS_META[docData.status] ?? STATUS_META.submitted;

  return (
    <div className="container mx-auto py-10 px-4 sm:px-6 max-w-3xl">
      <article className="space-y-6">
        {/* Eyebrow: committee + type + status */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Badge variant="outline" className="border-border/60 text-muted-foreground gap-1.5">
            <Landmark className="w-3 h-3" /> {docData.committee}
          </Badge>
          <Badge className="bg-primary/10 border-primary/20 text-primary font-semibold">
            {committeeDocTypeLabel(docData.type)}
          </Badge>
          <Badge variant="outline" className={status.cls}>{status.label}</Badge>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="rounded-lg gap-1.5" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-foreground">
          {docData.title}
        </h1>

        {/* Submitter + date */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4 border-y border-border/40 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            {docData.submittedCountry && <CountryFlag code={docData.submittedCountry} size={18} />}
            <span>
              <span className="font-semibold text-foreground">
                {docData.submittedCountry
                  ? getCountryName(docData.submittedCountry) || docData.submittedCountry
                  : docData.submittedByName}
              </span>
              {docData.submittedCountry && (
                <span className="text-xs"> · {docData.submittedByName}</span>
              )}
            </span>
          </span>
          {docData.createdAt?.toDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary/70" />
              {format(docData.createdAt.toDate(), "MMMM d, yyyy")}
            </span>
          )}
        </div>

        {/* Sponsors / signatories */}
        {((docData.sponsors?.length ?? 0) > 0 || (docData.signatories?.length ?? 0) > 0) && (
          <div className="space-y-4 p-4 rounded-2xl border border-border/40 bg-secondary/10">
            <CountryChips label="Sponsors" values={docData.sponsors ?? []} />
            <CountryChips label="Signatories" values={docData.signatories ?? []} />
          </div>
        )}

        {/* Chair note (rejection reason etc.) */}
        {docData.chairNote && (
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm">
            <span className="font-semibold">Chair&apos;s note: </span>
            {docData.chairNote}
          </div>
        )}

        {/* Body */}
        <div className="markdown-content pt-2" dangerouslySetInnerHTML={{ __html: parsed }} />
      </article>
    </div>
  );
}
