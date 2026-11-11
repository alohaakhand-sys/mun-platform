"use client";

/**
 * What the delegate holding the floor is being asked to answer.
 *
 * THE GAP THIS FILLS. A point had a one-way life: a delegate raised it, the chair saw it in their
 * queue, the chair ruled, and the RAISER saw a status chip. The one person the ruling is actually
 * addressed to — the delegate mid-speech — was never told anything. Recognizing a Point of Order
 * against a speaker who cannot see it is a ruling delivered to nobody.
 *
 * ONLY THE FLOOR HOLDER SUBSCRIBES. The listener mounts when `holdsTheFloor` is true for this
 * delegate and unmounts the moment the floor moves on, so a 30-delegate committee runs at most one
 * of these at a time instead of thirty for the whole sitting. That matters on the Spark tier's
 * 50k reads/day — see the note on `subscribeRecognizedPoints`.
 *
 * TIME-BOXED, LIKE EVERY OTHER CONSENT CARD HERE. `recognized` is a terminal status, so without a
 * window every point the chair ever recognized would pile up on the next speaker's screen. Two
 * bounds, and both are needed: a card lives `SHOW_WINDOW_MS` from `resolvedAt` (the 90s the
 * doc-endorsement handshake uses), AND it must have been recognized during THIS delegate's speech
 * — a ruling made against the previous speaker is not addressed to whoever holds the floor next.
 * Plus a manual dismiss for a delegate who has answered it. Same ticker discipline as the
 * endorsement inbox: one interval, only while a card is actually up.
 *
 * Mounted OUTSIDE the console's `.dark` video stage (see DelegateSessionConsole) and styled from
 * semantic tokens alone, so it reads in both live themes.
 */
import { useEffect, useMemo, useState } from "react";
import {
  subscribeRecognizedPoints, POINT_META,
  type RaisedPoint, type LiveSession,
} from "@/lib/services/sessionService";
import { holdsTheFloor } from "@/lib/services/floorGate";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { TYPE_ICON, TYPE_TONE } from "./PointsQueuePanel";
import { Clock, X } from "lucide-react";

/** How long a recognized point stays on the speaker's screen. Mirrors ENDORSEMENT_WINDOW_SECS. */
const SHOW_WINDOW_MS = 90_000;

const T = {
  wrap: "space-y-2",
  head: "text-xs font-semibold uppercase tracking-wide text-muted-foreground/80",
  card: "rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-3 space-y-1.5",
  title: "text-sm font-semibold text-foreground",
  sub: "text-xs text-muted-foreground",
  timer: "text-amber-600 dark:text-amber-400",
} as const;

const CHIP: Record<string, string> = {
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  primary: "bg-primary/15 text-primary",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  muted: "bg-secondary text-muted-foreground",
};

/** Firestore Timestamp → epoch ms. `serverTimestamp()` is null on the write-through snapshot. */
function resolvedMs(p: RaisedPoint): number | null {
  const s = p.resolvedAt?.seconds;
  return typeof s === "number" ? s * 1000 : null;
}

/**
 * Clock-skew grace on the "recognized during MY speech" cut-off — `floorSince` is this client's
 * `Date.now()` while `resolvedAt` is a server timestamp. Erring toward SHOWING a point: a card the
 * delegate did not need is noise, a ruling they never saw is the bug this component exists to fix.
 */
const EPOCH_GRACE_MS = 5_000;

/**
 * A GATE, NOT A BRANCH INSIDE THE BODY. Everything below — the listener, the "since" epoch, the
 * dismissals — belongs to ONE speech, so it lives in a child that mounts when this delegate takes
 * the floor and unmounts when they lose it. React resets all of it on unmount, which is both how
 * the previous speech's points cannot flash on the next speaker's screen and why none of this
 * needs a clear-on-change effect.
 */
export function RecognizedPointCard(props: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  /** The viewer's uid. The card only ever renders for whoever holds the floor. */
  delegateId: string;
  className?: string;
}) {
  if (!holdsTheFloor(props.session, props.delegateId)) return null;
  return <WhileIHoldTheFloor {...props} />;
}

function WhileIHoldTheFloor({
  eventId, sessionId, delegateId, className,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  delegateId: string;
  className?: string;
}) {
  const [points, setPoints] = useState<RaisedPoint[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  // WHEN THIS SPEECH STARTED, captured on mount. Without it, taking the floor would inherit every
  // point the chair recognized against the PREVIOUS speaker inside the 90s window — rulings
  // addressed to somebody else.
  const [floorSince] = useState(() => Date.now());

  useEffect(
    () => subscribeRecognizedPoints(eventId, sessionId, setPoints),
    [eventId, sessionId],
  );

  const live = useMemo(() => points.filter((p) => {
    if (!p.id || dismissed.includes(p.id)) return false;
    // My own point, recognized, is not something I answer — the raiser already has their status
    // chip in "Your points". (Only reachable via a vice-chair proxy raise or a stale point that
    // survived the floor changing hands.)
    if (p.delegateId === delegateId) return false;
    const at = resolvedMs(p);
    // A point with no server timestamp yet has only just landed — show it rather than swallow it.
    if (at == null) return true;
    if (at < floorSince - EPOCH_GRACE_MS) return false;
    return now - at < SHOW_WINDOW_MS;
  }), [points, dismissed, delegateId, floorSince, now]);

  // 1s ticker only while a card is up, so the window can expire without waiting for a snapshot.
  useEffect(() => {
    if (live.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live.length]);

  if (live.length === 0) return null;

  return (
    <div className={cn(T.wrap, className)}>
      <p className={T.head}>{live.length === 1 ? "The chair has recognized a point" : "Points recognized"}</p>
      {live.map((p) => {
        const meta = POINT_META[p.type];
        const Icon = TYPE_ICON[p.type];
        const at = resolvedMs(p);
        const left = at == null ? SHOW_WINDOW_MS : SHOW_WINDOW_MS - (now - at);
        return (
          <div key={p.id} className={T.card}>
            <div className="flex items-start gap-2.5">
              <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", CHIP[TYPE_TONE[p.type]] || CHIP.muted)}>
                <Icon className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={T.title}>
                  <span className="font-bold">{meta.label}</span>
                  {" — "}
                  {getCountryName(p.country) || p.country || "a delegate"}
                </p>
                <p className={cn(T.sub, "inline-flex items-center gap-1")}>
                  <CountryFlag code={p.country} size={13} />
                  {p.targetCountry ? "Directed at you" : "Raised to the chamber"}
                </p>
              </div>
              <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold tabular-nums shrink-0", T.timer)}>
                <Clock className="w-3 h-3" /> {Math.max(0, Math.ceil(left / 1000))}s
              </span>
              <button type="button" title="Dismiss" aria-label="Dismiss"
                onClick={() => p.id && setDismissed((d) => [...d, p.id as string])}
                className="shrink-0 w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex items-center justify-center transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* The delegate's own words — the substance of what you are being asked to address. */}
            {p.note && (
              <p className="text-[12.5px] leading-snug text-foreground/85 italic pl-[42px]">
                &ldquo;{p.note}&rdquo;
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
