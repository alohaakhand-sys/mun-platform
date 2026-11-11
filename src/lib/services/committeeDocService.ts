import {
  collection, collectionGroup, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, query, where,
  serverTimestamp, onSnapshot, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { sameCommittee } from "@/lib/utils/committee";

// In-session committee documents that flow Delegate → Chair: a delegate submits a
// Working Paper / Draft Resolution / Amendment (markdown), the committee's chair (or an
// EB overseer / organizer) reviews and approves/rejects it. Stored per-event at
// events/{eventId}/committeeDocs/{docId}, keyed by committee NAME (consistent with
// studyGuides + position papers, which also key by committee name).

export type CommitteeDocType = "working-paper" | "draft-resolution" | "amendment";
/**
 * "collecting-endorsements" is the transient state between submit and the close of the
 * sponsor/signatory consent window — a paper here is NOT yet introduceable.
 *
 * IT IS ALSO THE ONE STATUS THAT IS NOT PUBLIC. `firestore.rules` keys `committeeDocs` read
 * visibility off this union: a paper still collecting is readable only by its author and the
 * committee's reviewers, because it is a draft mid-handshake. Everything else circulates.
 * Adding a value here without deciding which side of that line it falls on is a leak.
 *
 * There was a sixth value, "under-review", with no writer anywhere in the codebase — a state the
 * machine could never reach, carried in eight UI tables. It comes back when the dais review loop
 * is built (a chair marking "I am reading this"), with a writer, not before.
 */
export type CommitteeDocStatus =
  | "collecting-endorsements" | "submitted" | "approved" | "rejected";

/**
 * The statuses any signed-in user may read — must stay in step with the `committeeDocs` read rule
 * in `firestore.rules`. Exported because the client queries have to be SHAPED like the rule:
 * Firestore evaluates a read rule per document on a list query and one failing document fails the
 * WHOLE query rather than filtering it out, so an unfiltered listener over a collection containing
 * somebody's in-progress draft errors for every delegate.
 */
export const PUBLIC_DOC_STATUSES: CommitteeDocStatus[] = ["submitted", "approved", "rejected"];

/** Seconds a sponsor/signatory has to accept or reject an endorsement request. */
export const ENDORSEMENT_WINDOW_SECS = 90;

export interface CommitteeDoc {
  id?: string;
  type: CommitteeDocType;
  committee: string;          // normalized committee name
  title: string;
  content: string;            // markdown
  format: "markdown";
  sponsors?: string[];        // CONFIRMED sponsors (author + accepters); legacy free-text names
  signatories?: string[];     // CONFIRMED signatories (accepters only)
  submittedBy: string;        // uid — ALWAYS the authoring delegation, proxy or not
  submittedByName: string;
  submittedCountry?: string;
  /**
   * Set when a vice-chair with delegate power submitted this ON BEHALF of `submittedBy`. The
   * create rule's dais branch requires it to name the writer, so it is also the audit trail.
   */
  proxyBy?: string;
  proxyByName?: string;
  status: CommitteeDocStatus;
  endorsementEndsAt?: number; // epoch ms — consent window close (while collecting-endorsements)
  chairNote?: string;
  reviewedBy?: string;        // uid
  sessionId?: string;         // live session where it was authored (provenance)
  dateStr?: string;           // YYYY-MM-DD of that session
  createdAt?: any;
  updatedAt?: any;
}

// ── Sponsor / signatory endorsement handshake ────────────────────────────────────
// When a delegate submits a paper, every marked sponsor AND signatory (except the
// author's own delegation) gets a consent request with a countdown. Records live in a
// doc-scoped subcollection so the flow works both in a live session and off the dashboard.
export type EndorsementRole = "sponsor" | "signatory";
export type EndorsementStatus = "pending" | "accepted" | "rejected" | "expired";

export interface DocEndorsement {
  id?: string;
  role: EndorsementRole;
  country: string;            // target delegation
  targetUid: string;          // the delegate who may respond
  status: EndorsementStatus;
  requestedByUid: string;
  requestedByName: string;
  requestedByCountry: string;
  eventId: string;
  docId: string;
  docTitle: string;
  docType: CommitteeDocType;
  committee: string;
  sessionId?: string;
  endsAt: number;             // epoch ms — shared window close
  createdAt?: any;
  respondedAt?: any;
  /** Set when a vice-chair answered this consent request on the target delegation's behalf. */
  proxyBy?: string;
  proxyByName?: string;
}

export const COMMITTEE_DOC_TYPES: { value: CommitteeDocType; label: string }[] = [
  { value: "working-paper", label: "Working Paper" },
  { value: "draft-resolution", label: "Draft Resolution" },
  { value: "amendment", label: "Amendment" },
];

export function committeeDocTypeLabel(t: CommitteeDocType): string {
  return COMMITTEE_DOC_TYPES.find((x) => x.value === t)?.label ?? t;
}

function col(eventId: string) {
  return collection(db, "events", eventId, "committeeDocs");
}

function toMillis(v: any): number {
  return v?.toMillis?.() ?? (v instanceof Date ? v.getTime() : 0);
}

function byNewest(a: CommitteeDoc, b: CommitteeDoc): number {
  return toMillis(b.createdAt) - toMillis(a.createdAt);
}

export async function createCommitteeDoc(
  eventId: string,
  data: Omit<CommitteeDoc, "id" | "createdAt" | "updatedAt" | "format" | "status"> & {
    status?: CommitteeDocStatus;
  }
): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const ref = await addDoc(col(eventId), {
      ...data,
      format: "markdown",
      status: data.status || "submitted",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { success: true, id: ref.id };
  } catch (error) {
    return { success: false, error };
  }
}

/** Single doc fetch — used by the standalone reader route and the projector hero. */
export async function getCommitteeDoc(eventId: string, docId: string): Promise<CommitteeDoc | null> {
  try {
    const snap = await getDoc(doc(db, "events", eventId, "committeeDocs", docId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as CommitteeDoc) : null;
  } catch {
    return null;
  }
}

/**
 * REVIEWER-ONLY: every paper in the committee, whatever its status.
 *
 * SCOPED BY QUERY, NOT BY CLIENT FILTER — and that is the security boundary talking, not a
 * preference. The read rule's reviewer branch is `canReviewDocs(eventId, resource.data.committee)`,
 * and a chair or vice-chair satisfies it ONLY for the committee named on their staff doc. Firestore
 * fails a list query WHOLE when any document in the result set fails its read rule, so the
 * unfiltered listener this replaced died with "Missing or insufficient permissions" the moment
 * ANOTHER committee held a paper still `collecting-endorsements` — the one non-public status, and
 * one that outlives its 90s window whenever a handshake is abandoned. Organizer / EB /
 * canMarkDelegates reviewers never saw the failure because they pass on every document in the
 * event, which is precisely why it presented as a chair-tier-only bug. Filtering in the QUERY keeps
 * every returned document inside the caller's own committee, so the rule that grants them the room
 * is the same rule each result is judged by.
 *
 * Equality is EXACT here where the old client-side filter used `sameCommittee` (trim + lowercase).
 * Deliberate: the rule compares the raw strings too, so a case-drifted paper was never readable by
 * its own committee's chair — it only ever took the whole listener down with it.
 *
 * Delegates use `subscribeMyCommitteeDocs` + `subscribeApprovedCommitteeDocs` instead.
 */
export function subscribeCommitteeDocs(
  eventId: string,
  committee: string,
  cb: (docs: CommitteeDoc[]) => void
): () => void {
  const q = query(col(eventId), where("committee", "==", committee));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommitteeDoc)).sort(byNewest));
  }, (err) => { console.error("subscribeCommitteeDocs", err); cb([]); });
}

