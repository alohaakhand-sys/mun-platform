"use client";

/**
 * The delegate side of the left dock: ONE stream, no drill-down.
 *
 * Their own notes and the dais's replies interleave with the committee announcements, in one
 * chronological column. Announcements are rare enough that merging them beats a tab, and merging
 * keeps the order honest — "the chair announced X, then I asked about it" reads as it happened.
 *
 * A delegate never sees another delegate's thread. That is enforced by `firestore.rules`, not by
 * this component: the query is `where("threadKey","in",[uid,"@all"])` and the rule allows exactly
 * those two. Widening the query breaks the whole listener rather than leaking anything.
 */
import { useCallback } from "react";
import { sendDelegateNote } from "@/lib/services/sessionChatService";
import { ChatDock, ChatDenied } from "./ChatDock";
import { ChatThreadView } from "./ChatThreadView";
import type { SessionChat } from "./useSessionChat";

export function DelegateChatDock({
  eventId, sessionId, chat, viewer, canSend, disabledReason, open, wide, onToggle,
}: {
  eventId: string;
  sessionId: string;
  chat: SessionChat;
  viewer: { delegateId: string; country: string; name: string };
  /** False off the roll or once the sitting is closed — the rule blocks the write either way. */
  canSend: boolean;
  disabledReason?: string;
  open: boolean;
  wide: boolean;
  onToggle: () => void;
}) {
  const send = useCallback(async (text: string) => {
    await sendDelegateNote(eventId, sessionId, {
      uid: viewer.delegateId, name: viewer.name, country: viewer.country,
    }, text);
  }, [eventId, sessionId, viewer.delegateId, viewer.name, viewer.country]);

  const markSeen = chat.markSeen;
  // One stream, two thread keys — mark both, or the announcement lane keeps the badge lit.
  const onSeen = useCallback((lastAt: number) => {
    for (const t of chat.threads) markSeen(t.key, t.lastAt || lastAt);
  }, [chat.threads, markSeen]);

  return (
    <ChatDock
      open={open} wide={wide} unread={chat.unread}
      title="Dais" subtitle="Private — only the chair sees this"
      onToggle={onToggle}
    >
      {chat.denied ? <ChatDenied dais={false} /> : (
      <ChatThreadView
        messages={chat.messages}
        meUid={viewer.delegateId}
        canSend={canSend}
        disabledReason={disabledReason}
        placeholder="Message the dais…"
        onSend={send}
        onSeen={onSeen}
      />
      )}
    </ChatDock>
  );
}
