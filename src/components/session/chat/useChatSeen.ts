"use client";

/**
 * Per-thread "last message I looked at" stamps, for the chat unread badges.
 *
 * WHY LOCALSTORAGE AND NOT THE SERVER. Unread is computed by `foldThreads` over messages the
 * listener has ALREADY delivered, so this mechanism costs zero extra Firestore reads and, crucially,
 * zero writes. The two server-side alternatives both cost real money on the Spark tier:
 *  - an `unreadCount` map like `messageService.markConversationRead` — a getDoc + updateDoc (and a
 *    batch over the tail) every time a thread is opened;
 *  - anything stamped on the session doc — ONE write there bills a read to every one of the ~40
 *    connected clients, so a chair skimming ten threads would cost 400 reads.
 * This is the same trade the room notifications already make (`room_notifs_read_{uid}`).
 *
 * ACCEPTED TRADE-OFF: it is per-device. A chair on a laptop and a tablet keeps two counts, and
 * clearing the browser's storage marks everything unread again. Nothing is lost but a badge.
 *
 * `useSyncExternalStore` over a module-level cache, same as `useLiveTheme`: localStorage IS an
 * external store, so this gives a correct server snapshot (empty — no badges in SSR markup) instead
 * of a hydration mismatch on the counts, and it keeps two open consoles in step. Keyed per session,
 * so yesterday's committee-day cannot clear today's badges.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";

type SeenMap = Record<string, number>;

const EMPTY: SeenMap = {};

/** Cached per storage key, so the snapshot is referentially stable between writes. */
const cache = new Map<string, SeenMap>();
const listeners = new Map<string, Set<() => void>>();

const storageKey = (eventId: string, sessionId: string) =>
  `mun-live-chat-seen:${eventId}:${sessionId}`;

function parse(raw: string | null): SeenMap {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SeenMap) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function read(key: string): SeenMap {
  const hit = cache.get(key);
  if (hit) return hit;
  let value: SeenMap = EMPTY;
  try { value = parse(localStorage.getItem(key)); } catch { /* private mode */ }
  cache.set(key, value);
  return value;
}

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function write(key: string, next: SeenMap) {
  cache.set(key, next);
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
  emit(key);
}

function subscribeTo(key: string, onChange: () => void) {
  let set = listeners.get(key);
  if (!set) { set = new Set(); listeners.set(key, set); }
  set.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key) return;
    cache.set(key, parse(e.newValue));
    emit(key);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    set!.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChatSeen(eventId: string, sessionId: string) {
  const key = storageKey(eventId, sessionId);

  const subscribe = useCallback((onChange: () => void) => subscribeTo(key, onChange), [key]);
  const snapshot = useCallback(() => read(key), [key]);
  const seen = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

  /**
   * Mark a thread read up to `lastAt`. Monotonic — a stale call (an out-of-order scroll callback, a
   * re-render replaying an older tail) can never re-raise the badge.
   */
  const markSeen = useCallback((threadKey: string, lastAt: number) => {
    if (!threadKey || !lastAt) return;
    const cur = read(key);
    if ((cur[threadKey] ?? 0) >= lastAt) return;
    write(key, { ...cur, [threadKey]: lastAt });
  }, [key]);

  return useMemo(() => ({ seen, markSeen }), [seen, markSeen]);
}
