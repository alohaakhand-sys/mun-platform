"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, EventData } from "@/lib/services/eventService";
import { getApplicationsByEvent } from "@/lib/services/applicationService";
import { AUDIENCE_GROUPS, DEFAULT_MEAL_AUDIENCE, audienceLabel, type AudienceGroup } from "@/lib/data/passAudience";
import {
  FoodSlot, TransportRoute, AccommodationBlock, AccommodationRequest, LiveSession, DressCode,
  getFoodSlots, getTransportRoutes, getAccommodationBlocks, getAccommodationRequests, getDressCode,
  addFoodSlot, updateFoodSlot, deleteFoodSlot,
  addTransportRoute, deleteTransportRoute,
  addAccommodationBlock, deleteAccommodationBlock, approveAccommodationRequest,
  addLiveSession, updateLiveSession, deleteLiveSession,
  saveDressCode,
} from "@/lib/services/optionalModulesService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  UtensilsCrossed, Bus, Hotel, Radio, Shirt, PlusCircle, Trash2, CheckCircle2, XCircle, Loader2, Layers, Settings,
  Coffee, Utensils, Cookie, Wine, Plane, Building2, MapPin, MoonStar, BedSingle, BedDouble, Users, Crown,
  Landmark, ShieldAlert, Globe2, Newspaper, Flame, SquarePen, Briefcase, Flag, Sparkles,
} from "lucide-react";

type ModuleKey = "food" | "transport" | "accommodation" | "livemun" | "dresscode";

/* ---------------- template picker ---------------- */
type Tpl<T> = { label: string; icon: React.ElementType; tint: string; values: T };

