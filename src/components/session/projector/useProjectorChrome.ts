"use client";

/**
 * Operator affordances for a display nobody is sitting at.
 *
 * The projector is opened once, dragged to a second screen, and then ignored for three hours. That
 * changes what "chrome" means: every control here exists to be used in the first ten seconds and
 * then get out of the room's way.
 *
 *   AUTO-HIDE   the exit link, the scale buttons and the mouse cursor disappear after 3s of
 *               stillness and come back on any pointer move or key. A visible "Exit" button
 *               projected onto a wall for a whole committee session is operator UI in the
 *               audience's face.
 *   FULLSCREEN  the popup opens at 1440x900; without this the operator has to know F11.
 *   WAKE LOCK   a sitting runs longer than any OS sleep timer, and the one thing a projector
 *               must never do is go black mid-vote. Re-acquired on `visibilitychange` because
 *               the lock is dropped whenever the document is hidden.
 *   SCALE       rooms differ. Three steps, persisted, on +/- — cheaper than guessing a throw
 *               distance from the viewport.
 *
 * The scale is a `useSyncExternalStore` over localStorage, same pattern and same reason as
 * `useLiveTheme`: it is an external store, so this gives a correct server snapshot instead of a
 * hydration mismatch, and avoids the setState-in-effect the lint config rejects.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const SCALE_KEY = "mun-projector-scale";
const SCALES = [0.85, 1, 1.15] as const;
const DEFAULT_SCALE = 1;
const IDLE_MS = 3000;

/** Wake Lock is not in every TS DOM lib yet; this is the whole surface we use. */
interface WakeLockSentinelish { released: boolean; release: () => Promise<void> }
interface WakeLockish { request: (type: "screen") => Promise<WakeLockSentinelish> }

// ── Scale store ────────────────────────────────────────────────────────────────────────
let currentScale: number | null = null;
const scaleListeners = new Set<() => void>();

function readScale(): number {
  if (currentScale !== null) return currentScale;
  try {
    const n = Number(localStorage.getItem(SCALE_KEY));
    currentScale = (SCALES as readonly number[]).includes(n) ? n : DEFAULT_SCALE;
  } catch {
    currentScale = DEFAULT_SCALE;
  }
  return currentScale;
}

const readScaleServer = () => DEFAULT_SCALE;

function subscribeScale(onChange: () => void) {
  scaleListeners.add(onChange);
  return () => { scaleListeners.delete(onChange); };
}

function writeScale(next: number) {
  currentScale = next;
  try { localStorage.setItem(SCALE_KEY, String(next)); } catch { /* private mode — session-only */ }
  scaleListeners.forEach((l) => l());
}

export function useProjectorChrome() {
  const [chromeVisible, setChromeVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const scale = useSyncExternalStore(subscribeScale, readScale, readScaleServer);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stepScale = useCallback((dir: 1 | -1) => {
    const i = (SCALES as readonly number[]).indexOf(readScale());
    writeScale(SCALES[Math.min(SCALES.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))]);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => { /* denied — F11 still works */ });
  }, []);

  // ── Idle → hide chrome ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const arm = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setChromeVisible(false), IDLE_MS);
    };
    const wake = () => { setChromeVisible(true); arm(); };
    arm();
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); stepScale(1); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); stepScale(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, stepScale]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── Wake lock ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockish }).wakeLock;
    if (!api) return;
    let sentinel: WakeLockSentinelish | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const s = await api.request("screen");
        if (cancelled) { void s.release(); return; }
        sentinel = s;
      } catch { /* unsupported, denied, or battery saver — the operator can disable sleep */ }
    };
    // The lock is released whenever the tab is hidden; take it back when it returns.
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, []);

  return { chromeVisible, fullscreen, toggleFullscreen, scale, stepScale };
}
