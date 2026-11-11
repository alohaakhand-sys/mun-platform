"use client";

import { ensureMyMembership } from "@/lib/services/membershipService";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileStack, Loader2, Plus, UploadCloud, X, Pencil, Trash2, Clock, CheckCircle2, AlertTriangle, BookOpen, Sparkles,
} from "lucide-react";
import { callWritingAssist } from "@/components/shared/ai/aiWritingClient";
import { openDocReader } from "@/components/session/docs/openDocReader";
import { EndorsementInbox } from "@/components/session/docs/EndorsementInbox";
import { cn } from "@/lib/utils";
import { marked } from "marked";
import { formatDistanceToNow } from "date-fns";
import { MarkdownDocEditor } from "@/components/features/shared/MarkdownDocEditor";
import {
  CommitteeDoc, CommitteeDocType, COMMITTEE_DOC_TYPES, committeeDocTypeLabel,
  createCommitteeDoc, updateCommitteeDoc, deleteCommitteeDoc,
  subscribeMyCommitteeDocs, subscribeApprovedCommitteeDocs,
  finalizeDocEndorsements, requestDocEndorsements,
  ENDORSEMENT_WINDOW_SECS,
} from "@/lib/services/committeeDocService";
import { RosterCountryPicker } from "@/components/session/docs/RosterCountryPicker";
import { getEventById } from "@/lib/services/eventService";
import { sameCommittee } from "@/lib/utils/committee";
import { notifyChairsCommitteeDoc } from "@/lib/services/notifyService";

