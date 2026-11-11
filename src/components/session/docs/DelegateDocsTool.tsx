"use client";

/**
 * Delegate in-session document authoring — the "Documents" tool of the delegate console.
 *
 * `DelegateDocsTool` is the tool-panel body: the delegate's own working papers / draft
 * resolutions (with chair status), a "what's on the floor" row when the chair has published
 * one, and the composer launcher. `DocComposer` is the authoring surface itself — rendered
 * by the console in a wide ConsoleModal: rich-text (markdown) body via MarkdownDocEditor
 * plus Sponsors / Signatories country marking sourced from `session.attendance` (the one
 * roster a delegate can always read).
 *
 * Docs land in the SAME `committeeDocs` collection as the Documents-hub flow, so a paper
 * written live also shows up in /dashboard/documents and vice versa.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  createCommitteeDoc, subscribeMyCommitteeDocs, committeeDocTypeLabel, COMMITTEE_DOC_TYPES,
  requestDocEndorsements, finalizeDocEndorsements, subscribeDocEndorsements,
  ENDORSEMENT_WINDOW_SECS,
  type CommitteeDoc, type CommitteeDocType, type CommitteeDocStatus, type DocEndorsement,
} from "@/lib/services/committeeDocService";
import {
  proposeMotion, type LiveSession, type ParticipationIdentity, type ProxyAttribution,
} from "@/lib/services/sessionService";
import { notifyChairsCommitteeDoc } from "@/lib/services/notifyService";
import { MarkdownDocEditor } from "@/components/features/shared/MarkdownDocEditor";
import { callWritingAssist } from "@/components/shared/ai/aiWritingClient";
import { RosterCountryPicker } from "./RosterCountryPicker";
import { openDocReader } from "./openDocReader";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { FieldLabel, GroupLabel, SubCard } from "../console/shared";
import { cn } from "@/lib/utils";
import {
  FileStack, FilePlus2, BookOpen, Loader2, Megaphone, CheckCircle2, Presentation,
  Clock, Check, X, Sparkles,
} from "lucide-react";

const STATUS_CHIP: Record<CommitteeDocStatus, { label: string; cls: string }> = {
  "collecting-endorsements": { label: "Collecting", cls: "text-violet-600 dark:text-violet-400" },
  submitted: { label: "Submitted", cls: "text-amber-600 dark:text-amber-400" },
  approved: { label: "Approved", cls: "text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Rejected", cls: "text-red-600 dark:text-red-400" },
};
/** Never dereference the map directly — a paper written before a status was retired would crash. */
const statusChip = (s: CommitteeDocStatus) =>
  STATUS_CHIP[s] ?? { label: s, cls: "text-muted-foreground" };

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Deduped roster countries from the session doc (the source a delegate may read). */
function attendanceCountries(session: LiveSession): string[] {
  return Object.values(session.attendance || {}).map((a) => a?.country || "").filter(Boolean);
}

