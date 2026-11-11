import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { MarkingMode } from "./eventService";

/**
 * The attendance states a daily marking doc can carry. Structurally identical to
 * sessionService's `AttendanceStatus` — declared here, not imported, because
 * sessionService imports THIS module to mirror roll call into the marking record
 * and a back-import would close the cycle.
 */
export type MarkingAttendance = "present" | "present_and_voting" | "absent" | "late";

export interface Marking {
  id?: string;
  eventId: string;
  committeeId: string;
  delegateId: string; // The userId of the delegate
  applicationId: string;
  dateStr?: string; // YYYY-MM-DD for daily marking
  // Whether the delegate was in the room that day. Mirrored from the live session's
  // roll call (`attendanceSource: "rollcall"`) or set by the chair ("chair", which
  // always wins — a later roll-call mirror must not overwrite a chair's correction).
  // Absent ⇒ unknown, and the scoring math falls back to its legacy behaviour.
  attendanceStatus?: MarkingAttendance;
  attendanceSource?: "rollcall" | "chair";
  // The marking scale this doc's `scores` are stored on. Stamped at write time so a
  // later event-level mode flip never misreads already-stored values. Absent ⇒ "decimal".
  markMode?: MarkingMode;
  scores: Record<string, number>; // templateId -> score (decimal: -100..+100; binary: -1..+1)
  // Optional per-criterion list of individual ±100 marks (e.g. one per speech in a day).
  // When present, scores[id] is kept as the MEAN of scoreEntries[id] (mirror) so all
  // readers of `scores` stay unchanged. Absent ⇒ scores[id] is a direct single value.
  scoreEntries?: Record<string, number[]>;
  feedback: string;
  gradedBy: string; // The userId of the chair
  positionPaperScore?: number;
  paperStatus?: "review"|"approved"|"revision"|"flagged";
  paperGradedAt?: any;
  createdAt?: any;
  updatedAt?: any;

  // Discriminates the per-day marking doc (default) from the committee-level final
  // rollup doc. Absent ⇒ "daily" (back-compat with all existing docs).
  kind?: "daily" | "final";
  // --- Present only on the final-rollup doc (id `${committeeId}_${delegateId}__final`) ---
  finalScore?: number;         // 0..100 blended, published to the delegate
  computedPct?: number;        // 0..100 consistency-first aggregate of daily %s (pre-blend)
  chairOverall?: number | null;// chair's manual holistic 0..100, or null if not given
  overallWeight?: number;      // blend weight used (0..1)
  dayCount?: number;           // N — conference days considered
  presentDays?: number;        // days the delegate had at least one scored criterion
  excludedDays?: number;       // attended-but-unscored days dropped from the denominator
  days?: string[];             // the day set (YYYY-MM-DD) used for the aggregate
}

export async function submitMarking(marking: Omit<Marking, "id">): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const markingsRef = collection(db, "markings");
    const docRef = await addDoc(markingsRef, {
      ...marking,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error submitting marking:", error);
    return { success: false, error };
  }
}

