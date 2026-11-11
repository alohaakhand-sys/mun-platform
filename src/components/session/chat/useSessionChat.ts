"use client";

/**
 * The console-level chat binding: one listener, folded threads, unread totals.
 *
 * MOUNT THIS AT THE CONSOLE TOP LEVEL, not inside the dock. A badge that only counts while the
 * panel is open is not a badge — the whole point is to tell someone there is something to open.
 * The `CHAT_INBOX_LIMIT` window on the dais query is what makes a session-long listener affordable
 * on the Spark tier.
 *
 * `enabled` is a hard gate, not a nicety. The dais listener is unfiltered, and Firestore rules do
 * not filter queries: for anyone the `/chat` rule does not accept as dais, that listen fails
 * outright rather than returning fewer rows. Pass the console's `canDais`, never `canControl`.
 */
import { useEffect, useMemo, useState } from "react";
import {
  foldThreads, totalUnread, type ChatSenderRole, type ChatThread, type SessionChatMessage,
} from "@/lib/services/sessionChatModel";
import { subscribeChatInbox, subscribeMyThread } from "@/lib/services/sessionChatService";
import { useChatSeen } from "./useChatSeen";

/** Stable identity, so a stale-feed render does not remake the array every pass. */
const EMPTY: SessionChatMessage[] = [];

export interface SessionChat {
  messages: SessionChatMessage[];
  threads: ChatThread[];
  unread: number;
  /**
   * The listener was denied and is DEAD — Firestore does not retry a rejected listener. Surface
   * this instead of rendering an empty inbox, which is indistinguishable from "no messages" and is
   * how a silently broken panel survives a whole conference.
   */
  denied: boolean;
  markSeen: (threadKey: string, lastAt: number) => void;
}

export function useSessionChat({
  eventId, sessionId, uid, role, enabled,
}: {
  eventId: string;
  sessionId: string;
  /** The viewer's uid — the delegate's own thread key, or the dais member's identity. */
  uid: string;
  role: ChatSenderRole;
  enabled: boolean;
}): SessionChat {
  /**
   * The feed is stamped with the (session, viewer) it came from, and stale stamps are discarded at
   * RENDER time rather than cleared by a setState in the effect. Switching the session date must
   * not leave yesterday's thread on screen for the beat before the first snapshot lands — and
   * deriving that instead of clearing it keeps the subscribe effect a pure subscription.
   */
  const feedKey = `${eventId}|${sessionId}|${uid}|${role}`;
  const [feed, setFeed] = useState<{ key: string; msgs: SessionChatMessage[] }>(
    { key: "", msgs: EMPTY },
  );
  const { seen, markSeen } = useChatSeen(eventId, sessionId);

  // Denial is stamped with the same feedKey, so re-authenticating or changing session clears it by
  // derivation rather than needing a reset write.
  const [deniedKey, setDeniedKey] = useState("");

  useEffect(() => {
    if (!enabled || !eventId || !sessionId || !uid) return;
    const emit = (msgs: SessionChatMessage[]) => setFeed({ key: feedKey, msgs });
    const onErr = () => setDeniedKey(feedKey);
    return role === "dais"
      ? subscribeChatInbox(eventId, sessionId, emit, onErr)
      : subscribeMyThread(eventId, sessionId, uid, emit, onErr);
  }, [enabled, eventId, sessionId, uid, role, feedKey]);

  const messages = feed.key === feedKey ? feed.msgs : EMPTY;
  const denied = deniedKey === feedKey;
  const threads = useMemo(() => foldThreads(messages, seen, role), [messages, seen, role]);
  const unread = useMemo(() => totalUnread(threads), [threads]);

  return { messages, threads, unread, denied, markSeen };
}
