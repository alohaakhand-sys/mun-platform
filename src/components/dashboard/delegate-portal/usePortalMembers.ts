"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export interface PortalMember {
  uid: string;
  name: string;
  role: string;
  committee: string;
  country: string;
  isStaff: boolean;
  photoURL: string;
}

export interface MemberGroup {
  committee: string;
  members: PortalMember[];
}

const UNASSIGNED = "Unassigned";

// Loads the whole-event roster (approved delegates + accepted chairs) from the server
// route and groups it by committee — the delegate's own committee first, then the rest
// alphabetically, "Unassigned" last. Chairs sort to the top of each committee group.
export function usePortalMembers(eventId?: string | null) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [members, setMembers] = useState<PortalMember[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!eventId || !user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/events/${eventId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`members request failed: ${res.status}`);
        const data = await res.json();
        const members: PortalMember[] = data.members || [];

        const myCommittee = members.find((m) => m.uid === user.uid)?.committee || "";

        const map = new Map<string, PortalMember[]>();
        for (const m of members) {
          const key = m.committee || UNASSIGNED;
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(m);
        }
        for (const arr of map.values()) {
          arr.sort((a, b) => {
            if (a.isStaff !== b.isStaff) return a.isStaff ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        }

        const keys = Array.from(map.keys()).sort((a, b) => {
          if (a === b) return 0;
          if (myCommittee && a === myCommittee) return -1;
          if (myCommittee && b === myCommittee) return 1;
          if (a === UNASSIGNED) return 1;
          if (b === UNASSIGNED) return -1;
          return a.localeCompare(b);
        });

        if (!cancelled) {
          setGroups(keys.map((k) => ({ committee: k, members: map.get(k)! })));
          setMembers(members);
          setCount(members.length);
        }
      } catch (err) {
        console.error("usePortalMembers error:", err);
        if (!cancelled) {
          setGroups([]);
          setMembers([]);
          setCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // Deps are eventId + uid only — roster must not refetch when ?tab= changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, user?.uid]);

  return { groups, members, count, loading };
}
