"use client";

/**
 * Live-session presence via RTDB — powers the small "X joined / left" notifications
 * that every participant sees in the live console (chair + delegates alike).
 *
 * Each open console writes its own node at /sessionPresence/{eventId}/{sessionKey}/{uid} with
 * onDisconnect().remove(), so a crashed tab still reads as a leave. Identity
 * (name/country/role) is stored IN the node so leave events need no lookup after
 * the node is gone. The first snapshot is swallowed — members already present when
 * a viewer opens the console are not "joins".
 *
 * NOTE: writes require the `sessionPresence` block in database.rules.json —
 * deploy with `npm run deploy:dbrules` or writes fail silently (browser console only).
 */
import { useEffect, useRef, useState } from "react";
import {
  ref, onValue, onDisconnect, set, remove,
  serverTimestamp as rtdbServerTimestamp,
} from "firebase/database";
import { rtdb } from "@/lib/firebase/client";

export interface PresenceEvent {
  /** Unique per event (uid + monotonic counter) — safe as a React key. */
  id: string;
  kind: "join" | "leave";
  uid: string;
  name: string;
  country?: string;
  role?: string;
}

interface PresenceNode { name: string; country?: string; role?: string }

/** A node as read back out of the room — `PresenceNode` plus who it belongs to. */
export interface PresenceMember extends PresenceNode {
  uid: string;
  joinedAt?: number;
}

/** RTDB keys must not contain . # $ [ ] / — collapse them so any eventId/sessionId is safe. */
function sanitizeKey(raw: string): string {
  return raw.replace(/[.#$\[\]\/]/g, "-");
}

/**
 * /sessionPresence/{eventId}/{sessionKey}. The event is its own path level so the RTDB rules can
 * check `/eventMembers/{eventId}/{uid}` (the server-written membership mirror) — a combined
 * `eventId_sessionId` key gave them no way to recover the event. Shared with the Kotlin app.
 */
function presenceRoomPath(eventId: string, sessionId: string): string {
  return `/sessionPresence/${sanitizeKey(eventId)}/${sanitizeKey(sessionId)}`;
}

const EVENT_TTL_MS = 4000;
const MAX_VISIBLE = 4;

export function useSessionPresence({
  eventId, sessionId, uid, name, country, role, enabled, publishSelf = true,
}: {
  eventId: string;
  sessionId: string;
  uid: string;
  name: string;
  country?: string;
  role?: string;
  enabled: boolean;
  /**
   * GHOST OBSERVER. False = watch the room without ever writing a node, so nobody in the
   * session gets a "joined" toast. Skipping the write IS the invisibility mechanism: the
   * diff below can only ever report nodes that exist. Only the App Admin observer
   * (/dashboard/admin/live-sessions/observe) passes false.
   */
  publishSelf?: boolean;
}): PresenceEvent[] {
  const [events, setEvents] = useState<PresenceEvent[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    if (!enabled || !eventId || !sessionId || !uid) return;

    const key = presenceRoomPath(eventId, sessionId);
    const myRef = ref(rtdb, `${key}/${uid}`);
    const roomRef = ref(rtdb, key);
    const connectedRef = ref(rtdb, ".info/connected");

    // ── Publish own presence, re-armed on every (re)connection ──
    // Skipped entirely for a ghost observer — they still watch the room below.
    let stopConnected = () => {};
    if (publishSelf) {
      const node: PresenceNode & { joinedAt: unknown } = {
        name,
        ...(country ? { country } : {}),
        ...(role ? { role } : {}),
        joinedAt: rtdbServerTimestamp(),
      };
      stopConnected = onValue(connectedRef, (snap) => {
        if (snap.val() !== true) return;
        onDisconnect(myRef).remove().then(() => set(myRef, node)).catch(() => {});
      });
    }

    // ── Watch the room and diff snapshots into join/leave events ──
    let prev: Map<string, PresenceNode> | null = null; // null = first snapshot not seen yet
    const timers: ReturnType<typeof setTimeout>[] = [];
    const push = (kind: "join" | "leave", euid: string, who: PresenceNode) => {
      const ev: PresenceEvent = {
        id: `${euid}-${counter.current++}`,
        kind, uid: euid, name: who.name, country: who.country, role: who.role,
      };
      setEvents((cur) => [...cur.slice(-(MAX_VISIBLE - 1)), ev]);
      timers.push(setTimeout(() => {
        setEvents((cur) => cur.filter((e) => e.id !== ev.id));
      }, EVENT_TTL_MS));
    };
    const stopRoom = onValue(roomRef, (snap) => {
      const next = new Map<string, PresenceNode>();
      snap.forEach((child) => {
        const v = child.val() || {};
        next.set(child.key as string, { name: v.name || "Someone", country: v.country, role: v.role });
      });
      if (prev !== null) {
        for (const [euid, who] of next) {
          if (euid !== uid && !prev.has(euid)) push("join", euid, who);
        }
        for (const [euid, who] of prev) {
          if (euid !== uid && !next.has(euid)) push("leave", euid, who);
        }
      }
      prev = next;
    });

    return () => {
      stopConnected();
      stopRoom();
      timers.forEach(clearTimeout);
      if (publishSelf) {
        onDisconnect(myRef).cancel().catch(() => {});
        remove(myRef).catch(() => {});
      }
      setEvents([]);
    };
  }, [enabled, eventId, sessionId, uid, name, country, role, publishSelf]);

  return events;
}

/**
 * The room's presence LIST, rather than its join/leave traffic. Read-only — it publishes
 * nothing, so mounting it alongside `useSessionPresence` costs no extra RTDB connection
 * (the Firebase SDK multiplexes every listener over one socket, and the Spark cap counts
 * connections, not listeners).
 *
 * Built for the ceremony floor picker: the organizer hands the microphone to whoever is
 * actually in the room, so the list has to be the room, not a roster.
 */
export function usePresenceRoster({
  eventId, sessionId, enabled,
}: { eventId: string; sessionId: string; enabled: boolean }): PresenceMember[] {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    if (!enabled || !eventId || !sessionId) { setMembers([]); return; }
    const roomRef = ref(rtdb, presenceRoomPath(eventId, sessionId));
    const stop = onValue(roomRef, (snap) => {
      const next: PresenceMember[] = [];
      snap.forEach((child) => {
        const v = child.val() || {};
        next.push({
          uid: child.key as string,
          name: v.name || "Someone",
          country: v.country,
          role: v.role,
          joinedAt: typeof v.joinedAt === "number" ? v.joinedAt : undefined,
        });
      });
      next.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      setMembers(next);
    }, (e) => { console.error("usePresenceRoster", e); setMembers([]); });
    return () => stop();
  }, [enabled, eventId, sessionId]);

  return members;
}
