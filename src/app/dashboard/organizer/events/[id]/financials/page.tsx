"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, updateEvent, EventData, RoleTier, getEnabledRoleTiers, getRolePrice, getEventCapacity } from "@/lib/services/eventService";
import { getApplicationsByEvent, ApplicationData } from "@/lib/services/applicationService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Clock, AlertCircle, CheckCircle2, CreditCard, Wallet, ArrowUpRight, FlaskConical } from "lucide-react";
import { TierStatusCard } from "@/components/features/organizer/TierStatusCard";
import { RolesTiersSection } from "@/components/features/organizer/RolesTiersSection";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { getSystemSettings, SystemSettings } from "@/lib/services/systemSettingsService";
import { resolvePlan } from "@/lib/data/eventPlan";

// Prefer the real amount the Stripe webhook recorded, else the role's tier price.
function amountForApp(app: ApplicationData, event: EventData | null): number {
  if (typeof app.paidAmount === "number") return app.paidAmount;
  return getRolePrice(event, app.role, app.teamSize || 1);
}

function statusForApp(app: ApplicationData): "paid" | "pending" | "refunded" {
  if (app.paymentStatus === "paid") return "paid";
  if (app.paymentStatus === "refunded") return "refunded";
  return "pending";
}

// A live application owes or has paid; a rejected one only counts if money moved.
function isPaymentRow(app: ApplicationData): boolean {
  if (app.paymentStatus === "paid" || app.paymentStatus === "refunded") return true;
  if (app.status === "rejected") return false;
  return app.status === "approved" || app.status === "pending" || !!app.paymentStatus;
}

