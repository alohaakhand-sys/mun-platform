"use client";

/**
 * The committee's procedural record for one day — motions, points, votes and yields,
 * merged into a single chronological timeline you can open item by item.
 *
 * WHY IT EXISTS: the console's `MotionsLog` is a live scratchpad for the sitting in
 * progress. Once a session is gavelled out, everything it recorded became unreachable —
 * a chair asking "what did we pass on day 2, who moved it, what was the tally" had
 * nowhere in the product to look. This is the archive: pick a date, read the day.
 *
 * Read-only by design. The record of what the committee did is not something to edit
 * after the fact; corrections happen live, in the console, while the floor is open.
 *
 * DEDUP RULE (the one subtlety): `motions` (the append-only history) mirrors things that
 * also exist as richer documents. An entry written by `executeMotion` / `resolveMotionAfterVote`
 * / `dismissMotion` carries `outcome: "passed" | "failed"`, and one written by `resolvePoint`
 * carries `"ruled"` — those all have a Motion or RaisedPoint doc with the full detail, so the
 * history copy is skipped. What is kept from the history is what exists NOWHERE else:
 * `kind: "yield"`, and `outcome: "raised"` (the chair's own hand-logged minutes).
 */

import { useEffect, useMemo, useState } from "react";
import type { ApplicationData } from "@/lib/services/applicationService";
import {
  getDailyMotionLog, MOTION_META, POINT_META,
  type DailyMotionLog as DailyLog, type Motion, type MotionLogEntry,
  type FinishedVote, type RaisedPoint, type Ballot,
} from "@/lib/services/sessionService";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import {
  Gavel, Hand, Vote as VoteIcon, CornerDownRight, ChevronLeft, ChevronRight, ChevronDown,
  Loader2, ScrollText, UserCheck,
} from "lucide-react";

// ── Timestamps ────────────────────────────────────────────────────────────────
/** Firestore Timestamp → epoch ms. Returns 0 for a write whose serverTimestamp hasn't landed. */
function ts(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (typeof v === "number") return v;
  return 0;
}

