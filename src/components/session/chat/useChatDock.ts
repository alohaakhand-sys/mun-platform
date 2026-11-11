"use client";

/**
 * Open/closed state for the left chat dock, persisted across sessions.
 *
 * Deliberately the same store shape as `useLiveTheme`: localStorage is an external store, so
 * `useSyncExternalStore` gives a correct server snapshot instead of a hydration mismatch and avoids
 * the setState-in-effect the lint config rejects. The `storage` listener keeps two open consoles
 * (e.g. a second tab) in step.
 *
 * ONLY THE DESKTOP STATE IS PERSISTED. Below `lg` the dock is a full-width sheet that replaces the
 * video, so a remembered "open" would hide the stage on every phone load. The consoles pair this
 * with an ephemeral `useState` sheet flag — see the `wide ? dockOpen : sheetOpen` split there, same
 * reasoning as the `didAutoOpenPanel` / `wideForPanel` guard for the right tool panel.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "mun-live-chat-open";
/** Default OPEN — the dock is meant to be present, not discovered. */
const DEFAULT = true;

let current: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (current !== null) return current;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    current = stored === null ? DEFAULT : stored === "1";
  } catch {
    current = DEFAULT;
  }
  return current;
}

const readServer = (): boolean => DEFAULT;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    current = e.newValue === "1";
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function setChatDockOpen(next: boolean) {
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

export function useChatDock(): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, read, readServer);
  return [open, setChatDockOpen];
}