/**
 * A delegate's OWN papers, live, at any status. Single-field equality, so the query matches the
 * rule's `submittedBy == uid` branch exactly and needs no composite index.
 *
 * Also strictly cheaper than the unfiltered listener it replaced, which pulled every paper in the
 * committee onto every delegate's device for the whole sitting — see the Spark read budget.
 */
export function subscribeMyCommitteeDocs(
  eventId: string,
  uid: string,
  cb: (docs: CommitteeDoc[]) => void,
  committee?: string
): () => void {
  const q = query(col(eventId), where("submittedBy", "==", uid));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as CommitteeDoc))
        .filter((x) => !committee || sameCommittee(x.committee, committee))
        .sort(byNewest)
    );
  }, (err) => { console.error("subscribeMyCommitteeDocs", err); cb([]); });
}

/**
 * The papers a delegate may read that are not their own — approved ones, live.
 *
 * Deliberately narrower than `PUBLIC_DOC_STATUSES`: the rule permits reading anything submitted or
 * rejected too, but circulating another delegation's rejected paper is not the product's job. The
 * rule is the security boundary; this is the product decision sitting inside it.
 */
export function subscribeApprovedCommitteeDocs(
  eventId: string,
  committee: string,
  cb: (docs: CommitteeDoc[]) => void
): () => void {
  const q = query(col(eventId), where("status", "==", "approved"));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as CommitteeDoc))
        .filter((x) => sameCommittee(x.committee, committee))
        .sort(byNewest)
    );
  }, (err) => { console.error("subscribeApprovedCommitteeDocs", err); cb([]); });
}

