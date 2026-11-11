"use client";

/**
 * One control-bar menu open at a time.
 *
 * The Meet-style bar at the bottom of the live stage opens four popovers upward into the same
 * ~58px band: Layout, More (⋮), Leave/End, and the delegate's Yield. Each owned its own
 * `useState`, so tapping a second button left the first menu mounted and the two painted on top
 * of one another. None of them closed on an outside click or on Escape either.
 *
 * WHY NOT `useExclusiveDisclosure`. That group is mounted around the whole chair stage with
 * `initialOpenId="live-marks"`, and its members are INLINE disclosures competing for vertical
 * space inside a video tile — the marking rubric and the gate bar's chair override. Joining it
 * would make opening the layout menu collapse the rubric, which is a different (and unwanted)
 * behaviour. This is a separate, bar-scoped group with the same shape.
 */
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { cn } from "@/lib/utils";

interface BarMenuGroupValue {
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

const BarMenuCtx = createContext<BarMenuGroupValue | null>(null);

/**
 * The bottom control bar's row: the Meet-style button strip, and the menu group its popovers
 * belong to. One component owns BOTH because the z-lift below has to ride on the element that
 * knows whether a menu is open.
 *
 * THE LIFT IS NOT COSMETIC. The row sits at `z-[3]`, and a positioned element with a z-index is
 * its own stacking context — so a popover inside it can never out-paint anything outside it, no
 * matter what z it asks for. Everything a tile hangs over its video outranks the row: the floor
 * pill (z-4), the marking rubric (z-5), the gate bar (z-6). Tiles themselves do not create a
 * stacking context, so those children compete at stage level and win. In tiles mode the speaking
 * delegate's rubric therefore painted straight over the ⋮ menu, which opens right beside it.
 * Lifting the whole row to `z-[7]` while a menu is open puts the menu above all of them, and drops
 * it back so the row does not permanently outrank the chrome it sits under.
 */
export function ControlBarRow({
  children, onOpenChange, className,
}: {
  children: React.ReactNode;
  /**
   * Fires when the group goes from "nothing open" to "something open" and back. The chair's Flow
   * Bar sits directly above the control bar and fades itself while one is showing. Reported from
   * the setter rather than an effect: an effect would fire a parent setState during commit and
   * cost an extra render of the whole stage on every menu tap.
   */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Mirrored in a ref so the notification can be computed OUTSIDE the state updater — an updater
  // must stay pure (React invokes it twice under StrictMode, which would double-fire the callback).
  const openIdRef = useRef<string | null>(null);
  const set = useCallback((id: string | null) => {
    const prev = openIdRef.current;
    if (prev === id) return;
    openIdRef.current = id;
    setOpenId(id);
    if ((prev === null) !== (id === null)) onOpenChange?.(id !== null);
  }, [onOpenChange]);

  return (
    <BarMenuCtx.Provider value={{ openId, setOpenId: set }}>
      <div
        className={cn(
          "absolute left-1/2 bottom-5 -translate-x-1/2 flex items-center gap-2",
          openId ? "z-[7]" : "z-[3]",
          className,
        )}
      >
        {children}
      </div>
    </BarMenuCtx.Provider>
  );
}

export type BarMenuSetter = (next: boolean | ((prev: boolean) => boolean)) => void;

/**
 * `[open, setOpen]` for one member of the bar group. Opening this one closes whichever was open,
 * in the same render.
 *
 * Falls back to plain local state when no provider is mounted, so a bar button dropped anywhere
 * else (the vice-chair's Represent panel, tests) still works standalone.
 */
export function useBarMenu(id: string): [boolean, BarMenuSetter] {
  const group = useContext(BarMenuCtx);
  const [localOpen, setLocalOpen] = useState(false);

  const open = group ? group.openId === id : localOpen;

  const setOpen = useCallback<BarMenuSetter>((next) => {
    const resolve = (prev: boolean) => (typeof next === "function" ? next(prev) : next);
    if (group) {
      group.setOpenId(resolve(group.openId === id) ? id : null);
    } else {
      setLocalOpen(resolve);
    }
  }, [group, id]);

  return [open, setOpen];
}

/**
 * The popover surface every control-bar menu opens into — shared geometry, plus dismissal.
 *
 * `text-foreground` is load-bearing, not decoration. These mount INSIDE the video stage, which is
 * `.dark` under both console themes; `bg-card` resolves to the dark surface here, but `color`
 * inherits COMPUTED from the console root, so in light theme black ink lands on a dark card and
 * the labels vanish. Stating the token on the surface makes it resolve against the palette this
 * subtree actually declares.
 */
export function BarMenuPopover({
  open, onClose, align = "center", className, children,
}: {
  open: boolean;
  onClose: () => void;
  /** `center` hangs off the button's midline; `right` right-aligns (bar-end menus). */
  align?: "center" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Outside click closes — which also gives cross-surface dismissal for free: tapping a corner
    // launcher or a modal backdrop is an outside click, so no wiring between the console root and
    // the bar is needed to keep a stale menu from surviving under a panel.
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    // CAPTURE phase + stopPropagation, deliberately. The chair and delegate ToolPanels and every
    // mounted ConsoleModal all listen for Escape on `document` in the bubble phase. Without this,
    // one Escape with a menu open would also step the side rail back. Capturing on `document`
    // runs first and stops the event before any of them see it, so Escape closes the topmost
    // thing only.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className={cn(
        "absolute bottom-[58px] rounded-xl bg-card text-foreground border border-border/70",
        "shadow-lg shadow-primary/10 dark:shadow-xl animate-in fade-in slide-in-from-bottom-1 duration-150",
        align === "right" ? "right-0" : "left-1/2 -translate-x-1/2",
        className,
      )}
    >
      {children}
    </div>
  );
}
