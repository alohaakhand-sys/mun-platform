/**
 * The "how long have we been sitting" clock — PURE, no Firebase import.
 *
 * Sibling of `motionFloor.ts` / `motionMeta.ts` for the same reason: `sessionService.ts`
 * initializes Firebase at module scope, so anything a node-env unit test needs to read has to
 * live outside it. Only `import type` crosses back, and TS erases that.
 *
 * Design notes worth keeping:
 *
 *  1. NO MIGRATION. `session.clock` is absent on every session created before this shipped, so
 *     `readSessionClock` synthesizes one from `createdAt`. Same normalizer-for-absent-field
 *     pattern as `getAgenda`. An old session therefore shows a correct-enough clock immediately
 *     (it counts the whole sitting including breaks, which is what it did before too).
 *
 *  2. ELAPSED IS DERIVED, NEVER STORED. The doc keeps three numbers that only change on a
 *     suspend/resume gavel; the running total is computed at read time. Nothing writes per tick.
 *
 *  3. KNOWN DRIFT, documented not defended. Other writers (`endCaucus`, `nextSpeaker`) force-set
 *     `phase:"gsl"` without touching the clock. If one fires while suspended, `suspendedAt` is
 *     left standing but the phase is no longer "suspended", so we resume counting from `now` and
 *     that break's length is lost from `accumulatedMs`. Self-correcting on the next proper
 *     resume; not worth wrapping every `setPhase` caller to prevent.
 */
import type { LiveSession, SessionClock } from "./sessionService";

/** Documents the exact read-set, so fixtures stay small. */
export type SessionClockInput = Pick<LiveSession,
  "phase" | "finalized" | "clock" | "createdAt" | "finalizedAt">;

export interface SessionClockState {
  /** Milliseconds of ACTUAL sitting time — suspensions excluded. */
  elapsedMs: number;
  running: boolean;
  /** Suspended: the clock is held, and will resume from where it stopped. */
  paused: boolean;
  /** Finalized: the total is final and will never move again. */
  frozen: boolean;
}

/** epoch ms out of a Firestore Timestamp | Date | number, or null if unreadable. */
function toMillis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const o = v as { toMillis?: () => number; seconds?: number };
  if (typeof o.toMillis === "function") return o.toMillis();
  if (typeof o.seconds === "number") return o.seconds * 1000;
  return null;
}

/**
 * Normalize `session.clock`, tolerating the pre-clock shape. NEVER read `session.clock`
 * directly — a missing field must read identically to a zeroed one.
 */
export function readSessionClock(s: SessionClockInput, now = Date.now()): SessionClock {
  const c = s?.clock;
  if (c && typeof c.startedAt === "number" && c.startedAt > 0) {
    return {
      startedAt: c.startedAt,
      accumulatedMs: Math.max(0, c.accumulatedMs || 0),
      suspendedAt: typeof c.suspendedAt === "number" ? c.suspendedAt : null,
    };
  }
  // Fallback: the doc's own creation. `createdAt` is a serverTimestamp, so it reads back as null
  // for the one frame between the local write and the server echo — `now` keeps that at 0:00:00
  // instead of 1970.
  return { startedAt: toMillis(s?.createdAt) ?? now, accumulatedMs: 0, suspendedAt: null };
}

/**
 * The clock as the top bar shows it. `now` is injectable so tests need no fake timers.
 *
 * Precedence of the stop point mirrors what the room sees:
 *   finalized → frozen at `finalizedAt` (the gavel that ended it, not when you opened the page)
 *   suspended → held at `suspendedAt`
 *   otherwise → running to `now`
 */
export function sessionClockState(s: SessionClockInput, now = Date.now()): SessionClockState {
  const clock = readSessionClock(s, now);
  const frozen = !!s?.finalized;
  const paused = !frozen && s?.phase === "suspended";

  let stopAt = now;
  if (frozen) stopAt = toMillis(s?.finalizedAt) ?? clock.suspendedAt ?? now;
  else if (paused) stopAt = clock.suspendedAt ?? now;   // see drift note 3

  const elapsedMs = Math.max(0, stopAt - clock.startedAt - clock.accumulatedMs);
  return { elapsedMs, running: !frozen && !paused, paused, frozen };
}

/** `h:mm:ss` past an hour, `m:ss` under it. Pair with `tabular-nums` so it doesn't jitter. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
