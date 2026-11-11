"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Wrench, Megaphone, Download, Smartphone, Loader2 } from "lucide-react";

// Platform tools for the App Admin: a notification to everyone / organizers / one event
// (/api/admin/broadcast), CSV exports (/api/admin/export), and the published Android version
// (/api/app/latest, the R2 manifest that android-native/tools/release.mjs writes).

type Audience = "all" | "organizers" | "event";
type Release = { versionName?: string; versionCode?: number; date?: string; notes?: string[] };

export default function AdminToolsPage() {
  const { authorized } = useAdminGuard();
  const [audience, setAudience] = useState<Audience>("organizers");
  const [eventId, setEventId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [release, setRelease] = useState<Release | null | undefined>(undefined);

  useEffect(() => {
    if (!authorized) return;
    fetch("/api/app/latest").then((r) => (r.ok ? r.json() : null)).then(setRelease).catch(() => setRelease(null));
  }, [authorized]);

  const token = async () => `Bearer ${await auth.currentUser?.getIdToken()}`;

  const send = async () => {
    const who = audience === "all" ? "EVERY member" : audience === "organizers" ? "every event owner" : `the members of event ${eventId}`;
    if (!confirm(`Send this notification to ${who}?`)) return;
    setSending(true); setSendMsg("");
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: await token() },
        body: JSON.stringify({ audience, eventId, title, body, href }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't send.");
      setSendMsg(`Sent to ${data.sent} ${data.sent === 1 ? "person" : "people"}.`);
      setTitle(""); setBody(""); setHref("");
    } catch (e: any) { setSendMsg(e.message); }
    setSending(false);
  };

  const exportCsv = async (type: string) => {
    setExporting(type);
    try {
      const res = await fetch(`/api/admin/export?type=${type}`, { headers: { Authorization: await token() } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Export failed.");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `munpilot-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { alert(e.message); }
    setExporting(null);
  };

  if (!authorized) return null;
  return (
    <div className="space-y-6 pb-20 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Wrench className="w-7 h-7" /> Tools</h1>
        <p className="text-muted-foreground mt-1">Notify members, export data, and see the published app.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5" /> Send a notification</CardTitle>
          <CardDescription>Shows in the bell on the website and as a phone alert. Up to 2,000 people per send.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["organizers", "event", "all"] as Audience[]).map((a) => (
              <Button key={a} size="sm" variant={audience === a ? "default" : "outline"} onClick={() => setAudience(a)}>
                {a === "all" ? "Everyone" : a === "organizers" ? "Event owners" : "One event"}
              </Button>
            ))}
          </div>
          {audience === "event" && (
            <div className="space-y-1.5"><Label>Event ID</Label><Input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="From Admin → Events" /></div>
          )}
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></div>
          <div className="space-y-1.5"><Label>Message</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={600} /></div>
          <div className="space-y-1.5"><Label>Link (optional)</Label><Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="/dashboard/organizer/pro" /></div>
          <div className="flex items-center gap-3">
            <Button onClick={send} disabled={sending || !title.trim() || !body.trim() || (audience === "event" && !eventId.trim())}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Send
            </Button>
            {sendMsg && <span className="text-sm text-muted-foreground">{sendMsg}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="w-5 h-5" /> Export CSV</CardTitle>
          <CardDescription>Up to 5,000 rows each. Every export is written to the audit log.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[["users", "Members"], ["payments", "Payments"], ["payouts", "Payouts"], ["plans", "Event plans"]].map(([t, label]) => (
            <Button key={t} variant="outline" disabled={exporting !== null} onClick={() => exportCsv(t)}>
              {exporting === t ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}{label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5" /> Android app</CardTitle>
          <CardDescription>The version phones update to. Releases are published with android-native/tools/release.mjs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {release === undefined ? <p className="text-muted-foreground">Loading…</p> : !release ? <p className="text-muted-foreground">No release published.</p> : (
            <>
              <p><Badge>{release.versionName}</Badge> <span className="text-muted-foreground">build {release.versionCode}{release.date ? ` · ${release.date}` : ""}</span></p>
              {release.notes?.length ? <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">{release.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled jobs</CardTitle>
          <CardDescription>Run by the server&apos;s scheduler (Coolify), each with the CRON_SECRET.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p><code>/api/cron/close-stale-sittings</code> · daily: closes sittings left open.</p>
          <p><code>/api/cron/scheduled-announcements</code> · every 15 min: sends announcements whose time has come.</p>
          <p><code>/api/cron/waitlist-offers</code> · hourly: expires 48-hour seat offers and offers the next in line.</p>
          <p><code>/api/cron/complaint-sla</code> · every 6 hours: escalates complaints with no action for 48 hours.</p>
        </CardContent>
      </Card>
    </div>
  );
}
