"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import type { PortalMember } from "./usePortalMembers";

const UNASSIGNED = "Unassigned";

type Section = { key: string; title: string; members: PortalMember[] };

function tierOf(role: string): "organizer" | "eb" | "chair" | "observer" | "delegate" {
  const r = (role || "").toLowerCase();
  if (r === "organizer" || r.includes("organizer")) return "organizer"; // covers co-organizer
  if (r === "director" || r === "usg" || r === "eb") return "eb";
  if (r.includes("chair")) return "chair";
  if (r.includes("observer") || r.includes("faculty")) return "observer";
  return "delegate";
}

function prettyRole(role: string) {
  if (!role) return "Member";
  return role
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Group the flat roster into role + committee sections, ordered:
// Organizers · Executive Board · <committees (own first, Unassigned last)> · Observers & Faculty.
function buildSections(members: PortalMember[], myCommittee: string): Section[] {
  const organizers: PortalMember[] = [];
  const eb: PortalMember[] = [];
  const observers: PortalMember[] = [];
  const byCommittee = new Map<string, PortalMember[]>();

  for (const m of members) {
    const tier = tierOf(m.role);
    if (tier === "organizer") organizers.push(m);
    else if (tier === "eb") eb.push(m);
    else if (tier === "observer") observers.push(m);
    else {
      const key = m.committee || UNASSIGNED;
      if (!byCommittee.has(key)) byCommittee.set(key, []);
      byCommittee.get(key)!.push(m);
    }
  }

  const nameSort = (a: PortalMember, b: PortalMember) => {
    if (a.isStaff !== b.isStaff) return a.isStaff ? -1 : 1; // chairs above delegates
    return a.name.localeCompare(b.name);
  };
  organizers.sort(nameSort);
  eb.sort(nameSort);
  observers.sort(nameSort);
  for (const arr of byCommittee.values()) arr.sort(nameSort);

  const committeeKeys = Array.from(byCommittee.keys()).sort((a, b) => {
    if (myCommittee && a === myCommittee) return -1;
    if (myCommittee && b === myCommittee) return 1;
    if (a === UNASSIGNED) return 1;
    if (b === UNASSIGNED) return -1;
    return a.localeCompare(b);
  });

  const sections: Section[] = [];
  if (organizers.length) sections.push({ key: "organizers", title: "Organizers", members: organizers });
  if (eb.length) sections.push({ key: "eb", title: "Executive Board", members: eb });
  for (const c of committeeKeys) sections.push({ key: `c:${c}`, title: c, members: byCommittee.get(c)! });
  if (observers.length) sections.push({ key: "observers", title: "Observers & Faculty", members: observers });
  return sections;
}

function MemberTile({ member, onOpen }: { member: PortalMember; onOpen: (uid: string) => void }) {
  return (
    <button
      onClick={() => onOpen(member.uid)}
      className="group relative glass-card rounded-2xl border border-border/50 overflow-hidden text-center px-3 pt-5 pb-4 hover:border-primary/40 hover:-translate-y-0.5 transition-all"
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-16 bg-secondary" />
      <div className="relative flex flex-col items-center">
        <div className="rounded-full p-[2px] bg-border transition-colors group-hover:bg-foreground">
          <Avatar className="h-14 w-14 ring-2 ring-card">
            <AvatarImage src={member.photoURL || ""} alt={member.name} className="object-cover" />
            <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
              {member.name?.[0]?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
        </div>
        <p className="font-semibold text-sm mt-2.5 leading-tight line-clamp-1 w-full">{member.name}</p>
        <div className="mt-1 text-xs text-muted-foreground line-clamp-1 w-full inline-flex items-center justify-center gap-1">
          {member.isStaff ? (
            prettyRole(member.role)
          ) : member.country ? (
            <>
              <CountryFlag code={member.country} size={12} />
              {getCountryName(member.country)}
            </>
          ) : (
            prettyRole(member.role)
          )}
        </div>
      </div>
    </button>
  );
}

export function PortalMembersDialog({
  open,
  onOpenChange,
  members,
  count,
  myCommittee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: PortalMember[];
  count: number;
  myCommittee: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const query = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        (m.committee || "").toLowerCase().includes(query) ||
        (m.country || "").toLowerCase().includes(query) ||
        (m.role || "").toLowerCase().includes(query)
    );
  }, [members, query]);

  const sections = useMemo(() => buildSections(filtered, myCommittee), [filtered, myCommittee]);

  const openProfile = (uid: string) => {
    onOpenChange(false);
    router.push(`/dashboard/profile/${uid}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] p-0 overflow-hidden flex flex-col gap-0">
        <div className="px-5 pt-5 pb-3 border-b border-border/50 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-primary" /> People
            <span className="text-sm font-normal text-muted-foreground">· {count}</span>
          </DialogTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people by name, role, committee or country…"
              className="pl-9 bg-secondary border-border/50"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-6">
          {sections.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm">No people match your search.</p>
            </div>
          ) : (
            sections.map((s) => (
              <div key={s.key}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  {s.title} <span className="text-muted-foreground/60">· {s.members.length}</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {s.members.map((m) => (
                    <MemberTile key={m.uid} member={m} onOpen={openProfile} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
