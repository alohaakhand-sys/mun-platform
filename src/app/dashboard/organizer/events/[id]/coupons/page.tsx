"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEventPlan } from "@/lib/hooks/useEventPlan";
import { ProGate } from "@/components/ProGate";
import { getCoupons, saveCoupon, deleteCoupon, type Coupon, type CouponKind } from "@/lib/services/optionalModulesService";
import { AUDIENCE_GROUPS, audienceLabel, type AudienceGroup } from "@/lib/data/passAudience";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, PlusCircle, Ticket, Trash2, Pause, Play, ScanLine, X } from "lucide-react";

// Custom coupons (setup/qr-passes-plan.md, phase P3, Pro): a welcome kit, a T-shirt, a drink, an
// extra meal, for chosen groups or named people. Everyone claims them with their one QR pass; the
// scanner picks the coupon and the server counts each use.

const KINDS: { key: CouponKind; label: string }[] = [
  { key: "kit", label: "Kit" }, { key: "gift", label: "Gift" }, { key: "drink", label: "Drink" },
  { key: "meal", label: "Extra meal" }, { key: "other", label: "Other" },
];
const EMPTY: Coupon = { title: "", kind: "kit", audience: { groups: ["delegate"] }, usesPerPerson: 1, active: true };
type Person = { uid: string; name: string; role: string; committee: string };

export default function CouponsPage() {
  const eventId = useParams().id as string;
  const { user } = useAuth();
  const { plan } = useEventPlan(eventId);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [error, setError] = useState("");

  const load = () => getCoupons(eventId).then(setCoupons);
  useEffect(() => { load(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(c: Coupon) {
    try { await saveCoupon(eventId, { ...c, active: !c.active }, user!.uid); load(); } catch (e: any) { setError(e.message); }
  }
  async function remove(c: Coupon) {
    if (!confirm(`Delete "${c.title}"? Uses already recorded stay in the report.`)) return;
    try { await deleteCoupon(eventId, c.id!); load(); } catch (e: any) { setError(e.message); }
  }

  if (!plan) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Ticket className="w-7 h-7" /> Coupons</h1>
          <p className="text-muted-foreground mt-1">Kits, gifts, drinks and extra meals, claimed with each person&apos;s QR pass.</p>
        </div>
        {plan.features.passes && (
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href={`/dashboard/scan/${eventId}`} />} nativeButton={false}><ScanLine className="w-4 h-4 mr-1.5" /> Scan</Button>
            <Button onClick={() => setEditing({ ...EMPTY, audience: { groups: ["delegate"] } })}><PlusCircle className="w-4 h-4 mr-1.5" /> New coupon</Button>
          </div>
        )}
      </div>

      <ProGate feature="Custom coupons" allowed={plan.features.passes}>
        <Card>
          <CardContent className="p-0">
            {coupons === null ? <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              : coupons.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">No coupons yet. Make one for a welcome kit, a T-shirt or a gala drink.</p>
              : (
                <div className="divide-y divide-border/50">
                  {coupons.map((c) => (
                    <div key={c.id} className={`flex items-center gap-3 p-4 ${c.active ? "" : "opacity-60"}`}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium flex items-center gap-2">{c.title}{!c.active && <Badge variant="secondary">Paused</Badge>}</p>
                        <p className="text-xs text-muted-foreground">
                          {[KINDS.find((k) => k.key === c.kind)?.label, c.day, c.timeWindow, c.venue].filter(Boolean).join(" · ")}
                        </p>
                        <p className="text-xs text-muted-foreground">{audienceLabel(c.audience, [])}{c.usesPerPerson > 1 ? ` · ${c.usesPerPerson} each` : ""}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                      <Button size="icon" variant="ghost" title={c.active ? "Pause" : "Resume"} onClick={() => toggle(c)}>{c.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</Button>
                      <Button size="icon" variant="ghost" className="text-destructive" title="Delete" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>
      </ProGate>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {editing && <CouponDialog eventId={eventId} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CouponDialog({ eventId, initial, onClose, onSaved }: { eventId: string; initial: Coupon; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [c, setC] = useState<Coupon>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [q, setQ] = useState("");
  const groups = c.audience.groups || [];
  const uids = c.audience.uids || [];

  // Named people come from the server's roster (profile names), loaded once.
  useEffect(() => {
    (async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/passes/people?eventId=${encodeURIComponent(eventId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      setPeople(res.ok ? (await res.json()).people : []);
    })();
  }, [eventId]);
  const nameOf = (uid: string) => people?.find((p) => p.uid === uid)?.name || "Someone";
  const found = q.trim().length < 2 ? [] : (people || []).filter((p) => !uids.includes(p.uid) && p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6);
  const setAudience = (g: AudienceGroup[], u: string[]) => setC({ ...c, audience: { groups: g, ...(u.length ? { uids: u } : {}) } });

  async function save() {
    setSaving(true); setError("");
    try { await saveCoupon(eventId, { ...c, title: c.title.trim() }, user!.uid); onSaved(); }
    catch (e: any) { setError(e.message || "Couldn't save."); setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{c.id ? "Edit coupon" : "New coupon"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5"><Label>Title</Label><Input value={c.title} maxLength={80} onChange={(e) => setC({ ...c, title: e.target.value })} placeholder="e.g. Welcome kit" /></div>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => <Button key={k.key} type="button" size="sm" variant={c.kind === k.key ? "default" : "outline"} onClick={() => setC({ ...c, kind: k.key })}>{k.label}</Button>)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Day</Label><Input value={c.day || ""} onChange={(e) => setC({ ...c, day: e.target.value })} placeholder="Any day" /></div>
            <div className="space-y-1.5"><Label>Time</Label><Input value={c.timeWindow || ""} onChange={(e) => setC({ ...c, timeWindow: e.target.value })} placeholder="Any time" /></div>
            <div className="space-y-1.5"><Label>Where</Label><Input value={c.venue || ""} onChange={(e) => setC({ ...c, venue: e.target.value })} placeholder="Help desk" /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Who gets it</Label>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCE_GROUPS.map((g) => {
                const on = groups.includes(g.key);
                return <Button key={g.key} type="button" size="sm" variant={on ? "default" : "outline"} onClick={() => setAudience(on ? groups.filter((x) => x !== g.key) : [...groups, g.key], uids)}>{g.label}</Button>;
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>And these people</Label>
            {uids.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {uids.map((u) => (
                  <Badge key={u} variant="secondary" className="gap-1">{nameOf(u)}<button type="button" aria-label="Remove" onClick={() => setAudience(groups, uids.filter((x) => x !== u))}><X className="w-3 h-3" /></button></Badge>
                ))}
              </div>
            )}
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={people === null ? "Loading people…" : "Search a name to add"} disabled={people === null} />
            {found.map((p) => (
              <button key={p.uid} type="button" className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-secondary" onClick={() => { setAudience(groups, [...uids, p.uid]); setQ(""); }}>
                {p.name} <span className="text-xs text-muted-foreground">{[p.role, p.committee].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
          <div className="space-y-1.5 w-40"><Label>Uses per person</Label><Input type="number" min={1} max={20} value={c.usesPerPerson} onChange={(e) => setC({ ...c, usesPerPerson: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !c.title.trim() || (groups.length === 0 && uids.length === 0)}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