export async function getMarkingsByCommittee(eventId: string, committeeId: string): Promise<Marking[]> {
  if (!eventId || !committeeId) return [];
  try {
    const markingsRef = collection(db, "markings");
    const q = query(
      markingsRef,
      where("eventId", "==", eventId),
      where("committeeId", "==", committeeId),
      orderBy("updatedAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as Marking));
  } catch (error) {
    console.error("Error fetching markings:", error);
    return [];
  }
}

/**
 * A position paper's grade lives on its own markings doc: no `dateStr` (not a day's marks) and
 * not the `__final` rollup. Older grades were saved on whichever doc a query returned first, which
 * could be a day's marks; those are still read when no paper doc exists yet.
 */
function isPaperDoc(id: string, data: any): boolean {
  return !data?.dateStr && data?.kind !== "final" && !id.endsWith("__final");
}

/** The delegate's position-paper marking: the paper doc, else an older grade on another doc, else null. */
export async function getDelegateMarking(
  applicationId: string, delegateId?: string, eventId?: string, committeeId?: string,
): Promise<Marking | null> {
  try {
    const markingsRef = collection(db, "markings");
    // Scope by event + committee when known: the markings read rule is evaluated per
    // returned doc, so an unscoped query can surface a legacy/foreign doc (missing
    // eventId or a non-matching committeeId) that fails `canWriteMarking` and denies the
    // WHOLE query. Constraining to the caller's own event/committee returns only
    // chair-readable docs. (The delegate path passes just delegateId — self-read.)
    const constraints: any[] = [where("applicationId", "==", applicationId)];
    if (delegateId) constraints.push(where("delegateId", "==", delegateId));
    if (eventId) constraints.push(where("eventId", "==", eventId));
    if (committeeId) constraints.push(where("committeeId", "==", committeeId));
    const q = query(markingsRef, ...constraints);
    const snapshot = await getDocs(q);
    const paper = snapshot.docs.find((d) => isPaperDoc(d.id, d.data()))
      || snapshot.docs.find((d) => d.data().paperStatus || d.data().positionPaperScore != null);
    return paper ? ({ id: paper.id, ...paper.data() } as Marking) : null;
  } catch (error) {
    console.error("Error fetching delegate marking:", error);
    return null;
  }
}

/** All of a delegate's daily markings for an event (for the delegate's own Results view). */
export async function getDelegateEventMarkings(eventId: string, delegateId: string): Promise<Marking[]> {
  if (!eventId || !delegateId) return [];
  try {
    const markingsRef = collection(db, "markings");
    const q = query(markingsRef, where("eventId", "==", eventId), where("delegateId", "==", delegateId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as Marking));
  } catch (error) {
    console.error("Error fetching delegate event markings:", error);
    return [];
  }
}

/**
 * ONE delegate's marking docs within ONE committee, across every day.
 *
 * Constrained by committeeId, unlike `getDelegateEventMarkings`: the markings read rule is
 * evaluated per returned doc, so a delegate who was migrated between committees mid-event
 * carries docs the current chair cannot read — and a single unreadable doc denies the WHOLE
 * query. Same trap `getDelegateMarking` documents.
 */
export async function getDelegateCommitteeMarkings(
  eventId: string, committeeId: string, delegateId: string,
): Promise<Marking[]> {
  if (!eventId || !committeeId || !delegateId) return [];
  try {
    const q = query(
      collection(db, "markings"),
      where("eventId", "==", eventId),
      where("committeeId", "==", committeeId),
      where("delegateId", "==", delegateId),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Marking));
  } catch (error) {
    console.error("Error fetching delegate committee markings:", error);
    return [];
  }
}

export async function getDailyMarkings(eventId: string, committeeId: string, dateStr: string): Promise<Marking[]> {
  if (!eventId || !committeeId || !dateStr) return [];
  try {
    const markingsRef = collection(db, "markings");
    const q = query(
      markingsRef,
      where("eventId", "==", eventId),
      where("committeeId", "==", committeeId),
      where("dateStr", "==", dateStr)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as Marking));
  } catch (error) {
    console.error("Error fetching daily markings:", error);
    return [];
  }
}

import { setDoc, onSnapshot, getDoc, deleteField, runTransaction, writeBatch } from "firebase/firestore";
import { clamp, MARK_MIN, MARK_MAX, BINARY_MIN, BINARY_MAX } from "./markingScore";

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The stored range for a criterion, by marking mode. */
const scaleFor = (mode: MarkingMode | undefined): [number, number] =>
  mode === "binary" ? [BINARY_MIN, BINARY_MAX] : [MARK_MIN, MARK_MAX];

