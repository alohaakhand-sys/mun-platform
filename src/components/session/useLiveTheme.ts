"use client";

/**
 * Light/dark for the Live MUN consoles, persisted and independent of the app-wide theme.
 *
 * WHY ITS OWN PREFERENCE. Live MUN was hard-coded `dark` on its root regardless of what the rest of
 * the dashboard was set to, so it has always been independent — this just makes that independence
 * a choice the chair controls instead of a constant. Defaults to LIGHT: a committee sitting in a
 * bright room reads a light console better, and the dark option stays one tap away.
 *
 * THE VIDEO STAGE IS EXEMPT. The consoles wrap the stage in its own `.dark` element in both themes.
 * Video reads better against dark, every comparable product does the same, and the stage's chrome
 * is ~100 literal `white/black` utilities that are correct there and would have to be rewritten as
 * tokens for no gain. Nesting works because `globals.css` declares the palette on `.dark` and the
 * variant is `&:is(.dark *)`, so a `.dark` subtree re-declares its own tokens inside a light root.
 *
 * `useSyncExternalStore` rather than state + effect: localStorage is an external store, it gives a
 * correct server snapshot instead of a hydration mismatch, and it avoids the setState-in-effect the
 * lint config rejects.
 */
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type LiveTheme = "light" | "dark";

const STORAGE_KEY = "mun-live-theme";
const DEFAULT: LiveTheme = "light";

let current: LiveTheme | null = null;
const listeners = new Set<() => void>();

function read(): LiveTheme {
  if (current) return current;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    current = stored === "dark" || stored === "light" ? stored : DEFAULT;
  } catch {
    current = DEFAULT;
  }
  return current;
}

/** Server render has no localStorage — the default keeps markup stable across hydration. */
const readServer = (): LiveTheme => DEFAULT;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Keep two open consoles (e.g. the projector popup) in step.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    current = e.newValue === "dark" ? "dark" : "light";
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function setLiveTheme(next: LiveTheme) {
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode — session-only */ }
  listeners.forEach((l) => l());
}

export function useLiveTheme(): [LiveTheme, (t: LiveTheme) => void] {
  const theme = useSyncExternalStore(subscribe, read, readServer);
  return [theme, setLiveTheme];
}

/** Theme class alone. Empty in light — `:root` already carries the light palette. */
export const liveThemeClass = (t: LiveTheme) => (t === "dark" ? "dark" : "");

/**
 * Root class for a full console shell: the theme plus `live-console`, which `globals.css` uses to
 * deepen the light palette so panels have a desk to sit on (see the `.live-console:not(.dark)`
 * block there). The three shells — chair, delegate, and `ConsoleScaffold` — all go through this so
 * the class can never be attached to one and forgotten on another.
 *
 * THE PROJECTOR IS NOT ON THIS TOGGLE AT ALL. `ProjectorShell` stamps `.mun-projector`, which is
 * light-locked: a beamer loses black level, not white, so a dark board turns to mud under any
 * ambient light in a hall. Being a second window onto the same sitting doesn't make it the same
 * medium — see the `.mun-projector` block in globals.css.
 */
export const consoleShellClass = (t: LiveTheme) => cn("live-console", liveThemeClass(t));
