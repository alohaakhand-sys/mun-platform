"use client";

/**
 * Drag-to-move + collapse for a floating console card, remembered across reloads.
 *
 * WHY THIS EXISTS. The Floor Card is an OVERLAY on the video stage — it necessarily covers part of
 * the frame. Whose face it covers depends on the layout, the speaker count and the delegate's
 * screen, so no fixed spot is right for everyone. Rather than guess, the delegate moves it, and
 * collapses it to a one-line bar when they only need the headline. Both choices persist, because a
 * card that snaps back to the middle of the speaker's face on every refresh is worse than no card.
 *
 * STORAGE SHAPE. One key per card, holding `{x, y, collapsed}`. `x`/`y` are an OFFSET from wherever
 * the layout puts the card, never absolute coordinates: the console is responsive, so a remembered
 * absolute position from a wide window would land off-screen in a narrow one, while an offset just
 * shifts the card from its (re-computed) home.
 *
 * `useSyncExternalStore` for the same reason `useLiveTheme` uses it — localStorage is an external
 * store, so this gives a correct server snapshot instead of a hydration mismatch, and avoids the
 * setState-in-effect the lint config rejects. The snapshot is cached per key so the reference stays
 * stable between renders (React tears otherwise).
 *
 * THE DRAG IS CLAMPED TO THE OFFSET PARENT, not the viewport: the card lives inside the console's
 * stage row, and letting it be dragged behind the top bar or off the bottom would make it
 * unrecoverable on a touch screen. Double-click (or the reset control) puts it home regardless.
 */
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

export interface DockState {
  /** Offset from the card's laid-out position, in CSS px. */
  x: number;
  y: number;
  collapsed: boolean;
}

const HOME: DockState = { x: 0, y: 0, collapsed: false };
/** Keeps the card off the very edge of its container so the border stays visible. */
const MARGIN = 8;

const cache = new Map<string, DockState>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string): DockState {
  const hit = cache.get(key);
  if (hit) return hit;
  let value = HOME;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.x === "number" && typeof parsed.y === "number") {
      value = { x: parsed.x, y: parsed.y, collapsed: !!parsed.collapsed };
    }
  } catch {
    // Malformed or unavailable storage is not worth breaking the console over — take the default.
  }
  cache.set(key, value);
  return value;
}

function write(key: string, next: DockState) {
  cache.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Private mode: the position still applies for this session, it just will not survive a reload.
  }
  listeners.get(key)?.forEach((l) => l());
}

function subscribe(key: string, onChange: () => void) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(onChange);
  return () => {
    set.delete(onChange);
  };
}

/** Server render has no localStorage; a shared constant keeps the snapshot reference stable. */
const readServer = () => HOME;

export interface DockedCard {
  /**
   * Attach to the element that MOVES. NOT named `ref`: the React Compiler lint treats any object
   * property called `ref` as a ref container and then rejects every OTHER field of this object as
   * "accessed during render".
   */
  attach: (node: HTMLElement | null) => void;
  /** Transform for that same element. */
  style: React.CSSProperties;
  /** Spread onto the drag handle (the header strip), not the whole card. */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onDoubleClick: () => void;
    style: React.CSSProperties;
  };
  dragging: boolean;
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** True once the card has been moved — lets the UI offer "put it back". */
  moved: boolean;
  reset: () => void;
}

export function useDockedCard(key: string): DockedCard {
  const stored = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(key, cb), [key]),
    useCallback(() => read(key), [key]),
    readServer,
  );

  // Live offset while a finger/mouse is down. Committed to storage on release so a single drag is
  // one write instead of one per pointermove.
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  // Captured at pointerdown: the card's position with the stored offset removed, plus the box it is
  // allowed to travel in. Re-measured every drag because collapsing changes the card's height.
  const originRef = useRef({ px: 0, py: 0, x: 0, y: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 });

  const pos = drag ?? { x: stored.x, y: stored.y };

  const setNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  const handlers = useMemo(() => {
    const begin = (e: React.PointerEvent) => {
      // Ignore right/middle click and anything starting on a control inside the handle.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button,a,input,select,textarea")) return;
      const el = nodeRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const parent = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect();
      const bounds = parent ?? {
        left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight,
      };
      // rect already includes the stored offset, so subtract it to get the laid-out home position.
      const homeLeft = rect.left - stored.x;
      const homeTop = rect.top - stored.y;

      const minX = bounds.left + MARGIN - homeLeft;
      const maxX = bounds.right - MARGIN - rect.width - homeLeft;
      const minY = bounds.top + MARGIN - homeTop;
      const maxY = bounds.bottom - MARGIN - rect.height - homeTop;

      originRef.current = {
        px: e.clientX, py: e.clientY, x: stored.x, y: stored.y,
        // A card wider or taller than its container has no slack: collapse the range to its start
        // rather than let max < min invert the clamp.
        minX, maxX: Math.max(minX, maxX), minY, maxY: Math.max(minY, maxY),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ x: stored.x, y: stored.y });
    };

    const move = (e: React.PointerEvent) => {
      if (!drag) return;
      const o = originRef.current;
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      setDrag({
        x: clamp(o.x + e.clientX - o.px, o.minX, o.maxX),
        y: clamp(o.y + e.clientY - o.py, o.minY, o.maxY),
      });
    };

    const end = (e: React.PointerEvent) => {
      if (!drag) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      write(key, { ...drag, collapsed: stored.collapsed });
      setDrag(null);
    };

    return { begin, move, end };
  }, [drag, key, stored.x, stored.y, stored.collapsed]);

  return {
    attach: setNode,
    style: {
      transform: pos.x || pos.y ? `translate3d(${pos.x}px, ${pos.y}px, 0)` : undefined,
      // No easing while the pointer is down — a transition turns a drag into a lagging rubber band.
      transition: drag ? "none" : "transform 160ms ease-out",
    },
    handleProps: {
      onPointerDown: handlers.begin,
      onPointerMove: handlers.move,
      onPointerUp: handlers.end,
      onPointerCancel: handlers.end,
      onDoubleClick: () => write(key, { ...HOME, collapsed: stored.collapsed }),
      // `touch-action: none` ONLY on the handle: the card body must still scroll the page normally.
      style: { touchAction: "none", cursor: drag ? "grabbing" : "grab" },
    },
    dragging: !!drag,
    collapsed: stored.collapsed,
    toggleCollapsed: () => write(key, { ...stored, collapsed: !stored.collapsed }),
    moved: stored.x !== 0 || stored.y !== 0,
    reset: () => write(key, { ...HOME, collapsed: stored.collapsed }),
  };
}
