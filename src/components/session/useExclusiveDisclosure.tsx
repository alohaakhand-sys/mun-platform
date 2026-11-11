"use client";

/**
 * One expanded panel at a time, across components that know nothing about each other.
 *
 * The live stage stacks several independent disclosures into a small space — the gate bar's chair
 * override, the in-tile marking rubric, the delegate's locked-actions list and yield picker. Each
 * owned its own `useState`, so opening a second left the first expanded and the two overlapped in a
 * tile that has no room for both.
 *
 * Group membership is by STRING ID rather than by instance, deliberately: `LiveMarkStrip` remounts
 * whenever the speaker changes (it is keyed by delegate id), and keying the group by id means the
 * chair's "I want the rubric open" preference survives that remount instead of snapping shut on
 * every new speaker.
 *
 * Falls back to plain local state when no provider is mounted, so every component using this still
 * works standalone (the projector, tests, any surface that never wraps a group).
 */
import { createContext, useCallback, useContext, useState } from "react";

interface DisclosureGroupValue {
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

const DisclosureCtx = createContext<DisclosureGroupValue | null>(null);

export function DisclosureGroup({
  children, initialOpenId = null,
}: {
  children: React.ReactNode;
  /** Which member starts expanded. Null = all collapsed. */
  initialOpenId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  return (
    <DisclosureCtx.Provider value={{ openId, setOpenId }}>
      {children}
    </DisclosureCtx.Provider>
  );
}

export type DisclosureSetter = (next: boolean | ((prev: boolean) => boolean)) => void;

/**
 * `[open, setOpen]` for one member of the group. Opening this one closes whichever was open.
 *
 * @param id      stable within the group — see the note above on remounting
 * @param fallbackOpen  used only when there is NO provider; inside a group the provider's
 *                      `initialOpenId` decides, because two members cannot both claim to start open
 */
export function useExclusiveDisclosure(
  id: string,
  fallbackOpen = false,
): [boolean, DisclosureSetter] {
  const group = useContext(DisclosureCtx);
  const [localOpen, setLocalOpen] = useState(fallbackOpen);

  const groupOpen = group ? group.openId === id : false;
  const open = group ? groupOpen : localOpen;

  const setOpen = useCallback<DisclosureSetter>((next) => {
    const resolve = (prev: boolean) => (typeof next === "function" ? next(prev) : next);
    if (group) {
      group.setOpenId(resolve(group.openId === id) ? id : null);
    } else {
      setLocalOpen(resolve);
    }
  }, [group, id]);

  return [open, setOpen];
}
