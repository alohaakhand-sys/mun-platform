"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalEvent } from "./PortalEventContext";
import { usePortalMembers } from "./usePortalMembers";
import { PortalMemberCard } from "./PortalMemberCard";
import { PortalChatPanel } from "./PortalChatPanel";
import { PortalMembersDialog } from "./PortalMembersDialog";

// Right column (xl+). Two stacked halves: a live committee group chat on top, and the
// event roster grouped by committee below, with a "View all" people directory. The top
// bar / left rail carry navigation on smaller screens, so this whole column is hidden < xl.
export function PortalRightRail() {
  const { event } = usePortalEvent();
  const { groups, members, count, loading } = usePortalMembers(event?.id);
  const [allOpen, setAllOpen] = useState(false);

  const committeeId = event?.committeeId || "";
  const committeeMembers = committeeId ? members.filter((m) => m.committee === committeeId) : [];

  return (
    <aside className="hidden xl:block w-80 shrink-0 sticky top-[5.5rem] self-start">
      <div className="flex flex-col gap-4 h-[calc(100vh-7rem)]">
        {/* Top half — live committee group chat */}
        <PortalChatPanel eventId={event?.id} committeeId={committeeId} committeeMembers={committeeMembers} />

        {/* Bottom half — roster + people directory */}
        <div className="glass-card rounded-2xl border border-border/50 flex flex-col overflow-hidden flex-1 min-h-0">
          <div className="px-4 py-3 border-b border-border/40 shrink-0 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Members</span>
            {!loading && <span className="text-xs text-muted-foreground">· {count}</span>}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-4">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-1.5">
                  <div className="h-9 w-9 rounded-full bg-secondary animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-2/3 bg-secondary rounded animate-pulse" />
                    <div className="h-2.5 w-1/2 bg-secondary rounded animate-pulse" />
                  </div>
                </div>
              ))
            ) : groups.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10 px-4">
                No members allocated yet.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.committee}>
                  <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {group.committee}
                  </p>
                  <div className="space-y-0.5">
                    {group.members.map((m) => (
                      <PortalMemberCard key={m.uid} member={m} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-2.5 border-t border-border/40 shrink-0">
            <Button
              variant="outline"
              className="w-full gap-2 h-9"
              onClick={() => setAllOpen(true)}
              disabled={count === 0}
            >
              <Users className="w-4 h-4" /> View all
            </Button>
          </div>
        </div>
      </div>

      <PortalMembersDialog
        open={allOpen}
        onOpenChange={setAllOpen}
        members={members}
        count={count}
        myCommittee={committeeId}
      />
    </aside>
  );
}
