"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isAppAdminProfile } from "@/lib/utils/roles";
import { auth } from "@/lib/firebase/client";
import { getSystemSettings, updateSystemSettings, SystemSettings } from "@/lib/services/systemSettingsService";
import { logAudit } from "@/lib/services/auditService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";

export default function SystemSettingsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  
  useEffect(() => {
    if (authLoading) return;
    if (!profile || !isAppAdminProfile(profile as any)) {
      router.push("/dashboard");
      return;
    }
    
    async function load() {
      try {
        const data = await getSystemSettings();
        setSettings(data);
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile, authLoading, router]);

  const handleSave = async (tabName: string) => {
    if (!settings || !profile) return;
    setSaving(true);
    setSaveStatus("saving");
    try {
      await updateSystemSettings(settings);
      await logAudit({
        actorUid: profile.uid,
        actorEmail: profile.email || "",
        actorRole: profile.role,
        action: "system_settings_updated",
        targetType: "systemSettings",
        targetId: "global",
        targetName: `${tabName} Settings`,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveStatus("idle");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof SystemSettings, value: any) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);
    setSaveStatus("idle");
  };

  if (loading || authLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!settings) return null;

  return (
    <div className="space-y-8 pb-20 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          <p className="text-muted-foreground mt-1">Configure global platform behavior.</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "saved" && <span className="text-sm text-green-500 flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> Saved</span>}
          {saveStatus === "saving" && <span className="text-sm text-muted-foreground flex items-center gap-1"><Loader2 className="w-4 h-4 animate-spin"/> Saving...</span>}
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="bg-background border border-border/50 p-1 rounded-2xl h-auto mb-6">
          <TabsTrigger value="general" className="rounded-xl py-2 px-5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">General</TabsTrigger>
          <TabsTrigger value="pricing" className="rounded-xl py-2 px-5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Pricing</TabsTrigger>
          <TabsTrigger value="maintenance" className="rounded-xl py-2 px-5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0 space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>General Configuration</CardTitle>
              <CardDescription>Basic settings for the platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Support Email</Label>
                <Input 
                  value={settings.supportEmail} 
                  onChange={(e) => updateSetting("supportEmail", e.target.value)}
                  placeholder="support@example.com"
                />
                <p className="text-xs text-muted-foreground">Where &quot;Support&quot; in everyone&apos;s profile menu sends them.</p>
              </div>
              <Button onClick={() => handleSave("General")} disabled={saving}>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing" className="mt-0 space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Pricing & Limits</CardTitle>
              <CardDescription>Configure platform fees and hard limits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Platform Fee Percentage ({settings.platformFeePercent}%)</Label>
                <input 
                  type="range" 
                  min="0" max="15" step="0.5"
                  value={settings.platformFeePercent}
                  onChange={(e) => updateSetting("platformFeePercent", parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                The fee above is the Free events&apos; cut of ticket revenue, taken off the organizer&apos;s wallet.
              </p>
              <div className="border-t border-border/40 pt-5 space-y-4">
                <h3 className="text-sm font-semibold">Pro events &amp; Free limits</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {([
                    ["proEventPrice", "Pro price per event (USD)", "Paid upfront to make one event Pro."],
                    ["proFeePercent", "Pro events' platform fee (%)", "Taken off Pro events' ticket revenue."],
                    ["freeParticipantCap", "Free: participants per event", "Approved delegates, observers and advisors (staff don't count)."],
                    ["freeCommitteeCap", "Free: committees per event", ""],
                    ["freeEventCap", "Free: published events at once", "Upcoming or running Free events per organizer."],
                    ["freeAiDailyQuota", "AI uses per person per day", "AI inside a Pro event doesn't count."],
                  ] as const).map(([key, label, hint]) => (
                    <div key={key} className="space-y-1.5">
                      <Label>{label}</Label>
                      <Input
                        type="number" min={0}
                        value={settings[key] ?? ""}
                        onChange={(e) => updateSetting(key, e.target.value === "" ? (undefined as any) : Number(e.target.value))}
                      />
                      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={() => handleSave("Pricing")} disabled={saving}>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="mt-0 space-y-6">
          <Card className="glass-card border-destructive/20">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2"><ShieldAlert className="w-5 h-5"/> Maintenance Mode</CardTitle>
              <CardDescription>Affects all non-admin users immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between border border-destructive/20 bg-destructive/5 p-4 rounded-xl">
                <div className="space-y-0.5">
                  <Label className="text-base text-destructive font-semibold">Enable Maintenance Mode</Label>
                  <p className="text-sm text-muted-foreground">Locks out regular users and displays the maintenance message.</p>
                </div>
                <Switch 
                  checked={settings.maintenanceMode}
                  onCheckedChange={(val) => updateSetting("maintenanceMode", val)}
                />
              </div>
              <div className="space-y-2">
                <Label>Maintenance Message</Label>
                <Textarea 
                  value={settings.maintenanceMessage}
                  onChange={(e) => updateSetting("maintenanceMessage", e.target.value)}
                  rows={3}
                />
              </div>
              <Button onClick={() => handleSave("Maintenance")} disabled={saving} variant={settings.maintenanceMode ? "destructive" : "default"}>
                Save Maintenance Settings
              </Button>
            </CardContent>
          </Card>
          <MarkingRepairCard />
          <MembersBackfillCard />
        </TabsContent>

      </Tabs>
    </div>
  );
}

/**
 * Runs the marking-doc repair (api/admin/repair-markings) page by page. Marks saved through the
 * committee hub's matrix before 2026-10-25 were stored under literal "scores.<id>" fields that no
 * reader sees; this moves them where they belong. Safe to run again: a clean doc is skipped.
 */
function MarkingRepairCard() {
  const [state, setState] = useState<{ running: boolean; scanned: number; repaired: number; done: boolean; error?: string }>(
    { running: false, scanned: 0, repaired: 0, done: false },
  );
  const run = async () => {
    setState({ running: true, scanned: 0, repaired: 0, done: false });
    let after: string | null = null;
    let scanned = 0, repaired = 0;
    try {
      do {
        const idToken = await auth.currentUser?.getIdToken();
        const res: Response = await fetch("/api/admin/repair-markings", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
          body: JSON.stringify(after ? { after } : {}),
        });
        if (!res.ok) throw new Error(`Repair failed (${res.status})`);
        const page: { scanned: number; repaired: number; next: string | null } = await res.json();
        scanned += page.scanned; repaired += page.repaired; after = page.next;
        setState({ running: true, scanned, repaired, done: false });
      } while (after);
      setState({ running: false, scanned, repaired, done: true });
    } catch (e) {
      setState({ running: false, scanned, repaired, done: false, error: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Repair marking records</CardTitle>
        <CardDescription>
          Moves chair marks that an earlier version stored under the wrong field back into the scores delegates and
          results read. Feedback overwritten by that version cannot be recovered. Safe to run more than once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={run} disabled={state.running}>
          {state.running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {state.running ? "Repairing…" : "Run repair"}
        </Button>
        {(state.scanned > 0 || state.done) && (
          <p className="text-sm text-muted-foreground">
            {state.scanned} records checked, {state.repaired} repaired{state.done ? ". Done." : "…"}
          </p>
        )}
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Builds every event's membership markers (api/admin/backfill-members), page by page. The live
 * read rules let only members, staff and admins read sessions and committee papers; run this
 * BEFORE those rules reach a project, and again any time to reconcile. Safe to repeat.
 */
function MembersBackfillCard() {
  const [state, setState] = useState<{ running: boolean; events: number; members: number; done: boolean; error?: string }>(
    { running: false, events: 0, members: 0, done: false },
  );
  const run = async () => {
    setState({ running: true, events: 0, members: 0, done: false });
    let after: string | null = null;
    let events = 0, members = 0;
    try {
      do {
        const idToken = await auth.currentUser?.getIdToken();
        const res: Response = await fetch("/api/admin/backfill-members", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
          body: JSON.stringify(after ? { after } : {}),
        });
        if (!res.ok) throw new Error(`Backfill failed (${res.status})`);
        const page: { events: number; members: number; next: string | null } = await res.json();
        events += page.events; members += page.members; after = page.next;
        setState({ running: true, events, members, done: false });
      } while (after);
      setState({ running: false, events, members, done: true });
    } catch (e) {
      setState({ running: false, events, members, done: false, error: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Build event membership</CardTitle>
        <CardDescription>
          Writes the membership record each conference&apos;s live sessions and papers are checked against (organizer,
          accepted staff, approved applicants). Run it before the live read rules are deployed, and any time to
          reconcile. Safe to run more than once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={run} disabled={state.running}>
          {state.running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {state.running ? "Building…" : "Build membership"}
        </Button>
        {(state.events > 0 || state.done) && (
          <p className="text-sm text-muted-foreground">
            {state.events} events, {state.members} members{state.done ? ". Done." : "…"}
          </p>
        )}
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </CardContent>
    </Card>
  );
}
