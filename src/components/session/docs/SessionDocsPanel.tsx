"use client";

/**
 * Chair's in-session Documents panel — the review + publish desk for delegate-submitted
 * working papers / draft resolutions (mymun-style dais approval flow).
 *
 * The `docs` subscription lives at the console top level (like points/requests/motions)
 * so the tool-list badge can count pending submissions while this panel is closed.
 * Approve / Reject reuse the committeeDocService status flow the Documents hub already
 * uses; "Publish to projector" denormalizes a ref onto the session doc (PublishedDocRef —
 * same pattern as the published vote result).
 */
import { useMemo, useState } from "react";
import {
  updateCommitteeDocStatus, committeeDocTypeLabel, type CommitteeDoc,
} from "@/lib/services/committeeDocService";
import {
  publishDocToProjector, unpublishDoc, type LiveSession,
} from "@/lib/services/sessionService";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import {
  PanelEmpty, QueueRow, StatusPill, DismissWithReason, GroupLabel, SubCard, type PanelTone,
} from "../console/shared";
import { openDocReader } from "./openDocReader";
import {
  FileStack, FileText, ScrollText, BookOpen, Check, Cast, MonitorOff, Loader2,
} from "lucide-react";

const TYPE_ICON: Record<string, React.ElementType> = {
  "working-paper": FileText,
  "draft-resolution": ScrollText,
  amendment: FileStack,
};

const STATUS_TONE: Record<string, PanelTone> = {
  submitted: "amber",
  approved: "emerald",
  rejected: "muted",
};

