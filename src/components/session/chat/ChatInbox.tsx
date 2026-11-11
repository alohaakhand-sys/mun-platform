"use client";

/**
 * The dais level-0 view: the announcement lane pinned on top, then one row per delegate who has
 * traffic, newest activity first. Same two-level drill-down grammar as the right tool panel, so the
 * console reads as one system.
 *
 * The picker at the bottom is how a chair opens a thread with somebody who has NOT written yet —
 * without it the dais can only ever reply, never initiate. It returns a UID, not a country, because
 * threads are keyed per delegate (a double delegation gets two threads).
 */
import { useMemo, useState } from "react";
import { ChevronRight, Megaphone, MessageSquare, Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCountryName } from "@/lib/data/countries";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { PanelEmpty, GroupLabel, panelTone } from "@/components/session/console/shared";
import { BROADCAST_THREAD, type ChatThread } from "@/lib/services/sessionChatModel";

export interface ChatRosterEntry {
  uid: string;
  country: string;
  name: string;
}

function ago(sentAt: number): string {
  if (!sentAt) return "";
  const secs = Math.max(0, Math.floor((Date.now() - sentAt) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

function UnreadPill({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums shrink-0">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function ThreadRow({
  label, sub, flag, preview, time, unread, tinted, icon: Icon, onClick,
}: {
  label: string;
  sub?: string;
  flag?: React.ReactNode;
  preview: string;
  time: string;
  unread: number;
  tinted?: boolean;
  icon?: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border px-2.5 py-2 flex items-start gap-2.5 transition-colors",
        tinted ? panelTone("violet").tint : "border-border/60 bg-secondary/20 hover:bg-secondary/50",
      )}>
      <span className="shrink-0 mt-0.5">
        {flag ?? (Icon ? <Icon className={cn("w-4 h-4", tinted && panelTone("violet").title)} /> : null)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-[13px] leading-tight truncate">{label}</span>
          {time && <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/70">{time}</span>}
        </span>
        {sub && <span className="block text-[10.5px] text-muted-foreground leading-tight truncate">{sub}</span>}
        <span className="block text-[12px] text-foreground/70 leading-snug truncate mt-0.5">{preview || "—"}</span>
      </span>
      {unread > 0 ? <UnreadPill n={unread} /> : <ChevronRight className="w-4 h-4 shrink-0 mt-1 text-muted-foreground/50" />}
    </button>
  );
}

export function ChatInbox({
  threads, roster, onOpen,
}: {
  threads: ChatThread[];
  roster: ChatRosterEntry[];
  onOpen: (threadKey: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");

  const broadcast = threads.find((t) => t.isBroadcast);
  const conversations = threads.filter((t) => !t.isBroadcast);

  // Labels prefer the roster (authoritative, and present even before the delegate writes) and fall
  // back to what the messages themselves carried.
  const rosterByUid = useMemo(() => {
    const m = new Map<string, ChatRosterEntry>();
    for (const r of roster) if (r.uid) m.set(r.uid, r);
    return m;
  }, [roster]);

  const needle = q.trim().toLowerCase();
  const pickable = useMemo(() => {
    const open = new Set(conversations.map((t) => t.key));
    return roster
      .filter((r) => r.uid && !open.has(r.uid))
      .filter((r) => !needle
        || (getCountryName(r.country) || r.country || "").toLowerCase().includes(needle)
        || (r.name || "").toLowerCase().includes(needle))
      .sort((a, b) => (getCountryName(a.country) || a.country || "")
        .localeCompare(getCountryName(b.country) || b.country || ""));
  }, [roster, conversations, needle]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5">
      <ThreadRow
        label="Announcements" icon={Megaphone} tinted
        preview={broadcast?.lastText || "Send a notice to the whole committee"}
        time={broadcast ? ago(broadcast.lastAt) : ""}
        unread={broadcast?.unread ?? 0}
        onClick={() => onOpen(BROADCAST_THREAD)}
      />

      <GroupLabel count={conversations.length}>Delegates</GroupLabel>

      {conversations.length === 0 ? (
        <PanelEmpty icon={MessageSquare}>No delegate has messaged the dais yet.</PanelEmpty>
      ) : (
        <div className="space-y-1.5">
          {conversations.map((t) => {
            const r = rosterByUid.get(t.key);
            const country = r?.country || t.country;
            const name = r?.name || t.name;
            return (
              <ThreadRow
                key={t.key}
                label={country ? (getCountryName(country) || country) : (name || "Delegate")}
                sub={country ? name : undefined}
                flag={country ? <CountryFlag code={country} size={18} /> : undefined}
                icon={MessageSquare}
                preview={`${t.lastFromRole === "dais" ? "You: " : ""}${t.lastText}`}
                time={ago(t.lastAt)}
                unread={t.unread}
                onClick={() => onOpen(t.key)}
              />
            );
          })}
        </div>
      )}

      {!picking ? (
        <button type="button" onClick={() => setPicking(true)}
          className="w-full h-9 rounded-lg border border-dashed border-border/70 text-[12.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors inline-flex items-center justify-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5" /> Message a delegate
        </button>
      ) : (
        <div className="rounded-xl border border-border/60 bg-secondary/20 p-2 space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder="Search the roster…"
              className="w-full h-8 pl-8 pr-2.5 rounded-md bg-background border border-border/60 text-[12.5px] outline-none focus:border-primary/50"
            />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1">
            {pickable.length === 0 ? (
              <p className="py-2 text-center text-[12px] text-muted-foreground">Nobody left to start with.</p>
            ) : pickable.map((r) => (
              <button key={r.uid} type="button"
                onClick={() => { setPicking(false); setQ(""); onOpen(r.uid); }}
                className="w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-secondary/60 transition-colors">
                {r.country && <CountryFlag code={r.country} size={16} />}
                <span className="text-[12.5px] font-medium truncate">
                  {r.country ? (getCountryName(r.country) || r.country) : (r.name || "Delegate")}
                </span>
                {r.country && r.name && (
                  <span className="text-[11px] text-muted-foreground truncate ml-auto">{r.name}</span>
                )}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setPicking(false); setQ(""); }}
            className="w-full h-7 text-[12px] text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}
    </div>
  );
}
