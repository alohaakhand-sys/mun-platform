"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById } from "@/lib/services/eventService";
import { resolvePlan } from "@/lib/data/eventPlan";
import {
  getMyStaffDoc, PermissionsMap, DEFAULT_PERMISSIONS,
  isExecBoardRole, isChairTierRole,
} from "@/lib/services/staffService";

export interface EventStaffRole {
  loading: boolean;
  role: string;            // "" if not staff
  committeeId: string | null;
  permissions: PermissionsMap;
  isOwner: boolean;        // event organizerId === uid
  isCoOrganizer: boolean;
  isExecBoard: boolean;    // director / usg
  isChairTier: boolean;    // chair / vice-chair
  /** Vice-chair granted "delegate power" — may proxy for delegations in the live session. */
  canActAsDelegate: boolean;
  /** The event's optional modules (food, transport, ...), from the same event read. */
  optionalModules: string[];
  /** QR passes are in use: meals or transport are on, or the Pro plan's coupons. */
  passesOn: boolean;
  /** True for owner/co-org (full authority on this event). */
  isOrganizerLevel: boolean;
  /** True if this committee is the user's chair-tier committee. */
  isChairOf: (committee: string) => boolean;
  /**
   * Executive Board (director / USG) whose scope covers this committee. The staff doc's
   * committeeId is the scope; empty means every committee. Mirrors `isEbOf` in firestore.rules.
   */
  isExecBoardOf: (committee: string) => boolean;
  /** Permission check that auto-grants to owner/co-organizer. */
  can: (key: keyof PermissionsMap) => boolean;
}

/** QR passes are in use at an event: meals or transport are on, or its plan includes coupons. */
export function passesInUse(event: unknown): boolean {
  const mods: string[] = ((event as any)?.optionalModules as string[]) || [];
  return mods.includes("food") || mods.includes("transport") || resolvePlan(event as any).features.passes;
}

/**
 * Resolves the current user's role + permissions for a single event, mirroring
 * the firestore.rules gates so UI can hide/disable what the rules forbid.
 */
export function useEventStaffRole(eventId?: string): EventStaffRole {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<EventStaffRole, "isChairOf" | "isExecBoardOf" | "can" | "isOrganizerLevel">>({
    loading: true,
    role: "",
    committeeId: null,
    permissions: { ...DEFAULT_PERMISSIONS },
    isOwner: false,
    isCoOrganizer: false,
    isExecBoard: false,
    isChairTier: false,
    canActAsDelegate: false,
    optionalModules: [],
    passesOn: false,
  });

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user || !eventId) {
        if (active) setState(s => ({ ...s, loading: false }));
        return;
      }
      const [event, staffDoc] = await Promise.all([
        getEventById(eventId),
        getMyStaffDoc(eventId, user.uid),
      ]);
      if (!active) return;
      // Only an ACCEPTED doc grants a role — a pending invite, a role change awaiting
      // re-acceptance, or a public staff application ("applied") is not staff yet.
      const staff = staffDoc?.inviteStatus === "accepted" ? staffDoc : null;
      const role = staff?.role || "";
      setState({
        loading: false,
        role,
        committeeId: staff?.committeeId ?? null,
        permissions: { ...DEFAULT_PERMISSIONS, ...(staff?.permissions || {}) },
        isOwner: !!event && (event as any).organizerId === user.uid,
        isCoOrganizer: role === "co-organizer",
        isExecBoard: isExecBoardRole(role),
        isChairTier: isChairTierRole(role),
        canActAsDelegate: role === "vice-chair" && !!staff?.delegatePower,
        optionalModules: ((event as any)?.optionalModules as string[]) || [],
        passesOn: passesInUse(event),
      });
    }
    load();
    return () => { active = false; };
  }, [user, eventId]);

  const isOrganizerLevel = state.isOwner || state.isCoOrganizer;

  return {
    ...state,
    isOrganizerLevel,
    isChairOf: (committee: string) =>
      state.isChairTier && !!state.committeeId && state.committeeId === committee,
    isExecBoardOf: (committee: string) =>
      state.isExecBoard && (!state.committeeId || state.committeeId === committee),
    can: (key) => isOrganizerLevel || !!state.permissions[key],
  };
}
