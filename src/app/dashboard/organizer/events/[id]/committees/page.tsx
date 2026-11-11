"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, updateEvent, isUserCoOrganizer, cascadeCommitteeRename, getCommitteeChoicesAllowed, getCommitteeAgendas, getCommitteeDifficulties, EventData, Committee, CommitteeDifficulty } from "@/lib/services/eventService";
import { useEventPlan } from "@/lib/hooks/useEventPlan";
import { getApplicationsByEvent } from "@/lib/services/applicationService";
import { belongsToCommittee } from "@/lib/utils/committee";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryPicker } from "@/components/ui/CountryPicker";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountry } from "@/lib/data/countries";
import { COMMITTEE_TEMPLATES, CommitteeTemplate } from "@/lib/data/committeeTemplates";
import {
  Landmark, Users, Globe2, Plus, Edit2, Trash2, Save, Loader2, AlertTriangle,
  Sparkles, FileText, ChevronRight, ListChecks, Minus,
} from "lucide-react";

type Mode = "scratch" | "template";

const DIFFICULTY_OPTIONS: CommitteeDifficulty[] = ["Beginner", "Intermediate", "Advanced"];

/** Circular seat-fill gauge. filled / capacity → percentage ring. */
function SeatRing({ filled, capacity }: { filled: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((filled / capacity) * 100)) : 0;
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 100 ? "text-emerald-500" : pct >= 75 ? "text-amber-500" : "text-primary";
  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} strokeWidth="4" className="fill-none stroke-secondary/25" />
        <circle
          cx="22" cy="22" r={r} strokeWidth="4" strokeLinecap="round"
          stroke="currentColor"
          className={`fill-none ${color} transition-[stroke-dashoffset] duration-500`}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-bold tabular-nums">{pct}%</span>
    </div>
  );
}

