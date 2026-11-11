"use client";

/**
 * In-flight latch for one-at-a-time chair actions — lifted verbatim out of
 * `useFloorController` (ChairSessionConsole.tsx) so the Flow Bar can share the exact same
 * discipline instead of reimplementing it.
 *
 * A ref (not just state) is the gate: state updates are async, so two clicks inside one React
 * batch would both see `busy === false`. A lost race self-heals — the session doc is the
 * authority and the next snapshot corrects the UI.
 *
 * One addition over the original: the thrown message is captured into `error`. Several service
 * calls throw meaningfully — `openVote` throws "A vote is already open." — and the old code only
 * console.error'd it, so the chair saw a dead button and no reason.
 */
import { useRef, useState, useCallback } from "react";

export interface ActionLatch {
  busy: boolean;
  /** Wrap a handler so only one runs at a time. */
  guard: (fn: () => Promise<void> | void) => () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

export function useActionLatch(label = "action"): ActionLatch {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guard = useCallback((fn: () => Promise<void> | void) => async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { setError(null); await fn(); }
    catch (e: unknown) {
      console.error(label, e);
      const msg = e instanceof Error ? e.message : "";
      setError(msg || "That didn't go through.");
    }
    finally { busyRef.current = false; setBusy(false); }
  }, [label]);

  const clearError = useCallback(() => setError(null), []);

  return { busy, guard, error, clearError };
}