function ago(createdAt: any): string {
  const secs = createdAt?.seconds ? Math.max(0, Math.floor(Date.now() / 1000 - createdAt.seconds)) : 0;
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

export function SessionDocsPanel({
  eventId, sessionId, session, canControl, userId, docs,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  canControl: boolean;
  userId: string;
  /** Console-level subscription (subscribeCommitteeDocs) — shared with the tool-list badge. */
  docs: CommitteeDoc[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const published = session.publishedDoc;

  const awaiting = useMemo(() => docs.filter((d) => d.status === "submitted"), [docs]);
  const approved = useMemo(() => docs.filter((d) => d.status === "approved"), [docs]);
  const rejected = useMemo(() => docs.filter((d) => d.status === "rejected"), [docs]);
  const [showRejected, setShowRejected] = useState(false);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    if (!canControl || busy) return;
    setBusy(id);
    try { await fn(); }
    catch (e) { console.error("doc action", e); }
    finally { setBusy(null); }
  };

  const publish = (d: CommitteeDoc) => {
    if (!d.id) return;
    if (d.status !== "approved" && !confirm("This document isn't approved yet. Publish it to the projector anyway?")) return;
    run(d.id, () => publishDocToProjector(eventId, sessionId, {
      docId: d.id!,
      title: d.title,
      docType: d.type,
      submittedCountry: d.submittedCountry,
      sponsors: d.sponsors ?? [],
      signatories: d.signatories ?? [],
    }, userId));
  };

  const row = (d: CommitteeDoc) => {
    const isBusy = busy === d.id;
    const isPublished = !!published && published.docId === d.id;
    const sponsorCount = d.sponsors?.length ?? 0;
    const signatoryCount = d.signatories?.length ?? 0;
    return (
      <QueueRow
        key={d.id}
        tone={isPublished ? "violet" : STATUS_TONE[d.status] || "primary"}
        icon={TYPE_ICON[d.type] || FileText}
        flag={d.submittedCountry ? <CountryFlag code={d.submittedCountry} size={26} /> : undefined}
        title={d.title}
        time={`${ago(d.createdAt)} ago`}
        statusChip={(
          <>
            {isPublished && <StatusPill tone="violet">on projector</StatusPill>}
            {d.status === "approved" && !isPublished && <StatusPill tone="emerald">approved</StatusPill>}
            {d.status === "submitted" && <StatusPill tone="amber">awaiting review</StatusPill>}
            {d.status === "rejected" && <StatusPill tone="muted">rejected</StatusPill>}
          </>
        )}
        meta={(
          <>
            {committeeDocTypeLabel(d.type)}
            {d.submittedCountry && <> · {getCountryName(d.submittedCountry) || d.submittedCountry}</>}
            {sponsorCount > 0 && <> · {sponsorCount} sponsor{sponsorCount === 1 ? "" : "s"}</>}
            {signatoryCount > 0 && <> · {signatoryCount} signator{signatoryCount === 1 ? "y" : "ies"}</>}
          </>
        )}
        note={d.chairNote ? (
          <p className="text-[11.5px] text-muted-foreground leading-snug italic mt-1">“{d.chairNote}”</p>
        ) : undefined}
        actions={(
          <div className="flex flex-col gap-2 w-full @lg:w-auto @lg:flex-row @lg:items-center">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 w-full @lg:w-auto"
              onClick={() => d.id && openDocReader(eventId, d.id)}>
              <BookOpen className="w-3.5 h-3.5" /> Read
            </Button>
            {canControl && (
              <div className="flex flex-wrap items-center gap-2">
                {d.status === "submitted" && (
                  <Button size="sm" disabled={isBusy} className="h-8 gap-1.5 flex-1 @lg:flex-none"
                    onClick={() => d.id && run(d.id, () => updateCommitteeDocStatus(eventId, d.id!, "approved", "", userId))}>
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                  </Button>
                )}
                {d.status !== "rejected" && (
                  isPublished ? (
                    <Button size="sm" variant="outline" disabled={isBusy} className="h-8 gap-1.5 flex-1 @lg:flex-none"
                      onClick={() => d.id && run(d.id, () => unpublishDoc(eventId, sessionId))}>
                      <MonitorOff className="w-3.5 h-3.5" /> Unpublish
                    </Button>
                  ) : (
                    <Button size="sm" variant={d.status === "approved" ? "default" : "outline"} disabled={isBusy}
                      className="h-8 gap-1.5 flex-1 @lg:flex-none" onClick={() => publish(d)}>
                      <Cast className="w-3.5 h-3.5" /> Publish
                    </Button>
                  )
                )}
                {d.status === "submitted" && (
                  <DismissWithReason label="Reject" placeholder="Reason for the delegate (optional)" disabled={isBusy}
                    onConfirm={(reason) => { if (d.id) return run(d.id, () => updateCommitteeDocStatus(eventId, d.id!, "rejected", reason, userId)); }} />
                )}
              </div>
            )}
          </div>
        )}
      />
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* On-projector strip */}
      {published && (
        <SubCard className="p-3 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <Cast className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">On projector</p>
            <p className="text-[13px] font-semibold truncate">{published.title}</p>
          </div>
          {canControl && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0"
              onClick={() => run("unpublish", () => unpublishDoc(eventId, sessionId))}>
              <MonitorOff className="w-3.5 h-3.5" /> Unpublish
            </Button>
          )}
        </SubCard>
      )}

      <GroupLabel count={awaiting.length}>Awaiting review</GroupLabel>
      {awaiting.length === 0
        ? <PanelEmpty icon={FileStack}>No submissions waiting. Delegates write documents in their Documents tool.</PanelEmpty>
        : awaiting.map(row)}

      {approved.length > 0 && (
        <>
          <GroupLabel count={approved.length} className="mt-1.5">Approved</GroupLabel>
          {approved.map(row)}
        </>
      )}

      {rejected.length > 0 && (
        <div className="pt-2 mt-1 border-t border-border/40">
          <button type="button" onClick={() => setShowRejected((v) => !v)}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-0.5">
            {showRejected ? "Hide" : "Show"} rejected ({rejected.length})
          </button>
          {showRejected && <div className="mt-2 flex flex-col gap-2.5">{rejected.map(row)}</div>}
        </div>
      )}
    </div>
  );
}