export default function EventFinancialsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const eventId = params.id as string;
  const { isOwner, isOrganizerLevel, loading: roleLoading } = useEventStaffRole(eventId);
  const [event, setEvent] = useState<EventData | null>(null);
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  // DEV ONLY (remove before production): Developer Payment Mode toggle state.
  const [devAllowed, setDevAllowed] = useState(false);
  const [savingDev, setSavingDev] = useState(false);

  useEffect(() => {
    if (!eventId || !user || roleLoading) return;
    // Money is owner-only (plan D5); a co-organizer gets the roles and schedule, prices locked.
    if (!isOwner && !isOrganizerLevel) {
      router.push(`/dashboard/organizer/events/${eventId}`);
      return;
    }
    if (!isOwner) { setLoading(false); return; }
    (async () => {
      const [ev, apps, s] = await Promise.all([getEventById(eventId), getApplicationsByEvent(eventId), getSystemSettings().catch(() => null)]);
      setSettings(s);
      if (!ev || ev.organizerId !== user.uid) {
        router.push(`/dashboard/organizer/events/${eventId}`);
        return;
      }
      setEvent(ev);
      setApplications(apps);
      setLoading(false);
    })();
  }, [eventId, user, roleLoading, isOwner, isOrganizerLevel]);

  // DEV ONLY (remove before production): does this build allow simulated payments?
  useEffect(() => {
    fetch("/api/payments/status")
      .then((r) => r.json())
      .then((s) => setDevAllowed(!!s.devPaymentsAllowed))
      .catch(() => setDevAllowed(false));
  }, []);

  // DEV ONLY (remove before production): persist the per-event toggle.
  const toggleDevPayment = async (on: boolean) => {
    if (!event) return;
    setSavingDev(true);
    try {
      await updateEvent(eventId, { devPaymentMode: on });
      setEvent({ ...event, devPaymentMode: on });
    } finally {
      setSavingDev(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles &amp; Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Only the event owner can change prices or see revenue and payouts.
          </p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card p-5">
          <RolesTiersSection eventId={eventId} />
        </div>
      </div>
    );
  }

  const tiers: RoleTier[] = getEnabledRoleTiers(event);

  const payments = applications
    .filter(isPaymentRow)
    .map((a, i) => ({
      id: (a as any).id ?? `app-${i}`,
      applicantName: a.applicantName ?? a.userId,
      tier: a.tierName ?? a.role ?? tiers[0]?.role ?? "—",
      amount: amountForApp(a, event),
      status: statusForApp(a),
      date: a.createdAt?.toDate?.()?.toLocaleDateString() ?? "—",
    }));

  const paidCount = payments.filter(p => p.status === "paid").length;
  const revenue = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingCount = payments.filter(p => p.status === "pending").length;
  const totalCapacity = getEventCapacity(event);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financials</h1>
          <p className="text-muted-foreground mt-1">{event?.title} — revenue and registrations for this event.</p>
        </div>
        <Button variant="outline" className="gap-2" render={<Link href="/dashboard/organizer/financials" />} nativeButton={false}>
          <Wallet className="w-4 h-4" /> Wallet &amp; Payouts
        </Button>
      </div>

      {/* DEV ONLY (remove before production): Developer Payment Mode toggle. */}
      {devAllowed && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 p-2">
                <FlaskConical className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-200">Developer Payment Mode</h3>
                  {event?.devPaymentMode && (
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">ACTIVE</Badge>
                  )}
                </div>
                <p className="text-sm text-amber-800/90 dark:text-amber-300/80 max-w-xl">
                  Simulates payment without Stripe — delegates are marked paid instantly, no card or webhook.
                  For development and demos only. <strong>Never enable in production.</strong>
                </p>
              </div>
            </div>
            <Switch
              checked={!!event?.devPaymentMode}
              onCheckedChange={toggleDevPayment}
              disabled={savingDev}
              aria-label="Toggle developer payment mode"
            />
          </div>
        </div>
      )}

      {/* Per-role pricing setup — drives the public application form and checkout. */}
      <div className="rounded-2xl border border-border/40 bg-card p-5">
        <RolesTiersSection eventId={eventId} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-[var(--h-slab)] text-white border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary flex items-center justify-between">
              Event Revenue <DollarSign className="w-4 h-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${revenue.toLocaleString()}</div>
            <p className="text-xs text-primary mt-1">
              From paid registrations · {resolvePlan(event, settings).feePercent}% platform fee · you get ${(Math.round(revenue * (100 - resolvePlan(event, settings).feePercent)) / 100).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Tickets Sold <CreditCard className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {paidCount}<span className="text-sm text-muted-foreground font-normal"> / {totalCapacity || "∞"}</span>
            </div>
            {totalCapacity > 0 && (
              <div className="w-full bg-secondary h-2 mt-2 rounded-full overflow-hidden">
                <div className="bg-primary h-full transition-all" style={{ width: `${Math.min((paidCount / totalCapacity) * 100, 100)}%` }} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Pending <Clock className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
          </CardContent>
        </Card>
      </div>

      {/* Tiers */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Role Tiers</h2>
        {tiers.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No accepted roles configured. Set them under Allocation → Roles &amp; Tiers.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tiers.map((tier, i) => (
              <TierStatusCard
                key={i}
                name={tier.label || tier.role}
                price={tier.price}
                sold={applications.filter(a => a.paymentStatus === "paid" && (a.tierName ?? a.role) === tier.role).length}
              />
            ))}
          </div>
        )}
      </div>

      {/* Payments table */}
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>Applications with payment status for this event.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <ArrowUpRight className="w-8 h-8 opacity-20" />
              No payments yet.
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b">
                  <tr>
                    <th className="text-left font-medium p-3">Applicant</th>
                    <th className="text-left font-medium p-3">Tier</th>
                    <th className="text-right font-medium p-3">Amount</th>
                    <th className="text-center font-medium p-3">Date</th>
                    <th className="text-right font-medium p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={p.id} className={i !== payments.length - 1 ? "border-b" : ""}>
                      <td className="p-3 font-medium">{p.applicantName}</td>
                      <td className="p-3 text-muted-foreground">{p.tier}</td>
                      <td className="p-3 text-right">${p.amount}</td>
                      <td className="p-3 text-center text-muted-foreground">{p.date}</td>
                      <td className="p-3 text-right">
                        {p.status === "paid" && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                          </Badge>
                        )}
                        {p.status === "pending" && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            <Clock className="w-3 h-3 mr-1" /> Pending
                          </Badge>
                        )}
                        {p.status === "refunded" && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">
                            <AlertCircle className="w-3 h-3 mr-1" /> Refunded
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
