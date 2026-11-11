"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Check, Sparkles } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/ui/TagInput";
import type { UserProfile } from "@/lib/services/userService";
import { SectionCard } from "./_shared";
import {
  getSkillEndorsers, hasEndorsed, toggleEndorsement, slugifySkill, type SkillEndorser,
} from "@/lib/services/reputationService";

type SkillState = { count: number; endorsed: boolean; endorsers: SkillEndorser[] };

export function SkillsSection({
  profile, editable, viewerUid, canEndorse, onSave,
}: {
  profile: UserProfile;
  editable: boolean;
  viewerUid?: string;
  canEndorse: boolean;
  onSave: (patch: Partial<UserProfile>) => Promise<void>;
}) {
  const skills = profile.skills || [];
  const interests = profile.interests || [];

  const [editing, setEditing] = useState(false);
  const [draftSkills, setDraftSkills] = useState<string[]>(skills);
  const [draftInterests, setDraftInterests] = useState<string[]>(interests);
  const [savingEdit, setSavingEdit] = useState(false);
  const [state, setState] = useState<Record<string, SkillState>>({});
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const counts = profile.endorsementCounts || {};
      const entries = await Promise.all(
        skills.map(async (s) => {
          const slug = slugifySkill(s);
          const [endorsers, mine] = await Promise.all([
            getSkillEndorsers(profile.uid, slug, 3),
            canEndorse && viewerUid ? hasEndorsed(viewerUid, profile.uid, slug) : Promise.resolve(false),
          ]);
          return [slug, { count: Math.max(0, counts[slug] || 0), endorsed: mine, endorsers }] as const;
        })
      );
      if (alive) setState(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
    // re-run when the skill set or viewer changes
  }, [profile.uid, skills.join("|"), canEndorse, viewerUid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onToggle(skill: string) {
    if (!canEndorse) return;
    const slug = slugifySkill(skill);
    setPending(slug);
    try {
      const res = await toggleEndorsement(profile.uid, skill);
      const endorsers = await getSkillEndorsers(profile.uid, slug, 3);
      setState((prev) => ({
        ...prev,
        [slug]: {
          count: Math.max(0, (prev[slug]?.count || 0) + (res.endorsed ? 1 : -1)),
          endorsed: res.endorsed,
          endorsers,
        },
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setPending(null);
    }
  }

  async function saveEdits() {
    setSavingEdit(true);
    try {
      await onSave({ skills: draftSkills, interests: draftInterests });
      setEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingEdit(false);
    }
  }

  const hasContent = skills.length > 0 || interests.length > 0;
  if (!editable && !hasContent) return null;

  return (
    <SectionCard
      title="Skills & Interests"
      onEdit={editable ? () => { setDraftSkills(skills); setDraftInterests(interests); setEditing((v) => !v); } : undefined}
      editLabel={editing ? "Close" : hasContent ? "Edit" : "Add"}
    >
      {editing ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1.5">Skills</p>
            <TagInput value={draftSkills} onChange={setDraftSkills} placeholder="Diplomacy, Public Speaking…" />
          </div>
          <div>
            <p className="text-sm font-medium mb-1.5">Interests</p>
            <TagInput value={draftInterests} onChange={setDraftInterests} placeholder="Foreign Policy, Crisis…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={savingEdit}>Cancel</Button>
            <Button size="sm" onClick={saveEdits} disabled={savingEdit} className="gap-1.5">
              {savingEdit && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </div>
        </div>
      ) : (
        <>
          {skills.length > 0 ? (
            <div className="flex flex-col divide-y divide-border/50">
              {skills.map((s) => {
                const slug = slugifySkill(s);
                const st = state[slug];
                const count = st?.count ?? Math.max(0, (profile.endorsementCounts || {})[slug] || 0);
                return (
                  <div key={s} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px] leading-tight">{s}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {st?.endorsers?.length ? (
                          <AvatarGroup>
                            {st.endorsers.map((e) => (
                              <Avatar key={e.uid} size="sm" className="w-5 h-5">
                                <AvatarImage src={e.photoURL || ""} alt={e.name} />
                                <AvatarFallback className="text-[9px]">{(e.name || "?").charAt(0).toUpperCase()}</AvatarFallback>
                              </Avatar>
                            ))}
                          </AvatarGroup>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {count > 0 ? `Endorsed by ${count}` : "No endorsements yet"}
                        </span>
                      </div>
                    </div>
                    {canEndorse && (
                      <Button
                        variant={st?.endorsed ? "secondary" : "outline"}
                        size="sm"
                        className="gap-1.5 shrink-0"
                        disabled={pending === slug}
                        onClick={() => onToggle(s)}
                      >
                        {pending === slug ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : st?.endorsed ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                        {st?.endorsed ? "Endorsed" : "Endorse"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {editable ? "Add skills so peers can endorse them." : "No skills listed."}
            </p>
          )}
          {interests.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2">
              {interests.map((i) => (
                <Badge key={i} variant="outline" className="gap-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  {i}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
