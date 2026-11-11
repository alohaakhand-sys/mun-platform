'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getOrganizerEvents, EventData } from '@/lib/services/eventService';
import { getSystemSettings, SystemSettings } from '@/lib/services/systemSettingsService';
import { PLAN_DEFAULTS, resolvePlan, planLabel } from '@/lib/data/eventPlan';

// Pro is per conference (src/lib/data/eventPlan.ts). This page says what Free and Pro really are
// (numbers from the App Admin's settings) and lists the organizer's events to upgrade.
export default function ProLandingPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [events, setEvents] = useState<EventData[] | null>(null);

  useEffect(() => {
    getSystemSettings().then(setSettings).catch(() => setSettings(null));
    if (user) getOrganizerEvents(user.uid).then(setEvents).catch(() => setEvents([]));
  }, [user]);

  const s = { ...PLAN_DEFAULTS, ...(settings || {}) };
  const free = [
    `${s.freeParticipantCap} participants and ${s.freeCommitteeCap} committees per event`,
    `${s.freeEventCap} published events at once`,
    'Live MUN: roll call, speakers, motions, voting (no video)',
    'Announcements up to 50 people',
    `${s.freeAiDailyQuota} AI uses a day`,
    '2 certificate designs, 4 themes',
    `${s.platformFeePercent}% platform fee`,
  ];
  const pro = [
    'No participant or committee caps',
    'Live video in sessions and ceremonies',
    'AI inside the event without the daily limit',
    'Announcements and committee emails to any size',
    'Ornate Gold certificate',
    'Custom theme colour',
    'Verified organizer badge',
    `${s.proFeePercent}% platform fee`,
  ];

  return (
    <div className="container mx-auto py-10 max-w-5xl space-y-10">
      <div className="flex flex-col items-center text-center space-y-3">
        <Crown className="w-14 h-14 text-foreground" />
        <h1 className="text-4xl font-bold tracking-tight">MUN Pilot Pro</h1>
        <p className="text-lg text-muted-foreground max-w-2xl">For organizers running bigger conferences. Pro is per event: upgrade the one that needs it.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader><CardTitle>Free</CardTitle><CardDescription>Every event starts here.</CardDescription></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {free.map((f) => <li key={f} className="flex items-center gap-3 text-sm"><CheckCircle2 className="w-5 h-5 text-slate-400 shrink-0" />{f}</li>)}
            </ul>
          </CardContent>
        </Card>
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary"><Crown className="w-5 h-5" /> Pro · ${s.proEventPrice} per event</CardTitle>
            <CardDescription>Pay and it&apos;s unlocked right away, or send a request for the team to review.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {pro.map((f) => <li key={f} className="flex items-center gap-3 text-sm font-medium"><CheckCircle2 className="w-5 h-5 text-primary shrink-0" />{f}</li>)}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Your events</CardTitle><CardDescription>Open one to upgrade it or ask for more room.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {events === null ? <p className="text-sm text-muted-foreground">Loading…</p>
            : events.length === 0 ? <p className="text-sm text-muted-foreground">You don&apos;t own an event yet.</p>
            : events.map((e) => (
              <Link key={e.id} href={`/dashboard/organizer/events/${e.id}/plan`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-secondary transition-colors">
                <span className="text-sm font-medium">{e.title}</span>
                <Badge variant="outline">{planLabel(resolvePlan(e, settings))}</Badge>
              </Link>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