/**
 * Live view of one committee-day's marking docs.
 *
 * WHY THIS EXISTS: the chair scores from four surfaces at once during a session
 * (LiveMarkStrip on the speaker's tile, QuickScoreDialog, SpeechScorer, and the
 * matrix itself). A one-shot `getDailyMarkings` leaves every other surface showing
 * a stale doc, and — worse — lets a stale surface write a stale value back. The
 * snapshot is the reconciler.
 *
 * Same three-equality query as `getDailyMarkings`: no orderBy, so no composite index.
 */
export function subscribeDailyMarkings(
  eventId: string, committeeId: string, dateStr: string, cb: (rows: Marking[]) => void,
): () => void {
  if (!eventId || !committeeId || !dateStr) return () => {};
  const q = query(
    collection(db, "markings"),
    where("eventId", "==", eventId),
    where("committeeId", "==", committeeId),
    where("dateStr", "==", dateStr),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Marking))),
    (err) => console.error("subscribeDailyMarkings", err),
  );
}

/**
 * Write ONE criterion on a daily doc — the only safe manual-cell path.
 *
 * WHY NOT `saveDailyMarking`: that takes a whole `scores` map, which a matrix builds
 * from the state it loaded. If a live per-speech mark advanced another criterion's mean
 * in between, the stale map writes the OLD mean back while `scoreEntries` keeps the new
 * list — the two silently disagree and the daily % is wrong. Addressing the single field
 * path makes a stale cell physically unable to touch a neighbour.
 *
 * `value === null` clears the criterion (unscored — excluded from the average, which is
 * distinct from a scored 0).
 */
export async function setCriterionScore(
  base: DailyMarkingBase, templateId: string, value: number | null,
): Promise<{ success: boolean; error?: any }> {
  try {
    const [lo, hi] = scaleFor(base.markMode);
    await writeCriterion(base, templateId, value === null ? null : { score: clamp(value, lo, hi) });
    return { success: true };
  } catch (error) {
    console.error("Error setting criterion score:", error);
    return { success: false, error };
  }
}

/**
 * The one write path for a criterion on a daily doc, used by `setCriterionScore` and
 * `setScoreEntries` (`appendScoreEntry` has its own because it reads the entries it appends to).
 *
 * Get-or-create, like `appendScoreEntry`. The reason is that dotted keys are FIELD PATHS only in
 * `update()`: `setDoc(..., { merge: true })` writes `"scores.abc"` as a literal top-level field
 * named "scores.abc", which no reader ever looks at. These two writers used `setDoc` that way,
 * so every mark they saved was invisible, and every save also blanked the chair's feedback with
 * `feedback: ""`. An existing doc is now updated by path; only a brand-new doc gets the base
 * fields (and an empty feedback), with `scores` written as a real nested map.
 *
 * `value` null clears the criterion; `entries` (when given) is the per-speech list it mirrors.
 */
