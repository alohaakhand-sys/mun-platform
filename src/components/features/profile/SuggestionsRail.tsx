"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ArrowRight, UserPlus } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getAllUsers, type UserProfile } from "@/lib/services/userService";
import { getPublishedEvents, type EventData } from "@/lib/services/eventService";
import { SectionCard } from "./_shared";

/** Delegates the owner isn't connected to yet. Owner-rail only (needs the owner's connections). */
export function PeopleYouMayKnow({ ownerUid }: { ownerUid: string }) {
  const [people, setPeople] = useState<UserProfile[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [all, connSnap] = await Promise.all([
        getAllUsers(),
        getDocs(collection(db, "users", ownerUid, "connections")).catch(() => null),
      ]);
      const connected = new Set<string>(connSnap ? connSnap.docs.map((d) => d.id) : []);
      const list = all
        .filter((u) => u.uid !== ownerUid && !connected.has(u.uid) && (u.displayName || u.firstName))
        .slice(0, 4);
      if (alive) setPeople(list);
    })();
    return () => { alive = false; };
  }, [ownerUid]);

  if (people.length === 0) return null;

  return (
    <SectionCard title="People you may know">
      <div className="flex flex-col divide-y divide-border/50 -mt-1">
        {people.map((u) => {
          const name = u.displayName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Delegate";
          return (
            <div key={u.uid} className="flex items-center gap-3 py-3 first:pt-0">
              <Avatar className="w-11 h-11 shrink-0">
                <AvatarImage src={u.photoURL || ""} alt={name} />
                <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/profile/${u.uid}`} className="font-semibold text-sm leading-tight hover:underline line-clamp-1">
                  {name}
                </Link>
                {u.headline && <p className="text-xs text-muted-foreground line-clamp-1">{u.headline}</p>}
              </div>
              <Button variant="outline" size="sm" className="gap-1 shrink-0" render={<Link href={`/dashboard/profile/${u.uid}`} />} nativeButton={false}>
                <UserPlus className="w-3.5 h-3.5" /> View
              </Button>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/** A few published conferences to explore. Existing data only, with a Browse fallback. */
export function SuggestedConferences() {
  const [events, setEvents] = useState<EventData[]>([]);

  useEffect(() => {
    let alive = true;
    getPublishedEvents().then((all) => { if (alive) setEvents(all.slice(0, 3)); });
    return () => { alive = false; };
  }, []);

  return (
    <SectionCard title="Suggested conferences">
      {events.length > 0 ? (
        <div className="flex flex-col divide-y divide-border/50 -mt-1">
          {events.map((e) => (
            <Link key={e.id} href={`/dashboard/conferences/${e.id}`} className="flex items-center gap-3 py-3 first:pt-0 group">
              <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden">
                {e.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <CalendarDays className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm leading-tight line-clamp-1 group-hover:underline">{e.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{[e.date, e.location].filter(Boolean).join(" · ")}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-1">Find events open for applications.</p>
      )}
      <Button variant="outline" size="sm" className="w-full gap-1.5 mt-3" render={<Link href="/dashboard/conferences" />} nativeButton={false}>
        Browse conferences <ArrowRight className="w-4 h-4" />
      </Button>
    </SectionCard>
  );
}