// ── Tool panel body ──────────────────────────────────────────────────────────────
export function DelegateDocsTool({
  eventId, sessionId, session, identity, onCompose, proxy,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  identity: ParticipationIdentity;
  /** Open the composer modal (owned by the console so it can outlive this panel). */
  onCompose: (initialDoc?: { type?: CommitteeDocType; title?: string; content?: string; sponsors?: string[]; signatories?: string[] }) => void;
  /**
   * Set when a vice-chair is acting for `identity`'s delegation from the Represent panel. The
   * listener below already reads the represented delegate's papers (a chair-tier reader passes the
   * `committeeDocs` read rule at every status), so only the writes and the copy change.
   */
  proxy?: ProxyAttribution;
}) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<CommitteeDoc[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [movedIds, setMovedIds] = useState<Set<string>>(new Set());

  // Live so the endorsement tracker below updates as responses land and the paper's
  // status flips collecting-endorsements → submitted on finalize.
  //
  // Server-side `where submittedBy == me`, not a client-side filter over the whole collection.
  // The read rule only lets a delegate see another delegation's paper once it leaves
  // `collecting-endorsements`, and a list query fails WHOLE rather than filtering — so an
  // unfiltered listener here died with a permissions error the moment anyone else in the room was
  // mid-handshake. It is also far cheaper: this pulls one delegate's papers, not the committee's.
  useEffect(() => {
    if (!identity.committeeId) return;
    return subscribeMyCommitteeDocs(
      eventId, identity.delegateId, setDocs, identity.committeeId,
    );
  }, [eventId, identity.delegateId, identity.committeeId]);

  const published = session.publishedDoc;

  const moveToIntroduce = async (d: CommitteeDoc) => {
    if (!d.id || busyId) return;
    setBusyId(d.id);
    try {
      await proposeMotion(eventId, sessionId, identity, "introduce_document",
        { documentId: d.id, topic: d.title }, "", proxy);
      setMovedIds((prev) => new Set(prev).add(d.id!));
    } catch (e) {
      console.error("moveToIntroduce", e);
    } finally {
      setBusyId(null);
    }
  };

  const convertWorkingPaper = async (d: CommitteeDoc) => {
    if (!d.id || convertingId) return;
    setConvertingId(d.id);
    try {
      const convertedText = await callWritingAssist({
        action: "convert-resolution",
        surface: "committee-doc",
        text: d.content,
        context: { committee: identity.committeeId || "", title: d.title, country: identity.country || "" },
      });
      if (convertedText) {
        onCompose({
          type: "draft-resolution",
          title: d.title.replace(/^WP\s*[-—:]*\s*/i, "Draft Resolution ").replace(/^Working Paper\s*[-—:]*\s*/i, "Draft Resolution "),
          content: convertedText,
          sponsors: d.sponsors,
          signatories: d.signatories,
        });
      }
    } catch (e) {
      console.error("convertWorkingPaper", e);
    } finally {
      setConvertingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* On the floor */}
      {published && (
        <SubCard className="p-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Presentation className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">On the floor</p>
              <p className="text-[13px] font-semibold truncate">{published.title}</p>
            </div>
            <button type="button" onClick={() => openDocReader(eventId, published.docId)}
              className="h-8 px-2.5 shrink-0 rounded-md bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Read
            </button>
          </div>
        </SubCard>
      )}

      {/* Compose */}
      {session.phase !== "closed" && (
        <button type="button" onClick={() => onCompose()}
          className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors">
          <FilePlus2 className="w-4 h-4" /> New document
        </button>
      )}

      {/* My documents */}
      <div className="space-y-1.5">
        <div className="flex items-center">
          <GroupLabel count={docs?.length ?? undefined}>
            {proxy ? "Their documents" : "Your documents"}
          </GroupLabel>
        </div>
        {docs === null ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : docs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <FileStack className="w-7 h-7 mx-auto mb-1.5 text-muted-foreground/30" />
            No documents yet. Write your first working paper or draft resolution.
          </p>
        ) : (
          docs.map((d) => {
            const chip = statusChip(d.status);
            const moved = d.id ? movedIds.has(d.id) : false;
            // Not while collecting — the sponsor list is not settled yet — and not once rejected.
            const canIntroduce = (d.status === "submitted" || d.status === "approved") && !moved;
            return (
              <SubCard key={d.id} className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug">{d.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {committeeDocTypeLabel(d.type)}
                      {(d.sponsors?.length ?? 0) > 0 && <> · {d.sponsors!.length} sponsor{d.sponsors!.length === 1 ? "" : "s"}</>}
                      {(d.signatories?.length ?? 0) > 0 && <> · {d.signatories!.length} signator{d.signatories!.length === 1 ? "y" : "ies"}</>}
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-bold uppercase tracking-wide shrink-0", chip.cls)}>{chip.label}</span>
                </div>
                {d.chairNote && (
                  <p className="text-[11px] text-muted-foreground italic">Chair: “{d.chairNote}”</p>
                )}
                <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                  <button type="button" onClick={() => d.id && openDocReader(eventId, d.id)}
                    className="h-8 px-2.5 rounded-md border border-border/60 text-[12.5px] font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors inline-flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> Read
                  </button>
                  {d.type === "working-paper" && session.phase !== "closed" && (
                    <button type="button" disabled={convertingId === d.id} onClick={() => convertWorkingPaper(d)}
                      className="h-8 px-2.5 rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-400 text-[12.5px] font-semibold hover:bg-violet-500/25 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                      title="Auto-convert this Working Paper into a formal UN Draft Resolution via AI">
                      {convertingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Convert to Resolution
                    </button>
                  )}
                  {moved ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Motion proposed
                    </span>
                  ) : canIntroduce && session.phase !== "closed" && (
                    <button type="button" disabled={busyId === d.id} onClick={() => moveToIntroduce(d)}
                      className="h-8 px-2.5 rounded-md bg-primary/15 text-primary text-[12.5px] font-semibold hover:bg-primary/25 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50">
                      {busyId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
                      Move to introduce
                    </button>
                  )}
                </div>
                {d.status === "collecting-endorsements" && d.id && (
                  <EndorsementTracker
                    eventId={eventId}
                    docId={d.id}
                    endsAt={d.endorsementEndsAt || 0}
                    getIdToken={() => (user ? user.getIdToken() : Promise.resolve(null))}
                  />
                )}
              </SubCard>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Author's live endorsement tracker (shown while collecting) ───────────────────
// Watches the paper's endorsement rows, counts down the shared window, and fires the
// server-side finalize once the window closes OR every request has been answered. Finalize
// flips the paper to "submitted" (parent subscription re-renders and drops this tracker).
function EndorsementTracker({
  eventId, docId, endsAt, getIdToken,
}: {
  eventId: string;
  docId: string;
  endsAt: number;
  getIdToken: () => Promise<string | null>;
}) {
  const [rows, setRows] = useState<DocEndorsement[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);

  useEffect(() => subscribeDocEndorsements(eventId, docId, setRows), [eventId, docId]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const windowClosed = endsAt > 0 && now >= endsAt;
  const anyPending = rows.some((r) => r.status === "pending");
  const allAnswered = rows.length > 0 && !anyPending;

  useEffect(() => {
    if (fired.current) return;
    if (!windowClosed && !allAnswered) return;
    fired.current = true;
    (async () => {
      const token = await getIdToken();
      if (!token) { fired.current = false; return; }
      const res = await finalizeDocEndorsements(token, { eventId, docId });
      // 409 = window not closed yet (raced an early call); let the ticker retry.
      if (!res.ok) fired.current = false;
    })();
  }, [windowClosed, allAnswered, eventId, docId, getIdToken]);

  const left = endsAt - now;

  return (
    <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">Awaiting endorsements</span>
        <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold tabular-nums",
          left <= 15000 ? "text-red-600 dark:text-red-400" : "text-violet-600 dark:text-violet-400")}>
          <Clock className="w-3 h-3" /> {fmtLeft(Math.max(0, left))}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Sending requests…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => {
            const Icon = r.status === "accepted" ? Check : r.status === "rejected" || r.status === "expired" ? X : Clock;
            const cls =
              r.status === "accepted" ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              : r.status === "pending" ? "text-violet-600 dark:text-violet-400 border-violet-500/30"
              : "text-red-600 dark:text-red-400 border-red-500/30";
            return (
              <span key={r.id} title={`${r.role} · ${r.status}`}
                className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium", cls)}>
                <CountryFlag code={r.country} size={12} />
                <span className="truncate max-w-[90px]">{getCountryName(r.country) || r.country}</span>
                <Icon className="w-2.5 h-2.5" />
              </span>
            );
          })}
        </div>
      )}
      <p className="text-[10.5px] text-muted-foreground">
        Introducing unlocks once the window closes — only accepters stay on the paper.
      </p>
    </div>
  );
}

// ── Composer (rendered by the console in a wide ConsoleModal) ────────────────────
export function DocComposer({
  eventId, sessionId, session, identity, initialDoc, onDone, proxy, authorName,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  identity: ParticipationIdentity;
  initialDoc?: { type?: CommitteeDocType; title?: string; content?: string; sponsors?: string[]; signatories?: string[] };
  /** Close the modal (called after a successful submit). */
  onDone: () => void;
  /** Set when a vice-chair is submitting the paper ON BEHALF of `identity`'s delegation. */
  proxy?: ProxyAttribution;
  /**
   * The AUTHOR's display name. Required alongside `proxy` — the signed-in profile belongs to the
   * vice-chair, and stamping their name as `submittedByName` would misattribute the paper on every
   * surface that reads it (chair review table, endorsement request, chair email).
   */
  authorName?: string;
}) {
  const { user, profile } = useAuth();
  const [type, setType] = useState<CommitteeDocType>(initialDoc?.type || "draft-resolution");
  const [title, setTitle] = useState(initialDoc?.title || "");
  const [content, setContent] = useState(initialDoc?.content || "");
  const [sponsors, setSponsors] = useState<string[]>(initialDoc?.sponsors || []);
  const [signatories, setSignatories] = useState<string[]>(initialDoc?.signatories || []);
  const [busy, setBusy] = useState<null | "submit" | "introduce">(null);
  const [error, setError] = useState<string | null>(null);

  const countries = useMemo(() => attendanceCountries(session), [session]);
  const myCountry = identity.country || "";
  // Any delegation besides our own that must consent before joining the paper.
  const hasEndorsees = sponsors.length + signatories.length > 0;
  /**
   * A paper is found by matching its `committee` string, and `sameCommittee("", "")` is FALSE by
   * design (two unassigned delegates are not committee-mates). So a paper written without a
   * committee matches nothing and is invisible to every list, including its own author's, forever.
   * The rules reject it too — this is the half that explains why.
   */
  const noCommittee = !identity.committeeId?.trim();

  const submit = async (thenIntroduce: boolean) => {
    if (busy || noCommittee) return;
    if (!title.trim() || !content.trim()) {
      setError("A title and the document text are required.");
      return;
    }
    setBusy(thenIntroduce ? "introduce" : "submit");
    setError(null);
    const submittedByName = authorName || profile?.displayName || user?.displayName || "Delegate";

    // Every marked delegation except our own must consent before landing on the paper.
    const rows = [
      ...sponsors.map((country) => ({ role: "sponsor" as const, country })),
      ...signatories.map((country) => ({ role: "signatory" as const, country })),
    ];
    const collecting = rows.length > 0;
    const endsAt = Date.now() + ENDORSEMENT_WINDOW_SECS * 1000;

    try {
      const res = await createCommitteeDoc(eventId, {
        type,
        committee: identity.committeeId,
        title: title.trim(),
        content,
        // Confirmed lists start with our own delegation only; accepters are added on finalize.
        sponsors: myCountry ? [myCountry] : [],
        signatories: [],
        sessionId,
        dateStr: identity.dateStr,
        submittedBy: identity.delegateId,
        submittedByName,
        submittedCountry: myCountry || undefined,
        // The create rule has two branches: `submittedBy == uid` for the delegate, and a dais one
        // that requires this stamp to name the writer. Spread conditionally — Firestore rejects an
        // explicit `undefined`, and an empty string would satisfy neither branch.
        ...(proxy?.by ? { proxyBy: proxy.by, proxyByName: proxy.byName || "" } : {}),
        ...(collecting ? { status: "collecting-endorsements" as const, endorsementEndsAt: endsAt } : {}),
      });
      if (!res.success || !res.id) {
        setError("Couldn't submit the document. Check your connection and try again.");
        return;
      }
      // Best-effort chair email — mirrors CommitteeDocsDelegate.
      notifyChairsCommitteeDoc({
        eventId,
        committee: identity.committeeId,
        docType: committeeDocTypeLabel(type),
        title: title.trim(),
        delegateName: myCountry ? `${submittedByName} (${getCountryName(myCountry) || myCountry})` : submittedByName,
      });

      if (collecting) {
        // Fan out consent requests (server resolves country → delegate + notifies).
        const token = user ? await user.getIdToken() : null;
        if (token) {
          const fan = await requestDocEndorsements(token, {
            eventId, docId: res.id, sessionId, endsAt, rows,
          });
          // Nobody resolvable → don't leave the paper hanging the full window.
          if (fan.ok && fan.created === 0) {
            await finalizeDocEndorsements(token, { eventId, docId: res.id });
          }
        }
        // Introducing is gated until the window closes — done from the docs list.
      } else if (thenIntroduce) {
        await proposeMotion(eventId, sessionId, identity, "introduce_document",
          { documentId: res.id, topic: title.trim() }, "", proxy);
      }
      onDone();
    } catch (e) {
      console.error("DocComposer submit", e);
      setError("Couldn't submit the document. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  // Every list finds a paper by matching its committee, so one written without a committee can
  // never be found again. Say so before they write it, rather than accepting the submission and
  // letting the rules reject it (or worse, storing an unreachable paper).
  if (noCommittee) {
    return (
      <SubCard className="p-4 flex items-start gap-2.5">
        <FileStack className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">You are not assigned to a committee yet</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Documents are filed under a committee, so one written now could not be found again.
            Ask the chair to seat you, then write it.
          </p>
        </div>
      </SubCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Type + title */}
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="space-y-1.5">
          <FieldLabel>Type</FieldLabel>
          <select value={type} onChange={(e) => setType(e.target.value as CommitteeDocType)}
            className="w-full h-9 px-2.5 rounded-lg border border-border/60 bg-background text-sm">
            {COMMITTEE_DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Title</FieldLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160}
            placeholder={type === "working-paper" ? "e.g. WP 1.1 — Framework for refugee resettlement" : "e.g. Draft Resolution 1.1"}
            className="w-full h-9 px-2.5 rounded-lg border border-border/60 bg-background text-sm" />
        </div>
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <FieldLabel>Document text</FieldLabel>
        <MarkdownDocEditor value={content} onChange={setContent}
          placeholder="Preambulatory clauses, operative clauses…" minHeightClass="min-h-[300px]"
          ai={{
            surface: "committee-doc",
            docType: type,
            context: { committee: identity.committeeId, title, country: myCountry },
            onConvertedToDraftResolution: () => setType("draft-resolution"),
          }} />
      </div>

      {/* Sponsors / signatories */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel>Mark sponsors</FieldLabel>
          <p className="text-[11px] text-muted-foreground -mt-0.5">
            Co-authors who endorse the text. Your delegation is always a sponsor.
          </p>
          <RosterCountryPicker countries={countries} value={sponsors} onChange={setSponsors}
            locked={myCountry ? [myCountry] : []} exclude={signatories} />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Mark signatories</FieldLabel>
          <p className="text-[11px] text-muted-foreground -mt-0.5">
            Want it debated — no endorsement implied.
          </p>
          <RosterCountryPicker countries={countries} value={signatories} onChange={setSignatories}
            exclude={myCountry ? [myCountry, ...sponsors] : sponsors} />
        </div>
      </div>

      {error && <p className="text-[12.5px] font-medium text-red-600 dark:text-red-400">{error}</p>}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button type="button" disabled={!!busy} onClick={() => submit(true)}
          className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" />
            : hasEndorsees ? <Check className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
          {hasEndorsees ? "Submit & request endorsements" : "Submit & move to introduce"}
        </button>
        <button type="button" disabled={!!busy} onClick={() => submit(false)}
          className="h-10 px-4 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/60 text-[13px] font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors disabled:opacity-50">
          {busy === "submit" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
          Submit only
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <CountryFlag code={myCountry} size={13} />
        {hasEndorsees
          ? `Each marked sponsor & signatory gets ${ENDORSEMENT_WINDOW_SECS}s to accept — only accepters stay on the paper, then it unlocks to introduce.`
          : `Submitting as ${getCountryName(myCountry) || myCountry || "your delegation"} — the chair reviews every submission.`}
      </p>
    </div>
  );
}
