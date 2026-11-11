/**
 * Live-session chat — the PURE half.
 *
 * No firebase import, on purpose: `vitest.config.ts` runs `environment: "node"` with no Firebase
 * stub, so anything importable by a test must not reach `@/lib/firebase/client`. Same split as
 * `motionFloor.ts` / `rollCall.ts` / `caucusList.ts`. Firestore I/O lives in `sessionChatService.ts`.
 *
 * This chat is ISOLATED from the platform messenger (`conversations/*`, `messageService.ts`) by
 * construction — different path, different service, different UI. Do not bridge them.
 */

/**
 * Reserved thread key for the dais announcement lane. A uid can never collide with it: Firebase
 * uids are alphanumeric, and the rules additionally block a delegate from writing this key.
 */
export const BROADCAST_THREAD = "@all";

/** Hard cap, mirrored in `firestore.rules` (`text.size() <= 1000`). Keep the two in step. */
export const CHAT_MAX_CHARS = 1000;

/** Minimum gap between two sends from one client. Client-side only — rules cannot rate-limit. */
export const CHAT_MIN_SEND_GAP_MS = 1500;

/** Rolling spam guard: at most this many sends inside `CHAT_BURST_WINDOW_MS`. */
export const CHAT_BURST_LIMIT = 20;
export const CHAT_BURST_WINDOW_MS = 5 * 60_000;

/**
 * Newest-N window for the dais inbox. This is the read-budget guard: on the Spark tier a
 * three-hour sitting must not cost an unbounded initial snapshot on every chair reload.
 */
export const CHAT_INBOX_LIMIT = 300;

export type ChatSenderRole = "delegate" | "dais";

export interface SessionChatMessage {
  id?: string;
  /** The DELEGATE's uid (per-delegate, not per-delegation), or `BROADCAST_THREAD`. */
  threadKey: string;
  fromRole: ChatSenderRole;
  /** Author's uid. Rules pin this to `request.auth.uid`, so it is always the real human. */
  fromUid: string;
  fromName: string;
  /** The delegation label, for the chair's inbox rows. "" on a broadcast. */
  country: string;
  text: string;
  /**
   * ORDERING key — client epoch ms. Exists the instant the doc is written locally, so an
   * optimistic row lands in the right position and `orderBy(sentAt)` never sorts a pending null.
   */
  sentAt: number;
  /** EVIDENTIARY key — serverTimestamp(). Null until the server acks. What the record trusts. */
  createdAt?: any;
}

export interface ChatThread {
  /** `BROADCAST_THREAD`, or the delegate's uid. */
  key: string;
  isBroadcast: boolean;
  /** Ascending by `sentAt` — oldest first, the order a transcript reads in. */
  messages: SessionChatMessage[];
  lastAt: number;
  lastText: string;
  lastFromRole: ChatSenderRole;
  /** Display labels, taken from the newest message that carried them. */
  country: string;
  name: string;
  /** Messages from the OTHER side newer than the viewer's last-seen stamp. */
  unread: number;
}

/**
 * The thread key for one uid, derived from the SAME field `firestore.rules` reads — the session's
 * own attendance map — so the query shape and the rule can never disagree after a roster edit.
 *
 * Returns null when the uid is not on today's roll. The caller then subscribes to announcements
 * only and disables the composer, rather than firing a write the rules will reject.
 *
 * Structurally typed (not `LiveSession`) so this module imports nothing.
 */
export function threadKeyFor(
  attendance: Record<string, { country?: string }> | undefined,
  uid: string,
): string | null {
  if (!uid || !attendance) return null;
  return attendance[uid] ? uid : null;
}

/** Trim + clamp to the rules' ceiling. Every send path goes through this. */
export function normalizeChatText(raw: string): string {
  return (raw || "").trim().slice(0, CHAT_MAX_CHARS);
}

/**
 * Fold a flat message list into per-thread summaries.
 *
 * `seen` maps threadKey -> the `sentAt` of the last message the viewer looked at (persisted in
 * localStorage — see `useChatSeen`). Unread is therefore pure arithmetic over messages the
 * listener ALREADY delivered: no extra Firestore read, and no write anywhere.
 *
 * `forRole` is the VIEWER's side. The dais counts delegate messages as unread; a delegate counts
 * dais messages. Your own messages are never unread to you.
 *
 * Ordering: the broadcast lane is pinned first (announcements should not sink under chatter),
 * then by most recent activity.
 */
export function foldThreads(
  msgs: SessionChatMessage[],
  seen: Record<string, number>,
  forRole: ChatSenderRole,
): ChatThread[] {
  const byKey = new Map<string, SessionChatMessage[]>();
  for (const m of msgs) {
    if (!m?.threadKey) continue;
    const list = byKey.get(m.threadKey);
    if (list) list.push(m);
    else byKey.set(m.threadKey, [m]);
  }

  const threads: ChatThread[] = [];
  for (const [key, list] of byKey) {
    list.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
    const last = list[list.length - 1];
    const since = seen[key] ?? 0;
    // Labels come from the newest message that actually carried them: a delegate renaming their
    // delegation mid-conference should show as the delegation they are now.
    let country = "";
    let name = "";
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.fromRole !== "delegate") continue;
      country = m.country || "";
      name = m.fromName || "";
      break;
    }
    threads.push({
      key,
      isBroadcast: key === BROADCAST_THREAD,
      messages: list,
      lastAt: last?.sentAt || 0,
      lastText: last?.text || "",
      lastFromRole: last?.fromRole || "delegate",
      country,
      name,
      unread: list.filter((m) => m.fromRole !== forRole && (m.sentAt || 0) > since).length,
    });
  }

  threads.sort((a, b) => {
    if (a.isBroadcast !== b.isBroadcast) return a.isBroadcast ? -1 : 1;
    return b.lastAt - a.lastAt;
  });
  return threads;
}

/** Total unread across every thread — what the collapsed dock rail and the TopBar badge show. */
export function totalUnread(threads: ChatThread[]): number {
  return threads.reduce((n, t) => n + t.unread, 0);
}