export default function CommitteeManagementPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { plan } = useEventPlan(eventId);
  const { user } = useAuth();
  const router = useRouter();

  const [event, setEvent] = useState<EventData | null>(null);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [approvedApps, setApprovedApps] = useState<{ assignedCommittee?: string; choices?: { primary?: { committee?: string } } }[]>([]);
  const [committeeChoices, setCommitteeChoices] = useState(1);
  const [savingChoices, setSavingChoices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isTemplateChooserOpen, setIsTemplateChooserOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [mode, setMode] = useState<Mode>("scratch");
  const [formData, setFormData] = useState({
    name: "",
    capacity: "",
    countries: [] as string[],
    difficulties: ["Beginner"] as CommitteeDifficulty[],
    agendas: [] as string[],
    description: "",
  });

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
      setCommittees(eventData.committees || []);
      setCommitteeChoices(getCommitteeChoicesAllowed(eventData));

      // Seat-fill needs approved applications, counted per committee.
      const apps = await getApplicationsByEvent(eventId);
      setApprovedApps(apps.filter(a => a.status === "approved"));
      setLoading(false);
    }
    loadData();
  }, [user, eventId, router]);

  // committee name → number of approved delegates placed there.
  const filledByCommittee = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of committees) {
      map[c.name] = approvedApps.filter(a => belongsToCommittee(a, c.name)).length;
    }
    return map;
  }, [committees, approvedApps]);

  const maxChoices = Math.max(1, committees.length);

  const handleSetChoices = async (n: number) => {
    const val = Math.min(maxChoices, Math.max(1, n));
    if (val === committeeChoices) return;
    setCommitteeChoices(val);
    setSavingChoices(true);
    try {
      await updateEvent(eventId, { committeeChoicesAllowed: val });
    } catch (error) {
      console.error("Error saving committee choices:", error);
    } finally {
      setSavingChoices(false);
    }
  };

  const openScratchDialog = (index: number | null = null) => {
    if (index !== null) {
      const committee = committees[index];
      const difficulties = getCommitteeDifficulties(committee);
      setFormData({
        name: committee.name,
        capacity: committee.capacity?.toString() || "",
        countries: (committee.countries ?? []).map(c => getCountry(c)?.code ?? c.toLowerCase()),
        difficulties: difficulties.length ? difficulties : ["Beginner"],
        agendas: getCommitteeAgendas(committee),
        description: committee.description ?? "",
      });
      setEditingIndex(index);
    } else {
      setFormData({ name: "", capacity: "", countries: [], difficulties: ["Beginner"], agendas: [], description: "" });
      setEditingIndex(null);
    }
    setMode("scratch");
    setIsDialogOpen(true);
  };

  const startFromScratch = () => {
    setIsTemplateChooserOpen(false);
    openScratchDialog(null);
  };

  const applyTemplate = (template: CommitteeTemplate) => {
    const cap = template.recommendedCapacity ?? template.countries.length;
    const trimmed = template.countries.slice(0, cap);
    setFormData({
      name: template.name,
      capacity: cap.toString(),
      countries: trimmed,
      difficulties: ["Beginner"],
      agendas: [],
      description: template.description ?? "",
    });
    setEditingIndex(null);
    setMode("template");
    setIsTemplateChooserOpen(false);
    setIsDialogOpen(true);
  };

  const handleSaveCommittee = async () => {
    if (!formData.name.trim()) return;

    const cap = parseInt(formData.capacity) || 0;
    // De-dupe difficulties (keep option order); fall back to Beginner if none picked.
    const difficulties = DIFFICULTY_OPTIONS.filter(d => formData.difficulties.includes(d));
    const effectiveDifficulties = difficulties.length ? difficulties : (["Beginner"] as CommitteeDifficulty[]);
    const agendas = formData.agendas.map(a => a.trim()).filter(Boolean);
    const newCommittee: Committee = {
      name: formData.name.trim(),
      capacity: cap,
      countries: formData.countries.filter(Boolean).slice(0, cap || formData.countries.length),
      difficulties: effectiveDifficulties,
      // Legacy mirror so older readers still work.
      difficulty: effectiveDifficulties[0],
    };
    const description = formData.description.trim();
    if (agendas.length) {
      newCommittee.agendas = agendas;
      newCommittee.topic = agendas[0]; // legacy mirror
    }
    if (description) newCommittee.description = description;

    const oldName = editingIndex !== null ? committees[editingIndex].name : null;
    let updatedCommittees = [...committees];
    if (editingIndex !== null) {
      updatedCommittees[editingIndex] = newCommittee;
    } else {
      updatedCommittees.push(newCommittee);
    }

    // The event's plan caps how many committees it may have (eventPlan.ts; the rules hold it too).
    if (editingIndex === null && plan?.committees != null && updatedCommittees.length > plan.committees) {
      alert(`This event's plan allows ${plan.committees} committees. Make it Pro, or ask for more room, under Plan.`);
      return;
    }
    setSaving(true);
    try {
      await updateEvent(eventId, { committees: updatedCommittees });
      // Renaming a committee must cascade to delegates/staff/markings/results/study guide.
      if (oldName && oldName !== newCommittee.name) {
        await cascadeCommitteeRename(eventId, oldName, newCommittee.name);
      }
      setCommittees(updatedCommittees);
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error saving committee:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCommittee = async () => {
    if (editingIndex === null) return;
    const updatedCommittees = committees.filter((_, i) => i !== editingIndex);

    setSaving(true);
    try {
      await updateEvent(eventId, { committees: updatedCommittees });
      setCommittees(updatedCommittees);
      setIsDeleteDialogOpen(false);
      setEditingIndex(null);
    } catch (error) {
      console.error("Error deleting committee:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-20">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Committees</h1>
          <p className="text-muted-foreground mt-1">
            Build from scratch or start with a premade template — UNSC, UNDP, and more.
          </p>
        </div>
        {committees.length > 0 && (
          <Button onClick={() => setIsTemplateChooserOpen(true)} className="gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Create Committee
          </Button>
        )}
      </div>

      {committees.length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
                <ListChecks className="w-[18px] h-[18px]" />
              </span>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Committee choices per applicant
                  {savingChoices && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How many committees an applicant ranks on the form (each with its own ranked
                  countries). 1 = single committee. {`Max ${maxChoices} (you have ${committees.length} committee${committees.length === 1 ? "" : "s"}).`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl"
                onClick={() => handleSetChoices(committeeChoices - 1)} disabled={savingChoices || committeeChoices <= 1} aria-label="Fewer choices">
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-10 text-center text-lg font-bold tabular-nums">{committeeChoices}</span>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl"
                onClick={() => handleSetChoices(committeeChoices + 1)} disabled={savingChoices || committeeChoices >= maxChoices} aria-label="More choices">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {committees.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
              <Landmark className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Committees Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              Pick a UN-standard template like UNSC or UNDP, or build your own from scratch.
            </p>
            <Button onClick={() => setIsTemplateChooserOpen(true)} className="gap-2 shadow-sm">
              <Plus className="w-4 h-4" /> Create Committee
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {committees.map((committee, idx) => (
            <Card key={idx} className="glass-card hover:shadow-sm transition-shadow flex flex-col">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1.5 min-w-0">
                    <CardTitle className="text-xl">{committee.name}</CardTitle>
                    {getCommitteeDifficulties(committee).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {getCommitteeDifficulties(committee).map(d => (
                          <Badge key={d} variant="secondary" className="text-[10px] uppercase tracking-wider">{d}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openScratchDialog(idx)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => { setEditingIndex(idx); setIsDeleteDialogOpen(true); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1">
                {getCommitteeAgendas(committee).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      {getCommitteeAgendas(committee).length > 1 ? "Agendas" : "Topic"}
                    </h4>
                    <ul className="space-y-1">
                      {getCommitteeAgendas(committee).map((a, i) => (
                        <li key={i} className="text-sm text-foreground/80 line-clamp-2">
                          {getCommitteeAgendas(committee).length > 1 && <span className="text-muted-foreground mr-1">{i + 1}.</span>}
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-secondary p-3 rounded-xl border border-border/40 flex items-center gap-3">
                    <SeatRing filled={filledByCommittee[committee.name] || 0} capacity={committee.capacity || 0} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                        <Users className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wider">Seats</span>
                      </div>
                      <p className="text-lg font-semibold leading-none">
                        {filledByCommittee[committee.name] || 0}
                        <span className="text-sm font-normal text-muted-foreground"> / {committee.capacity || "N/A"}</span>
                      </p>
                    </div>
                  </div>
                  <div className="bg-secondary p-3 rounded-xl border border-border/40">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Globe2 className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Countries</span>
                    </div>
                    <p className="text-lg font-semibold">{committee.countries?.length || 0}</p>
                  </div>
                </div>

                {committee.countries && committee.countries.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Delegation</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {committee.countries.slice(0, 18).map((c, i) => (
                        <CountryFlag key={`${c}-${i}`} code={c} size={20} title={getCountry(c)?.name ?? c} />
                      ))}
                      {committee.countries.length > 18 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{committee.countries.length - 18} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Template Chooser Dialog */}
      <Dialog open={isTemplateChooserOpen} onOpenChange={setIsTemplateChooserOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Pick a Committee Template
            </DialogTitle>
            <DialogDescription>
              Start from a UN-standard committee. You'll be able to edit the name, capacity, and country roster after selecting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
              Start from a template
            </p>
            {COMMITTEE_TEMPLATES.map(template => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                className="w-full text-left rounded-xl border border-border/40 bg-secondary hover:bg-secondary hover:border-primary/40 transition-all p-4 group"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <h3 className="font-semibold truncate">{template.name}</h3>
                      <Badge variant="outline" className="text-[10px]">{template.shortName}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>

                <div className="flex items-center gap-3 mt-3">
                  <span className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{template.countries.length}</strong> countries
                  </span>
                  {template.groups && (
                    <span className="text-xs text-muted-foreground">
                      <strong className="text-foreground">{template.groups.length}</strong> blocks
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 mt-3">
                  {template.countries.slice(0, 24).map((c, i) => (
                    <CountryFlag key={`${c}-${i}`} code={c} size={18} />
                  ))}
                  {template.countries.length > 24 && (
                    <Badge variant="secondary" className="text-[10px] h-[18px]">
                      +{template.countries.length - 24}
                    </Badge>
                  )}
                </div>
              </button>
            ))}

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border/50" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Or</span>
              <span className="h-px flex-1 bg-border/50" />
            </div>

            {/* Build from scratch */}
            <button
              type="button"
              onClick={startFromScratch}
              className="w-full text-left rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-secondary transition-all p-4 group flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">Build your own from scratch</h3>
                <p className="text-xs text-muted-foreground">
                  Set the name, capacity, and pick the country roster yourself.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTemplateChooserOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit / Template-Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border/40">
            <DialogTitle className="flex items-center gap-2">
              {mode === "template" && <Sparkles className="w-5 h-5 text-primary" />}
              {editingIndex !== null ? "Edit Committee" : mode === "template" ? "Customize Template" : "Create Committee"}
            </DialogTitle>
            <DialogDescription>
              {mode === "template"
                ? "Tweak the template's name, capacity, and country roster before saving."
                : "Configure the details, capacity, and available countries for this committee."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Committee Name</Label>
                <Input
                  placeholder="e.g., UNSC, DISEC, WHO"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Total Capacity</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g., 50"
                  value={formData.capacity}
                  onChange={e => {
                    const next = e.target.value;
                    const nextCap = parseInt(next) || 0;
                    setFormData(prev => ({
                      ...prev,
                      capacity: next,
                      countries: nextCap > 0 ? prev.countries.slice(0, nextCap) : prev.countries,
                    }));
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Capacity is the maximum number of delegates. Add countries up to this number.
            </p>

            <div className="space-y-2">
              <Label>Difficulty <span className="text-xs font-normal text-muted-foreground">(pick one or more)</span></Label>
              <div className="flex flex-wrap gap-2">
                {DIFFICULTY_OPTIONS.map(d => {
                  const active = formData.difficulties.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        difficulties: active
                          ? prev.difficulties.filter(x => x !== d)
                          : [...prev.difficulties, d],
                      }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        active
                          ? "bg-primary/10 border-primary/40 text-foreground"
                          : "bg-background border-border/40 text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Topics / Agendas</Label>
              <div className="space-y-2">
                {formData.agendas.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder={`Agenda ${i + 1} — e.g., Regulating Antibiotic Resistance`}
                      value={a}
                      onChange={e => setFormData(prev => {
                        const next = [...prev.agendas];
                        next[i] = e.target.value;
                        return { ...prev, agendas: next };
                      })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setFormData(prev => ({ ...prev, agendas: prev.agendas.filter((_, idx) => idx !== i) }))}
                      aria-label={`Remove agenda ${i + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setFormData(prev => ({ ...prev, agendas: [...prev.agendas, ""] }))}
                >
                  <Plus className="w-4 h-4" /> Add agenda
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Short summary of the committee's mandate and agenda..."
                rows={4}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
              <AiTextareaAssist
                value={formData.description}
                onPick={(t) => setFormData(prev => ({ ...prev, description: t }))}
                surface="committee-description"
                context={{ committee: formData.name }}
              />
            </div>

            <div className="space-y-2">
              <Label>Delegation Roster</Label>
              <CountryPicker
                value={formData.countries}
                onChange={countries => setFormData({ ...formData, countries })}
                max={parseInt(formData.capacity) || undefined}
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 shrink-0 border-t border-border/40 bg-background">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveCommittee} disabled={saving || !formData.name.trim()} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete Committee
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to delete the <strong>{editingIndex !== null ? committees[editingIndex]?.name : ""}</strong> committee?</p>
            <p className="text-sm text-muted-foreground mt-2">
              {(() => {
                const n = editingIndex !== null ? filledByCommittee[committees[editingIndex]?.name] || 0 : 0;
                return n > 0
                  ? `${n} delegate${n === 1 ? " is" : "s are"} seated in it and will need a new seat. `
                  : "";
              })()}
              This will remove the committee from the event. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCommittee} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