function TemplatePicker<T>({ templates, active, onPick }: { templates: Tpl<T>[]; active: string | null; onPick: (t: Tpl<T>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" /> Quick start — pick a template
      </p>
      <div className="grid grid-cols-3 gap-2">
        {templates.map((t, i) => {
          const isActive = active === t.label;
          return (
            <motion.button
              key={t.label}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onPick(t)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center transition-colors",
                isActive ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border/50 hover:border-primary/40 hover:bg-secondary"
              )}
            >
              <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", t.tint)}>
                <t.icon className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-medium leading-tight">{t.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

const CUSTOM_TINT = "bg-secondary text-foreground/70";

const FOOD_TEMPLATES: Tpl<Omit<FoodSlot, "id">>[] = [
  { label: "Breakfast", icon: Coffee, tint: "bg-amber-500/10 text-amber-600", values: { mealName: "Breakfast", timeWindow: "08:00 – 09:30", venue: "", day: "" } },
  { label: "Lunch", icon: UtensilsCrossed, tint: "bg-orange-500/10 text-orange-500", values: { mealName: "Lunch", timeWindow: "12:30 – 14:00", venue: "", day: "" } },
  { label: "Dinner", icon: Utensils, tint: "bg-rose-500/10 text-rose-500", values: { mealName: "Dinner", timeWindow: "19:00 – 21:00", venue: "", day: "" } },
  { label: "Tea & Snacks", icon: Cookie, tint: "bg-yellow-500/10 text-yellow-600", values: { mealName: "Tea & Snacks", timeWindow: "16:00 – 16:30", venue: "", day: "" } },
  { label: "Gala Dinner", icon: Wine, tint: "bg-primary/10 text-primary", values: { mealName: "Gala Dinner", timeWindow: "20:00 – 23:00", venue: "", day: "" } },
  { label: "Custom", icon: SquarePen, tint: CUSTOM_TINT, values: { mealName: "", timeWindow: "", venue: "", day: "" } },
];

type RouteVals = Omit<TransportRoute, "id" | "registeredDelegates">;
const ROUTE_TEMPLATES: Tpl<RouteVals>[] = [
  { label: "Airport Shuttle", icon: Plane, tint: "bg-sky-500/10 text-sky-500", values: { routeName: "Airport → Venue", pickupPoint: "Airport", dropoffPoint: "Venue", departureTime: "", returnTime: "", capacity: 30 } },
  { label: "Hotel → Venue", icon: Building2, tint: "bg-blue-500/10 text-blue-500", values: { routeName: "Hotel → Venue", pickupPoint: "Hotel Lobby", dropoffPoint: "Venue", departureTime: "08:00", returnTime: "18:00", capacity: 40 } },
  { label: "Venue → Hotel", icon: MapPin, tint: "bg-primary/10 text-primary", values: { routeName: "Venue → Hotel", pickupPoint: "Venue", dropoffPoint: "Hotel Lobby", departureTime: "18:00", returnTime: "", capacity: 40 } },
  { label: "Social Night", icon: MoonStar, tint: "bg-primary/10 text-primary", values: { routeName: "Venue → Social Night", pickupPoint: "Venue", dropoffPoint: "Social Venue", departureTime: "20:00", returnTime: "23:30", capacity: 50 } },
  { label: "City Tour", icon: Globe2, tint: "bg-emerald-500/10 text-emerald-600", values: { routeName: "City Tour", pickupPoint: "Hotel Lobby", dropoffPoint: "City Center", departureTime: "10:00", returnTime: "13:00", capacity: 25 } },
  { label: "Custom", icon: SquarePen, tint: CUSTOM_TINT, values: { routeName: "", pickupPoint: "", dropoffPoint: "", departureTime: "", returnTime: "", capacity: 20 } },
];

const ACC_TEMPLATES: Tpl<Omit<AccommodationBlock, "id">>[] = [
  { label: "Single Room", icon: BedSingle, tint: "bg-blue-500/10 text-blue-500", values: { blockName: "Single Room", roomType: "Single", pricePerNight: 60, availableRooms: 10 } },
  { label: "Twin Sharing", icon: BedDouble, tint: "bg-primary/10 text-primary", values: { blockName: "Twin Sharing", roomType: "Twin", pricePerNight: 40, availableRooms: 15 } },
  { label: "Triple Sharing", icon: Users, tint: "bg-primary/10 text-primary", values: { blockName: "Triple Sharing", roomType: "Triple", pricePerNight: 30, availableRooms: 10 } },
  { label: "Suite", icon: Crown, tint: "bg-amber-500/10 text-amber-600", values: { blockName: "Executive Suite", roomType: "Suite", pricePerNight: 120, availableRooms: 4 } },
  { label: "Dormitory", icon: Hotel, tint: "bg-emerald-500/10 text-emerald-600", values: { blockName: "Dormitory", roomType: "Dorm", pricePerNight: 18, availableRooms: 30 } },
  { label: "Custom", icon: SquarePen, tint: CUSTOM_TINT, values: { blockName: "", roomType: "", pricePerNight: 0, availableRooms: 0 } },
];

const SESSION_TEMPLATES: Tpl<Omit<LiveSession, "id">>[] = [
  { label: "General Assembly", icon: Globe2, tint: "bg-blue-500/10 text-blue-500", values: { title: "General Assembly", committeeName: "GA", currentSpeaker: "", topic: "", status: "idle" } },
  { label: "Security Council", icon: ShieldAlert, tint: "bg-rose-500/10 text-rose-500", values: { title: "Security Council", committeeName: "UNSC", currentSpeaker: "", topic: "", status: "idle" } },
  { label: "Crisis Committee", icon: Flame, tint: "bg-orange-500/10 text-orange-500", values: { title: "Crisis Committee", committeeName: "Crisis", currentSpeaker: "", topic: "", status: "idle" } },
  { label: "ECOSOC", icon: Landmark, tint: "bg-emerald-500/10 text-emerald-600", values: { title: "ECOSOC", committeeName: "ECOSOC", currentSpeaker: "", topic: "", status: "idle" } },
  { label: "Press Corps", icon: Newspaper, tint: "bg-primary/10 text-primary", values: { title: "Press Corps", committeeName: "Press", currentSpeaker: "", topic: "", status: "idle" } },
  { label: "Custom", icon: SquarePen, tint: CUSTOM_TINT, values: { title: "", committeeName: "", currentSpeaker: "", topic: "", status: "idle" } },
];

const DRESS_TEMPLATES: Tpl<string>[] = [
  { label: "Business Formal", icon: Briefcase, tint: "bg-secondary text-slate-500", values: "Delegates are expected to wear Western Business Formal attire — suits, blazers, ties, formal dresses, and closed dress shoes. Equivalent national formal wear is welcome." },
  { label: "Western Formal", icon: Shirt, tint: "bg-blue-500/10 text-blue-500", values: "Western Business Attire is required for all committee sessions. Gentlemen: suit and tie. Ladies: formal suit, blouse, or modest formal dress." },
  { label: "National Dress", icon: Flag, tint: "bg-rose-500/10 text-rose-500", values: "Delegates are encouraged to wear their National or Cultural Dress, representing their heritage with pride. Formal attire is the alternative." },
  { label: "Smart Casual", icon: Coffee, tint: "bg-amber-500/10 text-amber-600", values: "Smart Casual is acceptable for socials and informal sessions — collared shirts, neat trousers, modest dresses. No shorts, flip-flops, or athletic wear." },
  { label: "Thematic Gala", icon: Wine, tint: "bg-primary/10 text-primary", values: "For the Gala Night, delegates may wear thematic formal attire — black-tie, evening gowns, or themed elegant outfits as announced." },
  { label: "Custom", icon: SquarePen, tint: CUSTOM_TINT, values: "" },
];

const MODULE_CONFIG: Record<ModuleKey, { label: string; icon: React.ElementType; color: string }> = {
  food: { label: "Food Coupons", icon: UtensilsCrossed, color: "text-orange-500" },
  transport: { label: "Transport", icon: Bus, color: "text-blue-500" },
  accommodation: { label: "Accommodation", icon: Hotel, color: "text-primary" },
  livemun: { label: "Live MUN", icon: Radio, color: "text-red-500" },
  dresscode: { label: "Dress Code", icon: Shirt, color: "text-green-500" },
};

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
      <p className="text-sm">No {label} yet. Add one above.</p>
    </div>
  );
}

export default function ModulesPage() {
  const params = useParams();
  const eventId = params?.id as string;
  const { user } = useAuth();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);

  const [foodSlots, setFoodSlots] = useState<FoodSlot[]>([]);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [accBlocks, setAccBlocks] = useState<AccommodationBlock[]>([]);
  const [accRequests, setAccRequests] = useState<AccommodationRequest[]>([]);
  // uid → applicant name, so a room request names its delegate instead of showing a raw uid.
  const [nameByUid, setNameByUid] = useState<Record<string, string>>({});
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [dressCode, setDressCode] = useState<DressCode>({ text: "", images: [] });

  const [saving, setSaving] = useState(false);

  // Selected template per module (for highlight)
  const [foodTpl, setFoodTpl] = useState<string | null>(null);
  const [routeTpl, setRouteTpl] = useState<string | null>(null);
  const [accTpl, setAccTpl] = useState<string | null>(null);
  const [sessionTpl, setSessionTpl] = useState<string | null>(null);
  const [dressTpl, setDressTpl] = useState<string | null>(null);

  // Food form
  const [foodForm, setFoodForm] = useState<Omit<FoodSlot, "id">>({ mealName: "", timeWindow: "", venue: "", day: "", audience: { groups: [...DEFAULT_MEAL_AUDIENCE] }, usesPerPerson: 1 });
  const [foodDialog, setFoodDialog] = useState(false);

  // Transport form
  const [routeForm, setRouteForm] = useState<Omit<TransportRoute, "id" | "registeredDelegates">>({
    routeName: "", pickupPoint: "", dropoffPoint: "", departureTime: "", returnTime: "", capacity: 20,
  });
  const [routeDialog, setRouteDialog] = useState(false);

  // Accommodation form
  const [accForm, setAccForm] = useState<Omit<AccommodationBlock, "id">>({
    blockName: "", roomType: "", pricePerNight: 0, availableRooms: 0,
  });
  const [accDialog, setAccDialog] = useState(false);

  // Live session form
  const [sessionForm, setSessionForm] = useState<Omit<LiveSession, "id">>({
    title: "", committeeName: "", currentSpeaker: "", topic: "", status: "idle",
  });
  const [sessionDialog, setSessionDialog] = useState(false);

  // Dress code dialog
  const [dressDialog, setDressDialog] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      getApplicationsByEvent(eventId).then(apps => {
        const m: Record<string, string> = {};
        apps.forEach(a => { if (a.userId && a.applicantName) m[a.userId] = a.applicantName; });
        setNameByUid(m);
      }).catch(() => {});
      const [ev, slots, rts, blocks, reqs, dc] = await Promise.all([
        getEventById(eventId),
        getFoodSlots(eventId),
        getTransportRoutes(eventId),
        getAccommodationBlocks(eventId),
        getAccommodationRequests(eventId),
        getDressCode(eventId),
      ]);
      setEvent(ev);
      setFoodSlots(slots);
      setRoutes(rts);
      setAccBlocks(blocks);
      setAccRequests(reqs);
      setDressCode(dc || { text: "", images: [] });
      setLoading(false);
    })();
  }, [eventId]);

  const enabledModules = (event?.optionalModules || []) as string[];

  // ── Food handlers ──────────────────────────────────────────────────────────
  const handleAddFood = async () => {
    if (!foodForm.mealName) return;
    setSaving(true);
    const res = await addFoodSlot(eventId, foodForm);
    if (res.success && res.id) setFoodSlots((p) => [...p, { ...foodForm, id: res.id }]);
    setFoodForm({ mealName: "", timeWindow: "", venue: "", day: "", audience: { groups: [...DEFAULT_MEAL_AUDIENCE] }, usesPerPerson: 1 });
    setFoodTpl(null);
    setFoodDialog(false);
    setSaving(false);
  };

  const handleDeleteFood = async (id: string) => {
    await deleteFoodSlot(eventId, id!);
    setFoodSlots((p) => p.filter((s) => s.id !== id));
  };

  // ── Transport handlers ─────────────────────────────────────────────────────
  const handleAddRoute = async () => {
    if (!routeForm.routeName) return;
    setSaving(true);
    const res = await addTransportRoute(eventId, routeForm);
    if (res.success && res.id) setRoutes((p) => [...p, { ...routeForm, id: res.id, registeredDelegates: [] }]);
    setRouteForm({ routeName: "", pickupPoint: "", dropoffPoint: "", departureTime: "", returnTime: "", capacity: 20 });
    setRouteTpl(null);
    setRouteDialog(false);
    setSaving(false);
  };

  const handleDeleteRoute = async (id: string) => {
    await deleteTransportRoute(eventId, id!);
    setRoutes((p) => p.filter((r) => r.id !== id));
  };

  // ── Accommodation handlers ─────────────────────────────────────────────────
  const handleAddBlock = async () => {
    if (!accForm.blockName) return;
    setSaving(true);
    const res = await addAccommodationBlock(eventId, accForm);
    if (res.success && res.id) setAccBlocks((p) => [...p, { ...accForm, id: res.id }]);
    setAccForm({ blockName: "", roomType: "", pricePerNight: 0, availableRooms: 0 });
    setAccTpl(null);
    setAccDialog(false);
    setSaving(false);
  };

  const handleDeleteBlock = async (id: string) => {
    await deleteAccommodationBlock(eventId, id!);
    setAccBlocks((p) => p.filter((b) => b.id !== id));
  };

  /** Rooms still free in a block: its rooms minus the requests already confirmed into it. */
  const roomsLeft = (blockId?: string) => {
    const b = accBlocks.find(x => x.id === blockId);
    if (!b) return Infinity;
    return Math.max(0, (b.availableRooms || 0) - accRequests.filter(r => r.blockId === blockId && r.status === "confirmed").length);
  };
  const handleApproveReq = async (reqId: string, status: "confirmed" | "rejected") => {
    await approveAccommodationRequest(eventId, reqId, status);
    setAccRequests((p) => p.map((r) => (r.id === reqId ? { ...r, status } : r)));
  };

  // ── Live session handlers ──────────────────────────────────────────────────
  const handleAddSession = async () => {
    if (!sessionForm.title) return;
    setSaving(true);
    const res = await addLiveSession(eventId, sessionForm);
    if (res.success && res.id) setLiveSessions((p) => [...p, { ...sessionForm, id: res.id }]);
    setSessionForm({ title: "", committeeName: "", currentSpeaker: "", topic: "", status: "idle" });
    setSessionTpl(null);
    setSessionDialog(false);
    setSaving(false);
  };

  const handleToggleSession = async (session: LiveSession) => {
    const next = session.status === "live" ? "idle" : "live";
    await updateLiveSession(eventId, session.id!, { status: next });
    setLiveSessions((p) => p.map((s) => (s.id === session.id ? { ...s, status: next } : s)));
  };

  const handleDeleteSession = async (id: string) => {
    await deleteLiveSession(eventId, id!);
    setLiveSessions((p) => p.filter((s) => s.id !== id));
  };

  // ── Dress code handler ─────────────────────────────────────────────────────
  const handleSaveDressCode = async () => {
    setSaving(true);
    await saveDressCode(eventId, dressCode);
    setSaving(false);
    setDressDialog(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (enabledModules.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Optional Modules</h1>
          <p className="text-muted-foreground mt-1">Enable modules in Event Settings to manage them here.</p>
        </div>
        <div className="py-20 text-center glass-card rounded-2xl border-dashed flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
            <Layers className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">No modules enabled for this event.</p>
            <p className="text-sm text-muted-foreground">Turn on Food, Transport, Accommodation or Dress Code in Event Settings.</p>
          </div>
          <Button render={<Link href={`/dashboard/organizer/events/${eventId}/details#optional-modules`} />} nativeButton={false} className="gap-2">
            <Settings className="w-4 h-4" /> Enable Optional Modules
          </Button>
        </div>
      </div>
    );
  }

  const tabKeys = (["food", "transport", "accommodation", "dresscode"] as ModuleKey[]).filter(
    (k) => enabledModules.includes(k)
  );

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-3xl font-bold tracking-tight">Optional Modules</h1>
        <p className="text-muted-foreground mt-1">{event?.title} — manage enabled modules for delegates.</p>
      </motion.div>

      <Tabs defaultValue={tabKeys[0]}>
        <TabsList className="flex-wrap h-auto gap-1 mb-6">
          {tabKeys.map((k) => {
            const cfg = MODULE_CONFIG[k];
            const Icon = cfg.icon;
            return (
              <TabsTrigger key={k} value={k} className="gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} /> {cfg.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* ── FOOD ── */}
        <TabsContent value="food">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UtensilsCrossed className="w-5 h-5 text-orange-500" /> Food Slots
              </CardTitle>
              <Dialog open={foodDialog} onOpenChange={setFoodDialog}>
                <DialogTrigger render={<Button size="sm" className="gap-1.5"><PlusCircle className="w-4 h-4" /> Add Slot</Button>} />
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Food Slot</DialogTitle></DialogHeader>
                  <TemplatePicker
                    templates={FOOD_TEMPLATES}
                    active={foodTpl}
                    onPick={(t) => { setFoodForm((p) => ({ ...p, ...t.values })); setFoodTpl(t.label); }}
                  />
                  <div className="space-y-3 py-2 border-t border-border/40 mt-1 pt-3">
                    <div className="space-y-1"><Label>Meal Name</Label><Input value={foodForm.mealName} onChange={e => setFoodForm(p => ({ ...p, mealName: e.target.value }))} placeholder="e.g. Lunch Day 1" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>Day</Label><Input value={foodForm.day} onChange={e => setFoodForm(p => ({ ...p, day: e.target.value }))} placeholder="e.g. Day 1" /></div>
                      <div className="space-y-1"><Label>Time Window</Label><Input value={foodForm.timeWindow} onChange={e => setFoodForm(p => ({ ...p, timeWindow: e.target.value }))} placeholder="12:00 – 14:00" /></div>
                    </div>
                    <div className="space-y-1"><Label>Venue</Label><Input value={foodForm.venue} onChange={e => setFoodForm(p => ({ ...p, venue: e.target.value }))} placeholder="Cafeteria A" /></div>
                    {/* Who claims this meal with their QR pass, and how many times. */}
                    <div className="space-y-1.5">
                      <Label>Who gets it</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {AUDIENCE_GROUPS.map((g) => {
                          const groups = foodForm.audience?.groups || [];
                          const on = groups.includes(g.key);
                          return (
                            <Button key={g.key} type="button" size="sm" variant={on ? "default" : "outline"}
                              onClick={() => setFoodForm(p => ({ ...p, audience: { groups: on ? groups.filter(x => x !== g.key) : [...groups, g.key as AudienceGroup] } }))}>
                              {g.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-1 w-40"><Label>Uses per person</Label><Input type="number" min={1} max={20} value={foodForm.usesPerPerson ?? 1} onChange={e => setFoodForm(p => ({ ...p, usesPerPerson: Math.min(20, Math.max(1, Number(e.target.value) || 1)) }))} /></div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddFood} disabled={saving || !foodForm.mealName || !(foodForm.audience?.groups?.length)}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {foodSlots.length === 0 ? <EmptyState label="food slots" /> : (
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {foodSlots.map((slot) => (
                      <motion.div
                        key={slot.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        className="flex items-center justify-between p-3 rounded-xl bg-secondary border border-border/30"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                            <UtensilsCrossed className="w-4 h-4" />
                          </span>
                          <div>
                            <p className="font-medium text-sm">{slot.mealName}</p>
                            <p className="text-xs text-muted-foreground">{[slot.day, slot.timeWindow, slot.venue].filter(Boolean).join(" · ")}</p>
                            <p className="text-xs text-muted-foreground">{audienceLabel(slot.audience, DEFAULT_MEAL_AUDIENCE)}{(slot.usesPerPerson ?? 1) > 1 ? ` · ${slot.usesPerPerson} each` : ""}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteFood(slot.id!)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TRANSPORT ── */}
        <TabsContent value="transport">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Bus className="w-5 h-5 text-blue-500" /> Transport Routes</CardTitle>
              <Dialog open={routeDialog} onOpenChange={setRouteDialog}>
                <DialogTrigger render={<Button size="sm" className="gap-1.5"><PlusCircle className="w-4 h-4" /> Add Route</Button>} />
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Transport Route</DialogTitle></DialogHeader>
                  <TemplatePicker
                    templates={ROUTE_TEMPLATES}
                    active={routeTpl}
                    onPick={(t) => { setRouteForm((p) => ({ ...p, ...t.values })); setRouteTpl(t.label); }}
                  />
                  <div className="space-y-3 py-2 border-t border-border/40 mt-1 pt-3">
                    <div className="space-y-1"><Label>Route Name</Label><Input value={routeForm.routeName} onChange={e => setRouteForm(p => ({ ...p, routeName: e.target.value }))} placeholder="e.g. Hotel A → Venue" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>Pickup</Label><Input value={routeForm.pickupPoint} onChange={e => setRouteForm(p => ({ ...p, pickupPoint: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>Dropoff</Label><Input value={routeForm.dropoffPoint} onChange={e => setRouteForm(p => ({ ...p, dropoffPoint: e.target.value }))} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>Departure</Label><Input value={routeForm.departureTime} onChange={e => setRouteForm(p => ({ ...p, departureTime: e.target.value }))} placeholder="08:00" /></div>
                      <div className="space-y-1"><Label>Return</Label><Input value={routeForm.returnTime} onChange={e => setRouteForm(p => ({ ...p, returnTime: e.target.value }))} placeholder="18:00" /></div>
                    </div>
                    <div className="space-y-1"><Label>Capacity</Label><Input type="number" value={routeForm.capacity} onChange={e => setRouteForm(p => ({ ...p, capacity: parseInt(e.target.value) || 0 }))} /></div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddRoute} disabled={saving || !routeForm.routeName}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {routes.length === 0 ? <EmptyState label="transport routes" /> : (
                <div className="space-y-3">
                  {routes.map((route) => {
                    const registered = route.registeredDelegates?.length || 0;
                    const pct = Math.round((registered / (route.capacity || 1)) * 100);
                    return (
                      <div key={route.id} className="p-4 rounded-xl bg-secondary border border-border/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{route.routeName}</p>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteRoute(route.id!)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">{route.pickupPoint} → {route.dropoffPoint} · {route.departureTime}</p>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Capacity</span><span>{registered}/{route.capacity}</span>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ACCOMMODATION ── */}
        <TabsContent value="accommodation">
          <div className="space-y-4">
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Hotel className="w-5 h-5 text-primary" /> Accommodation Blocks</CardTitle>
                <Dialog open={accDialog} onOpenChange={setAccDialog}>
                  <DialogTrigger render={<Button size="sm" className="gap-1.5"><PlusCircle className="w-4 h-4" /> Add Block</Button>} />
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Accommodation Block</DialogTitle></DialogHeader>
                    <TemplatePicker
                      templates={ACC_TEMPLATES}
                      active={accTpl}
                      onPick={(t) => { setAccForm((p) => ({ ...p, ...t.values })); setAccTpl(t.label); }}
                    />
                    <div className="space-y-3 py-2 border-t border-border/40 mt-1 pt-3">
                      <div className="space-y-1"><Label>Block Name</Label><Input value={accForm.blockName} onChange={e => setAccForm(p => ({ ...p, blockName: e.target.value }))} placeholder="e.g. Hotel Grand — Twin" /></div>
                      <div className="space-y-1"><Label>Room Type</Label><Input value={accForm.roomType} onChange={e => setAccForm(p => ({ ...p, roomType: e.target.value }))} placeholder="Twin, Single, Suite..." /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label>Price/Night ($)</Label><Input type="number" value={accForm.pricePerNight || ""} onChange={e => setAccForm(p => ({ ...p, pricePerNight: parseFloat(e.target.value) || 0 }))} /></div>
                        <div className="space-y-1"><Label>Available Rooms</Label><Input type="number" value={accForm.availableRooms || ""} onChange={e => setAccForm(p => ({ ...p, availableRooms: parseInt(e.target.value) || 0 }))} /></div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddBlock} disabled={saving || !accForm.blockName}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {accBlocks.length === 0 ? <EmptyState label="accommodation blocks" /> : (
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {accBlocks.map((block) => (
                        <motion.div
                          key={block.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -12 }}
                          className="flex items-center justify-between p-3 rounded-xl bg-secondary border border-border/30"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <Hotel className="w-4 h-4" />
                            </span>
                            <div>
                              <p className="font-medium text-sm">{block.blockName}</p>
                              <p className="text-xs text-muted-foreground">{block.roomType} · ${block.pricePerNight}/night · {roomsLeft(block.id) === 0 ? "full" : `${roomsLeft(block.id)} of ${block.availableRooms} rooms left`}</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteBlock(block.id!)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </Card>

            {accRequests.filter(r => r.status === "pending").length > 0 && (
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-base">Pending Requests</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {accRequests.filter(r => r.status === "pending").map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary border border-border/30">
                      <div>
                        <p className="text-sm font-medium">{nameByUid[req.delegateUid] || "Delegate"}</p>
                        <p className="text-xs text-muted-foreground">{req.blockName}{roomsLeft(req.blockId) === 0 ? " · full" : ""}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="gap-1 text-green-600 border-green-500/30 h-8" onClick={() => handleApproveReq(req.id!, "confirmed")} disabled={roomsLeft(req.blockId) === 0}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 h-8" onClick={() => handleApproveReq(req.id!, "rejected")}>
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── LIVE MUN ── */}
        <TabsContent value="livemun">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Radio className="w-5 h-5 text-red-500" /> Live Sessions</CardTitle>
              <Dialog open={sessionDialog} onOpenChange={setSessionDialog}>
                <DialogTrigger render={<Button size="sm" className="gap-1.5"><PlusCircle className="w-4 h-4" /> Add Session</Button>} />
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Live Session</DialogTitle></DialogHeader>
                  <TemplatePicker
                    templates={SESSION_TEMPLATES}
                    active={sessionTpl}
                    onPick={(t) => { setSessionForm((p) => ({ ...p, ...t.values })); setSessionTpl(t.label); }}
                  />
                  <div className="space-y-3 py-2 border-t border-border/40 mt-1 pt-3">
                    <div className="space-y-1"><Label>Title</Label><Input value={sessionForm.title} onChange={e => setSessionForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. UNSC Crisis Update" /></div>
                    <div className="space-y-1"><Label>Committee</Label><Input value={sessionForm.committeeName} onChange={e => setSessionForm(p => ({ ...p, committeeName: e.target.value }))} /></div>
                    <div className="space-y-1"><Label>Topic</Label><Input value={sessionForm.topic} onChange={e => setSessionForm(p => ({ ...p, topic: e.target.value }))} /></div>
                    <div className="space-y-1"><Label>Current Speaker</Label><Input value={sessionForm.currentSpeaker} onChange={e => setSessionForm(p => ({ ...p, currentSpeaker: e.target.value }))} /></div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddSession} disabled={saving || !sessionForm.title}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {liveSessions.length === 0 ? <EmptyState label="live sessions" /> : (
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                  {liveSessions.map((session) => (
                    <motion.div
                      key={session.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-secondary border border-border/30"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${session.status === "live" ? "bg-red-500 animate-pulse" : "bg-muted-foreground/30"}`} />
                        <div>
                          <p className="font-medium text-sm">{session.title}</p>
                          <p className="text-xs text-muted-foreground">{session.committeeName} · {session.topic}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={session.status === "live" ? "text-red-500 border-red-500/20 bg-red-500/5" : "text-muted-foreground"}>
                          {session.status === "live" ? "LIVE" : "Idle"}
                        </Badge>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleToggleSession(session)}>
                          {session.status === "live" ? "Stop" : "Go Live"}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteSession(session.id!)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DRESS CODE ── */}
        <TabsContent value="dresscode">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Shirt className="w-5 h-5 text-green-500" /> Dress Code</CardTitle>
              <Dialog open={dressDialog} onOpenChange={setDressDialog}>
                <DialogTrigger render={
                  <Button size="sm" className="gap-1.5">
                    {dressCode.text || dressCode.images.length ? <><SquarePen className="w-4 h-4" /> Edit</> : <><PlusCircle className="w-4 h-4" /> Set Dress Code</>}
                  </Button>
                } />
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{dressCode.text || dressCode.images.length ? "Edit Dress Code" : "Set Dress Code"}</DialogTitle></DialogHeader>
                  <TemplatePicker
                    templates={DRESS_TEMPLATES}
                    active={dressTpl}
                    onPick={(t) => { setDressCode((p) => ({ ...p, text: t.values })); setDressTpl(t.label); }}
                  />
                  <div className="space-y-3 py-2 border-t border-border/40 mt-1 pt-3">
                    <div className="space-y-1">
                      <Label>Guidance</Label>
                      <Textarea
                        value={dressCode.text}
                        onChange={e => setDressCode(p => ({ ...p, text: e.target.value }))}
                        placeholder="Describe the expected attire for delegates, chairs, and staff..."
                        rows={5}
                      />
                      <AiTextareaAssist
                        value={dressCode.text}
                        onPick={(t) => setDressCode(p => ({ ...p, text: t }))}
                        surface="dress-code-note"
                        className="mt-1"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Image URLs <span className="text-muted-foreground text-xs">(one per line)</span></Label>
                      <Textarea
                        value={dressCode.images.join("\n")}
                        onChange={e => setDressCode(p => ({ ...p, images: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) }))}
                        placeholder="https://example.com/attire1.jpg"
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveDressCode} disabled={saving} className="gap-2">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Save Dress Code
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {!dressCode.text && dressCode.images.length === 0 ? (
                <EmptyState label="dress code" />
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  {dressCode.text && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary border border-border/30">
                      <span className="w-9 h-9 rounded-lg bg-green-500/10 text-green-600 flex items-center justify-center shrink-0">
                        <Shirt className="w-4 h-4" />
                      </span>
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{dressCode.text}</p>
                    </div>
                  )}
                  {dressCode.images.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {dressCode.images.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={src} alt={`Attire ${i + 1}`} className="w-full aspect-square object-cover rounded-xl border border-border/30" />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
