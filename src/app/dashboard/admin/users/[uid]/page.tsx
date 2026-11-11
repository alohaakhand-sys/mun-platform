"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BadgeCheck } from "lucide-react";

// One member for the App Admin (/api/admin/users/[uid]): role, Verified organizer badge, their
// own Free-events and AI-a-day numbers (blank = the platform default), AI used today, their
// events with plans, and payouts. Changes go through the server, which writes the audit entry.

type Detail = {
  uid: string; name: string; email: string; disabled: boolean; role: string; verifiedOrganizer: boolean;
  freeEvents: number | null; aiDailyQuota: number | null; defaults: { freeEvents: number; aiDailyQuota: number };
  aiUsedToday: number; events: { id: string; title: string; status: string; plan: string }[];
  payouts: { id: string; amount: number; status: string; requestedAt: number | null }[];
};

async function call(path: string, body?: unknown) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function AdminUserDetailPage() {
  const { uid } = useParams() as { uid: string };
  const { authorized } = useAdminGuard();
  const [d, setD] = useState<Detail | null>(null);
  const [freeEvents, setFreeEvents] = useState("");
  const [aiQuota, setAiQuota] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const data: Detail = await call(`/api/admin/users/${uid}`);
      setD(data);
      setFreeEvents(data.freeEvents == null ? "" : String(data.freeEvents));
      setAiQuota(data.aiDailyQuota == null ? "" : String(data.aiDailyQuota));
    } catch (e: any) { setMsg(e.message); }
  }, [uid]);
  useEffect(() => { if (authorized) void load(); }, [authorized, load]);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true); setMsg("");
    try { await call(`/api/admin/users/${uid}`, patch); await load(); setMsg("Saved."); } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  };
  const status = async (action: "disable" | "enable" | "delete") => {
    const reason = action === "enable" ? "" : prompt(action === "delete"
      ? `Delete ${d?.name || d?.email}'s account for good? Type a reason to confirm.`
      : `Disable ${d?.name || d?.email}? Reason (shown in the audit log):`);
    if (reason === null) return;
    if (action === "delete" && !reason.trim()) return;
    setSaving(true); setMsg("");
    try {
      await call(`/api/admin/users/${uid}/status`, { action, reason });
      if (action === "delete") { window.location.href = "/dashboard/admin/users"; return; }
      await load(); setMsg(action === "disable" ? "Account disabled." : "Account enabled.");
    } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  if (!authorized) return null;
  return (
    <div className="space-y-6 max-w-3xl pb-20">
      <Link href="/dashboard/admin/users" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4 mr-1" /> Users</Link>
      {!d ? (msg ? <p className="text-sm text-destructive">{msg}</p> : <Skeleton className="h-48 rounded-xl" />) : (
        <>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              {d.name || d.email || d.uid}{d.verifiedOrganizer && <BadgeCheck className="w-6 h-6 text-primary" />}
            </h1>
            <p className="text-muted-foreground mt-1">{d.email} · <Badge variant="outline">{d.role}</Badge>{d.disabled && <Badge variant="destructive" className="ml-2">Disabled</Badge>}</p>
          </div>

          <Card>
            <CardHeader><CardTitle>Plan settings for this member</CardTitle><CardDescription>Blank uses the platform default.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between text-sm">
                <span>Verified organizer badge</span>
                <Switch checked={d.verifiedOrganizer} disabled={saving} onCheckedChange={(v) => save({ verifiedOrganizer: v })} />
              </label>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Free events at once</Label>
                  <Input type="number" min={0} value={freeEvents} placeholder={`Default ${d.defaults.freeEvents}`} onChange={(e) => setFreeEvents(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>AI uses a day</Label>
                  <Input type="number" min={0} value={aiQuota} placeholder={`Default ${d.defaults.aiDailyQuota}`} onChange={(e) => setAiQuota(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Used today: {d.aiUsedToday}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button disabled={saving} onClick={() => save({ freeEvents: num(freeEvents), aiDailyQuota: num(aiQuota) })}>{saving ? "Saving…" : "Save"}</Button>
                {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Disabling signs them out within the hour and blocks sign-in. Deleting removes the login and profile; their applications stay as history.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {d.disabled ? (
                <Button variant="outline" disabled={saving} onClick={() => status("enable")}>Enable account</Button>
              ) : (
                <Button variant="outline" disabled={saving} onClick={() => status("disable")}>Disable account</Button>
              )}
              <Button variant="destructive" disabled={saving} onClick={() => status("delete")}>Delete account</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Events they own</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.events.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : d.events.map((e) => (
                <div key={e.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                  <span>{e.title || e.id} <span className="text-muted-foreground capitalize">· {e.status}</span></span>
                  <Badge variant="outline">{e.plan}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Payouts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.payouts.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : d.payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                  <span>${p.amount.toLocaleString()} <span className="text-muted-foreground">· {p.requestedAt ? new Date(p.requestedAt).toLocaleDateString() : "—"}</span></span>
                  <Badge variant="outline" className="capitalize">{p.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
