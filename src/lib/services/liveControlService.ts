/**
 * Event-level Live MUN control — the organizer's master switch and the two ceremonies.
 *
 * Location: events/{eventId}/liveControl/state — ONE small doc per event.
 *
 * WHY A SEPARATE DOC, not a field on the event. Every chair and delegate has to read this
 * before they can enter Live MUN, so it must be cheap and readable by any signed-in user.
 * The event doc is large (40+ fields) and its read rule is `published || owner || staff`;
 * a tiny sibling doc keeps the gate check to a single ~200-byte read against the Spark
 * 50k/day cap, and lets the rules grant read to everyone without widening the event doc.
 *
 * THE GATE. `sessionsOpen` is the whole product rule: until the organizer turns it on, no
 * chair can open a committee sitting and no delegate can enter one. It is turned on ONCE at
 * the start of a conference — chairs open their own sitting each day, so there is deliberately
 * no daily organizer action and no per-committee switch.
 *
 * ABSENT DOC = NOT STARTED. `getLiveControl` returns null for an event whose organizer has
 * never opened this page, and `resolveLiveGate` reads that as "not started". The firestore
 * rules take the opposite default (a missing doc allows) so that an event mid-conference can
 * never be locked out by a failed write — see the note in firestore.rules.
 */
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { newTimer, type LiveSession } from "@/lib/services/sessionService";

export type CeremonyKind = "opening" | "closing";
export type CeremonyStatus = "idle" | "live" | "ended";

export const CEREMONY_KINDS: CeremonyKind[] = ["opening", "closing"];

/** Display label, used by the gate copy and the ceremony header alike. */
export function ceremonyLabel(kind: CeremonyKind): string {
  return kind === "opening" ? "Opening Ceremony" : "Closing Ceremony";
}

export interface CeremonyState {
  status: CeremonyStatus;
  /** Organizer-editable, e.g. "Opening Ceremony — DUMUN 2026". Falls back to ceremonyLabel(). */
  title: string;
  /** epoch ms — same convention as TimerState.endsAt (the writer's own clock). */
  startedAt?: number;
  /** null when the ceremony is live again after a previous run — see startCeremony. */
  endedAt?: number | null;
  startedBy?: string;
}

export interface EventLiveControl {
  eventId: string;
  /** THE gate — see the file header. */
  sessionsOpen: boolean;
  sessionsOpenedAt?: number;
  sessionsOpenedBy?: string;
  opening: CeremonyState;
  closing: CeremonyState;
  /** Optional organizer message, surfaced in the gate modal participants see. */
  note?: string;
  updatedAt?: any;
}

const CONTROL_DOC = "state";

function controlRef(eventId: string) {
  return doc(db, "events", eventId, "liveControl", CONTROL_DOC);
}

function idleCeremony(kind: CeremonyKind): CeremonyState {
  return { status: "idle", title: ceremonyLabel(kind) };
}

/** The shape a brand-new control doc is seeded with — gate shut, both ceremonies idle. */
export function initialLiveControl(eventId: string): EventLiveControl {
  return {
    eventId,
    sessionsOpen: false,
    opening: idleCeremony("opening"),
    closing: idleCeremony("closing"),
  };
}

/**
 * Normalizes a raw doc. Ceremony sub-objects are defaulted so a doc written before either
 * ceremony existed still reads as "idle" rather than crashing the gate resolver.
 */
