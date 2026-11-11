'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, CheckCircle2 } from 'lucide-react';
import { getEventById, updateEvent } from '@/lib/services/eventService';
import { useEventPlan } from '@/lib/hooks/useEventPlan';

export default function CertificatesToolPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { plan } = useEventPlan(eventId);

  const [selectedTemplate, setSelectedTemplate] = useState('diploma');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const templates = [
    { id: 'diploma', name: 'Classic Diploma', style: 'border-double border-8 border-slate-800 bg-[#fdfbf7] text-center' },
    { id: 'modern', name: 'Modern Minimal', style: 'border-l-8 border-violet-600 bg-white text-left pl-8' },
    { id: 'ornate', name: 'Ornate Gold', style: 'border-[12px] border-[#d4af37] bg-white text-center' },
  ];

  useEffect(() => {
    getEventById(eventId).then(ev => {
      if (ev?.certificateTemplate) setSelectedTemplate(ev.certificateTemplate);
      setLoading(false);
    });
  }, [eventId]);

  const handleSave = async () => {
    setSaving(true);
    await updateEvent(eventId, { certificateTemplate: selectedTemplate });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl space-y-8">
        <Skeleton className="h-10 w-56" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Certificate Templates</h1>
        <p className="text-muted-foreground mt-1">
          Select the base template for delegate certificates. Awards (Best Delegate, etc.) will be dynamically rendered.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {templates.map(tpl => {
          const cardContent = (
            <Card
              key={tpl.id}
              className={`cursor-pointer transition-all ${selectedTemplate === tpl.id ? 'ring-2 ring-violet-600 shadow-sm' : 'hover:border-violet-300'}`}
              onClick={() => setSelectedTemplate(tpl.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base">{tpl.name}</CardTitle>
                  {selectedTemplate === tpl.id && <CheckCircle2 className="w-5 h-5 text-violet-600" />}
                </div>
              </CardHeader>
              <CardContent>
                <div className={`w-full aspect-[1.4] p-4 flex flex-col justify-center items-center shadow-inner scale-90 ${tpl.style}`}>
                  <Award className="w-8 h-8 mb-2 opacity-50" />
                  <div className="w-3/4 h-2 bg-slate-300 mb-2 rounded" />
                  <div className="w-1/2 h-4 bg-slate-800 mb-4 rounded" />
                  <div className="w-full h-1 bg-slate-200 mb-1 rounded" />
                  <div className="w-5/6 h-1 bg-slate-200 rounded" />
                </div>
              </CardContent>
            </Card>
          );
          // Ornate Gold comes with the event's plan (eventPlan.ts).
          if (tpl.id === 'ornate' && !plan?.features.ornate) {
            return (
              <div key={tpl.id} className="relative">
                <div className="opacity-50 pointer-events-none">{cardContent}</div>
                <a href={`/dashboard/organizer/events/${eventId}/plan`} className="absolute top-3 right-3 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-700 px-2 py-0.5">Pro event</a>
              </div>
            );
          }
          return cardContent;
        })}
      </div>

      <div className="flex justify-end">
        <Button className="bg-violet-600 hover:bg-violet-700 text-white" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Set as Event Default'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Award Types</CardTitle>
          <CardDescription>These awards will be available for Chairs to assign during marking.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="px-3 py-1">Best Delegate</Badge>
            <Badge variant="secondary" className="px-3 py-1">Outstanding Delegate</Badge>
            <Badge variant="secondary" className="px-3 py-1">Honorable Mention</Badge>
            <Badge variant="secondary" className="px-3 py-1">Verbal Commendation</Badge>
            <Badge variant="outline" className="px-3 py-1 border-dashed">Participation (Default)</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            <em>Note: Certificates are automatically unlocked for delegates to download only after you approve the results in the Results Approvals tab.</em>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
