"use client";

import { motion } from "framer-motion";
import { EventData } from "@/lib/services/eventService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, MapPin, Coffee, Users, Mic2, PartyPopper, CalendarOff } from "lucide-react";

interface ScheduleViewerProps {
  event: EventData;
}

function getIcon(type: string) {
  switch (type) {
    case "break": return Coffee;
    case "session": return Users;
    case "social": return PartyPopper;
    default: return Mic2;
  }
}

function getColorClass(type: string) {
  switch (type) {
    case "break": return "bg-orange-500 text-white";
    case "session": return "bg-blue-500 text-white";
    case "social": return "bg-primary text-white";
    default: return "bg-primary text-primary-foreground";
  }
}

export function ScheduleViewer({ event }: ScheduleViewerProps) {
  const schedule = event.schedule || [];

  return (
    <Card className="glass-card shadow-sm border-primary/10">
      <CardHeader className="bg-secondary border-b border-border/50 pb-6">
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Clock className="w-6 h-6 text-primary" />
          Conference Schedule
        </CardTitle>
        <CardDescription className="text-base">
          Timeline and locations for {event.title}.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-8">
        {schedule.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <CalendarOff className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No schedule published yet.</p>
            <p className="text-sm mt-1">The organizer hasn't added schedule items for this conference.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-primary/20 ml-4 md:ml-8 space-y-8 pb-4">
            {schedule.map((item, index) => {
              const Icon = getIcon(item.type);
              const colorClass = getColorClass(item.type);
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  className="relative pl-8 md:pl-12"
                >
                  <div className={`absolute -left-[17px] top-1 w-8 h-8 rounded-full flex items-center justify-center border-4 border-background ${colorClass} shadow-sm`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  <div className="bg-secondary border border-border/50 rounded-2xl p-5 hover:bg-secondary transition-colors hover:border-primary/30 group">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                      <h4 className="text-lg font-bold group-hover:text-primary transition-colors">{item.title}</h4>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold whitespace-nowrap">
                        <Clock className="w-3.5 h-3.5" />
                        {item.startTime}{item.endTime ? ` – ${item.endTime}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span>{item.location}</span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
