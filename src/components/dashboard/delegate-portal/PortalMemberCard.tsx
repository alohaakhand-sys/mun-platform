"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { roleLabel } from "@/lib/services/staffService";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalMessenger } from "./PortalMessengerContext";
import type { PortalMember } from "./usePortalMembers";

// One roster row: avatar + name + role/country, body links to the public profile and the
// Message button opens the in-place messaging popup for this person (no page navigation).
export function PortalMemberCard({ member }: { member: PortalMember }) {
  const { user } = useAuth();
  const { openChat } = usePortalMessenger();
  const isSelf = user?.uid === member.uid;

  const handleMessage = () => {
    if (isSelf) return;
    openChat({ uid: member.uid, name: member.name, photo: member.photoURL || "" });
  };

  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-secondary transition-colors">
      <Link
        href={`/dashboard/profile/${member.uid}`}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={member.photoURL || ""} alt={member.name} className="object-cover" />
          <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
            {member.name?.[0]?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate leading-tight">
            {member.name}
            {isSelf && <span className="text-muted-foreground font-normal"> (You)</span>}
          </p>
          <p className="text-xs text-muted-foreground truncate inline-flex items-center gap-1">
            {member.isStaff ? (
              roleLabel(member.role)
            ) : member.country ? (
              <>
                <CountryFlag code={member.country} size={12} />
                {getCountryName(member.country)}
              </>
            ) : (
              member.role
            )}
          </p>
        </div>
      </Link>
      {!isSelf && (
        <button
          onClick={handleMessage}
          title={`Message ${member.name}`}
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground transition-all"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="sr-only">Message {member.name}</span>
        </button>
      )}
    </div>
  );
}