const STATUS = {
  "collecting-endorsements": { label: "Collecting endorsements", Icon: Clock, cls: "border-primary/30 bg-primary/[0.07] text-primary dark:text-primary" },
  submitted: { label: "Submitted", Icon: Clock, cls: "border-blue-500/30 bg-blue-500/[0.07] text-blue-600 dark:text-blue-400" },
  approved: { label: "Approved", Icon: CheckCircle2, cls: "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Rejected", Icon: AlertTriangle, cls: "border-red-500/30 bg-red-500/[0.07] text-red-600 dark:text-red-400" },
} as const;

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function StatusPill({ status }: { status: CommitteeDoc["status"] }) {
  // Fall back rather than dereference — a paper stored under a status this build no longer knows
  // about would otherwise crash the whole list on `s.cls`.
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

export function CommitteeDocsDelegate({
  eventId,
  committee,
  eventTitle,
  submittedBy,
  submittedByName,
  submittedCountry,
}: {
  eventId: string;
  committee: string;
  eventTitle?: string;
  submittedBy: string;
  submittedByName: string;
  submittedCountry?: string;
}) {
  const { user } = useAuth();
  const [mine, setMine] = useState<CommitteeDoc[] | null>(null);
  const [approved, setApproved] = useState<CommitteeDoc[]>([]);
  const [form, setForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<CommitteeDocType>("working-paper");
  const [title, setTitle] = useState("");
  const [sponsors, setSponsors] = useState<string[]>([]);
  const [signatories, setSignatories] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [roster, setRoster] = useState<string[]>([]);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const finalizing = useRef<Set<string>>(new Set());

  const handleConvert = async (d: CommitteeDoc) => {
    if (!d.id || convertingId) return;
    setConvertingId(d.id);
    try {
      const convertedText = await callWritingAssist({
        action: "convert-resolution",
        surface: "committee-doc",
        text: d.content,
        context: { committee, title: d.title, country: submittedCountry || "" },
      });
      if (convertedText) {
        setEditingId(null);
        setType("draft-resolution");
        setTitle(d.title.replace(/^WP\s*[-—:]*\s*/i, "Draft Resolution ").replace(/^Working Paper\s*[-—:]*\s*/i, "Draft Resolution "));
        setSponsors(d.sponsors || []);
        setSignatories(d.signatories || []);
        setContent(convertedText);
        setError(null);
        setForm(true);
      }
    } catch (e) {
      console.error("handleConvert", e);
    } finally {
      setConvertingId(null);
    }
  };

  /**
   * TWO listeners, not one unfiltered one. The read rule keeps a paper private while it is still
   * `collecting-endorsements`, and a Firestore list query fails WHOLE rather than filtering out the
   * documents that fail the rule — so a single listener over the collection would die with a
   * permissions error as soon as any other delegate in the committee started a handshake.
   * Each of these is a single-field equality that matches a rule branch exactly, so both are
   * automatically indexed and together they read strictly less than the listener they replaced.
   */
  useEffect(() => {
    // No committee → render returns the notice below before `mine` is read.
    if (!committee) return;
    const a = subscribeMyCommitteeDocs(eventId, submittedBy, setMine, committee);
    // Circulating papers are read under the event-membership rule: self-heal the marker before
    // subscribing, since a listener denied once is never retried.
    let b = () => {};
    let gone = false;
    void ensureMyMembership(eventId).finally(() => {
      if (!gone) b = subscribeApprovedCommitteeDocs(eventId, committee, setApproved);
    });
    return () => { gone = true; a(); b(); };
  }, [eventId, committee, submittedBy]);

  /**
   * Roster for the sponsor/signatory pickers. The live console feeds `RosterCountryPicker` from
   * `session.attendance` (who is present); off-session there is no session, so the source is the
   * committee's own country list on the event — everyone assigned to it, which is the right answer
   * away from a sitting. Same component and the same stored shape either way; this used to be two
   * free-text comma-separated inputs writing typo'd names into the confirmed lists.
   */
  useEffect(() => {
    if (!committee) return;
    let alive = true;
    getEventById(eventId).then((ev) => {
      if (!alive || !ev) return;
      const c = (ev.committees || []).find((x) => sameCommittee(x.name, committee));
      setRoster(c?.countries || []);
    });
    return () => { alive = false; };
  }, [eventId, committee]);

  // Count down only while one of my papers is still collecting endorsements.
  const anyCollecting = (mine || []).some((d) => d.status === "collecting-endorsements");
  useEffect(() => {
    if (!anyCollecting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyCollecting]);

  // Author-side finalize once a paper's consent window has elapsed.
  useEffect(() => {
    if (!mine || !user) return;
    for (const d of mine) {
      const ends = d.endorsementEndsAt || 0;
      if (d.status !== "collecting-endorsements" || !d.id || ends <= 0) continue;
      if (now >= ends && !finalizing.current.has(d.id)) {
        const id = d.id;
        finalizing.current.add(id);
        user.getIdToken()
          .then((token) => finalizeDocEndorsements(token, { eventId, docId: id }))
          .catch(() => {})
          .finally(() => finalizing.current.delete(id));
      }
    }
  }, [mine, now, user, eventId]);

  const resetForm = () => {
    setForm(false);
    setEditingId(null);
    setType("working-paper");
    setTitle("");
    setSponsors([]);
    setSignatories([]);
    setContent("");
    setError(null);
  };

  const startNew = () => {
    resetForm();
    setForm(true);
  };

  const startEdit = (d: CommitteeDoc) => {
    setEditingId(d.id!);
    setType(d.type);
    setTitle(d.title);
    setSponsors(d.sponsors || []);
    setSignatories(d.signatories || []);
    setContent(d.content);
    setError(null);
    setForm(true);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return setError("Give the document a title.");
    if (!content.trim()) return setError("Document body is empty.");
    setSaving(true);
    setError(null);
    const sponsorList = sponsors;
    const signatoryList = signatories;

    // Editing an existing paper just tweaks its stored fields (no fresh handshake).
    if (editingId) {
      const res = await updateCommitteeDoc(eventId, editingId, {
        type, title: title.trim(), content, sponsors: sponsorList, signatories: signatoryList, status: "submitted",
      });
      if (!res.success) { setError("Save failed."); setSaving(false); return; }
      setSaving(false);
      resetForm();
      return;
    }

    // New paper — every named sponsor/signatory must consent before joining it.
    const rows = [
      ...sponsorList.map((country) => ({ role: "sponsor" as const, country })),
      ...signatoryList.map((country) => ({ role: "signatory" as const, country })),
    ];
    const collecting = rows.length > 0;
    const endsAt = Date.now() + ENDORSEMENT_WINDOW_SECS * 1000;

    const res = await createCommitteeDoc(eventId, {
      type,
      committee,
      title: title.trim(),
      content,
      // Confirmed lists start with our own delegation only; accepters added on finalize.
      sponsors: submittedCountry ? [submittedCountry] : [],
      signatories: [],
      submittedBy,
      submittedByName,
      ...(submittedCountry ? { submittedCountry } : {}),
      ...(collecting ? { status: "collecting-endorsements" as const, endorsementEndsAt: endsAt } : {}),
    });
    if (!res.success || !res.id) { setError("Submit failed."); setSaving(false); return; }

    notifyChairsCommitteeDoc({
      eventId,
      committee,
      docType: committeeDocTypeLabel(type),
      title: title.trim(),
      delegateName: submittedCountry ? `${submittedByName} (${submittedCountry})` : submittedByName,
      eventTitle,
    });

    if (collecting && user) {
      const token = await user.getIdToken();
      const fan = await requestDocEndorsements(token, { eventId, docId: res.id, endsAt, rows });
      if (fan.ok && fan.created === 0) {
        await finalizeDocEndorsements(token, { eventId, docId: res.id });
      }
    }
    setSaving(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteCommitteeDoc(eventId, id);
  };

  if (!committee) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          You don&apos;t have a committee assigned yet — committee documents unlock once you&apos;re allocated.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-border/50 overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2.5 text-lg">
              <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileStack className="w-5 h-5 text-primary" />
              </span>
              Committee Documents
            </CardTitle>
            <CardDescription>Submit working papers, draft resolutions & amendments to your chair.</CardDescription>
          </div>
          {!form && (
            <Button size="sm" className="gap-1.5 shrink-0" onClick={startNew}>
              <Plus className="w-4 h-4" /> New
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* ── Incoming endorsement requests (someone wants you to sponsor/sign) ── */}
        <EndorsementInbox />

        {/* ── Submit / edit form ─────────────────────────────────────────── */}
        {form && (
          <div className="space-y-4 rounded-2xl border border-border/50 p-4 bg-secondary/[0.03]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as CommitteeDocType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMITTEE_DOC_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Working Paper 1.1" />
              </div>
            </div>
            {/* Chips off the committee's own roster, not free text. Two comma-separated inputs
                used to write whatever was typed straight into the confirmed lists — a typo or a
                delegation that is not in this committee became a "sponsor" nobody could reconcile
                against the console's roster-picked papers. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Mark sponsors <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <p className="text-[11px] text-muted-foreground -mt-0.5">
                  Co-authors who endorse the text. Your delegation is always a sponsor.
                </p>
                <RosterCountryPicker
                  countries={roster} value={sponsors} onChange={setSponsors}
                  locked={submittedCountry ? [submittedCountry] : []} exclude={signatories}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mark signatories <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <p className="text-[11px] text-muted-foreground -mt-0.5">
                  Want it debated — no endorsement implied.
                </p>
                <RosterCountryPicker
                  countries={roster} value={signatories} onChange={setSignatories}
                  exclude={submittedCountry ? [submittedCountry, ...sponsors] : sponsors}
                />
              </div>
            </div>
            {roster.length === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 -mt-1">
                No countries are listed for this committee yet — you can still submit, and the chair
                can add sponsors on review.
              </p>
            )}
            {!editingId && (sponsors.length > 0 || signatories.length > 0) && (
              <p className="text-[11px] text-muted-foreground -mt-1">
                Each marked delegation gets {ENDORSEMENT_WINDOW_SECS}s to accept — only accepters stay on the paper.
              </p>
            )}
            <MarkdownDocEditor
              value={content}
              onChange={setContent}
              placeholder={"# Draft Resolution\n\nThe General Assembly,\n\n*Recalling* …\n\n1. **Calls upon** …"}
              ai={{
                surface: "committee-doc",
                docType: type,
                context: { committee, title, country: submittedCountry || "" },
                onConvertedToDraftResolution: () => setType("draft-resolution"),
              }}
            />
            <div className="flex items-center gap-3 pt-1">
              <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={resetForm} disabled={saving}>
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving || !title.trim() || !content.trim()} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                {editingId ? "Update" : "Submit"}
              </Button>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* ── My submissions ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wide">Your submissions</h4>
          {mine === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : mine.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nothing submitted yet.</p>
          ) : (
            mine.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                eventId={eventId}
                onEdit={startEdit}
                onDelete={handleDelete}
                onConvert={handleConvert}
                convertingId={convertingId}
                editable
                now={now}
              />
            ))
          )}
        </div>

        {/* ── Approved committee documents (read-only, for co-sponsors) ───── */}
        {approved.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wide">Approved in your committee</h4>
            {approved.map((d) => <DocRow key={d.id} doc={d} eventId={eventId} readOnly />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocRow({
  doc,
  eventId,
  onEdit,
  onDelete,
  onConvert,
  convertingId,
  editable,
  readOnly,
  now,
}: {
  doc: CommitteeDoc;
  eventId: string;
  onEdit?: (d: CommitteeDoc) => void;
  onDelete?: (id: string) => void;
  onConvert?: (d: CommitteeDoc) => void;
  convertingId?: string | null;
  editable?: boolean;
  readOnly?: boolean;
  now?: number;
}) {
  const [open, setOpen] = useState(false);
  const created = doc.createdAt?.toDate?.();
  const canEdit = editable && doc.status === "submitted";
  const collecting = doc.status === "collecting-endorsements";
  const leftMs = collecting && now != null ? (doc.endorsementEndsAt || 0) - now : 0;

  return (
    <div className="rounded-2xl border border-border/50 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-secondary">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{doc.title}</p>
            <StatusPill status={doc.status} />
            {collecting && (
              <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold tabular-nums",
                leftMs <= 15000 ? "text-red-600 dark:text-red-400" : "text-primary dark:text-primary")}>
                <Clock className="w-3 h-3" /> {fmtLeft(Math.max(0, leftMs))}
              </span>
            )}
          </div>
          {collecting && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Waiting on sponsors &amp; signatories to accept — only accepters stay, then it unlocks to introduce.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {committeeDocTypeLabel(doc.type)}
            {readOnly && doc.submittedByName ? ` · ${doc.submittedByName}` : ""}
            {created ? ` · ${formatDistanceToNow(created, { addSuffix: true })}` : ""}
            {doc.sponsors?.length ? ` · ${doc.sponsors.length} sponsor${doc.sponsors.length > 1 ? "s" : ""}` : ""}
            {doc.signatories?.length ? ` · ${doc.signatories.length} signator${doc.signatories.length > 1 ? "ies" : "y"}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button size="sm" variant="ghost" className="gap-1.5" title="Open in reader window"
            onClick={() => doc.id && openDocReader(eventId, doc.id)}>
            <BookOpen className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Open</span>
          </Button>
          {doc.type === "working-paper" && onConvert && (
            <Button size="sm" variant="outline" className="gap-1.5 text-primary dark:text-primary border-primary/30 hover:bg-primary/10"
              disabled={convertingId === doc.id} onClick={() => onConvert(doc)} title="Auto-convert this Working Paper into a formal UN Draft Resolution via AI">
              {convertingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Convert to Resolution</span>
            </Button>
          )}
          {canEdit && onEdit && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(doc)}>
              <Pencil className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Edit</span>
            </Button>
          )}
          {canEdit && onDelete && (
            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => onDelete(doc.id!)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "View"}</Button>
        </div>
      </div>
      {doc.chairNote && (
        <div className="px-4 py-2 text-xs border-t border-border/40 bg-background">
          <span className="font-semibold">Chair note: </span>
          <span className="text-muted-foreground">{doc.chairNote}</span>
        </div>
      )}
      {open && (
        <div
          className="markdown-content px-4 sm:px-6 py-5 max-h-[480px] overflow-auto border-t border-border/40"
          dangerouslySetInnerHTML={{ __html: marked.parse(doc.content) as string }}
        />
      )}
    </div>
  );
}
