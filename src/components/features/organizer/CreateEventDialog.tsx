"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createEvent, updateEvent, computeApplicationCloseAt, EventData } from "@/lib/services/eventService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/ui/ImageUploader";
import { DateField, TimeField } from "@/components/ui/DateTimePicker";
import { LocationSearch, SelectedPlace } from "@/components/features/organizer/LocationSearch";
import { LocationMap } from "@/components/features/organizer/LocationMap";
import {
  Globe2,
  MapPin,
  Navigation,
  Lock,
  ImagePlus,
  Loader2,
} from "lucide-react";

type Mode = "create" | "edit";

interface CreateEventDialogProps {
  trigger: React.ReactNode;
  mode?: Mode;
  initialEvent?: EventData;
  onSuccess?: (eventId: string) => void;
}

interface FormState {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string;
  format: "offline" | "online" | "hybrid";
  location: string;
  // Structured place from the map picker; null for free-typed / online locations.
  place: SelectedPlace | null;
  visibility: "public" | "unlisted";
  description: string;
  coverUrl: string;
}

const formatLabel: Record<FormState["format"], string> = {
  offline: "In person",
  online: "Virtual",
  hybrid: "Hybrid",
};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function parseInitial(event: EventData | undefined): FormState {
  if (!event) {
    return {
      title: "",
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      timeZone: browserTimeZone(),
      format: "offline",
      location: "",
      place: null,
      visibility: "public",
      description: "",
      coverUrl: "",
    };
  }
  const anyEv = event as any;
  let startDate = anyEv.startDate || "";
  let startTime = anyEv.startTime || "";
  if ((!startDate || !startTime) && event.date) {
    const dt = new Date(event.date);
    if (!isNaN(dt.getTime())) {
      const tz = dt.getTimezoneOffset() * 60000;
      const iso = new Date(dt.getTime() - tz).toISOString();
      startDate = startDate || iso.slice(0, 10);
      startTime = startTime || iso.slice(11, 16);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(event.date)) {
      startDate = startDate || event.date.slice(0, 10);
    }
  }
  return {
    title: event.title || "",
    startDate,
    startTime,
    endDate: anyEv.endDate || "",
    endTime: anyEv.endTime || "",
    timeZone: anyEv.timeZone || browserTimeZone(),
    format: (event.format as FormState["format"]) || "offline",
    location: event.location || "",
    place:
      event.locationPlaceId || event.locationLat != null || event.locationLng != null
        ? {
            name: event.locationName || event.location || "",
            address: event.locationAddress || "",
            latitude: event.locationLat ?? null,
            longitude: event.locationLng ?? null,
            placeId: event.locationPlaceId ?? null,
          }
        : null,
    visibility: (anyEv.visibility as FormState["visibility"]) || "public",
    description: event.description || "",
    coverUrl: event.coverUrl || "",
  };
}

