import {
  collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp,
  type Unsubscribe, type FirestoreError,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/client";
import {
  BROADCAST_THREAD, CHAT_INBOX_LIMIT, normalizeChatText,
  type ChatSenderRole, type SessionChatMessage,
} from "./sessionChatModel";

/**
 * Live-session chat — Firestore I/O.
 *
 * ISOLATED from the platform messenger (`conversations/*`, `messageService.ts`): different path,
 * different service, different UI. A note written here never appears in the delegate's inbox, and
 * nothing in the messenger can read this collection. Do not bridge them.
 *
 * Path: events/{eventId}/sessions/{sessionId}/chat/{autoId}
 * Two shapes, one collection, distinguished by `threadKey`:
 *   - a PRIVATE thread, keyed by the delegate's uid  — delegate <-> dais, nobody else
 *   - the BROADCAST lane, keyed "@all"               — dais -> every delegate, one way
 *
 * DELIBERATE OMISSIONS — do not "complete the pattern":
 *  - No `proxyFields()`. A vice-chair IS the dais; they reply under their own name with
 *    fromRole "dais". A proxy note would put a message in a delegate's own thread that they did
 *    not write. No chat control belongs in `RepresentPanel`.
 *  - No `bumpParticipation()`. A note to the dais is not a floor artifact and must not inflate a
 *    participation counter or a mark.
 *  - No typing indicators, read receipts or chat presence. Each is a write per keystroke, and each
 *    would leak the App Admin ghost observer's presence.
 *
 * Imports nothing from `sessionService.ts` — keep it that way (no cycle).
 */

function chatCol(eventId: string, sessionId: string) {
  return collection(db, "events", eventId, "sessions", sessionId, "chat");
}

/**
 * Chat listener failures are ALWAYS about identity, so the message must name the identity.
 *
 * `permission-denied` here has exactly one cause: the signed-in account is not who the `/chat` rule
 * expects for this query shape. The commonest way to hit it is not a rules bug but a browser one —
 * Firebase auth is shared per ORIGIN, so signing in as a delegate in a second tab re-authenticates
 * the chair console's still-mounted unfiltered inbox listener as that delegate, and Firestore kills
 * a denied listener permanently rather than retrying. Test chair and delegate in separate browsers
 * or profiles. A bare "Missing or insufficient permissions" sent us hunting the rules for an hour;
 * the uid is what ends that in one line.
 */
function logChatError(fn: string, uid: string | undefined, err: FirestoreError) {
  if (err.code === "permission-denied") {
    console.warn(
      `${fn}: permission-denied for uid=${uid || "(signed out)"}. ` +
      "This account is not chair/vice-chair/organizer for this committee — or the browser switched " +
      "accounts under a live listener. Firestore does not retry a denied listener.",
    );
    return;
  }
  console.error(fn, err);
}

/**
 * The one write path. Trims and clamps to the ceiling the rules enforce, stamps both clocks, and
 * refuses an empty body rather than letting the rules reject it (that failure would be visible
 * only in the browser console).
 *
 * `sentAt` is the client clock and is what the UI orders by — it exists before the server acks, so
 * an optimistic row never sorts against a null. `createdAt` is the server clock and is what the
 * record trusts.
 */
async function write(
  eventId: string, sessionId: string,
  fields: Omit<SessionChatMessage, "id" | "sentAt" | "createdAt" | "text">,
  rawText: string,
): Promise<void> {
  const text = normalizeChatText(rawText);
  if (!eventId || !sessionId || !text) return;
  await addDoc(chatCol(eventId, sessionId), {
    ...fields,
    text,
    sentAt: Date.now(),
    createdAt: serverTimestamp(),
  });
}

/** Delegate -> dais, into their own thread. `threadKey` is always the sender's own uid. */
export async function sendDelegateNote(
  eventId: string, sessionId: string,
  from: { uid: string; name: string; country: string },
  text: string,
): Promise<void> {
  if (!from?.uid) return;
  await write(eventId, sessionId, {
    threadKey: from.uid,
    fromRole: "delegate" as ChatSenderRole,
    fromUid: from.uid,
    fromName: from.name || "",
    country: from.country || "",
  }, text);
}

/** Dais -> one delegate. `threadKey` is the RECIPIENT's uid, not the sender's. */
export async function sendDaisReply(
  eventId: string, sessionId: string, threadKey: string,
  from: { uid: string; name: string },
  text: string,
): Promise<void> {
  if (!from?.uid || !threadKey || threadKey === BROADCAST_THREAD) return;
  await write(eventId, sessionId, {
    threadKey,
    fromRole: "dais" as ChatSenderRole,
    fromUid: from.uid,
    fromName: from.name || "",
    country: "",
  }, text);
}

/**
 * Dais -> every delegate in the session. A thread VARIANT, not a second system: same collection,
 * same doc shape, same rules block — only the key differs.
 *
 * This is the one surface here with real fan-out (one write bills a read to every open delegate
 * console), which is exactly why it is a one-way announcement lane and not a room chat.
 */
export async function sendDaisBroadcast(
  eventId: string, sessionId: string,
  from: { uid: string; name: string },
  text: string,
): Promise<void> {
  if (!from?.uid) return;
  await write(eventId, sessionId, {
    threadKey: BROADCAST_THREAD,
    fromRole: "dais" as ChatSenderRole,
    fromUid: from.uid,
    fromName: from.name || "",
    country: "",
  }, text);
}

/**
 * One delegate's view: their own thread plus every announcement, in a SINGLE listener.
 *
 * THE QUERY SHAPE IS LOAD-BEARING. Firestore rules do not filter queries — a `list` is evaluated
 * per returned document, and one failing document rejects the WHOLE listener rather than dropping
 * rows. The `/chat` rule allows a delegate exactly `threadKey == uid || threadKey == "@all"`, so
 * widening this query at all produces "Missing or insufficient permissions", visible only in the
 * browser console. Keep the two in step.
 *
 * Single-field `in`, sorted client-side: rides the automatic index, so there is nothing to add to
 * `firestore.indexes.json`. Same discipline as `subscribeMyPoints`.
 */
export function subscribeMyThread(
  eventId: string, sessionId: string, uid: string,
  cb: (msgs: SessionChatMessage[]) => void,
  onError?: (err: FirestoreError) => void,
): Unsubscribe {
  const q = query(chatCol(eventId, sessionId), where("threadKey", "in", [uid, BROADCAST_THREAD]));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SessionChatMessage));
    rows.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
    cb(rows);
  }, (err) => { logChatError("subscribeMyThread", uid, err); cb([]); onError?.(err); });
}

/**
 * The dais inbox: every thread in the session, newest `CHAT_INBOX_LIMIT` messages.
 *
 * Single-field `orderBy` + `limit` — automatic index, no entry in `firestore.indexes.json`. Same
 * shape as `subscribePoints`. The limit is the read-budget guard: on a 50k-reads/day tier a
 * three-hour sitting must not cost an unbounded snapshot on every chair reload. Do not remove it.
 *
 * Mount this ONLY for someone the `/chat` rule accepts as dais (see the console's `canDais` prop) —
 * for anyone else the unfiltered listen hard-fails.
 */
export function subscribeChatInbox(
  eventId: string, sessionId: string,
  cb: (msgs: SessionChatMessage[]) => void,
  onError?: (err: FirestoreError) => void,
): Unsubscribe {
  const q = query(chatCol(eventId, sessionId), orderBy("sentAt", "desc"), limit(CHAT_INBOX_LIMIT));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SessionChatMessage));
    rows.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
    cb(rows);
  }, (err) => { logChatError("subscribeChatInbox", auth.currentUser?.uid, err); cb([]); onError?.(err); });
}
