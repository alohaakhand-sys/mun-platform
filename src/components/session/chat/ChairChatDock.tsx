"use client";

/**
 * The dais side of the left dock: inbox (level 0) ⇄ one thread (level 1).
 *
 * Rendered only when the console's `canDais` is true — a NARROWER gate than `canControl`, which
 * also admits EB directors/USGs. The `/chat` rule accepts exactly `canWriteMarking` (chair,
 * vice-chair, organizer, co-organizer, canMarkDelegates), so anyone outside that set would get a
 * composer whose every send is denied and an inbox listener that fails outright.
 *
 * A vice-chair replies here as themselves with `fromRole: "dais"` — there is deliberately no proxy
 * path in chat (see the note in `sessionChatService`).
 */
import { useCallback, useMemo, useState } from "react";
import { getCountryName } from "@/lib/data/countries";
import { BROADCAST_THREAD, type ChatThread } from "@/lib/services/sessionChatModel";
import { sendDaisBroadcast, sendDaisReply } from "@/lib/services/sessionChatService";
import { ChatDock, ChatDenied } from "./ChatDock";
import { ChatInbox, type ChatRosterEntry } from "./ChatInbox";
import { ChatThreadView } from "./ChatThreadView";
import type { SessionChat } from "./useSessionChat";

const EMPTY: ChatThread["messages"] = [];

export function ChairChatDock({
  eventId, sessionId, chat, roster, userId, userName, open, wide, onToggle,
}: {
  eventId: string;
  sessionId: string;
  chat: SessionChat;
  roster: ChatRosterEntry[];
  userId: string;
  userName: string;
  open: boolean;
  wide: boolean;
  onToggle: () => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const active = useMemo(
    () => (openKey ? chat.threads.find((t) => t.key === openKey) ?? null : null),
    [openKey, chat.threads],
  );
  const rosterEntry = useMemo(
    () => (openKey ? roster.find((r) => r.uid === openKey) : undefined),
    [openKey, roster],
  );

  const send = useCallback(async (text: string) => {
    if (!openKey) return;
    const from = { uid: userId, name: userName };
    if (openKey === BROADCAST_THREAD) await sendDaisBroadcast(eventId, sessionId, from, text);
    else await sendDaisReply(eventId, sessionId, openKey, from, text);
  }, [openKey, eventId, sessionId, userId, userName]);

  const markSeen = chat.markSeen;
  const onSeen = useCallback(
    (lastAt: number) => { if (openKey) markSeen(openKey, lastAt); },
    [openKey, markSeen],
  );

  const isBroadcast = openKey === BROADCAST_THREAD;
  // The picker can open a thread nobody has written in yet, so fall back to the roster labels.
  const country = active?.country || rosterEntry?.country || "";
  const title = !openKey
    ? "Messages"
    : isBroadcast
      ? "Announcements"
      : (country ? (getCountryName(country) || country) : (active?.name || rosterEntry?.name || "Delegate"));
  const subtitle = !openKey
    ? "Private notes from delegates"
    : isBroadcast
      ? "Everyone in this committee"
      : (active?.name || rosterEntry?.name || undefined);

  return (
    <ChatDock
      open={open} wide={wide} unread={chat.unread}
      title={title} subtitle={subtitle}
      onToggle={onToggle}
      onBack={openKey ? () => setOpenKey(null) : undefined}
    >
      {chat.denied ? (
        <ChatDenied dais />
      ) : openKey ? (
        <ChatThreadView
          messages={active?.messages ?? EMPTY}
          meUid={userId}
          canSend
          broadcast={isBroadcast}
          placeholder={isBroadcast ? "Announce to the committee…" : "Reply to this delegate…"}
          onSend={send}
          onSeen={onSeen}
        />
      ) : (
        <ChatInbox threads={chat.threads} roster={roster} onOpen={setOpenKey} />
      )}
    </ChatDock>
  );
}