export function CreateEventDialog({
  trigger,
  mode = "create",
  initialEvent,
  onSuccess,
}: CreateEventDialogProps) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(parseInitial(initialEvent));
  const [showEnd, setShowEnd] = useState(Boolean(initialEvent && ((initialEvent as any).endDate || (initialEvent as any).endTime)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(parseInitial(initialEvent));
      setShowEnd(Boolean(initialEvent && ((initialEvent as any).endDate || (initialEvent as any).endTime)));
      setError(null);
    }
  }, [open, initialEvent]);

  const minDate = useMemo(() => todayISO(), []);

  const startInPast = useMemo(() => {
    if (!form.startDate || !form.startTime) return false;
    const dt = new Date(`${form.startDate}T${form.startTime}`);
    return !isNaN(dt.getTime()) && dt.getTime() < Date.now();
  }, [form.startDate, form.startTime]);

  const hostName =
    (profile as any)?.firstName ||
    (profile as any)?.displayName ||
    user?.displayName ||
    "Host";
  const hostAvatar = (profile as any)?.photoURL || user?.photoURL || "";

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canSubmit =
    !!form.title.trim() &&
    !!form.startDate &&
    !!form.startTime &&
    !!form.description.trim() &&
    (form.format === "online" || !!form.location.trim()) &&
    !startInPast &&
    !saving;

  async function handleSubmit() {
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    if (!canSubmit) {
      if (startInPast) setError("An event must not have a start time in the past.");
      else setError("Please fill all required fields.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const composedDate = `${form.startDate}T${form.startTime}`;
      // Application close is derived from the event start (one day before, unless a
      // schedule overrides it). Recompute here so changing the start date keeps the
      // rules/checkout gate (applicationCloseAt) in sync.
      const closeAt = computeApplicationCloseAt({
        date: composedDate,
        applicationSchedule: (initialEvent as any)?.applicationSchedule,
      } as any);

      // Structured place only applies to physical events. Picked → write the fields;
      // removed/free-typed → write nulls on edit so stale coordinates are cleared.
      const place = form.format !== "online" ? form.place : null;
      const placeFields: Record<string, any> = place
        ? {
            locationName: place.name,
            locationAddress: place.address || null,
            locationLat: place.latitude ?? null,
            locationLng: place.longitude ?? null,
            locationPlaceId: place.placeId ?? null,
          }
        : mode === "edit"
          ? { locationName: null, locationAddress: null, locationLat: null, locationLng: null, locationPlaceId: null }
          : {};

      const payload: Partial<EventData> & Record<string, any> = {
        title: form.title.trim(),
        date: composedDate,
        location: form.format === "online" ? form.location.trim() || "Online" : form.location.trim(),
        ...placeFields,
        format: form.format,
        description: form.description.trim(),
        coverUrl: form.coverUrl,
        startDate: form.startDate,
        startTime: form.startTime,
        endDate: showEnd ? form.endDate : "",
        endTime: showEnd ? form.endTime : "",
        timeZone: form.timeZone,
        visibility: form.visibility,
        ...(Number.isFinite(closeAt) ? { applicationCloseAt: closeAt } : {}),
      };

      let eventId: string;
      if (mode === "edit" && initialEvent?.id) {
        await updateEvent(initialEvent.id, {
          ...(payload as Partial<EventData>),
          lastEditedAt: new Date().toISOString() as any,
          lastEditedBy: user.uid,
        });
        eventId = initialEvent.id;
      } else {
        const fullPayload: Omit<EventData, "id"> = {
          ...(payload as Omit<EventData, "id">),
          committees: [],
          organizerId: user.uid,
          status: "draft",
        };
        eventId = await createEvent(fullPayload);

        // The server mails the organizer's own address, from the event it just checked they own.
        user.getIdToken().then((token) =>
          fetch("/api/notify/event-created", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ eventId, organizerName: hostName }),
          })
        ).catch((err) => console.error("Event-created email dispatch failed:", err));
      }

      setOpen(false);
      if (onSuccess) {
        onSuccess(eventId);
      } else {
        router.push(`/dashboard/organizer/events/${eventId}`);
        router.refresh();
      }
    } catch (err: any) {
      console.error("Failed to save event:", err);
      setError(err?.message || "Failed to save event. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as any} />
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl bg-card border-border/50 p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40 text-center sm:text-center">
          <DialogTitle className="text-base font-semibold">
            {mode === "edit" ? "Edit event" : "Create event"}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          {/* Cover */}
          <div className="relative">
            <ImageUploader
              value={form.coverUrl}
              onChange={(url) => update("coverUrl", url)}
            />
            {!form.coverUrl && (
              <div className="absolute bottom-3 right-3 pointer-events-none">
                <span className="inline-flex items-center gap-1.5 bg-foreground text-background text-xs font-semibold rounded-md px-2.5 py-1.5 shadow-sm">
                  <ImagePlus className="w-3.5 h-3.5" /> Add
                </span>
              </div>
            )}
          </div>

          {/* Host */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-secondary">
            {hostAvatar ? (
              <img
                src={hostAvatar}
                alt={hostName}
                className="w-10 h-10 rounded-full object-cover border border-border/40"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-bold">
                {hostName[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{hostName}</p>
              <p className="text-xs text-muted-foreground">Host — Your profile</p>
            </div>
          </div>

          {/* Event name */}
          <div>
            <Input
              placeholder="Event name"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              className="h-12 rounded-xl text-base"
            />
          </div>

          {/* Date / Time / TZ */}
          <div>
            <div className="grid grid-cols-3 gap-2">
              <DateField
                label="Start date"
                value={form.startDate}
                min={minDate}
                onChange={(v) => update("startDate", v)}
              />
              <TimeField
                label="Start time"
                value={form.startTime}
                invalid={startInPast}
                onChange={(v) => update("startTime", v)}
              />
              <label className="group rounded-xl border border-border/40 bg-secondary px-3 py-2 cursor-text transition-colors hover:border-primary/40 focus-within:border-primary/60">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Globe2 className="w-3 h-3" /> Time zone
                </span>
                <Input
                  value={form.timeZone}
                  onChange={(e) => update("timeZone", e.target.value)}
                  className="h-8 px-0 border-0 bg-transparent text-sm font-semibold focus-visible:ring-0"
                />
              </label>
            </div>
            {startInPast && (
              <p className="text-xs text-destructive mt-2">
                An event must not have a start time in the past.
              </p>
            )}
            {!showEnd ? (
              <button
                type="button"
                onClick={() => setShowEnd(true)}
                className="text-xs text-primary font-semibold mt-2 hover:underline"
              >
                + End date and time
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <DateField
                  label="End date"
                  value={form.endDate}
                  min={form.startDate || minDate}
                  onChange={(v) => update("endDate", v)}
                />
                <TimeField
                  label="End time"
                  value={form.endTime}
                  onChange={(v) => update("endTime", v)}
                />
              </div>
            )}
          </div>

          {/* Format */}
          <div className="rounded-xl border border-border/40 bg-secondary px-3 py-2 transition-colors hover:border-primary/40">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Navigation className="w-3 h-3" /> Is it in person or virtual?
            </Label>
            <Select
              value={form.format}
              onValueChange={(v) => update("format", v as FormState["format"])}
            >
              <SelectTrigger className="h-8 w-full px-0 border-0 bg-transparent text-sm font-semibold justify-between focus:ring-0">
                <SelectValue>{formatLabel[form.format]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offline">In person</SelectItem>
                <SelectItem value="online">Virtual</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          {form.format === "online" ? (
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Meeting link (optional)"
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                className="h-12 rounded-xl pl-10 text-sm"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <LocationSearch
                value={form.location}
                placeholder="Search venue or address"
                hasCoordinates={form.place?.latitude != null}
                onTextChange={(text) => {
                  // Manual edit detaches any previously picked place.
                  setForm((prev) => ({ ...prev, location: text, place: null }));
                }}
                onSelectPlace={(p) => {
                  const display = p.address ? `${p.name}, ${p.address}` : p.name;
                  setForm((prev) => ({ ...prev, location: display, place: p }));
                }}
              />
              <LocationMap
                lat={form.place?.latitude ?? null}
                lng={form.place?.longitude ?? null}
                onChange={(la, ln) =>
                  setForm((prev) => ({
                    ...prev,
                    // Pinning without searching still needs a label so the form can submit.
                    location: prev.location.trim() || "Pinned location",
                    place: {
                      name: prev.place?.name || prev.location.trim() || "Pinned location",
                      address: prev.place?.address || "",
                      latitude: la,
                      longitude: ln,
                      placeId: prev.place?.placeId ?? null,
                    },
                  }))
                }
              />
            </div>
          )}

          {/* Visibility */}
          <div className="rounded-xl border border-border/40 bg-secondary px-3 py-2 transition-colors hover:border-primary/40">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Lock className="w-3 h-3" /> Who can see it?
            </Label>
            <Select
              value={form.visibility}
              onValueChange={(v) => update("visibility", v as FormState["visibility"])}
            >
              <SelectTrigger className="h-8 w-full px-0 border-0 bg-transparent text-sm font-semibold justify-between focus:ring-0">
                <SelectValue>
                  {form.visibility === "public" ? "Public" : "Unlisted"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public — discoverable on /events</SelectItem>
                <SelectItem value="unlisted">Unlisted — link only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Textarea
              placeholder="What are the details?"
              rows={4}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="rounded-xl resize-none"
            />
            <AiTextareaAssist
              value={form.description}
              onPick={(t) => update("description", t)}
              surface="event-description"
              context={{ eventName: form.title }}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}
        </div>

        <div className="px-6 pb-6">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-11 rounded-xl font-semibold"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {mode === "edit" ? "Saving..." : "Creating..."}
              </>
            ) : mode === "edit" ? (
              "Save changes"
            ) : (
              "Create event"
            )}
          </Button>
          {mode === "create" && (
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Saved as a draft. Add committees, tickets &amp; schedule from the event page to publish.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreateEventDialog;
