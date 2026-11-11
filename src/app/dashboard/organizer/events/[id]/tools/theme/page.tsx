'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Palette } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEventPlan } from '@/lib/hooks/useEventPlan';
import { ProGate } from '@/components/ProGate';
import { getEventById, updateEvent, EventData } from '@/lib/services/eventService';

export default function ThemeToolPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { profile } = useAuth();
  // A custom colour comes with the event's plan (eventPlan.ts), not the person.
  const { plan } = useEventPlan(eventId);
  const isPro = !!plan?.features.customTheme;

  const [theme, setTheme] = useState('classic-blue');
  const [customHex, setCustomHex] = useState('#4f46e5');
  const [event, setEvent] = useState<EventData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const presets = [
    { id: 'classic-blue', name: 'Classic Blue', color: 'bg-blue-600', hex: '#2563eb' },
    { id: 'dark-diplomat', name: 'Dark Diplomat', color: 'bg-slate-900', hex: '#0f172a' },
    { id: 'emerald', name: 'Emerald', color: 'bg-emerald-600', hex: '#059669' },
    { id: 'sand', name: 'Sand', color: 'bg-[#C2B280]', hex: '#C2B280' },
  ];

  useEffect(() => {
    getEventById(eventId).then(ev => {
      if (ev) {
        setEvent(ev);
        // A custom colour is stored as its hex; a preset as its id.
        if (ev.theme?.startsWith('#')) { setTheme('custom'); setCustomHex(ev.theme); }
        else if (ev.theme) setTheme(ev.theme);
      }
      setLoading(false);
    });
  }, [eventId]);

  const handleSave = async () => {
    setSaving(true);
    await updateEvent(eventId, { theme: theme === 'custom' ? customHex : theme });
    setSaving(false);
  };

  const previewColor = theme === 'custom'
    ? customHex
    : (presets.find(p => p.id === theme)?.hex ?? '#2563eb');

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl md:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Event Theme</h1>
        <p className="text-muted-foreground mt-1">
          Customize the color scheme of your public event page and delegate dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Theme Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label>Preset Themes</Label>
                <div className="grid grid-cols-2 gap-3">
                  {presets.map(p => (
                    <div
                      key={p.id}
                      onClick={() => setTheme(p.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all ${theme === p.id ? 'border-violet-600 bg-violet-50 dark:bg-violet-900/20' : 'border-transparent hover:bg-secondary'}`}
                    >
                      <div className={`w-8 h-8 rounded-full mb-2 ${p.color}`} />
                      <span className="text-xs font-medium text-center">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Custom Color</Label>
                </div>
                <ProGate
                  feature="Custom Event Themes"
                  allowed={isPro}
                  lockedFallback={
                    <div className="flex items-center gap-3 opacity-50 pointer-events-none">
                      <input type="color" value={customHex} disabled className="w-10 h-10 rounded border-0 p-0" />
                      <span className="text-sm font-mono uppercase">{customHex}</span>
                    </div>
                  }
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={customHex}
                      onChange={e => { setCustomHex(e.target.value); setTheme('custom'); }}
                      className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                    />
                    <span className="text-sm font-mono uppercase">{customHex}</span>
                  </div>
                </ProGate>
              </div>

              <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Theme'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" /> Live Preview
              </CardTitle>
              <CardDescription>How delegates will see your event header.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-xl overflow-hidden shadow-sm">
                <div
                  className="h-32 w-full transition-colors duration-300"
                  style={{ backgroundColor: previewColor }}
                />
                <div className="bg-card p-6 relative">
                  <div className="absolute -top-12 left-6 w-24 h-24 bg-slate-200 border-4 border-white dark:border-slate-950 rounded-xl flex items-center justify-center font-bold text-slate-400">
                    LOGO
                  </div>
                  <div className="pl-32">
                    <h2 className="text-2xl font-bold">{event?.title ?? 'Your Event'}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">{event?.date} · {event?.location}</p>
                    <div className="mt-4 flex gap-2">
                      <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
                      <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
