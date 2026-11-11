"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, updateEvent, isUserCoOrganizer, getEventCapacity, EventData, MarkingTemplate, MarkingMode } from "@/lib/services/eventService";
import { DEFAULT_OVERALL_WEIGHT, clamp } from "@/lib/services/markingScore";
import { deleteField } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, UtensilsCrossed, Bus, Hotel, Shirt, Pencil, ClipboardList, Plus, Trash2 } from "lucide-react";
import { CreateEventDialog } from "@/components/features/organizer/CreateEventDialog";

const OPTIONAL_MODULES: { key: string; label: string; description: string; icon: React.ElementType; color: string }[] = [
  { key: "food", label: "Food Coupons", description: "Meal slots and food coupons for delegates", icon: UtensilsCrossed, color: "text-orange-500" },
  { key: "transport", label: "Transport", description: "Shuttle routes with pickup/dropoff and capacity", icon: Bus, color: "text-blue-500" },
  { key: "accommodation", label: "Accommodation", description: "Hotel room blocks and booking requests", icon: Hotel, color: "text-primary" },
  { key: "dresscode", label: "Dress Code", description: "Attire guidance and reference images", icon: Shirt, color: "text-green-500" },
];

export default function EventDetailsPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    targetAudience: "",
    website: "",
    contactEmail: "",
    instagramHandle: "",
    twitterHandle: "",
    facebookUrl: "",
    linkedinUrl: "",
  });
  const [modules, setModules] = useState<string[]>([]);
  const [templates, setTemplates] = useState<MarkingTemplate[]>([]);
  const [overallWeight, setOverallWeight] = useState<number>(DEFAULT_OVERALL_WEIGHT);
  const [markingDaysStr, setMarkingDaysStr] = useState<string>("");
  const [markingMode, setMarkingMode] = useState<MarkingMode>("decimal");

  useEffect(() => {
    async function loadData() {
      if (!user || !eventId) return;
      const eventData = await getEventById(eventId);
      const allowed = !!eventData &&
        (eventData.organizerId === user.uid || await isUserCoOrganizer(eventId, user.uid));
      if (!allowed) {
        router.push("/dashboard/organizer/events");
        return;
      }
      setEvent(eventData);
      setForm({
        targetAudience: eventData.targetAudience || "",
        website: eventData.website || "",
        contactEmail: eventData.contactEmail || "",
        instagramHandle: eventData.socialMedia?.instagram || "",
        twitterHandle: eventData.socialMedia?.twitter || "",
        facebookUrl: eventData.socialMedia?.facebook || "",
        linkedinUrl: eventData.socialMedia?.linkedin || "",
      });
      // Normalize legacy "live_mun" key to "livemun".
      setModules((eventData.optionalModules || []).map(m => (m === "live_mun" ? "livemun" : m)));
      setTemplates(eventData.markingTemplates || []);
      setOverallWeight(eventData.scoringConfig?.overallWeight ?? DEFAULT_OVERALL_WEIGHT);
      setMarkingDaysStr((eventData.scoringConfig?.markingDays || []).join(", "));
      setMarkingMode(eventData.scoringConfig?.markingMode === "binary" ? "binary" : "decimal");
      setLoading(false);
    }
    loadData();
  }, [user, eventId, router]);

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSuccess(false);
  };

  // Refresh the cached event after the Edit event modal saves (title/date/cover/etc.).
  const reload = async () => {
    const updated = await getEventById(eventId);
    if (updated) setEvent(updated);
  };

  const toggleModule = (key: string, on: boolean) => {
    setModules(prev => (on ? [...new Set([...prev, key])] : prev.filter(m => m !== key)));
    setSuccess(false);
  };

  // ── Marking templates (score columns for the chair Marking matrix) ───────────
  const newTemplateId = () =>
    (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t_${Date.now()}_${templates.length}`);
  const addTemplate = () => {
    // Every criterion is scored -100..+100; maxScore stays 100 (auto-fill cap fallback).
    setTemplates(prev => [...prev, { id: newTemplateId(), name: "", maxScore: 100 }]);
    setSuccess(false);
  };
  const addStarterSet = () => {
    setTemplates(prev => [
      ...prev,
      ...["Debate & Speeches", "Diplomacy & Lobbying", "Documentation", "Conduct & Discipline"].map(name => ({ id: newTemplateId(), name, maxScore: 100 })),
    ]);
    setSuccess(false);
  };
  const updateTemplate = (idx: number, patch: Partial<MarkingTemplate>) => {
    setTemplates(prev => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    setSuccess(false);
  };
  const removeTemplate = (idx: number) => {
    setTemplates(prev => prev.filter((_, i) => i !== idx));
    setSuccess(false);
  };

  async function handleSave() {
    if (!event) return;
    setSaving(true);
    try {
      const payload: Partial<EventData> = {
        // Auto-derived from committee capacities (single source of truth = committees).
        expectedDelegates: getEventCapacity(event),
        // A blank field removes the value; `undefined` is dropped by the client
        // (ignoreUndefinedProperties), so clearing used to keep the old value.
        targetAudience: form.targetAudience.trim() || (deleteField() as any),
        website: form.website.trim() || (deleteField() as any),
        contactEmail: form.contactEmail.trim() || (deleteField() as any),
        socialMedia: {
          ...(form.instagramHandle.trim() && { instagram: form.instagramHandle.trim() }),
          ...(form.twitterHandle.trim() && { twitter: form.twitterHandle.trim() }),
          ...(form.facebookUrl.trim() && { facebook: form.facebookUrl.trim() }),
          ...(form.linkedinUrl.trim() && { linkedin: form.linkedinUrl.trim() }),
        },
        optionalModules: modules,
        markingTemplates: templates
          .filter(t => t.name.trim())
          // Fixed -100..+100 scale; maxScore pinned to 100 (the +100 ceiling / auto-fill cap fallback).
          .map(t => ({ ...t, name: t.name.trim(), maxScore: 100 })),
        scoringConfig: {
          overallWeight: clamp(Number.isFinite(overallWeight) ? overallWeight : DEFAULT_OVERALL_WEIGHT, 0, 1),
          markingMode,
          ...((() => {
            const days = markingDaysStr
              .split(",")
              .map(s => s.trim())
              .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
            return days.length ? { markingDays: Array.from(new Set(days)).sort() } : {};
          })()),
        },
      };
      await updateEvent(eventId, payload);
      setSuccess(true);
      const updated = await getEventById(eventId);
      if (updated) setEvent(updated);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save:", err);
      alert("Failed to save event details.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-12 w-1/2" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="space-y-8 max-w-4xl pb-20">
      {/* Header — name/date/cover live in the Edit event modal; deadlines moved to Financials */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Event Details</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Extra info, modules, and quick edits for {event.title}.</p>
        </div>
        <CreateEventDialog
          mode="edit"
          initialEvent={event}
          onSuccess={() => reload()}
          trigger={
            <Button variant="outline" className="gap-2 rounded-lg shrink-0">
              <Pencil className="w-4 h-4" /> Edit event
            </Button>
          }
        />
      </div>

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-200 text-sm font-medium">
          ✓ Changes saved successfully
        </div>
      )}

      {/* Expected Delegates & Audience */}
      <Card className="glass-card border-border/40">
        <CardHeader>
          <CardTitle className="text-lg">Delegate Information</CardTitle>
          <CardDescription>Expected number and type of delegates attending</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Expected Delegates</label>
              <div className="h-10 flex items-center px-3 rounded-lg border border-border/40 bg-secondary text-sm font-semibold tabular-nums">
                {getEventCapacity(event)}
              </div>
              <p className="text-xs text-muted-foreground">Auto-calculated from the sum of all committee capacities</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Target Audience</label>
              <Input
                placeholder="e.g., University Students and School Students"
                value={form.targetAudience}
                onChange={(e) => handleChange("targetAudience", e.target.value)}
                className="rounded-lg"
              />
              <p className="text-xs text-muted-foreground">Who should apply for this event</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Website & Social Media */}
      <Card className="glass-card border-border/40">
        <CardHeader>
          <CardTitle className="text-lg">Web & Social Media</CardTitle>
          <CardDescription>Links to your event's online presence</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Website</label>
            <Input
              placeholder="https://yourevent.com"
              value={form.website}
              onChange={(e) => handleChange("website", e.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Contact Email</label>
            <Input
              type="email"
              placeholder="organizers@yourevent.com"
              value={form.contactEmail}
              onChange={(e) => handleChange("contactEmail", e.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                📷 Instagram
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">@</span>
                <Input
                  placeholder="handle"
                  value={form.instagramHandle}
                  onChange={(e) => handleChange("instagramHandle", e.target.value)}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                𝕏 Twitter/X
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">@</span>
                <Input
                  placeholder="handle"
                  value={form.twitterHandle}
                  onChange={(e) => handleChange("twitterHandle", e.target.value)}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                f Facebook
              </label>
              <Input
                placeholder="https://facebook.com/yourpage"
                value={form.facebookUrl}
                onChange={(e) => handleChange("facebookUrl", e.target.value)}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                in LinkedIn
              </label>
              <Input
                placeholder="https://linkedin.com/company/yourpage"
                value={form.linkedinUrl}
                onChange={(e) => handleChange("linkedinUrl", e.target.value)}
                className="rounded-lg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Optional Modules */}
      <Card id="optional-modules" className="glass-card border-border/40 scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-lg">Optional Modules</CardTitle>
          <CardDescription>Enable extra services for this event. Manage their content under Event → Modules.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {OPTIONAL_MODULES.map(({ key, label, description, icon: Icon, color }) => {
            const on = modules.includes(key);
            return (
              <div key={key} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border/40 bg-secondary">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">{description}</p>
                  </div>
                </div>
                <Switch checked={on} onCheckedChange={(v) => toggleModule(key, v)} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Marking Templates — score columns for the chair Marking matrix */}
      <Card className="glass-card border-border/40">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" /> Marking Templates
          </CardTitle>
          <CardDescription>
            Score criteria chairs use to grade delegates. Each becomes a column in the chair Marking matrix —
            chairs can&apos;t score anyone until at least one exists.{" "}
            {markingMode === "binary" ? (
              <>Every criterion is scored on a{" "}
              <span className="font-medium text-foreground">&minus;1 / 0 / +1</span> scale (&minus;1 = negative, 0 =
              neutral, +1 = positive), min-max normalised to 0&ndash;100% (0 = 50%).</>
            ) : (
              <>Every criterion is scored on a{" "}
              <span className="font-medium text-foreground">&minus;100 to +100</span> scale (use negatives to penalise
              invalid points, out-of-order motions or disruption).</>
            )}{" "}
            The daily&nbsp;% is the average of the criteria a chair actually scores that day. Optionally auto-fill a
            column from live-session participation (chairs still review &amp; can override).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Marking pattern — the scale chairs score on for this whole event */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl border border-border/40 bg-secondary">
            <div className="flex-1">
              <p className="text-sm font-medium">Marking pattern</p>
              <p className="text-[11px] text-muted-foreground">
                {markingMode === "binary"
                  ? "Chairs score each criterion as −1 / 0 / +1 (fast tally-style)."
                  : "Chairs score each criterion on a −100…+100 numeric scale."}
              </p>
            </div>
            <div className="w-full sm:w-40">
              <Select value={markingMode} onValueChange={v => { setMarkingMode(v as MarkingMode); setSuccess(false); }}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="decimal">Decimal (−100…+100)</SelectItem>
                  <SelectItem value="binary">Binary (−1 / 0 / +1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {templates.length === 0 && (
            <div className="text-sm text-muted-foreground rounded-xl border border-dashed border-border/50 p-4 text-center">
              No marking templates yet. Chairs see &ldquo;No marking templates defined&rdquo; until you add one.
            </div>
          )}

          {templates.map((t, idx) => (
            <div key={t.id} className="flex flex-col sm:flex-row sm:items-end gap-2 p-3 rounded-xl border border-border/40 bg-secondary">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Criterion</label>
                <Input value={t.name} placeholder="e.g. Debate" onChange={e => updateTemplate(idx, { name: e.target.value })} className="rounded-lg" />
              </div>
              <div className="w-full sm:w-24 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Range</label>
                <div className="h-9 flex items-center px-3 rounded-lg border border-border/40 bg-secondary text-xs text-muted-foreground tabular-nums">{markingMode === "binary" ? "−1 / 0 / +1" : "−100…+100"}</div>
              </div>
              <div className="w-full sm:w-44 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Auto-fill from</label>
                <Select
                  value={t.autoFillFrom || "none"}
                  onValueChange={v => updateTemplate(idx, { autoFillFrom: !v || v === "none" ? undefined : (v as MarkingTemplate["autoFillFrom"]) })}
                >
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Manual only</SelectItem>
                    <SelectItem value="speeches">GSL speeches</SelectItem>
                    <SelectItem value="caucusSpeeches">Caucus speeches</SelectItem>
                    <SelectItem value="allSpeeches">All speeches (GSL + caucus)</SelectItem>
                    <SelectItem value="speakingMinutes">Speaking minutes</SelectItem>
                    <SelectItem value="pointsRaised">Points raised</SelectItem>
                    <SelectItem value="points">Points recognized</SelectItem>
                    <SelectItem value="motionsProposed">Motions proposed</SelectItem>
                    <SelectItem value="motions">Motions carried</SelectItem>
                    <SelectItem value="votesCast">Votes cast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {t.autoFillFrom && (
                <div className="w-full sm:w-20 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cap</label>
                  <Input
                    type="number" min={1} value={t.autoFillCap ?? ""} placeholder={String(t.maxScore)}
                    onChange={e => updateTemplate(idx, { autoFillCap: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="rounded-lg"
                  />
                </div>
              )}
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500 shrink-0" onClick={() => removeTemplate(idx)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={addTemplate}>
              <Plus className="w-4 h-4" /> Add template
            </Button>
            {templates.length === 0 && (
              <Button variant="ghost" size="sm" onClick={addStarterSet}>Add starter set</Button>
            )}
            {templates.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                <span className="font-semibold text-foreground">{templates.length}</span> criteria · daily&nbsp;% = average of scored criteria
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Scoring config — final-day blend + optional explicit day set */}
      <Card className="glass-card border-border/40">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" /> Final Scoring
          </CardTitle>
          <CardDescription>
            The final score is a <span className="font-medium text-foreground">consistency-first</span> average of a
            delegate&apos;s daily&nbsp;% across every conference day (a missed day counts as 0%). On the final day a chair
            can also enter a manual holistic <span className="font-medium text-foreground">overall</span> mark
            ({markingMode === "binary" ? "−1 / 0 / +1" : "−100…+100"}) that blends in by the weight below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="w-full sm:w-56 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Chair overall weight</label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={1} step={0.05} value={overallWeight}
                  onChange={e => { setOverallWeight(parseFloat(e.target.value)); setSuccess(false); }}
                  className="flex-1 accent-primary"
                />
                <span className="text-sm font-semibold tabular-nums w-12 text-right">{Math.round(overallWeight * 100)}%</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                final = {Math.round((1 - overallWeight) * 100)}% computed + {Math.round(overallWeight * 100)}% chair overall
              </p>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Conference days <span className="opacity-60">(optional override)</span></label>
              <Input
                value={markingDaysStr}
                placeholder="Auto-derived from marks — e.g. 2026-07-01, 2026-07-02, 2026-07-03"
                onChange={e => { setMarkingDaysStr(e.target.value); setSuccess(false); }}
                className="rounded-lg"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to derive days from marked dates. Set explicit <span className="font-mono">YYYY-MM-DD</span> dates
                (comma-separated) to count absent days toward consistency.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-2 pt-4 border-t border-border/30">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 rounded-lg"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Details
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
