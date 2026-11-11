"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import type {
  UserProfile, ExperienceEntry, EducationEntry, AwardEntry,
} from "@/lib/services/userService";

type SavePatch = Partial<UserProfile>;

/**
 * Each dialog is mounted ONLY while open (parent removes it on close), so state
 * is initialised straight from props with `useState` — no reset effect needed.
 */
export interface ProfileDialogProps {
  profile: UserProfile;
  onSave: (patch: SavePatch) => Promise<void>;
  onClose: () => void;
}

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/** Dialog shell that owns the saving/error state and a Save button. */
function EditShell({
  title, description, onSubmit, onClose, wide, children,
}: {
  title: string;
  description?: string;
  onSubmit: () => Promise<void>;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={wide ? "max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1 -mr-1 space-y-4">{children}</div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// Intro/About/Contact editing moved to inline click-to-edit in ProfileView.
// Only the array-based editors (experience/education/awards) remain as dialogs.

/* ------------------------------ Experience ------------------------------ */

export function ExperienceDialog({ profile, onSave, onClose }: ProfileDialogProps) {
  const [items, setItems] = useState<ExperienceEntry[]>(
    profile.experience?.length ? profile.experience.map((e) => ({ ...e })) : []
  );

  const update = (id: string, patch: Partial<ExperienceEntry>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const add = () => setItems((prev) => [...prev, { id: newId(), org: "", roleTitle: "", startDate: "" }]);

  return (
    <EditShell
      title="MUN experience"
      description="Conferences chaired, society roles, delegations led."
      wide
      onClose={onClose}
      onSubmit={async () => {
        const cleaned = items
          .map((it) => ({ ...it, org: it.org.trim(), roleTitle: it.roleTitle.trim() }))
          .filter((it) => it.org || it.roleTitle);
        await onSave({ experience: cleaned });
      }}
    >
      {items.length === 0 && <p className="text-sm text-muted-foreground">No experience yet. Add your first entry.</p>}
      {items.map((it) => (
        <div key={it.id} className="rounded-xl border border-border/60 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entry</p>
            <button type="button" onClick={() => remove(it.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove entry">
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role / title"><Input value={it.roleTitle} onChange={(e) => update(it.id, { roleTitle: e.target.value })} placeholder="Head Delegate" /></Field>
            <Field label="Organization"><Input value={it.org} onChange={(e) => update(it.id, { org: e.target.value })} placeholder="IUBAT MUN Society" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Start"><Input value={it.startDate} onChange={(e) => update(it.id, { startDate: e.target.value })} placeholder="Oct 2024" /></Field>
            <Field label="End"><Input value={it.endDate || ""} onChange={(e) => update(it.id, { endDate: e.target.value })} placeholder="Present" disabled={it.current} /></Field>
            <Field label="Location"><Input value={it.location || ""} onChange={(e) => update(it.id, { location: e.target.value })} placeholder="Dhaka" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!it.current} onCheckedChange={(v) => update(it.id, { current: !!v, endDate: v ? "" : it.endDate })} />
            I currently hold this role
          </label>
          <Field label="Description">
            <textarea
              className="flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={it.description || ""}
              onChange={(e) => update(it.id, { description: e.target.value })}
              placeholder="What you did in this role…"
            />
            <AiTextareaAssist
              value={it.description || ""}
              onPick={(t) => update(it.id, { description: t })}
              surface="profile-bio"
              className="mt-1"
            />
          </Field>
        </div>
      ))}
      <Button variant="outline" onClick={add} className="w-full gap-1.5">
        <Plus className="size-4" /> Add experience
      </Button>
    </EditShell>
  );
}

/* ------------------------------- Education ------------------------------ */

export function EducationDialog({ profile, onSave, onClose }: ProfileDialogProps) {
  const [items, setItems] = useState<EducationEntry[]>(
    profile.education?.length ? profile.education.map((e) => ({ ...e })) : []
  );

  const update = (id: string, patch: Partial<EducationEntry>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const add = () => setItems((prev) => [...prev, { id: newId(), school: "" }]);

  return (
    <EditShell
      title="Education"
      wide
      onClose={onClose}
      onSubmit={async () => {
        const cleaned = items.map((it) => ({ ...it, school: it.school.trim() })).filter((it) => it.school);
        await onSave({ education: cleaned });
      }}
    >
      {items.length === 0 && <p className="text-sm text-muted-foreground">No education yet. Add your first entry.</p>}
      {items.map((it) => (
        <div key={it.id} className="rounded-xl border border-border/60 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entry</p>
            <button type="button" onClick={() => remove(it.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove entry">
              <Trash2 className="size-4" />
            </button>
          </div>
          <Field label="School"><Input value={it.school} onChange={(e) => update(it.id, { school: e.target.value })} placeholder="University name" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Degree"><Input value={it.degree || ""} onChange={(e) => update(it.id, { degree: e.target.value })} placeholder="BSc" /></Field>
            <Field label="Field"><Input value={it.field || ""} onChange={(e) => update(it.id, { field: e.target.value })} placeholder="Civil Engineering" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start year"><Input value={it.startYear || ""} onChange={(e) => update(it.id, { startYear: e.target.value })} placeholder="2019" /></Field>
            <Field label="End year"><Input value={it.endYear || ""} onChange={(e) => update(it.id, { endYear: e.target.value })} placeholder="2023" /></Field>
          </div>
          <Field label="Activities"><Input value={it.activities || ""} onChange={(e) => update(it.id, { activities: e.target.value })} placeholder="MUN Society (President), Debate Club" /></Field>
        </div>
      ))}
      <Button variant="outline" onClick={add} className="w-full gap-1.5">
        <Plus className="size-4" /> Add education
      </Button>
    </EditShell>
  );
}

/* -------------------------------- Awards -------------------------------- */

export function AwardsDialog({ profile, onSave, onClose }: ProfileDialogProps) {
  const [items, setItems] = useState<AwardEntry[]>(
    profile.awards?.length ? profile.awards.map((a) => ({ ...a })) : []
  );

  const update = (id: string, patch: Partial<AwardEntry>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const add = () => setItems((prev) => [...prev, { id: newId(), title: "" }]);

  return (
    <EditShell
      title="Honors & awards"
      description="Add awards earned outside this platform. Awards from events you competed in appear automatically."
      wide
      onClose={onClose}
      onSubmit={async () => {
        const cleaned = items.map((it) => ({ ...it, title: it.title.trim() })).filter((it) => it.title);
        await onSave({ awards: cleaned });
      }}
    >
      {items.length === 0 && <p className="text-sm text-muted-foreground">No manual awards yet.</p>}
      {items.map((it) => (
        <div key={it.id} className="rounded-xl border border-border/60 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Award</p>
            <button type="button" onClick={() => remove(it.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove award">
              <Trash2 className="size-4" />
            </button>
          </div>
          <Field label="Title"><Input value={it.title} onChange={(e) => update(it.id, { title: e.target.value })} placeholder="Best Delegate — UNSC" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issuer"><Input value={it.issuer || ""} onChange={(e) => update(it.id, { issuer: e.target.value })} placeholder="BUP MUN" /></Field>
            <Field label="Date"><Input value={it.date || ""} onChange={(e) => update(it.id, { date: e.target.value })} placeholder="Jan 2026" /></Field>
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={add} className="w-full gap-1.5">
        <Plus className="size-4" /> Add award
      </Button>
    </EditShell>
  );
}
