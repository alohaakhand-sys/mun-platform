"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import {
  FileStack, Loader2, CheckCircle2, Clock, RotateCcw, XCircle, BookOpen,
} from "lucide-react";
import { openDocReader } from "@/components/session/docs/openDocReader";
import { cn } from "@/lib/utils";
import { marked } from "marked";
import { formatDistanceToNow } from "date-fns";
import {
  CommitteeDoc, CommitteeDocStatus, committeeDocTypeLabel,
  listCommitteeDocs, listApprovedCommitteeDocs, updateCommitteeDocStatus,
} from "@/lib/services/committeeDocService";

const STATUS = {
  "collecting-endorsements": { label: "Collecting endorsements", Icon: Clock, cls: "border-primary/30 bg-primary/[0.07] text-primary dark:text-primary" },
  submitted: { label: "Submitted", Icon: Clock, cls: "border-blue-500/30 bg-blue-500/[0.07] text-blue-600 dark:text-blue-400" },
  approved: { label: "Approved", Icon: CheckCircle2, cls: "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Rejected", Icon: XCircle, cls: "border-red-500/30 bg-red-500/[0.07] text-red-600 dark:text-red-400" },
} as const;

function StatusPill({ status }: { status: CommitteeDoc["status"] }) {
  // Fall back rather than dereference — see the same guard in CommitteeDocsDelegate.
  const s = STATUS[status as keyof typeof STATUS];
  if (!s) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
        <Clock className="w-3 h-3" /> {status}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", s.cls)}>
      <s.Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}

export function CommitteeDocsChair({
  eventId,
  committee,
  reviewerUid,
  canReview = true,
}: {
  eventId: string;
  committee: string;
  reviewerUid: string;
  canReview?: boolean;
}) {
  const [docs, setDocs] = useState<CommitteeDoc[] | null>(null);

  /**
   * `canReview` decides the QUERY, not just which buttons render.
   *
   * This component is mounted twice from the Documents hub: for reviewers (chair / EB / organizer),
   * and read-only for faculty and observers — who are NOT event staff, so the `committeeDocs` read
   * rule does not let them see a paper that is still collecting endorsements. An unfiltered listing
   * fails WHOLE on a document the rule rejects, so a read-only viewer must ask only for the papers
   * they may actually have: the approved ones. That is also the right product answer — an observer
   * has no business reading an in-flight draft.
   */
  const load = () => (canReview
    ? listCommitteeDocs(eventId, committee)
    : listApprovedCommitteeDocs(eventId, committee));

  const reload = async () => setDocs(await load());

  useEffect(() => {
    // No committee → render returns the notice below before `docs` is read.
    if (!committee) return;
    let active = true;
    load().then((d) => { if (active) setDocs(d); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, committee, canReview]);

  if (!committee) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No committee in scope — committee documents appear once you&apos;re assigned a committee.
        </CardContent>
      </Card>
    );
  }

  const pending = docs?.filter((d) => d.status === "submitted").length ?? 0;

  return (
    <Card className="glass-card border-border/50 overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileStack className="w-5 h-5 text-primary" />
          </span>
          Committee Documents
          {pending > 0 && (
            <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">{pending}</span>
          )}
        </CardTitle>
        <CardDescription>Working papers, draft resolutions & amendments submitted by your delegates.</CardDescription>
      </CardHeader>

      <CardContent className="pt-6 space-y-3">
        {docs === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : docs.length === 0 ? (
          <div className="py-10 text-center">
            <FileStack className="w-10 h-10 mx-auto mb-3 text-muted-foreground/25" />
            <p className="font-medium text-sm">No submissions yet</p>
            <p className="text-xs text-muted-foreground mt-1">Delegate documents will land here for review.</p>
          </div>
        ) : (
          docs.map((d) => (
            <ReviewRow
              key={d.id}
              doc={d}
              eventId={eventId}
              canReview={canReview}
              onReview={async (status, note) => {
                await updateCommitteeDocStatus(eventId, d.id!, status, note, reviewerUid);
                reload();
              }}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ReviewRow({
  doc,
  eventId,
  canReview,
  onReview,
}: {
  doc: CommitteeDoc;
  eventId: string;
  canReview: boolean;
  onReview: (status: CommitteeDocStatus, note: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(doc.chairNote || "");
  const [busy, setBusy] = useState<CommitteeDocStatus | null>(null);
  const created = doc.createdAt?.toDate?.();

  const act = async (status: CommitteeDocStatus) => {
    setBusy(status);
    await onReview(status, note.trim());
    setBusy(null);
  };

  const author = doc.submittedCountry ? `${doc.submittedByName} (${doc.submittedCountry})` : doc.submittedByName;

  return (
    <div className="rounded-2xl border border-border/50 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-secondary">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{doc.title}</p>
            <StatusPill status={doc.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {committeeDocTypeLabel(doc.type)} · {author}
            {created ? ` · ${formatDistanceToNow(created, { addSuffix: true })}` : ""}
            {doc.sponsors?.length ? ` · ${doc.sponsors.length} sponsor${doc.sponsors.length > 1 ? "s" : ""}` : ""}
            {doc.signatories?.length ? ` · ${doc.signatories.length} signator${doc.signatories.length > 1 ? "ies" : "y"}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="gap-1.5" title="Open in reader window"
            onClick={() => doc.id && openDocReader(eventId, doc.id)}>
            <BookOpen className="w-3.5 h-3.5" /> Open
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Review"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/40">
          {doc.sponsors?.length ? (
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Sponsors: </span>{doc.sponsors.join(", ")}
            </p>
          ) : null}
          {doc.signatories?.length ? (
            <p className="px-4 pt-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Signatories: </span>{doc.signatories.join(", ")}
            </p>
          ) : null}
          <div
            className="markdown-content px-4 sm:px-6 py-5 max-h-[480px] overflow-auto"
            dangerouslySetInnerHTML={{ __html: marked.parse(doc.content) as string }}
          />
          {canReview && (
            <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-4">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note to the delegate (shown with the decision)…"
                className="min-h-[72px] rounded-xl text-sm"
              />
              <AiTextareaAssist
                value={note}
                onPick={setNote}
                surface="chair-feedback"
                context={{ committee: doc.committee, country: doc.submittedCountry || "" }}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={!!busy} onClick={() => act("approved")}>
                  {busy === "approved" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => act("submitted")}>
                  {busy === "submitted" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Request revision
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-red-600 hover:text-red-700" disabled={!!busy} onClick={() => act("rejected")}>
                  {busy === "rejected" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Reject
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
