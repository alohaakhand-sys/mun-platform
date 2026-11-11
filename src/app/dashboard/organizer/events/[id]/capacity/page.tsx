'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CapacityCard } from '@/components/features/organizer/CapacityCard';
import { WaitlistTable, WaitlistEntry } from '@/components/features/organizer/WaitlistTable';
import { Skeleton } from '@/components/ui/skeleton';
import { Gauge, Users, Clock } from 'lucide-react';
import { getEventById } from '@/lib/services/eventService';
import Link from 'next/link';
import { belongsToCommittee } from '@/lib/utils/committee';
import { getApplicationsByEvent } from '@/lib/services/applicationService';
import { getWaitlistByCommittee, offerSeat } from '@/lib/services/waitlistService';
import { notifyWaitlistOffer } from '@/lib/services/notifyService';

export default function CapacityManagementPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [committees, setCommittees] = useState<{ id: string; name: string; capacity: number; filledSeats: number }[]>([]);
  const [waitlist, setWaitlist] = useState<Record<string, WaitlistEntry[]>>({});
  const [eventTitle, setEventTitle] = useState("the conference");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [event, applications] = await Promise.all([
        getEventById(eventId),
        getApplicationsByEvent(eventId),
      ]);
      if (!event) { setLoading(false); return; }

      setEventTitle(event.title || "the conference");

      const approvedApps = applications.filter(a => a.status === 'approved');
      const committeeList = (event.committees ?? []).map(c => ({
        id: c.name,
        name: c.name,
        capacity: c.capacity ?? 50,
        filledSeats: approvedApps.filter(a => belongsToCommittee(a, c.name)).length,
      }));
      setCommittees(committeeList);

      const wlMap: Record<string, WaitlistEntry[]> = {};
      await Promise.all(
        committeeList.map(async c => {
          const entries = await getWaitlistByCommittee(eventId, c.id);
          wlMap[c.id] = entries.map(e => ({
            id: e.id!,
            applicantName: e.applicantName,
            applicantEmail: e.applicantEmail,
            position: e.position,
            appliedDate: e.createdAt?.toDate?.()?.toLocaleDateString() ?? '—',
            status: e.status as WaitlistEntry['status'],
          }));
        })
      );
      setWaitlist(wlMap);
      setLoading(false);
    }
    load();
  }, [eventId]);

  const handleOfferSeat = async (entryId: string) => {
    let entry: WaitlistEntry | undefined;
    let committeeId = "";
    for (const cid in waitlist) {
      const found = waitlist[cid].find(e => e.id === entryId);
      if (found) { entry = found; committeeId = cid; break; }
    }
    const res = await offerSeat(eventId, entryId);
    if (!res.success) { alert("Couldn't offer the seat. Please try again."); return; }
    if (entry?.applicantEmail) {
      notifyWaitlistOffer(eventId, entry.applicantEmail, eventTitle, committeeId);
    }
    setWaitlist(prev => {
      const updated = { ...prev };
      for (const cid in updated) {
        updated[cid] = updated[cid].map(e => e.id === entryId ? { ...e, status: 'offered' as const } : e);
      }
      return updated;
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl space-y-8">
      <div className="flex items-center gap-4">
        <div className="grid place-items-center w-11 h-11 rounded-sm border border-border bg-secondary text-foreground shrink-0">
          <Gauge className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">Committee Capacity &amp; Waitlist</span></h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Live fill rates (approved delegates) and waitlists. Capacity is set per committee on the{" "}
            <Link href={`/dashboard/organizer/events/${eventId}/committees`} className="text-primary underline-offset-2 hover:underline">Committees</Link> page.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold border-b border-border/40 pb-3 flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500">
            <Users className="w-[18px] h-[18px]" />
          </span>
          Committee Overview
        </h2>
        {committees.length === 0 ? (
          <p className="text-muted-foreground text-sm">No committees configured for this event.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {committees.map(committee => (
              <CapacityCard
                key={committee.id}
                committeeId={committee.id}
                name={committee.name}
                capacity={committee.capacity}
                filledSeats={committee.filledSeats}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6 pt-6">
        <h2 className="text-xl font-semibold border-b border-border/40 pb-3 flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500">
            <Clock className="w-[18px] h-[18px]" />
          </span>
          Waitlist Queues
        </h2>
        {committees.map(committee => {
          const committeeWaitlist = waitlist[committee.id] ?? [];
          if (committeeWaitlist.length === 0 && committee.filledSeats < committee.capacity) return null;
          return (
            <WaitlistTable
              key={`wl-${committee.id}`}
              committeeName={committee.name}
              entries={committeeWaitlist}
              onOfferSeat={handleOfferSeat}
            />
          );
        })}
      </div>
    </div>
  );
}
