"use client";

import { motion } from "framer-motion";
import { Calendar, MapPin, Globe2, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { EventData } from "@/lib/services/eventService";

interface EventBrowseCardProps {
  event: EventData;
  delay?: number;
  hasApplied?: boolean;
}

export function EventBrowseCard({ event, delay = 0, hasApplied = false }: EventBrowseCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="glass-card rounded-md overflow-hidden hover:border-foreground transition-colors group flex flex-col h-full"
    >
      {/* A placard, not a tinted gradient: the cover shows at full strength or the navy
          field carries the format stamp on its own. */}
      <div className="mp-placard shrink-0" style={{ height: 128 }}>
        <span className="mp-stamp">{event.format || "In-person"}</span>
        {event.coverUrl ? (
          <img src={event.coverUrl} alt={event.title} />
        ) : (
          <span>{event.title}</span>
        )}
      </div>
      
      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-1">
          {event.title}
        </h3>
        
        <div className="space-y-2 mb-4 text-sm text-muted-foreground flex-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 shrink-0 text-primary/70" />
            <span className="truncate">{event.date || "Date TBA"}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 shrink-0 text-primary/70" />
            <span className="truncate">{event.location || "Location TBA"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 shrink-0 text-primary/70" />
            <span>{event.committees?.length || 0} Committees</span>
          </div>
        </div>

        <div className="pt-4 border-t border-border/40 mt-auto">
          {hasApplied ? (
            <Button variant="secondary" className="w-full opacity-70 pointer-events-none" disabled>
              Already Applied
            </Button>
          ) : (
            <Button className="w-full" render={<Link href={`/events/${event.id}`} />} nativeButton={false}>
              View & Apply
              <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
