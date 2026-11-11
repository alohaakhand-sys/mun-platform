'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getOrganizerEvents, EventData, RoleTier, getEnabledRoleTiers, getRolePrice, getEventCapacity } from '@/lib/services/eventService';
import { getApplicationsByEvent, ApplicationData } from '@/lib/services/applicationService';
import { createPayoutRequest, getPayoutsByOrganizer, PayoutRequest } from '@/lib/services/payoutService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { DollarSign, Clock, AlertCircle, CheckCircle2, Wallet, CreditCard, ArrowUpRight, CalendarDays, Info } from 'lucide-react';
import { TierStatusCard } from '@/components/features/organizer/TierStatusCard';
import { getSystemSettings, SystemSettings } from '@/lib/services/systemSettingsService';
import { resolvePlan } from '@/lib/data/eventPlan';

interface PaymentRecord {
  id: string;
  applicantName: string;
  tier: string;
  amount: number;
  status: 'paid' | 'pending' | 'refunded';
  date: string;
}

// Resolve what a single application is worth, preferring the real amount the
// Stripe webhook recorded, else the applicant's role tier price (× team size).
function amountForApp(app: ApplicationData, event: EventData | null): number {
  if (typeof app.paidAmount === 'number') return app.paidAmount;
  return getRolePrice(event, app.role, app.teamSize || 1);
}

// Map an application's real payment state onto the table's status union.
function statusForApp(app: ApplicationData): PaymentRecord['status'] {
  if (app.paymentStatus === 'paid') return 'paid';
  if (app.paymentStatus === 'refunded') return 'refunded';
  return 'pending';
}

// A live application owes or has paid; a rejected one only counts if money moved.
function isPaymentRow(app: ApplicationData): boolean {
  if (app.paymentStatus === 'paid' || app.paymentStatus === 'refunded') return true;
  if (app.status === 'rejected') return false;
  return app.status === 'approved' || app.status === 'pending' || !!app.paymentStatus;
}