async function writeCriterion(
  base: DailyMarkingBase, templateId: string, value: { score: number; entries?: number[] } | null,
): Promise<void> {
  const ref = doc(db, "markings", `${base.committeeId}_${base.delegateId}_${base.dateStr}`);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? (snap.data() as Marking) : undefined;
    if (snap.exists()) {
      tx.update(ref, {
        [`scores.${templateId}`]: value === null ? deleteField() : value.score,
        [`scoreEntries.${templateId}`]: value?.entries ? value.entries : deleteField(),
        // Same rule as appendScoreEntry: stamp the scale on a doc that has none (roll-call
        // mirrors create markMode-less docs), never overwrite one already there.
        ...(data?.markMode || !base.markMode ? {} : { markMode: base.markMode }),
        updatedAt: serverTimestamp(),
      });
    } else if (value !== null) {
      tx.set(ref, {
        ...base,
        feedback: "",
        scores: { [templateId]: value.score },
        ...(value.entries ? { scoreEntries: { [templateId]: value.entries } } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Stamp attendance onto a delegate's daily marking doc. This is what makes an absent
 * day distinguishable from a day the chair simply never got to — the scoring math
 * treats those two very differently (see markingScore.computeFinalScore).
 *
 * A `rollcall` mirror never overwrites a `chair` correction; the chair is the authority
 * on who was actually excused.
 */
export async function setMarkingAttendance(
  base: DailyMarkingBase, status: MarkingAttendance, source: "rollcall" | "chair" = "chair",
): Promise<{ success: boolean; error?: any }> {
  try {
    const ref = doc(db, "markings", `${base.committeeId}_${base.delegateId}_${base.dateStr}`);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists() ? (snap.data() as Marking) : undefined;
      if (source === "rollcall" && prev?.attendanceSource === "chair") return;
      if (prev?.attendanceStatus === status && prev?.attendanceSource === source) return;
      if (snap.exists()) {
        tx.update(ref, { attendanceStatus: status, attendanceSource: source, updatedAt: serverTimestamp() });
      } else {
        tx.set(ref, { ...base, feedback: "", scores: {}, attendanceStatus: status, attendanceSource: source, updatedAt: serverTimestamp() });
      }
    });
    return { success: true };
  } catch (error) {
    console.error("Error setting marking attendance:", error);
    return { success: false, error };
  }
}

/**
 * Roll-call fan-out: mirror a whole committee's attendance onto the day's marking docs
 * in one batch (~one write per delegate, once a day).
 *
 * Batched `set(..., {merge:true})` rather than the transactional single-doc path, so it
 * cannot do the "chair correction wins" read. That is deliberate: this runs when the
 * chair COMPLETES roll call, which is itself the chair's statement of who is present.
 */
export async function mirrorAttendanceToMarkings(
  eventId: string, committeeId: string, dateStr: string,
  rows: Array<{ delegateId: string; applicationId: string; status: MarkingAttendance }>,
  gradedBy?: string,
): Promise<{ success: boolean; error?: any }> {
  if (!eventId || !committeeId || !dateStr || !rows.length) return { success: true };
  try {
    const batch = writeBatch(db);
    for (const r of rows) {
      batch.set(doc(db, "markings", `${committeeId}_${r.delegateId}_${dateStr}`), {
        eventId, committeeId, delegateId: r.delegateId,
        applicationId: r.applicationId, dateStr,
        // NO markMode here. The caller (a live session) doesn't know the event's marking
        // scale, and a wrong stamp would make computeDailyScore misread every stored
        // value on this doc — the doc's own markMode outranks the event fallback.
        ...(gradedBy ? { gradedBy } : {}),
        attendanceStatus: r.status, attendanceSource: "rollcall",
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error("Error mirroring attendance to markings:", error);
    return { success: false, error };
  }
}

/**
 * Remove a single criterion's score from a daily doc so it reads as *unscored*
 * (absent from the average) rather than a scored 0. Wipes both the mean mirror and
 * the per-speech entry list. Uses deleteField on the nested keys; a no-op (caught)
 * if the doc doesn't exist yet.
 */
export async function clearDailyMarkingScore(
  committeeId: string, delegateId: string, dateStr: string, templateId: string,
): Promise<{ success: boolean; error?: any }> {
  try {
    const markingId = `${committeeId}_${delegateId}_${dateStr}`;
    await updateDoc(doc(db, "markings", markingId), {
      [`scores.${templateId}`]: deleteField(),
      [`scoreEntries.${templateId}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    // Doc may not exist yet (nothing to clear) — treat as success.
    return { success: true, error };
  }
}

/**
 * Set the FULL list of ±100 marks for one criterion on a daily doc (manual matrix
 * editor path — the client holds the authoritative list). Keeps scores[id] = mean.
 * An empty list clears the criterion (unscored). `base` supplies the identity fields
 * needed on first create.
 */
export interface DailyMarkingBase {
  eventId: string; committeeId: string; delegateId: string; applicationId: string; dateStr: string; gradedBy: string;
  markMode?: MarkingMode; // stamped onto the doc so the scale is self-describing
}
export async function setScoreEntries(
  base: DailyMarkingBase, templateId: string, entries: number[],
): Promise<{ success: boolean; error?: any }> {
  try {
    const [lo, hi] = scaleFor(base.markMode);
    const clamped = entries.map(v => clamp(v, lo, hi));
    await writeCriterion(base, templateId, clamped.length === 0 ? null : { score: mean(clamped), entries: clamped });
    return { success: true };
  } catch (error) {
    console.error("Error saving score entries:", error);
    return { success: false, error };
  }
}

/**
 * Append ONE ±100 mark to a criterion's list (live-GSL per-speech path). Transaction
 * so concurrent appends don't clobber. Seeds the list from a pre-existing single
 * `scores[id]` (legacy/fast-typed) so the old value becomes the first entry. Keeps
 * scores[id] = mean of the new list. Creates the daily doc if absent.
 */
export async function appendScoreEntry(
  base: DailyMarkingBase, templateId: string, value: number,
): Promise<{ success: boolean; entries?: number[]; error?: any }> {
  try {
    const markingId = `${base.committeeId}_${base.delegateId}_${base.dateStr}`;
    const ref = doc(db, "markings", markingId);
    const [lo, hi] = scaleFor(base.markMode);
    const v = clamp(value, lo, hi);
    const entries = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? (snap.data() as Marking) : undefined;
      const prev = data?.scoreEntries?.[templateId]
        ?? (typeof data?.scores?.[templateId] === "number" ? [data!.scores[templateId]] : []);
      const next = [...prev, v];
      if (snap.exists()) {
        tx.update(ref, {
          [`scores.${templateId}`]: mean(next),
          [`scoreEntries.${templateId}`]: next,
          // Stamp the scale if the doc has none — `mirrorAttendanceToMarkings` deliberately
          // creates markMode-less docs at roll call, and every live mark after that took this
          // update branch, so those docs never became self-describing. NEVER overwrite an
          // existing stamp: the value already stored decides how it must be read.
          ...(data?.markMode || !base.markMode ? {} : { markMode: base.markMode }),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(ref, {
          ...base,
          feedback: "",
          scores: { [templateId]: mean(next) },
          scoreEntries: { [templateId]: next },
          updatedAt: serverTimestamp(),
        });
      }
      return next;
    });
    return { success: true, entries };
  } catch (error) {
    console.error("Error appending score entry:", error);
    return { success: false, error };
  }
}

/**
 * Set the daily doc's free-text feedback (the on-tile quick-mark dialog's expanded rubric).
 * Mirrors `appendScoreEntry`'s get-or-create so a feedback-only save doesn't require a
 * criterion to already be scored, and — unlike `setScoreEntries` — never touches `scores`.
 */
export async function setDailyFeedback(
  base: DailyMarkingBase, feedback: string,
): Promise<{ success: boolean; error?: any }> {
  try {
    const markingId = `${base.committeeId}_${base.delegateId}_${base.dateStr}`;
    const ref = doc(db, "markings", markingId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        tx.update(ref, { feedback, updatedAt: serverTimestamp() });
      } else {
        tx.set(ref, { ...base, feedback, scores: {}, updatedAt: serverTimestamp() });
      }
    });
    return { success: true };
  } catch (error) {
    console.error("Error saving daily feedback:", error);
    return { success: false, error };
  }
}

export async function saveDailyMarking(marking: Omit<Marking, "id">): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    // Generate deterministic ID based on committee, delegate, and date
    const markingId = `${marking.committeeId}_${marking.delegateId}_${marking.dateStr}`;
    const docRef = doc(db, "markings", markingId);

    await setDoc(docRef, {
      ...marking,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return { success: true, id: markingId };
  } catch (error) {
    console.error("Error saving daily marking:", error);
    return { success: false, error };
  }
}

/** Deterministic doc id for a delegate's committee-level final-score rollup. */
export function finalMarkingId(committeeId: string, delegateId: string): string {
  return `${committeeId}_${delegateId}__final`;
}

export interface FinalScorePayload {
  eventId: string;
  committeeId: string;
  delegateId: string;
  applicationId: string;
  gradedBy: string;
  finalScore: number;
  computedPct: number;
  chairOverall: number | null;
  overallWeight: number;
  dayCount: number;
  presentDays: number;
  excludedDays?: number;
  days: string[];
  markMode?: MarkingMode;
}

/**
 * Upsert a delegate's final-score rollup as a separate `/markings` doc (kind:"final").
 * Deterministic id keeps it idempotent; living in /markings means it rides the existing
 * self-read + canWriteMarking rules (no firestore.rules change).
 */
export async function saveFinalScore(f: FinalScorePayload): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const markingId = finalMarkingId(f.committeeId, f.delegateId);
    await setDoc(doc(db, "markings", markingId), {
      eventId: f.eventId,
      committeeId: f.committeeId,
      delegateId: f.delegateId,
      applicationId: f.applicationId,
      gradedBy: f.gradedBy,
      kind: "final",
      markMode: f.markMode ?? "decimal",
      scores: {},
      feedback: "",
      finalScore: f.finalScore,
      computedPct: f.computedPct,
      chairOverall: f.chairOverall,
      overallWeight: f.overallWeight,
      dayCount: f.dayCount,
      presentDays: f.presentDays,
      excludedDays: f.excludedDays ?? 0,
      days: f.days,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { success: true, id: markingId };
  } catch (error) {
    console.error("Error saving final score:", error);
    return { success: false, error };
  }
}

/** Read a single delegate's final-score rollup (or null if not yet computed). */
export async function getDelegateFinalScore(eventId: string, committeeId: string, delegateId: string): Promise<Marking | null> {
  if (!committeeId || !delegateId) return null;
  try {
    const snap = await getDoc(doc(db, "markings", finalMarkingId(committeeId, delegateId)));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Marking;
  } catch (error) {
    console.error("Error fetching delegate final score:", error);
    return null;
  }
}

export async function savePositionPaperGrade(
  applicationId: string,
  delegateId: string,
  eventId: string,
  committeeId: string,
  score: number,
  feedback: string,
  status: "review" | "approved" | "revision" | "flagged",
  gradedBy: string
): Promise<{ success: boolean; error?: any }> {
  try {
    // Always the paper's own doc, so a grade never overwrites a day's marks or feedback.
    const found = await getDelegateMarking(applicationId, delegateId, eventId, committeeId);
    const existing = found && found.id && isPaperDoc(found.id, found) ? found : null;
    if (existing && existing.id) {
      const docRef = doc(db, "markings", existing.id);
      await updateDoc(docRef, {
        positionPaperScore: score,
        feedback,
        paperStatus: status,
        paperGradedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { success: true };
    } else {
      // Create new marking document for position paper
      const markingsRef = collection(db, "markings");
      await addDoc(markingsRef, {
        eventId,
        committeeId,
        delegateId,
        applicationId,
        scores: {}, // no template scores yet
        feedback,
        gradedBy,
        positionPaperScore: score,
        paperStatus: status,
        paperGradedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { success: true };
    }
  } catch (error) {
    console.error("Error saving position paper grade:", error);
    return { success: false, error };
  }
}

export interface PaperComment {
  id?: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: any;
}

export async function addPaperComment(markingId: string, comment: Omit<PaperComment, "id" | "createdAt">): Promise<{ success: boolean; error?: any }> {
  try {
    const commentsRef = collection(db, `markings/${markingId}/comments`);
    await addDoc(commentsRef, {
      ...comment,
      createdAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error("Error adding comment:", error);
    return { success: false, error };
  }
}

export function subscribeToPaperComments(markingId: string, callback: (comments: PaperComment[]) => void) {
  const commentsRef = collection(db, `markings/${markingId}/comments`);
  const q = query(commentsRef, orderBy("createdAt", "asc"));
  return onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaperComment));
    callback(comments);
  });
}
