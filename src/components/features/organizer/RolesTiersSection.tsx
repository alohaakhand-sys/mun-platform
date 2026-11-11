"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DateField, TimeField } from "@/components/ui/DateTimePicker";
import { Check, AlertCircle, Loader2, Lock, Ticket, Sunrise, Clock, CalendarRange, ChevronRight, CircleDot, CalendarClock } from "lucide-react";
import {
  getEventById,
  updateEvent,
  getDefaultRoleTiers,
  getApplicationTimeline,
  computeApplicationCloseAt,
  validateApplicationSchedule,
  getEventStartMs,
  RoleTier,
  ApplicationSchedule,
  PricePhase,
  TEAM_ROLE,
} from "@/lib/services/eventService";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Local editor state for the shared schedule. Datetimes are naive-local ISO
// "YYYY-MM-DDTHH:mm" (same shape as event.date), or "" when unset.
type SchedState = {
  earlyEnabled: boolean;
  earlyEnd: string;
  lateEnabled: boolean;
  lateStart: string;
  lateEnd: string;
  regularClose: string;
};

const EMPTY_SCHED: SchedState = {
  earlyEnabled: false, earlyEnd: "",
  lateEnabled: false, lateStart: "", lateEnd: "",
  regularClose: "",
};

function fmtDT(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const dateOnly = (v?: string) => (v ? v.slice(0, 10) : "");
const composeDT = (d: string, t: string) => (d ? `${d}T${t || "00:00"}` : "");

const ROLE_HELP: Record<string, string> = {
  "Delegate": "Standard country representative.",
  "Head Delegate": "Leads a delegation from one institution.",
  "Observer": "Attends without voting rights.",
  "Faculty Advisor": "Supervises a delegation. No committee/country preferences.",
  "Team Delegation Lead": "One application for a group of 3-15 delegates. Priced per member.",
};

/** Build a normalized ApplicationSchedule from editor state (drops invalid/disabled parts). */
function toSchedule(sd: SchedState): ApplicationSchedule {
  const sched: ApplicationSchedule = {};
  if (sd.earlyEnabled && sd.earlyEnd) sched.earlyBird = { enabled: true, endAt: sd.earlyEnd };
  if (sd.earlyEnabled && sd.lateEnabled && sd.lateStart && sd.lateEnd) {
    sched.lateComer = { enabled: true, startAt: sd.lateStart, endAt: sd.lateEnd };
  }
  if (!sd.earlyEnabled && !sd.lateEnabled && sd.regularClose) sched.regularCloseAt = sd.regularClose;
  return sched;
}

interface RolesTiersSectionProps {
  eventId: string;
}

/**
 * Roles, tickets & application schedule. Applications open at creation and run as
 * Regular until they close (one day before the event by default). The organizer
 * optionally turns on a shared Early-bird and/or Late-comer window — the SAME timeline
 * for every accepted role; each role just carries its three prices. Late-comer requires
 * early-bird and its end becomes the hard close. Price editing is owner-only.
 */
export function RolesTiersSection({ eventId }: RolesTiersSectionProps) {
  const { isOwner, isOrganizerLevel, loading: roleLoading } = useEventStaffRole(eventId);
  const [tiers, setTiers] = useState<RoleTier[]>([]);
  const [sched, setSched] = useState<SchedState>(EMPTY_SCHED);
  const [eventDate, setEventDate] = useState<string>(""); // canonical event start (ISO)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const event = await getEventById(eventId);
      if (!active) return;
      setTiers(getDefaultRoleTiers(event));
      setEventDate((event as any)?.date || "");
      const s = event?.applicationSchedule;
      setSched({
        earlyEnabled: !!s?.earlyBird?.enabled,
        earlyEnd: s?.earlyBird?.endAt || "",
        lateEnabled: !!s?.lateComer?.enabled,
        lateStart: s?.lateComer?.startAt || "",
        lateEnd: s?.lateComer?.endAt || "",
        regularClose: s?.regularCloseAt || "",
      });
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [eventId]);

  const update = (role: string, patch: Partial<RoleTier>) => {
    setTiers(prev => prev.map(t => (t.role === role ? { ...t, ...patch } : t)));
    setMessage(null);
  };
  const patchSched = (patch: Partial<SchedState>) => {
    setSched(prev => ({ ...prev, ...patch }));
    setMessage(null);
  };

  // Synthetic event used to preview the live timeline as the organizer edits.
  const liveSchedule = useMemo(() => toSchedule(sched), [sched]);
  const previewEvent = useMemo(() => ({ date: eventDate, applicationSchedule: liveSchedule }), [eventDate, liveSchedule]);
  const eventStartMs = useMemo(() => getEventStartMs({ date: eventDate } as any), [eventDate]);
  const warnings = useMemo(() => validateApplicationSchedule(liveSchedule, eventStartMs), [liveSchedule, eventStartMs]);

  const eventStartDate = dateOnly(eventDate);
  const todayDate = useMemo(() => {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }, []);
  const defaultCloseLabel = Number.isNaN(eventStartMs) ? "the day before the event" : fmtDT(new Date(eventStartMs - ONE_DAY_MS).toISOString());

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Roles carry prices only — phase timing lives on the shared schedule.
      const cleaned = tiers.map(t => ({
        role: t.role,
        enabled: !!t.enabled,
        price: Math.max(0, Number(t.price) || 0),
        ...(t.label?.trim() ? { label: t.label.trim() } : {}),
        ...(sched.earlyEnabled && t.earlyBirdPrice != null && !Number.isNaN(Number(t.earlyBirdPrice))
          ? { earlyBirdPrice: Math.max(0, Number(t.earlyBirdPrice)) } : {}),
        ...(sched.earlyEnabled && sched.lateEnabled && t.latePrice != null && !Number.isNaN(Number(t.latePrice))
          ? { latePrice: Math.max(0, Number(t.latePrice)) } : {}),
      }));
      const schedule = toSchedule(sched);
      const closeAt = computeApplicationCloseAt({ date: eventDate, applicationSchedule: schedule } as any);
      await updateEvent(eventId, {
        roleTiers: cleaned,
        applicationSchedule: schedule,
        applicationCloseAt: Number.isFinite(closeAt) ? closeAt : (null as any),
      });
      setMessage("All changes saved");
    } catch (err: any) {
      setMessage(err?.message || "Failed to save roles.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  if (!isOrganizerLevel) {
    return (
      <Card className="glass-card border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          You don&apos;t have access to manage accepted roles for this event.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
              <Ticket className="w-[18px] h-[18px]" />
            </span>
            Roles, Tickets &amp; Schedule
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            Applications open as soon as the event is published and run at the Regular price
            until they close. Turn on Early bird / Late comer below to add discounted or
            premium windows shared across every accepted role. Seat limits are per committee.
          </p>
        </div>
        <Button onClick={save} disabled={saving} className="gap-1.5 rounded-xl shadow-sm shrink-0">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {!isOwner && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Only the event owner can change prices. You can still enable roles and set the schedule.
        </p>
      )}

      {/* Shared application schedule */}
      <div className="glass-card rounded-2xl p-4 space-y-4 border-primary/20">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="w-4 h-4 text-primary" /> Application schedule
          <span className="font-normal text-muted-foreground">· shared by all roles</span>
        </div>

        {/* Early bird */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-3">
          <div className="flex items-center gap-2.5">
            <Switch checked={sched.earlyEnabled} onCheckedChange={(v) => patchSched(v
              ? { earlyEnabled: true }
              : { earlyEnabled: false, lateEnabled: false })} aria-label="Enable early bird" />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <Sunrise className="w-3.5 h-3.5" /> Early bird
              <span className="font-normal text-muted-foreground">· from when applications open</span>
            </div>
          </div>
          {sched.earlyEnabled && (
            <div className="pl-12 space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Early bird ends</Label>
              <div className="grid grid-cols-2 gap-2">
                <DateField label="Date" value={dateOnly(sched.earlyEnd)} min={todayDate} max={eventStartDate || undefined}
                  onChange={(d) => patchSched({ earlyEnd: d ? composeDT(d, sched.earlyEnd.slice(11, 16)) : "" })} />
                <TimeField label="Time" value={sched.earlyEnd.slice(11, 16)}
                  onChange={(t) => patchSched({ earlyEnd: sched.earlyEnd ? composeDT(dateOnly(sched.earlyEnd), t) : "" })} />
              </div>
            </div>
          )}
        </div>

        {/* Late comer */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
          <div className="flex items-center gap-2.5">
            <Switch checked={sched.lateEnabled} disabled={!sched.earlyEnabled}
              onCheckedChange={(v) => patchSched({ lateEnabled: v })} aria-label="Enable late comer" />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5" /> Late comer
              <span className="font-normal text-muted-foreground">
                · {sched.earlyEnabled ? "its end closes applications" : "enable early bird first"}
              </span>
            </div>
          </div>
          {sched.earlyEnabled && sched.lateEnabled && (
            <div className="pl-12 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Late comer from</Label>
                <div className="grid grid-cols-2 gap-2">
                  <DateField label="Date" value={dateOnly(sched.lateStart)} min={dateOnly(sched.earlyEnd) || todayDate} max={eventStartDate || undefined}
                    onChange={(d) => patchSched({ lateStart: d ? composeDT(d, sched.lateStart.slice(11, 16)) : "" })} />
                  <TimeField label="Time" value={sched.lateStart.slice(11, 16)}
                    onChange={(t) => patchSched({ lateStart: sched.lateStart ? composeDT(dateOnly(sched.lateStart), t) : "" })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Late comer until (closes applications)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <DateField label="Date" value={dateOnly(sched.lateEnd)} min={dateOnly(sched.lateStart) || todayDate} max={eventStartDate || undefined}
                    onChange={(d) => patchSched({ lateEnd: d ? composeDT(d, sched.lateEnd.slice(11, 16)) : "" })} />
                  <TimeField label="Time" value={sched.lateEnd.slice(11, 16)}
                    onChange={(t) => patchSched({ lateEnd: sched.lateEnd ? composeDT(dateOnly(sched.lateEnd), t) : "" })} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Manual close — only when neither window is on */}
        {!sched.earlyEnabled && !sched.lateEnabled && (
          <div className="rounded-xl border border-border/50 bg-secondary p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <CalendarRange className="w-3.5 h-3.5 text-primary" /> Applications close
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DateField label="Date" value={dateOnly(sched.regularClose)} min={todayDate} max={eventStartDate || undefined}
                onChange={(d) => patchSched({ regularClose: d ? composeDT(d, sched.regularClose.slice(11, 16)) : "" })} />
              <TimeField label="Time" value={sched.regularClose.slice(11, 16)}
                onChange={(t) => patchSched({ regularClose: sched.regularClose ? composeDT(dateOnly(sched.regularClose), t) : "" })} />
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Leave empty to close automatically one day before the event ({defaultCloseLabel}).
            </p>
          </div>
        )}

        <SchedTimeline event={previewEvent} sched={sched} closeLabel={defaultCloseLabel} />
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-[11px] text-amber-600 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Per-role prices */}
      <div className="space-y-3">
        {tiers.map(tier => {
          const isTeam = tier.role === TEAM_ROLE;
          return (
            <div
              key={tier.role}
              className={`glass-card rounded-2xl p-4 transition-colors ${tier.enabled ? "border-primary/30" : "opacity-75"}`}
            >
              <div className="flex items-center gap-4">
                <Switch
                  checked={tier.enabled}
                  onCheckedChange={(v) => update(tier.role, { enabled: v })}
                  aria-label={`Accept ${tier.role}`}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{tier.label?.trim() || tier.role}</h3>
                  <p className="text-xs text-muted-foreground">{ROLE_HELP[tier.role] || ""}</p>
                </div>
                {tier.enabled && <NowBadge event={previewEvent} tier={tier} />}
              </div>

              {tier.enabled && (
                <div className="mt-4 pl-0 md:pl-14 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        Regular price (USD){isTeam && <span className="text-muted-foreground">· per member</span>}
                        {!isOwner && <Lock className="w-3 h-3 text-muted-foreground" />}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={tier.price}
                        disabled={!isOwner}
                        onChange={(e) => update(tier.role, { price: Number(e.target.value) })}
                        placeholder="0 = free"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Public label (optional)</Label>
                      <Input
                        value={tier.label ?? ""}
                        onChange={(e) => update(tier.role, { label: e.target.value })}
                        placeholder={tier.role}
                      />
                    </div>
                  </div>

                  {sched.earlyEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {sched.earlyEnabled && (
                        <div className="space-y-1.5">
                          <Label className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <Sunrise className="w-3 h-3" /> Early-bird price (USD){isTeam && " · /member"}
                            {!isOwner && <Lock className="w-3 h-3 text-muted-foreground" />}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={tier.earlyBirdPrice ?? ""}
                            disabled={!isOwner}
                            onChange={(e) => update(tier.role, { earlyBirdPrice: e.target.value === "" ? undefined : Number(e.target.value) })}
                            placeholder={`Defaults to $${tier.price}`}
                          />
                        </div>
                      )}
                      {sched.earlyEnabled && sched.lateEnabled && (
                        <div className="space-y-1.5">
                          <Label className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" /> Late-comer price (USD){isTeam && " · /member"}
                            {!isOwner && <Lock className="w-3 h-3 text-muted-foreground" />}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={tier.latePrice ?? ""}
                            disabled={!isOwner}
                            onChange={(e) => update(tier.role, { latePrice: e.target.value === "" ? undefined : Number(e.target.value) })}
                            placeholder={`Defaults to $${tier.price}`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center text-sm h-5 px-1">
        {saving ? (
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
          </span>
        ) : message === "All changes saved" ? (
          <span className="text-emerald-600 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> {message}
          </span>
        ) : message ? (
          <span className="text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Per-person price at a phase, mirroring eventService.rolePriceForPhase. */
function phasePrice(tier: RoleTier, phase: PricePhase): number {
  if (phase === "early") return Math.max(0, tier.earlyBirdPrice ?? tier.price ?? 0);
  if (phase === "late") return Math.max(0, tier.latePrice ?? tier.price ?? 0);
  return Math.max(0, tier.price ?? 0);
}

/** "Happening now" chip — what an applicant would pay/see for this role right now. */
function NowBadge({ event, tier }: { event: { date: string; applicationSchedule: ApplicationSchedule }; tier: RoleTier }) {
  const { phase } = getApplicationTimeline(event as any);
  if (phase === "closed") {
    return <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-secondary text-muted-foreground shrink-0">Closed</span>;
  }
  const p: PricePhase = phase === "early" ? "early" : phase === "late" ? "late" : "regular";
  const price = phasePrice(tier, p);
  const tone = p === "early" ? "bg-emerald-500/10 text-emerald-600"
    : p === "late" ? "bg-amber-500/10 text-amber-600"
    : "bg-primary/10 text-primary";
  const label = p === "early" ? "Early bird" : p === "late" ? "Late" : "Regular";
  return (
    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${tone}`}>
      Now: {label} · {price > 0 ? `$${price}` : "Free"}
    </span>
  );
}

/** Compact left-to-right timeline of the shared schedule phases. */
function SchedTimeline({ event, sched, closeLabel }: { event: { date: string; applicationSchedule: ApplicationSchedule }; sched: SchedState; closeLabel: string }) {
  const { phase: active } = getApplicationTimeline(event as any);
  const chip = (text: string, on: boolean, tone: string) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone} ${on ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-80"}`}>
      {on && <CircleDot className="w-2.5 h-2.5" />}{text}
    </span>
  );
  const sep = <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />;
  const closeText = sched.lateEnabled && sched.lateEnd ? fmtDT(sched.lateEnd)
    : !sched.earlyEnabled && !sched.lateEnabled && sched.regularClose ? fmtDT(sched.regularClose)
    : closeLabel;
  // Regular runs from early-bird end (or "now") until late-comer start (or the close).
  const regStart = sched.earlyEnabled && sched.earlyEnd ? fmtDT(sched.earlyEnd) : "now";
  const regEnd = sched.lateEnabled && sched.lateStart ? fmtDT(sched.lateStart) : closeText;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {chip("Opens now", false, "bg-secondary text-muted-foreground")}
      {sched.earlyEnabled && sched.earlyEnd && (
        <>{sep}{chip(`Early → ${fmtDT(sched.earlyEnd)}`, active === "early", "bg-emerald-500/10 text-emerald-600 ring-emerald-500/50")}</>
      )}
      {sep}
      {chip(`Regular ${regStart} → ${regEnd}`, active === "regular", "bg-primary/10 text-primary ring-primary/50")}
      {sched.lateEnabled && sched.lateStart && sched.lateEnd && (
        <>{sep}{chip(`Late ${fmtDT(sched.lateStart)} → ${fmtDT(sched.lateEnd)}`, active === "late", "bg-amber-500/10 text-amber-600 ring-amber-500/50")}</>
      )}
      {sep}
      {chip(`Closes ${closeText}`, active === "closed", "bg-secondary text-muted-foreground")}
    </div>
  );
}
