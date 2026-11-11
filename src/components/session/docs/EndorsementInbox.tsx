"use client";

/**
 * Recipient inbox for sponsor / signatory endorsement requests.
 *
 * Subscribes (collection-group) to every PENDING request addressed to the signed-in
 * delegate and lets them Accept / Reject before a shared countdown runs out. Once the
 * window passes (`endsAt`) the row drops from view — the author's finalize sweep then
 * marks it expired.
 *
 * Rendered in two places — the live-session console and the dashboard documents page — and
 * styled from semantic tokens alone so it reads correctly on either. It used to carry a `tone`
 * prop with a literal white-on-transparent "dark" variant, from when the console was hard-coded
 * dark. The console follows `useLiveTheme` now (light by default) and this component sits ABOVE
 * the console's `.dark` video stage, so that variant rendered white text on a white card.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeMyPendingEndorsements, respondEndorsement, type DocEndorsement,
} from "@/lib/services/committeeDocService";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { Check, X, Loader2, Clock } from "lucide-react";

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const T = {
  wrap: "space-y-2",
  head: "text-xs font-semibold uppercase tracking-wide text-muted-foreground/80",
  card: "rounded-xl border border-border/60 bg-secondary/40 p-3 space-y-2",
  title: "text-sm font-semibold text-foreground",
  sub: "text-xs text-muted-foreground",
  role: "text-primary",
  timer: "text-amber-600 dark:text-amber-400",
  timerLow: "text-red-600 dark:text-red-400",
  accept: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25",
  reject: "border border-border/60 text-muted-foreground hover:bg-secondary/60",
} as const;

export function EndorsementInbox({
  className, rows: externalRows, proxy,
}: {
  className?: string;
  /**
   * Rows to render INSTEAD of the signed-in delegate's own feed. The vice-chair's Represent panel
   * passes the represented delegation's pending requests, which it sources per-paper — the
   * collection-group feed below cannot be read for anyone else (its rule pins `targetUid` to the
   * caller). Providing this suppresses the internal subscription entirely.
   */
  rows?: DocEndorsement[];
  /** Set alongside `rows` when a vice-chair is answering on the target delegation's behalf. */
  proxy?: { by: string; byName?: string };
}) {
  const { user } = useAuth();
  const [ownRows, setOwnRows] = useState<DocEndorsement[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const t = T;
  const external = externalRows !== undefined;
  const rows = external ? externalRows! : ownRows;

  useEffect(() => {
    if (external || !user?.uid) return;
    return subscribeMyPendingEndorsements(user.uid, setOwnRows);
  }, [external, user?.uid]);

  // 1s ticker only while there are requests to count down.
  useEffect(() => {
    if (rows.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rows.length]);

  const live = rows.filter((r) => r.endsAt - now > 0);
  if (live.length === 0) return null;

  const respond = async (r: DocEndorsement, action: "accept" | "reject") => {
    if (!r.id || busy) return;
    setBusy(r.id);
    try {
      await respondEndorsement(r.eventId, r.docId, r.id, action, proxy);
    } catch (e) {
      console.error("respondEndorsement", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn(t.wrap, className)}>
      <p className={t.head}>Endorsement requests</p>
      {live.map((r) => {
        const left = r.endsAt - now;
        const verb = r.role === "sponsor" ? "sponsor" : "sign";
        return (
          <div key={r.id} className={t.card}>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0"><CountryFlag code={r.requestedByCountry} size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className={t.title}>
                  {getCountryName(r.requestedByCountry) || r.requestedByCountry || r.requestedByName} wants{" "}
                  {proxy ? "them" : "you"} to{" "}
                  <span className={cn("font-bold", t.role)}>{verb}</span>
                </p>
                <p className={cn(t.sub, "truncate")}>“{r.docTitle}”</p>
              </div>
              <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold tabular-nums shrink-0",
                left <= 15000 ? t.timerLow : t.timer)}>
                <Clock className="w-3 h-3" /> {fmt(left)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy === r.id} onClick={() => respond(r, "accept")}
                className={cn("h-8 flex-1 rounded-md text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50", t.accept)}>
                {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Accept
              </button>
              <button type="button" disabled={busy === r.id} onClick={() => respond(r, "reject")}
                className={cn("h-8 px-3 rounded-md text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50", t.reject)}>
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
