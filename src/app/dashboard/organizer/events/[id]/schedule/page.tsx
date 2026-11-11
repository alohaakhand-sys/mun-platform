"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, updateEvent, EventData, ScheduleItem } from "@/lib/services/eventService";
import { SCHEDULE_TEMPLATES, ScheduleTemplate, buildTemplateSessions, resolveEventStartDate } from "@/lib/data/scheduleTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, CalendarDays, Save, Clock, MapPin, GripVertical, Sparkles, LayoutTemplate, ChevronRight } from "lucide-react";

const TYPE_META: Record<string, { label: string; text: string; bg: string; border: string; bar: string }> = {
  main: { label: "Main Event", text: "text-primary", bg: "bg-primary/10", border: "border-primary/20", bar: "bg-primary" },
  session: { label: "Committee Session", text: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", bar: "bg-blue-500" },
  break: { label: "Break / Lunch", text: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", bar: "bg-amber-500" },
  social: { label: "Social Event", text: "text-primary", bg: "bg-primary/10", border: "border-primary/20", bar: "bg-primary" },
};

export default function SchedulePage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!user || !eventId) return;
      const eventData = await getEventById(eventId);
      if (eventData) {
        setEvent(eventData);
        setSchedule(eventData.schedule || []);
      }
      setLoading(false);
    }
    loadData();
  }, [user, eventId]);

  // Add a blank session (the "custom" path from the Add modal).
  const addCustomSession = () => {
    setSchedule(prev => [...prev, { title: "", startTime: "", endTime: "", location: "", type: "session" }]);
    setIsAddOpen(false);
  };

  // Append a template's sessions, with times anchored to the event's start date.
  const applyTemplate = (tpl: ScheduleTemplate) => {
    setSchedule(prev => [...prev, ...buildTemplateSessions(tpl, event)]);
    setIsAddOpen(false);
  };

  const handleRemoveItem = (index: number) => {
    setSchedule(schedule.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: keyof ScheduleItem, value: string) => {
    const newSchedule = [...schedule];
    newSchedule[index] = { ...newSchedule[index], [field]: value };
    setSchedule(newSchedule);
  };

  const handleSave = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      await updateEvent(eventId, { schedule });
      alert("Schedule updated successfully");
    } catch (err) {
      alert("Failed to update schedule");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid place-items-center w-11 h-11 rounded-sm border border-border bg-secondary text-foreground shrink-0">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight"><span className="text-gradient">Schedule Builder</span></h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {schedule.length} session{schedule.length !== 1 ? "s" : ""} · {event?.title}
            </p>
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          <Button variant="outline" onClick={() => setIsAddOpen(true)} className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" /> Add Session
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-xl shadow-sm">
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Schedule"}
          </Button>
        </div>
      </div>

      {/* Add to Schedule — pick a template or add a custom (blank) session */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Add to Schedule
            </DialogTitle>
            <DialogDescription>
              {resolveEventStartDate(event)
                ? "Start from a ready-made template (times auto-filled from your event date) or add a blank session to fill in yourself."
                : "Start from a ready-made template or add a blank session. Set your event date to have template times auto-filled."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
              Start from a template
            </p>
            {SCHEDULE_TEMPLATES.map(tpl => {
              const first = tpl.sessions[0];
              const last = tpl.sessions[tpl.sessions.length - 1];
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="w-full text-left rounded-xl border border-border/40 bg-secondary hover:bg-secondary hover:border-primary/40 transition-all p-4 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <LayoutTemplate className="w-4 h-4 text-primary shrink-0" />
                        <h3 className="font-semibold truncate">{tpl.name}</h3>
                        <span className="text-[10px] font-semibold rounded-full bg-secondary px-2 py-0.5 text-muted-foreground shrink-0">
                          {tpl.days} day{tpl.days > 1 ? "s" : ""} · {tpl.sessions.length} sessions
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{tpl.description}</p>
                      {first && last && (
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Starts {first.start} · ends {last.end} on day {last.day + 1}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {tpl.sessions.map((sess, i) => {
                      const meta = TYPE_META[sess.type] || TYPE_META.session;
                      return (
                        <span key={i} className={`text-[10px] font-medium rounded-md px-2 py-0.5 ${meta.bg} ${meta.text}`}>
                          {sess.start} {sess.title}
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border/50" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Or</span>
              <span className="h-px flex-1 bg-border/50" />
            </div>

            {/* Custom blank session */}
            <button
              type="button"
              onClick={addCustomSession}
              className="w-full text-left rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-secondary transition-all p-4 group flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">Add a custom session</h3>
                <p className="text-xs text-muted-foreground">
                  Start with a blank row and set the title, type, location, and times yourself.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {schedule.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center glass-card rounded-2xl border-dashed">
          <div className="grid place-items-center w-16 h-16 rounded-2xl bg-secondary text-muted-foreground mb-4">
            <Clock className="w-8 h-8" />
          </div>
          <p className="text-lg font-semibold mb-1">No sessions yet</p>
          <p className="text-sm text-muted-foreground mb-5">Build your conference itinerary session by session.</p>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" /> Add first session
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {schedule.map((item, index) => {
            const meta = TYPE_META[item.type] || TYPE_META.session;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.04 }}
                className="glass-card relative flex gap-4 rounded-2xl p-4 sm:p-5 overflow-hidden group"
              >
                <div className={`absolute left-0 inset-y-0 w-1 ${meta.bar}`} />
                <div className="flex flex-col items-center gap-2 pt-1 pl-1 shrink-0">
                  <span className={`grid place-items-center w-8 h-8 rounded-lg text-sm font-bold ${meta.bg} ${meta.text}`}>
                    {index + 1}
                  </span>
                  <GripVertical className="w-4 h-4 text-muted-foreground/30" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-w-0">
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                    <Label className="text-xs">Session Title</Label>
                    <Input
                      value={item.title}
                      onChange={(e) => handleChange(index, "title", e.target.value)}
                      placeholder="e.g. Opening Ceremony"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select value={item.type} onValueChange={(v) => handleChange(index, "type", v ?? "session")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="main">Main Event</SelectItem>
                        <SelectItem value="session">Committee Session</SelectItem>
                        <SelectItem value="break">Break / Lunch</SelectItem>
                        <SelectItem value="social">Social Event</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</Label>
                    <Input
                      value={item.location}
                      onChange={(e) => handleChange(index, "location", e.target.value)}
                      placeholder="e.g. Main Hall"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start Time</Label>
                    <Input
                      type="datetime-local"
                      value={item.startTime}
                      onChange={(e) => handleChange(index, "startTime", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">End Time</Label>
                    <Input
                      type="datetime-local"
                      value={item.endTime}
                      onChange={(e) => handleChange(index, "endTime", e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemoveItem(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </motion.div>
            );
          })}
          <Button variant="outline" onClick={() => setIsAddOpen(true)} className="w-full gap-2 rounded-xl border-dashed border-border/60 bg-transparent">
            <Plus className="w-4 h-4" /> Add another session
          </Button>
        </div>
      )}
    </div>
  );
}