function normalize(eventId: string, data: any): EventLiveControl {
  return {
    eventId,
    sessionsOpen: data?.sessionsOpen === true,
    sessionsOpenedAt: data?.sessionsOpenedAt,
    sessionsOpenedBy: data?.sessionsOpenedBy,
    opening: { ...idleCeremony("opening"), ...(data?.opening || {}) },
    closing: { ...idleCeremony("closing"), ...(data?.closing || {}) },
    note: data?.note || "",
    updatedAt: data?.updatedAt,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** One-shot read. Returns null when the organizer has never opened Live MUN for this event. */
export async function getLiveControl(eventId: string): Promise<EventLiveControl | null> {
  if (!eventId) return null;
  const snap = await getDoc(controlRef(eventId));
  return snap.exists() ? normalize(eventId, snap.data()) : null;
}

/**
 * Live subscription. Only the organizer control page and an open gate modal should hold one —
 * every other caller wants the one-shot read above (see [[spark-plan-read-budget]]).
 */
export function subscribeLiveControl(
  eventId: string, cb: (c: EventLiveControl | null) => void,
): Unsubscribe {
  return onSnapshot(controlRef(eventId), (snap) => {
    cb(snap.exists() ? normalize(eventId, snap.data()) : null);
  }, (err) => { console.error("subscribeLiveControl", err); cb(null); });
}

/** Which ceremony (if any) is live right now. Opening wins if both somehow are. */
export function liveCeremony(control: EventLiveControl | null): CeremonyKind | null {
  if (!control) return null;
  if (control.opening.status === "live") return "opening";
  if (control.closing.status === "live") return "closing";
  return null;
}

// ── Writes (organizer / co-organizer only, enforced in firestore.rules) ───────

/** Creates the control doc if it is missing. Safe to call on every organizer page load. */
export async function ensureLiveControl(eventId: string): Promise<EventLiveControl> {
  const existing = await getLiveControl(eventId);
  if (existing) return existing;
  const seed = initialLiveControl(eventId);
  await setDoc(controlRef(eventId), { ...seed, updatedAt: serverTimestamp() });
  return seed;
}

/**
 * WRITE ONLY THE FIELDS YOU MEAN. Every writer below uses `merge: true` so it also creates the
 * doc on an event whose organizer never opened the control page — but merge is per-field, so
 * spreading a default object through one of these would quietly reset its siblings. Doing that
 * here once turned a LIVE ceremony back to "idle" mid-broadcast, and would have shut committee
 * sessions the moment a ceremony started.
 */
export async function setSessionsOpen(eventId: string, open: boolean, uid: string): Promise<void> {
  await setDoc(controlRef(eventId), {
    eventId,
    sessionsOpen: open,
    ...(open ? { sessionsOpenedAt: Date.now(), sessionsOpenedBy: uid } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function setLiveControlNote(eventId: string, note: string): Promise<void> {
  await updateDoc(controlRef(eventId), { note, updatedAt: serverTimestamp() });
}

export async function setCeremonyTitle(
  eventId: string, kind: CeremonyKind, title: string,
): Promise<void> {
  await updateDoc(controlRef(eventId), {
    [`${kind}.title`]: title, updatedAt: serverTimestamp(),
  });
}

/**
 * Opens a ceremony. Mints the room doc FIRST so nobody can follow the "live" flag into a
 * channel whose session doc does not exist yet (the Agora token route reads `live.stage`
 * off it, and a missing doc would mean nobody is ever a publisher — including the host).
 */
export async function startCeremony(
  eventId: string, kind: CeremonyKind, uid: string, title?: string,
): Promise<void> {
  await ensureCeremonySession(eventId, kind, uid);
  // `endedAt: null` is explicit: merge writes INTO the existing ceremony map, so a previous run's
  // end timestamp would otherwise survive into a ceremony that is live again.
  await setDoc(controlRef(eventId), {
    eventId,
    [kind]: {
      status: "live",
      title: title || ceremonyLabel(kind),
      startedAt: Date.now(),
      endedAt: null,
      startedBy: uid,
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Ends a ceremony for everyone. Closing the room doc is what actually tears the video down:
 * `useAgoraLive` derives `ended` from `phase === "closed"`, so every client leaves the Agora
 * channel within a second or two. The control flag is only what the gate reads.
 */
export async function endCeremony(eventId: string, kind: CeremonyKind): Promise<void> {
  await updateDoc(controlRef(eventId), {
    [`${kind}.status`]: "ended",
    [`${kind}.endedAt`]: Date.now(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(ceremonySessionRef(eventId, kind), {
    phase: "closed",
    "live.stage": [],
    updatedAt: serverTimestamp(),
  }).catch((e) => console.error("endCeremony session", e));
}

// ── The ceremony room doc ────────────────────────────────────────────────────

/**
 * Reserved session ids. The `__ceremony__` prefix is load-bearing: firestore.rules matches on
 * it to keep ceremony docs writable by the organizer ALONE (a chair with `canMarkDelegates`
 * must not be able to put themselves on the ceremony stage), and the Agora token route uses
 * the same prefix to pick its ceremony branch.
 */
export function ceremonySessionId(kind: CeremonyKind): string {
  return `__ceremony__${kind}`;
}

/** The sentinel stored in `LiveSession.committeeId`. A ceremony belongs to no committee. */
export const CEREMONY_COMMITTEE = "__ceremony__";

/** How many people may hold the ceremony floor at once (a panel, not a speakers list). */
export const CEREMONY_STAGE_MAX = 6;

function ceremonySessionRef(eventId: string, kind: CeremonyKind) {
  return doc(db, "events", eventId, "sessions", ceremonySessionId(kind));
}

/**
 * Creates the ceremony room doc if missing, or re-opens it if a previous ceremony closed it.
 *
 * Deliberately NOT `ensureSession`: a ceremony has no roster, no roll call, no quorum and no
 * speakers list, and it is never registered in the `liveSessions` index (that monitor is for
 * committee sittings). `attendance` stays EMPTY on purpose — it suppresses the audience flag
 * tiles in LiveVideoRoom, and the `/chat` rule requires `uid in attendance`, so an empty map
 * enforces "no chat in a ceremony" at the rules layer rather than by hiding a button.
 */
export async function ensureCeremonySession(
  eventId: string, kind: CeremonyKind, createdBy: string,
): Promise<void> {
  const ref = ceremonySessionRef(eventId, kind);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    // Re-open: a prior run of this ceremony left phase "closed" (which kills video for
    // everyone). Clear the stage too — last time's speakers are not this time's.
    await updateDoc(ref, {
      phase: "gsl",
      finalized: false,
      "live.stage": [],
      "live.callEnded": false,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const session: LiveSession = {
    eventId,
    committeeId: CEREMONY_COMMITTEE,
    dateStr: "",
    // Anything but "closed"/"suspended" — `useAgoraLive` reads "closed" as "the call is over".
    phase: "gsl",
    quorumThreshold: 0,
    attendance: {},
    gsl: { defaultSpeakerSecs: 0, queue: [], activeSpeaker: null, timer: newTimer(0), spoken: 0 },
    caucus: null,
    activeVote: null,
    pointsMotions: { byDelegate: {} },
    rollCall: null,
    live: { stage: [], callEnded: false, updatedAt: serverTimestamp() },
    staff: {},
    pendingPublish: null,
    publishedResult: null,
    publishedDoc: null,
    finalized: false,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, { ...session, kind: "ceremony", ceremony: kind });
}

/**
 * Gives (or takes back) the ceremony floor, and labels the people on it in the same write.
 *
 * The label matters more here than in a committee. `LiveVideoRoom` names a tile from the roster,
 * then `session.staff`, then `attendance` — and a ceremony has no roster and no attendance, so
 * without this every speaker the organizer calls up would render as the generic "Speaker".
 * Stamping the name at the moment the floor is given is the only point where it is known: the
 * audience publishes no presence node to look it up from later.
 */
export async function setCeremonyStage(
  eventId: string, kind: CeremonyKind,
  uids: string[],
  /** uid → display name/role for the people being put on the floor. */
  labels: Record<string, { name: string; role?: string }> = {},
): Promise<void> {
  const patch: Record<string, any> = {
    "live.stage": uids,
    "live.updatedAt": serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  for (const uid of uids) {
    const l = labels[uid];
    if (!l) continue;
    patch[`staff.${uid}`] = { uid, name: l.name, role: l.role || "guest" };
  }
  await updateDoc(ceremonySessionRef(eventId, kind), patch);
}