function clockOf(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Item model ────────────────────────────────────────────────────────────────
type ItemKind = "motion" | "point" | "vote" | "yield";

interface LogItem {
  key: string;
  kind: ItemKind;
  at: number;
  title: string;
  byDelegateId: string;
  byCountry: string;
  /** Short badge — the outcome as the committee would state it. */
  outcome?: string;
  outcomeTone?: "pass" | "fail" | "neutral" | "open";
  motion?: Motion;
  point?: RaisedPoint;
  vote?: FinishedVote;
  entry?: MotionLogEntry;
}

/** Human summary of a motion's parameters — the numbers that make it a real motion. */
function motionParamsText(m: Motion): string {
  const p = m.params || {};
  const bits: string[] = [];
  if (p.topic) bits.push(`“${p.topic}”`);
  if (p.totalDurationSecs) bits.push(`${Math.round(p.totalDurationSecs / 60)} min total`);
  if (p.perSpeakerSecs) bits.push(`${p.perSpeakerSecs}s per speaker`);
  if (p.targetPhase) bits.push(`→ ${p.targetPhase}`);
  if (p.documentId) bits.push("document introduced");
  return bits.join(" · ");
}

const MOTION_STATUS_TONE: Record<string, LogItem["outcomeTone"]> = {
  executed: "pass", passed: "pass",
  failed: "fail", dropped: "fail", dismissed: "fail",
  pending: "open", recognized: "open", voting: "open",
};

function buildItems(log: DailyLog): LogItem[] {
  const items: LogItem[] = [];

  for (const m of log.motions) {
    const meta = MOTION_META[m.type];
    const outcome = m.autoResolved ? "out of order"
      : m.status === "executed" ? "carried"
      : m.status === "dropped" ? "dismissed"
      : m.status;
    items.push({
      key: `m_${m.id}`,
      kind: "motion",
      at: ts(m.createdAt),
      title: meta?.label || m.type,
      byDelegateId: m.byDelegateId,
      byCountry: m.byCountry || "",
      outcome,
      outcomeTone: m.autoResolved ? "fail" : MOTION_STATUS_TONE[m.status] || "neutral",
      motion: m,
    });
  }

  for (const p of log.points) {
    items.push({
      key: `p_${p.id}`,
      kind: "point",
      at: ts(p.createdAt),
      title: POINT_META[p.type]?.label || p.type,
      byDelegateId: p.delegateId,
      byCountry: p.country || "",
      outcome: p.status === "recognized" ? "recognized" : p.status === "dismissed" ? "dismissed" : "pending",
      outcomeTone: p.status === "recognized" ? "pass" : p.status === "dismissed" ? "fail" : "open",
      point: p,
    });
  }

  for (const v of log.votes) {
    items.push({
      key: `v_${v.voteId}`,
      kind: "vote",
      at: ts(v.closedAt) || ts(v.startedAt),
      title: v.motion || "Procedural vote",
      byDelegateId: "",
      byCountry: "",
      outcome: v.result,
      outcomeTone: v.result === "passed" ? "pass" : v.result === "tied" ? "neutral" : "fail",
      vote: v,
    });
  }

  // Only what the richer documents do not already carry — see the dedup note above.
  for (const e of log.entries) {
    if (e.kind !== "yield" && e.outcome !== "raised") continue;
    items.push({
      key: `e_${e.id}`,
      kind: e.kind === "yield" ? "yield" : e.kind === "point" ? "point" : "motion",
      at: ts(e.at),
      title: e.label,
      byDelegateId: e.byDelegateId || "",
      byCountry: e.byCountry || "",
      outcome: e.kind === "yield" ? "yielded" : "logged by chair",
      outcomeTone: "neutral",
      entry: e,
    });
  }

  // Chronological — this is the minutes, and minutes read forwards.
  return items.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

// ── Presentation ──────────────────────────────────────────────────────────────
const KIND_META: Record<ItemKind, { icon: React.ElementType; label: string; tone: string }> = {
  motion: { icon: Gavel, label: "Motion", tone: "bg-primary/15 text-primary" },
  point: { icon: Hand, label: "Point", tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  vote: { icon: VoteIcon, label: "Vote", tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  yield: { icon: CornerDownRight, label: "Yield", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
};

const OUTCOME_TONE: Record<NonNullable<LogItem["outcomeTone"]>, string> = {
  pass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  fail: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  open: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  neutral: "bg-secondary/40 text-muted-foreground border-border/50",
};

const BALLOT_TONE: Record<Ballot, string> = {
  yes: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  no: "bg-red-500/15 text-red-600 dark:text-red-400",
  abstain: "bg-secondary/50 text-muted-foreground",
};

export function DailyMotionLog({
  eventId, committeeId, dateStr, onDateChange, delegates = [],
}: {
  eventId: string;
  committeeId: string;
  dateStr: string;
  onDateChange: (d: string) => void;
  /** Used only to put a name to a uid on roll-call ballots. */
  delegates?: ApplicationData[];
}) {
  const [log, setLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ItemKind>("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId || !committeeId || !dateStr) return;
    let alive = true;
    setLoading(true);
    getDailyMotionLog(eventId, committeeId, dateStr)
      .then((l) => { if (alive) setLog(l); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [eventId, committeeId, dateStr]);

  const items = useMemo(() => (log ? buildItems(log) : []), [log]);
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

  const counts = useMemo(() => ({
    all: items.length,
    motion: items.filter((i) => i.kind === "motion").length,
    point: items.filter((i) => i.kind === "point").length,
    vote: items.filter((i) => i.kind === "vote").length,
    yield: items.filter((i) => i.kind === "yield").length,
  }), [items]);

  const carried = items.filter((i) => i.kind === "motion" && i.outcomeTone === "pass").length;

  const nameFor = (uid: string) => delegates.find((d) => d.userId === uid)?.applicantName || "";
  const countryFor = (uid: string) =>
    delegates.find((d) => d.userId === uid)?.assignedCountry || "";

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="bg-secondary/10 border-b border-border/50">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" /> Motion Log
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              The committee&apos;s procedural record for {dateStr} — motions, points, votes and yields,
              in the order they happened. Read-only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon-sm" title="Previous day"
              onClick={() => onDateChange(shiftDay(dateStr, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Input type="date" value={dateStr} onChange={(e) => onDateChange(e.target.value)} className="w-auto h-9" />
            <Button variant="outline" size="icon-sm" title="Next day"
              onClick={() => onDateChange(shiftDay(dateStr, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Filters double as the day's totals */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {([
            ["all", "All"], ["motion", "Motions"], ["point", "Points"], ["vote", "Votes"], ["yield", "Yields"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                filter === k
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-background border-border/60 text-muted-foreground hover:bg-secondary/30",
              )}
            >
              {label} <span className="tabular-nums opacity-70">{counts[k]}</span>
            </button>
          ))}
          {carried > 0 && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{carried}</span> carried
            </span>
          )}
        </div>
      </CardHeader>

      {loading ? (
        <div className="p-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium text-foreground">
            {items.length === 0 ? "Nothing recorded on this day" : "Nothing of that kind on this day"}
          </p>
          <p className="text-sm mt-1">
            {items.length === 0
              ? "No session ran, or the floor never moved. Pick another date."
              : "Switch the filter to see the rest of the day."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {shown.map((item) => {
            const meta = KIND_META[item.kind];
            const isOpen = open === item.key;
            return (
              <div key={item.key} className={cn("transition-colors", isOpen && "bg-secondary/10")}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : item.key)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/5"
                >
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground w-10 shrink-0 pt-1">
                    {clockOf(item.at)}
                  </span>
                  <span className={cn("shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center", meta.tone)}>
                    <meta.icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">{item.title}</span>
                    <span className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.byCountry && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <CountryFlag code={item.byCountry} size={13} />
                          {getCountryName(item.byCountry) || item.byCountry}
                        </span>
                      )}
                      {item.motion?.proxyByName && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          by proxy · {item.motion.proxyByName}
                        </span>
                      )}
                      {item.point?.proxyByName && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          by proxy · {item.point.proxyByName}
                        </span>
                      )}
                      {item.vote && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {item.vote.affirmative}–{item.vote.negative}–{item.vote.abstentions}
                          {item.vote.mode === "roll_call" ? " · roll call" : " · show of hands"}
                        </span>
                      )}
                    </span>
                  </span>
                  {item.outcome && (
                    <span className={cn(
                      "shrink-0 px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide mt-0.5",
                      OUTCOME_TONE[item.outcomeTone || "neutral"],
                    )}>
                      {item.outcome}
                    </span>
                  )}
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pl-[4.6rem] space-y-2.5 text-sm">
                    {item.motion && <MotionDetail m={item.motion} />}
                    {item.point && <PointDetail p={item.point} />}
                    {item.vote && <VoteDetail v={item.vote} nameFor={nameFor} countryFor={countryFor} />}
                    {item.entry && (
                      <Field label={item.entry.kind === "yield" ? "Yielded to" : "Note"}>
                        {item.entry.targetCountry
                          ? getCountryName(item.entry.targetCountry) || item.entry.targetCountry
                          : item.entry.label}
                      </Field>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Detail blocks ─────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function MotionDetail({ m }: { m: Motion }) {
  const params = motionParamsText(m);
  return (
    <>
      {params && <Field label="Parameters">{params}</Field>}
      {m.note && <Field label="Mover&apos;s note">{m.note}</Field>}
      {m.chairNote && (
        // No "Chair:" attribution on an auto-resolved motion — nobody ruled it, and
        // misattributing it has delegates arguing a ruling the chair never made.
        <Field label={m.autoResolved ? "Ruled out of order" : "Chair's note"}>{m.chairNote}</Field>
      )}
      {m.secondedBy && <Field label="Seconded by">{m.secondedBy}</Field>}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        <span>status <b className="text-foreground">{m.status}</b></span>
        {MOTION_META[m.type]?.needsVote && <span>takes a vote</span>}
        {m.voteId && <span>vote linked</span>}
      </div>
    </>
  );
}

function PointDetail({ p }: { p: RaisedPoint }) {
  return (
    <>
      {p.note && <Field label="Delegate's point">{p.note}</Field>}
      {p.targetCountry && (
        <Field label="Directed at">{getCountryName(p.targetCountry) || p.targetCountry}</Field>
      )}
      {p.chairNote && <Field label="Chair's ruling">{p.chairNote}</Field>}
      {POINT_META[p.type]?.canInterrupt && (
        <p className="text-[11px] text-muted-foreground">This point may interrupt a speaker.</p>
      )}
    </>
  );
}

function VoteDetail({
  v, nameFor, countryFor,
}: {
  v: FinishedVote;
  nameFor: (uid: string) => string;
  countryFor: (uid: string) => string;
}) {
  const total = v.affirmative + v.negative + v.abstentions;
  const ballots = Object.entries(v.ballots || {}) as Array<[string, Ballot]>;
  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        <span>threshold <b className="text-foreground">{v.threshold.replace(/_/g, " ")}</b></span>
        <span>eligible <b className="text-foreground tabular-nums">{v.eligibleCount}</b></span>
        <span>cast <b className="text-foreground tabular-nums">{total}</b></span>
        {v.round === 2 && <span>second round</span>}
        {v.scMode && <span>Security Council</span>}
        {v.divisionOfQuestion && <span>division of the question</span>}
      </div>

      {/* Tally bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-secondary/40">
        {total > 0 && (
          <>
            <div className="bg-emerald-500" style={{ width: `${(v.affirmative / total) * 100}%` }} />
            <div className="bg-red-500" style={{ width: `${(v.negative / total) * 100}%` }} />
            <div className="bg-muted-foreground/40" style={{ width: `${(v.abstentions / total) * 100}%` }} />
          </>
        )}
      </div>
      <div className="flex gap-4 text-[11px] tabular-nums">
        <span className="text-emerald-600 dark:text-emerald-400">For {v.affirmative}</span>
        <span className="text-red-600 dark:text-red-400">Against {v.negative}</span>
        <span className="text-muted-foreground">Abstain {v.abstentions}</span>
      </div>

      {v.vetoedBy && v.vetoedBy.length > 0 && (
        <Field label="Vetoed by">
          {v.vetoedBy.map((uid) => getCountryName(countryFor(uid)) || nameFor(uid) || uid).join(", ")}
        </Field>
      )}

      {/* A roll-call vote is on the record by name — that is the point of calling one. */}
      {ballots.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Roll call ({ballots.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ballots.map(([uid, b]) => {
              const proxy = v.ballotProxies?.[uid];
              const country = countryFor(uid);
              return (
                <span key={uid}
                  title={proxy ? `cast by proxy — ${proxy.byName}` : nameFor(uid)}
                  className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold", BALLOT_TONE[b])}>
                  {country && <CountryFlag code={country} size={12} />}
                  {getCountryName(country) || nameFor(uid) || uid.slice(0, 6)}
                  <span className="opacity-70">{b}</span>
                  {proxy && <UserCheck className="w-2.5 h-2.5 opacity-70" />}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {v.ballotChanges && v.ballotChanges.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {v.ballotChanges.length} ballot{v.ballotChanges.length === 1 ? " was" : "s were"} reopened by the chair.
        </p>
      )}
    </>
  );
}

/** Shift a YYYY-MM-DD string by whole days. */
function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + delta);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