/**
 * REVIEWER-ONLY, one-shot. Same committee-scoped query as `subscribeCommitteeDocs`, for the same
 * reason — see its note. Unscoped, this one failed SILENTLY: the catch swallowed the permission
 * error and the chair's documents hub simply rendered empty.
 */
export async function listCommitteeDocs(eventId: string, committee: string): Promise<CommitteeDoc[]> {
  try {
    const snap = await getDocs(query(col(eventId), where("committee", "==", committee)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as CommitteeDoc))
      .sort(byNewest);
  } catch {
    return [];
  }
}

/** A delegate's own submissions (single-field where → no composite index needed). */
export async function listMyCommitteeDocs(
  eventId: string,
  uid: string,
  committee?: string
): Promise<CommitteeDoc[]> {
  try {
    const snap = await getDocs(query(col(eventId), where("submittedBy", "==", uid)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as CommitteeDoc))
      .filter((x) => !committee || sameCommittee(x.committee, committee))
      .sort(byNewest);
  } catch {
    return [];
  }
}

/**
 * Approved docs in a committee, readable by every committee member (co-sponsors/voting).
 * Queries on status rather than filtering a full listing, so a non-reviewer can call it.
 */
export async function listApprovedCommitteeDocs(eventId: string, committee: string): Promise<CommitteeDoc[]> {
  try {
    const snap = await getDocs(query(col(eventId), where("status", "==", "approved")));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as CommitteeDoc))
      .filter((x) => sameCommittee(x.committee, committee))
      .sort(byNewest);
  } catch {
    return [];
  }
}

export async function updateCommitteeDoc(
  eventId: string,
  docId: string,
  partial: Partial<CommitteeDoc>
): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(db, "events", eventId, "committeeDocs", docId), {
      ...partial,
      updatedAt: serverTimestamp(),
    } as any);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

export async function updateCommitteeDocStatus(
  eventId: string,
  docId: string,
  status: CommitteeDocStatus,
  chairNote: string,
  reviewedBy: string
): Promise<{ success: boolean; error?: any }> {
  return updateCommitteeDoc(eventId, docId, { status, chairNote, reviewedBy });
}

/**
 * Delete a paper AND its consent rows.
 *
 * CHILDREN FIRST, PARENT LAST. Deleting a document in Firestore does not touch its subcollections,
 * and an orphaned `docEndorsements` row still satisfies the collection-group read rule for its
 * `targetUid` — so it keeps surfacing in that delegate's inbox as a request to sponsor a paper that
 * no longer exists, with no way to answer it. Doing the children first means a failure part-way
 * leaves a readable paper with fewer rows, which is recoverable; the other order leaves orphans,
 * which is not.
 *
 * The batch is bounded by how many delegations one paper can name, so it cannot approach the
 * 500-write ceiling.
 */
