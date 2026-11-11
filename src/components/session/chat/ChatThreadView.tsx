"use client";

/**
 * One chat thread: the transcript plus the composer. Used unchanged by BOTH sides — the chair's
 * level-1 drill-down, the delegate's single stream, and the broadcast lane — because a thread is a
 * thread. Only the labelling and the composer's dressing differ, and those are props.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone, Send, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubCard, panelTone } from "@/components/session/console/shared";
import {
  BROADCAST_THREAD, CHAT_BURST_LIMIT, CHAT_BURST_WINDOW_MS, CHAT_MAX_CHARS,
  CHAT_MIN_SEND_GAP_MS, normalizeChatText, type SessionChatMessage,
} from "@/lib/services/sessionChatModel";

function clockOf(sentAt: number): string {
  if (!sentAt) return "";
  return new Date(sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** A broadcast is not a bubble — it is a notice, so it spans the column and centres. */
function AnnouncementRow({ m }: { m: SessionChatMessage }) {
  const t = panelTone("violet");
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 text-center", t.tint)}>
      <div className={cn("flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wide", t.title)}>
        <Megaphone className="w-3 h-3" /> Announcement
      </div>
      <p className="mt-1 text-[13px] leading-snug whitespace-pre-wrap break-words">{m.text}</p>
      <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
        {m.fromName || "Dais"} · {clockOf(m.sentAt)}
      </p>
    </div>
  );
}

function Bubble({ m, mine }: { m: SessionChatMessage; mine: boolean }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="max-w-[85%] min-w-0">
        {!mine && (
          <p className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {m.fromName || (m.fromRole === "dais" ? "Dais" : "Delegate")}
            {m.fromRole === "dais" && <span className="ml-1 text-primary">· Dais</span>}
          </p>
        )}
        <div className={cn(
          "rounded-[14px] px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words",
          mine
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "border border-border bg-card2 rounded-bl-sm",
        )}>
          {m.text}
        </div>
        <p className={cn("mt-0.5 px-1 text-[10px] tabular-nums text-muted-foreground", mine && "text-right")}>
          {clockOf(m.sentAt)}
        </p>
      </div>
    </div>
  );
}

export function ChatThreadView({
  messages, meUid, canSend, disabledReason, placeholder = "Message the dais…",
  broadcast = false, onSend, onSeen,
}: {
  messages: SessionChatMessage[];
  meUid: string;
  canSend: boolean;
  /** Rendered in place of the composer. Say WHY, not just "unavailable". */
  disabledReason?: string;
  placeholder?: string;
  /** Dress the composer as the announcement lane: violet frame + confirm-on-send. */
  broadcast?: boolean;
  onSend: (text: string) => Promise<void>;
  onSeen: (lastAt: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [throttled, setThrottled] = useState(false);
  const lastSentRef = useRef(0);
  const burstRef = useRef<number[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);

  const lastAt = messages.length ? messages[messages.length - 1].sentAt || 0 : 0;

  // Mark read while the thread is actually on screen. `markSeen` is monotonic, so a replayed tail
  // can never re-raise the badge.
  useEffect(() => {
    if (lastAt) onSeen(lastAt);
  }, [lastAt, onSeen]);

  // Follow the tail only when the reader is already at it — yanking someone out of scrollback to
  // show a new message is worse than letting them miss it for a beat.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lastAt, messages.length]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  const submit = useCallback(async () => {
    const text = normalizeChatText(draft);
    if (!text || sending || !canSend) return;

    // Client-side only — rules cannot rate-limit without reading prior state. The real deterrent
    // is that every message is on the permanent record under the sender's own uid.
    const now = Date.now();
    if (now - lastSentRef.current < CHAT_MIN_SEND_GAP_MS) return;
    burstRef.current = burstRef.current.filter((t) => now - t < CHAT_BURST_WINDOW_MS);
    if (burstRef.current.length >= CHAT_BURST_LIMIT) { setThrottled(true); return; }

    setSending(true);
    try {
      await onSend(text);
      lastSentRef.current = now;
      burstRef.current.push(now);
      setDraft("");
      setConfirming(false);
      atBottomRef.current = true;
    } finally {
      setSending(false);
    }
  }, [draft, sending, canSend, onSend]);

  const tone = panelTone("violet");
  const over = draft.length > CHAT_MAX_CHARS - 100;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">
            {broadcast ? "No announcements yet." : "No messages yet."}
          </p>
        ) : (
          messages.map((m) => (
            m.threadKey === BROADCAST_THREAD
              ? <AnnouncementRow key={m.id || m.sentAt} m={m} />
              : <Bubble key={m.id || m.sentAt} m={m} mine={m.fromUid === meUid} />
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 p-2.5">
        {!canSend ? (
          <SubCard className="flex items-start gap-2 p-2.5 text-[12px] text-muted-foreground">
            <Lock className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>{disabledReason || "You can't send messages here."}</span>
          </SubCard>
        ) : throttled ? (
          <SubCard className="p-2.5 text-[12px] text-muted-foreground">
            Slow down — the dais has your notes.
            <button type="button" onClick={() => { burstRef.current = []; setThrottled(false); }}
              className="ml-1.5 font-semibold text-primary hover:underline">Dismiss</button>
          </SubCard>
        ) : (
          <div className={cn("rounded-[14px] border bg-card2", broadcast ? tone.tint : "border-border")}>
            {broadcast && (
              <p className={cn("flex items-center gap-1.5 px-2.5 pt-2 text-[10.5px] font-semibold", tone.title)}>
                <Megaphone className="w-3 h-3" /> Every delegate in this committee will see this.
              </p>
            )}
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value.slice(0, CHAT_MAX_CHARS)); setConfirming(false); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                if (broadcast && !confirming) { setConfirming(true); return; }
                void submit();
              }}
              rows={2}
              placeholder={broadcast ? "Announce to the committee…" : placeholder}
              className="w-full resize-none bg-transparent px-2.5 py-2 text-[13px] leading-snug outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center gap-2 px-2.5 pb-2">
              {over && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {draft.length}/{CHAT_MAX_CHARS}
                </span>
              )}
              <button
                type="button"
                disabled={sending || !normalizeChatText(draft)}
                onClick={() => { if (broadcast && !confirming) { setConfirming(true); return; } void submit(); }}
                className={cn(
                  "ml-auto h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                  broadcast && confirming ? tone.solid : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}>
                <Send className="w-3.5 h-3.5" />
                {broadcast ? (confirming ? "Confirm announce" : "Announce") : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