export default function FinancialsDashboard() {
  const { user, profile } = useAuth();
  const [events, setEvents] = useState<EventData[]>([]);
  const [appsByEvent, setAppsByEvent] = useState<Record<string, ApplicationData[]>>({});
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Payout request dialog
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutError, setPayoutError] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const evs = await getOrganizerEvents(user.uid);
      setEvents(evs);
      if (evs.length > 0) setSelectedEventId(evs[0].id);

      // Pull applications for every event up front — the wallet is org-wide,
      // so revenue must aggregate across all of the organizer's events.
      const entries = await Promise.all(
        evs.map(async (ev) => [ev.id, await getApplicationsByEvent(ev.id)] as const)
      );
      setAppsByEvent(Object.fromEntries(entries));
      setPayouts(await getPayoutsByOrganizer(user.uid));
      setSettings(await getSystemSettings().catch(() => null));
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!selectedEventId) { setSelectedEvent(null); return; }
    setSelectedEvent(events.find(e => e.id === selectedEventId) ?? null);
  }, [selectedEventId, events]);

  const tiers: RoleTier[] = getEnabledRoleTiers(selectedEvent);
  const selectedApps = appsByEvent[selectedEventId] ?? [];

  // Per-event payments table — driven by the real Stripe-backed payment status.
  const payments: PaymentRecord[] = selectedApps
    .filter(isPaymentRow)
    .map((a, i) => ({
      id: (a as any).id ?? `app-${i}`,
      applicantName: a.applicantName ?? a.userId,
      tier: a.tierName ?? a.role ?? tiers[0]?.role ?? '—',
      amount: amountForApp(a, selectedEvent),
      status: statusForApp(a),
      date: a.createdAt?.toDate?.()?.toLocaleDateString() ?? '—',
    }));

  const eventPaidCount = payments.filter(p => p.status === 'paid').length;
  const eventRevenue = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalCapacity = getEventCapacity(selectedEvent);
  const pendingCount = payments.filter(p => p.status === 'pending').length;

  // Org-wide wallet: every paid application across every event, less that event's platform fee
  // (its plan, eventPlan.ts), minus payouts already requested (pending) or completed (paid).
  const grossOf = (ev: EventData) => (appsByEvent[ev.id] ?? [])
    .filter(a => a.paymentStatus === 'paid')
    .reduce((s, a) => s + amountForApp(a, ev), 0);
  const feeOf = (ev: EventData) => grossOf(ev) * resolvePlan(ev, settings).feePercent / 100;
  const grossRevenue = events.reduce((sum, ev) => sum + grossOf(ev), 0);
  const platformFees = events.reduce((sum, ev) => sum + feeOf(ev), 0);
  const lifetimeRevenue = Math.round((grossRevenue - platformFees) * 100) / 100;
  const selectedFee = selectedEvent ? resolvePlan(selectedEvent, settings).feePercent : 0;

  const reservedPayouts = payouts
    .filter(p => p.status === 'pending' || p.status === 'paid')
    .reduce((s, p) => s + p.amount, 0);
  const availableBalance = Math.max(lifetimeRevenue - reservedPayouts, 0);

  const submitPayout = async () => {
    if (!user) return;
    const amount = parseFloat(payoutAmount);
    setPayoutError('');
    if (!(amount > 0)) { setPayoutError('Enter an amount greater than 0.'); return; }
    if (amount > availableBalance) { setPayoutError(`Amount exceeds available balance ($${availableBalance.toLocaleString()}).`); return; }
    setPayoutSubmitting(true);
    const res = await createPayoutRequest({
      organizerId: user.uid,
      organizerName: (profile as any)?.fullName ?? (profile as any)?.displayName ?? user.email ?? 'Organizer',
      organizerEmail: user.email ?? '',
      amount,
    });
    setPayoutSubmitting(false);
    if (!res.success) { setPayoutError(res.error ?? 'Could not submit payout request.'); return; }
    setPayouts(await getPayoutsByOrganizer(user.uid));
    setPayoutOpen(false);
    setPayoutAmount('');
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-6xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-6xl space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financials & Ticketing</h1>
          <p className="text-muted-foreground mt-1">Track revenue, tickets, and payouts per event.</p>
        </div>

        {events.length > 0 && (
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={selectedEventId} onValueChange={v => { if (v) setSelectedEventId(v); }}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {events.map(ev => (
                  <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-16 text-center text-muted-foreground">
            No events found. Create an event first to see financials.
          </CardContent>
        </Card>
      ) : !selectedEvent ? (
        <Card className="glass-card">
          <CardContent className="py-16 text-center text-muted-foreground">Select an event above.</CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-[var(--h-slab)] text-white border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-primary flex items-center justify-between">
                  Event Revenue <DollarSign className="w-4 h-4 text-primary" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${eventRevenue.toLocaleString()}</div>
                <p className="text-xs text-primary mt-1">
                  From paid registrations · {selectedFee}% platform fee · you get ${(Math.round(eventRevenue * (100 - selectedFee)) / 100).toLocaleString()}
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
                  {eventPaidCount}
                  <span className="text-sm text-muted-foreground font-normal"> / {totalCapacity || '∞'}</span>
                </div>
                {totalCapacity > 0 && (
                  <div className="w-full bg-secondary h-2 mt-2 rounded-full overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all"
                      style={{ width: `${Math.min((eventPaidCount / totalCapacity) * 100, 100)}%` }}
                    />
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

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="overview">Overview & Tiers</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="wallet">Wallet & Payouts</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <h2 className="text-xl font-semibold">Role Tiers</h2>
              {tiers.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="py-12 text-center text-muted-foreground text-sm">
                    No accepted roles configured for this event.
                    Set them under the event&apos;s Allocation → Roles &amp; Tiers.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {tiers.map((tier, i) => (
                    <TierStatusCard
                      key={i}
                      name={tier.label || tier.role}
                      price={tier.price}
                      sold={selectedApps.filter(a => a.paymentStatus === 'paid' && (a.tierName ?? a.role) === tier.role).length}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="payments">
              <Card>
                <CardHeader>
                  <CardTitle>Payments</CardTitle>
                  <CardDescription>Applications with payment status for {selectedEvent.title}.</CardDescription>
                </CardHeader>
                <CardContent>
                  {payments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8 text-sm">No payments yet.</p>
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
                          {payments.map((payment, i) => (
                            <tr key={payment.id} className={i !== payments.length - 1 ? 'border-b' : ''}>
                              <td className="p-3 font-medium">{payment.applicantName}</td>
                              <td className="p-3 text-muted-foreground">{payment.tier}</td>
                              <td className="p-3 text-right">${payment.amount}</td>
                              <td className="p-3 text-center text-muted-foreground">{payment.date}</td>
                              <td className="p-3 text-right">
                                {payment.status === 'paid' && (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                                  </Badge>
                                )}
                                {payment.status === 'pending' && (
                                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                    <Clock className="w-3 h-3 mr-1" /> Pending
                                  </Badge>
                                )}
                                {payment.status === 'refunded' && (
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
            </TabsContent>

            <TabsContent value="wallet" className="space-y-6">
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-secondary px-4 py-3 text-sm text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <p>
                  Registration fees are collected by the platform. Your balance below is every paid
                  registration across your events, less each event&apos;s platform fee. Request a payout and an
                  admin will transfer the funds to your account.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="w-6 h-6 text-primary" />
                      <CardTitle>Organizer Wallet</CardTitle>
                    </div>
                    <CardDescription>Balance across all your events.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="p-6 bg-secondary rounded-xl border border-dashed flex flex-col items-center justify-center text-center">
                      <span className="text-sm font-medium text-muted-foreground mb-1">Available Balance</span>
                      <span className="text-4xl font-bold">${availableBalance.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground mt-2">
                        ${grossRevenue.toLocaleString()} paid · ${(Math.round(platformFees * 100) / 100).toLocaleString()} platform fees · ${reservedPayouts.toLocaleString()} paid out / requested
                      </span>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => { setPayoutAmount(String(availableBalance)); setPayoutError(''); setPayoutOpen(true); }}
                      disabled={availableBalance <= 0}
                    >
                      Request Payout
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payout History</CardTitle>
                    <CardDescription>Your payout requests and their status.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {payouts.length === 0 ? (
                      <div className="py-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                        <ArrowUpRight className="w-8 h-8 opacity-20" />
                        No payouts yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {payouts.map((p) => (
                          <div key={p.id} className="flex items-center justify-between border rounded-lg p-3">
                            <div>
                              <p className="font-medium">${p.amount.toLocaleString()}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.requestedAt?.toDate?.()?.toLocaleDateString() ?? 'Just now'}
                              </p>
                            </div>
                            {p.status === 'paid' && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                              </Badge>
                            )}
                            {p.status === 'pending' && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                <Clock className="w-3 h-3 mr-1" /> Pending
                              </Badge>
                            )}
                            {p.status === 'rejected' && (
                              <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">
                                <AlertCircle className="w-3 h-3 mr-1" /> Rejected
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Payout</DialogTitle>
            <DialogDescription>
              Available balance: ${availableBalance.toLocaleString()}. An admin will review and transfer the funds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="payout-amount">Amount (USD)</Label>
            <Input
              id="payout-amount"
              type="number"
              min={1}
              max={availableBalance}
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              placeholder="0"
            />
            {payoutError && <p className="text-sm text-destructive">{payoutError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutOpen(false)} disabled={payoutSubmitting}>Cancel</Button>
            <Button onClick={submitPayout} disabled={payoutSubmitting}>
              {payoutSubmitting ? 'Submitting…' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