export async function deleteCommitteeDoc(
  eventId: string,
  docId: string
): Promise<{ success: boolean; error?: any }> {
  try {
    const rows = await getDocs(endorsementsCol(eventId, docId));
    if (!rows.empty) {
      const batch = writeBatch(db);
      rows.forEach((r) => batch.delete(r.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, "events", eventId, "committeeDocs", docId));
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

// ── Endorsement handshake ─────────────────────────────────────────────────────────

function endorsementsCol(eventId: string, docId: string) {
  return collection(db, "events", eventId, "committeeDocs", docId, "docEndorsements");
}

/**
 * A target delegate accepts / rejects an endorsement request.
 *
 * Two rule branches answer this write: the target's own row (`targetUid == uid`), and a committee
 * dais member answering for a delegation from the Represent panel. Both clamp the affected keys, so
 * the proxy stamp has to be part of the SAME write — the delegate branch's `hasOnly` list names all
 * four keys, and adding a fifth here would deny both branches.
 */
export async function respondEndorsement(
  eventId: string,
  docId: string,
  endorsementId: string,
  action: "accept" | "reject",
  proxy?: { by: string; byName?: string }
): Promise<{ success: boolean; error?: any }> {
  try {
    await updateDoc(doc(endorsementsCol(eventId, docId), endorsementId), {
      status: action === "accept" ? "accepted" : "rejected",
      respondedAt: serverTimestamp(),
      ...(proxy?.by ? { proxyBy: proxy.by, proxyByName: proxy.byName || "" } : {}),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

/** Author-side live view of the responses rolling in for one paper. */
export function subscribeDocEndorsements(
  eventId: string,
  docId: string,
  cb: (rows: DocEndorsement[]) => void
): () => void {
  return onSnapshot(endorsementsCol(eventId, docId), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DocEndorsement)));
  });
}

/**
 * PROXY INBOX: pending endorsement requests addressed to one delegation, across a known set of
 * papers.
 *
 * Deliberately NOT `subscribeMyPendingEndorsements` with someone else's uid. That one is a
 * `collectionGroup` query, and the collection-group read rule pins `targetUid == request.auth.uid`
 * — a constraint that cannot be relaxed for a committee's dais, because the `{path=**}` match has
 * no `eventId` in scope to check a staff doc against. Reading the doc-scoped subcollection instead
 * goes through the nested rule, whose read is plain `isSignedIn()`.
 *
 * `docIds` comes from a list the caller already holds (the chair console's `docs`), so this adds no
 * document listener — only one small subcollection listener per paper still collecting, which in
 * practice is 0–3 at a time. Pass a STABLE array or this resubscribes on every render.
 */
export function subscribeEndorsementsForDocs(
  eventId: string,
  docIds: string[],
  targetUid: string,
  cb: (rows: DocEndorsement[]) => void
): () => void {
  if (!docIds.length || !targetUid) {
    cb([]);
    return () => {};
  }
  const byDoc = new Map<string, DocEndorsement[]>();
  const emit = () =>
    cb(
      [...byDoc.values()]
        .flat()
        .filter((r) => r.targetUid === targetUid && r.status === "pending")
        .sort((a, b) => a.endsAt - b.endsAt)
    );
  const unsubs = docIds.map((docId) =>
    onSnapshot(
      endorsementsCol(eventId, docId),
      (snap) => {
        byDoc.set(docId, snap.docs.map((d) => ({ id: d.id, ...d.data() } as DocEndorsement)));
        emit();
      },
      (err) => {
        console.error("subscribeEndorsementsForDocs", docId, err);
        byDoc.set(docId, []);
        emit();
      }
    )
  );
  return () => unsubs.forEach((u) => u());
}

/** Recipient inbox — every pending endorsement request addressed to me (any event/doc). */
export function subscribeMyPendingEndorsements(
  uid: string,
  cb: (rows: DocEndorsement[]) => void
): () => void {
  const q = query(
    collectionGroup(db, "docEndorsements"),
    where("targetUid", "==", uid),
    where("status", "==", "pending")
  );
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as DocEndorsement))
          .sort((a, b) => a.endsAt - b.endsAt)
      );
    },
    (err) => {
      console.error("subscribeMyPendingEndorsements", err);
      cb([]);
    }
  );
}

/** POST helper attaching the caller's Firebase ID token (mirrors callMigrationApi). */
async function callDocsApi(
  path: string,
  idToken: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const resp = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: data.error || "Request failed" };
    return { ok: true, ...data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

/**
 * Fan out endorsement requests (server resolves each country → delegate uid with admin,
 * writes the endorsement docs, and notifies each target). `endsAt` must match the value
 * stamped on the paper's `endorsementEndsAt` so every countdown agrees.
 */
export function requestDocEndorsements(
  idToken: string,
  body: {
    eventId: string;
    docId: string;
    sessionId?: string;
    endsAt: number;
    rows: { role: EndorsementRole; country: string }[];
  }
) {
  return callDocsApi("/api/docs/endorsements", idToken, body);
}

/**
 * Close the window (server-side, idempotent): confirmed sponsors/signatories = author +
 * accepters, leftover pending → expired, paper status collecting-endorsements → submitted.
 */
export function finalizeDocEndorsements(
  idToken: string,
  body: { eventId: string; docId: string }
) {
  return callDocsApi("/api/docs/endorsements/finalize", idToken, body);
}
