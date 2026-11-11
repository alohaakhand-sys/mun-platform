'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, AlertCircle } from 'lucide-react';
import { getApplicationsByEvent } from '@/lib/services/applicationService';
import { getEventById } from '@/lib/services/eventService';
import { getEventStaff, roleLabel } from '@/lib/services/staffService';
import { getUserProfile } from '@/lib/services/userService';
import { effectiveCommittee } from '@/lib/utils/committee';
import { getCountryName } from '@/lib/data/countries';
import { themeColor, inkOn } from '@/lib/data/eventLook';
import { resolvePlan } from '@/lib/data/eventPlan';
import { auth } from '@/lib/firebase/client';
import type { IdCardPerson, IdCardTemplate } from '@/lib/pdf/idCardsPdf';

// Printable ID cards, built in the browser (the old generateBulkIdCards Cloud Function needs the
// Blaze plan). Delegates come from approved applications; staff from accepted staff docs (plus
// approved chair applications), named from their profiles.

type Group = 'all' | 'delegates' | 'staff';
const STAFF_APP_ROLES = ['staff', 'co-organizer', 'usg', 'chair', 'director', 'vice-chair'];

export default function IdCardsToolPage() {
  const params = useParams();
  const eventId = params.id as string;
  const [template, setTemplate] = useState<IdCardTemplate>('modern');
  const [targetGroup, setTargetGroup] = useState<Group>('all');
  const [eventTitle, setEventTitle] = useState('Conference');
  const [accent, setAccent] = useState('#0B6E4F');
  const [delegates, setDelegates] = useState<(IdCardPerson & { uid: string })[]>([]);
  const [staff, setStaff] = useState<(IdCardPerson & { uid: string })[]>([]);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pro: print each person's QR pass on their card (setup/qr-passes-plan.md).
  const [passesPro, setPassesPro] = useState(false);
  const [withQr, setWithQr] = useState(true);

  useEffect(() => {
    (async () => {
      const [ev, apps, staffDocs] = await Promise.all([getEventById(eventId), getApplicationsByEvent(eventId), getEventStaff(eventId)]);
      if (ev?.title) setEventTitle(ev.title);
      setPassesPro(!!ev && resolvePlan(ev).features.passes);
      const tc = themeColor(ev?.theme);
      if (tc) setAccent(tc);
      const approved = apps.filter(a => a.status === 'approved');
      const isStaffApp = (role?: string) => STAFF_APP_ROLES.some(r => (role || '').toLowerCase().includes(r));
      const del = approved.filter(a => !isStaffApp(a.role)).map(a => ({
        uid: a.userId,
        name: a.applicantName || 'Participant',
        role: a.assignedCountry ? `${a.role || 'Delegate'} of ${getCountryName(a.assignedCountry)}` : (a.role || 'Delegate'),
        committee: effectiveCommittee(a as any) || undefined,
      }));
      const accepted = staffDocs.filter(s => s.inviteStatus === 'accepted');
      const names = await Promise.all(accepted.map(s => s.uid ? getUserProfile(s.uid).catch(() => null) : Promise.resolve(null)));
      const st = accepted.map((s, i) => {
        const p: any = names[i];
        const fromProfile = p?.displayName || [p?.firstName, p?.lastName].filter(Boolean).join(' ');
        return {
          uid: s.uid || s.id || s.email,
          name: fromProfile || (s.name && s.name !== 'Pending User' ? s.name : s.email),
          role: roleLabel(s.role),
          committee: s.committeeId || undefined,
        };
      });
      // A chair who joined through an application has both; the staff doc wins.
      const staffUids = new Set(st.map(s => s.uid));
      const chairApps = approved.filter(a => isStaffApp(a.role) && !staffUids.has(a.userId)).map(a => ({
        uid: a.userId, name: a.applicantName || 'Staff', role: a.role || 'Staff', committee: effectiveCommittee(a as any) || undefined,
      }));
      setDelegates(del);
      setStaff([...st, ...chairApps]);
      setLoadingCounts(false);
    })();
  }, [eventId]);

  const people = useMemo(
    () => targetGroup === 'delegates' ? delegates : targetGroup === 'staff' ? staff : [...staff, ...delegates],
    [targetGroup, delegates, staff],
  );

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { downloadIdCardsPdf } = await import('@/lib/pdf/idCardsPdf');
      // The server signs the passes; a printed card and the phone carry the same code.
      let qrOf: Record<string, string> = {};
      if (passesPro && withQr) {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/passes/codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ eventId, uids: people.map(p => p.uid) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't get the passes.");
        const QRCode = (await import('qrcode')).default;
        const entries = await Promise.all(Object.entries(data.codes as Record<string, string>).map(async ([uid, code]) =>
          [uid, await QRCode.toDataURL(code, { margin: 1, width: 300, errorCorrectionLevel: 'M' })] as const));
        qrOf = Object.fromEntries(entries);
      }
      await downloadIdCardsPdf(
        { eventTitle, template, accent, ink: inkOn(accent), people: people.map(({ uid, name, role, committee }) => ({ name, role, committee, qr: qrOf[uid] })) },
        `${eventTitle} ID cards`,
      );
    } catch (err) {
      console.error('ID card PDF failed:', err);
      setError(err instanceof Error && err.message ? err.message : "Couldn't build the PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ID Cards</h1>
        <p className="text-muted-foreground mt-1">
          Pick a template and who to print for, then download a printable PDF (ten cards per A4 page).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Cards use your event&apos;s theme colour.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template</label>
            <Select value={template} onValueChange={val => { if (val) setTemplate(val as IdCardTemplate); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="modern">Modern</SelectItem>
                <SelectItem value="classic">Classic</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Print for</label>
            {loadingCounts ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={targetGroup} onValueChange={val => { if (val) setTargetGroup(val as Group); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone ({delegates.length + staff.length})</SelectItem>
                  <SelectItem value="delegates">Delegates ({delegates.length})</SelectItem>
                  <SelectItem value="staff">Staff ({staff.length})</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <label className={`flex items-start gap-2 text-sm ${passesPro ? '' : 'opacity-60'}`}>
            <input type="checkbox" className="mt-0.5" checked={passesPro && withQr} disabled={!passesPro} onChange={e => setWithQr(e.target.checked)} />
            <span>
              Print each person&apos;s QR pass on their card
              <span className="block text-xs text-muted-foreground">
                {passesPro ? 'The same code as My Pass on their phone. Resetting a pass makes its printed card stop working.' : 'Comes with a Pro event.'}
              </span>
            </span>
          </label>
          <Button onClick={handleGenerate} disabled={loading || loadingCounts || people.length === 0} className="gap-2">
            <Download className="w-4 h-4" />
            {loading ? 'Building PDF…' : `Download ID Cards (${people.length})`}
          </Button>
          {error && (
            <p className="text-sm text-destructive flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
