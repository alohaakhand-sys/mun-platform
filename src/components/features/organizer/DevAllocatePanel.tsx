'use client';

/**
 * App Admin test tool (dashboard/admin/events/[id]/test-allocate): pick any delegate and force
 * a committee + country assignment (and mark them approved) without going through the normal
 * review/country-assignment flow, to test downstream delegate features. Creating an application
 * on someone else's behalf is allowed to an App Admin only (firestore.rules, applications create),
 * so never mount this on an organizer page.
 *
 * Sources shown:
 *   - real applications (`applications` collection),
 *   - delegates invited via the Staff/Invitation tab (`events/{id}/staff` with a
 *     delegate role) — these have NO application, so allocating one creates it, and
 *   - any registered platform user with neither of the above. Without this third source
 *     the panel was permanently empty on a fresh event: nobody had applied yet, and the
 *     Invitation tab cannot create a delegate staff doc at all (STAFF_ROLE_OPTIONS has
 *     no "delegate" entry — it invites organizers/EB/chairs/observers only).
 *
 * Gated in the Allocation page so it only renders in dev (NODE_ENV !== production)
 * or when the URL carries ?dev=1.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { getCountryName } from '@/lib/data/countries';
import { getEventById, Committee } from '@/lib/services/eventService';
import {
  getApplicationsByEvent,
  updateApplication,
  devUpsertAllocatedApplication,
  ApplicationData,
} from '@/lib/services/applicationService';
import { getEventStaff, updateStaffMember, isDelegateRole } from '@/lib/services/staffService';
import { getAllUsers } from '@/lib/services/userService';
import { FlaskConical, Loader2, Check, Search } from 'lucide-react';

// A unified allocation target — either a real application or an invited staff-delegate.
interface Row {
  key: string;
  source: 'application' | 'staff' | 'user';
  appId?: string;
  staffId?: string;
  uid: string;
  name: string;
  email: string;
  status: string;
  role: string;
  committee: string;
  country: string;
}

interface Draft {
  committee: string;
  country: string;
}

// Same test the dashboard layout uses to route someone into the admin-only area.
const isAppAdmin = (u: { role?: string; isAdmin?: boolean }) =>
  u.role === 'App Admin' || u.role === 'admin' || u.isAdmin === true;

export function DevAllocatePanel() {
  const params = useParams();
  const eventId = params.id as string;

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      const [event, applications, staff, users] = await Promise.all([
        getEventById(eventId),
        getApplicationsByEvent(eventId),
        getEventStaff(eventId),
        getAllUsers(),
      ]);
      setCommittees(event?.committees ?? []);

      const uidByEmail = new Map(users.map(u => [(u.email || '').toLowerCase(), u.uid]));

      const appRows: Row[] = applications
        .filter(a => a.id)
        .map(a => ({
          key: `app:${a.id}`,
          source: 'application' as const,
          appId: a.id,
          uid: a.userId,
          name: a.applicantName || 'Unnamed',
          email: a.applicantEmail || '',
          status: a.status,
          role: a.role,
          committee: a.assignedCommittee ?? '',
          country: a.assignedCountry ?? '',
        }));

      // Emails/uids already covered by a real application — don't double-list them.
      const claimedEmails = new Set(appRows.map(r => r.email.toLowerCase()).filter(Boolean));
      const claimedUids = new Set(appRows.map(r => r.uid).filter(Boolean));

      const staffRows: Row[] = staff
        .filter(s => isDelegateRole(s.role) && s.id)
        .filter(s => !claimedEmails.has((s.email || '').toLowerCase()))
        .filter(s => !s.uid || !claimedUids.has(s.uid))
        .map(s => ({
          key: `staff:${s.id}`,
          source: 'staff' as const,
          staffId: s.id,
          uid: s.uid || uidByEmail.get((s.email || '').toLowerCase()) || '',
          name: s.name && s.name !== 'Pending User' ? s.name : (s.email || 'Invited delegate'),
          email: s.email || '',
          status: s.inviteStatus,
          role: 'delegate (invited)',
          committee: s.committeeId ?? '',
          country: '',
        }));

      // Everyone else with an account. Claimed = already listed above, either as an
      // applicant or as an invited staff member (staff of any role — a chair must not
      // show up here as an allocatable delegate).
      const staffUids = new Set(staff.map(s => s.uid).filter(Boolean));
      const staffEmails = new Set(staff.map(s => (s.email || '').toLowerCase()).filter(Boolean));
      const userRows: Row[] = users
        // App admins have no delegate dashboard (the layout bounces them to /dashboard/admin),
        // so allocating one produces an application nobody can ever open.
        .filter(u => !isAppAdmin(u))
        .filter(u => u.uid && !claimedUids.has(u.uid) && !staffUids.has(u.uid))
        .filter(u => !claimedEmails.has((u.email || '').toLowerCase()))
        .filter(u => !staffEmails.has((u.email || '').toLowerCase()))
        .map(u => ({
          key: `user:${u.uid}`,
          source: 'user' as const,
          uid: u.uid,
          name: u.displayName || u.email || 'Unnamed user',
          email: u.email || '',
          status: 'no application',
          role: 'registered user',
          committee: '',
          country: '',
        }));

      const allRows = [...appRows, ...staffRows, ...userRows];
      setRows(allRows);

      const initial: Record<string, Draft> = {};
      for (const r of allRows) initial[r.key] = { committee: r.committee, country: r.country };
      setDrafts(initial);
      setLoading(false);
    }
    load();
  }, [eventId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const countriesFor = (committeeName: string) =>
    committees.find(c => c.name === committeeName)?.countries ?? [];

  const setDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setSaved(prev => ({ ...prev, [key]: false }));
  };

  const handleAssign = async (row: Row) => {
    const draft = drafts[row.key];
    if (!draft?.committee || !draft?.country) {
      alert('Pick both a committee and a country first.');
      return;
    }
    if (row.source === 'staff' && !row.uid) {
      alert('This invited delegate has no account yet. They must sign up / log in once with this email before they can be allocated.');
      return;
    }
    setSaving(prev => ({ ...prev, [row.key]: true }));
    try {
      if (row.source === 'application') {
        const res = await updateApplication(row.appId!, {
          status: 'approved',
          assignedCommittee: draft.committee,
          assignedCountry: draft.country,
        });
        if (!res.success) throw res.error ?? new Error('update failed');
      } else {
        if (row.source === 'staff') {
          // Keep the staff doc's committee in sync (drives the invited-delegate's
          // virtual application) before creating/approving the real application.
          await updateStaffMember(eventId, row.staffId!, { committeeId: draft.committee } as any, {
            uid: row.uid,
            email: row.email,
          });
        }
        const res = await devUpsertAllocatedApplication({
          eventId,
          userId: row.uid,
          applicantName: row.name,
          applicantEmail: row.email,
          committee: draft.committee,
          country: draft.country,
        });
        if (!res.success) throw res.error ?? new Error('allocation failed');
      }
      setRows(prev => prev.map(r =>
        r.key === row.key
          ? { ...r, status: 'approved', committee: draft.committee, country: draft.country }
          : r
      ));
      setSaved(prev => ({ ...prev, [row.key]: true }));
    } catch (e) {
      console.error(e);
      alert('Failed to allocate. See console.');
    } finally {
      setSaving(prev => ({ ...prev, [row.key]: false }));
    }
  };

  return (
    <Card className="border-amber-300/60 bg-amber-50/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-amber-600" />
          <CardTitle>Dev Allocate — Delegates</CardTitle>
          <Badge variant="outline" className="border-amber-400 text-amber-700">dev test only</Badge>
        </div>
        <CardDescription>
          Force a committee + country onto any applicant or registered user and mark them approved.
          Bypasses the normal review flow AND the registration fee (stamped <code>devPaid</code>), so the
          delegate lands straight in the portal. This panel is temporary and will be removed before production.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email"
            className="pl-8"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No delegates found.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(row => {
              const draft = drafts[row.key] ?? { committee: '', country: '' };
              const countries = countriesFor(draft.committee);
              const noAccount = row.source === 'staff' && !row.uid;
              return (
                <div
                  key={row.key}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium truncate">{row.name}</p>
                      <Badge variant="outline" className="capitalize text-xs">{row.status}</Badge>
                      <Badge variant="secondary" className="capitalize text-xs">{row.role}</Badge>
                      {noAccount && (
                        <Badge variant="outline" className="border-red-300 text-red-600 text-xs">no account yet</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={draft.committee || null}
                      onValueChange={v => setDraft(row.key, { committee: v ?? '', country: '' })}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Committee" />
                      </SelectTrigger>
                      <SelectContent>
                        {committees.map(c => (
                          <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={draft.country || null}
                      onValueChange={v => setDraft(row.key, { country: v ?? '' })}
                      disabled={!draft.committee}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Country">
                          {draft.country ? (
                            <span className="flex items-center gap-2">
                              <CountryFlag code={draft.country} size={18} />
                              <span className="truncate">{getCountryName(draft.country)}</span>
                            </span>
                          ) : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {countries.map(code => (
                          <SelectItem key={code} value={code}>
                            <span className="flex items-center gap-2">
                              <CountryFlag code={code} size={18} />
                              <span>{getCountryName(code)}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      onClick={() => handleAssign(row)}
                      disabled={saving[row.key] || !draft.committee || !draft.country || noAccount}
                      className="bg-amber-600 text-white hover:bg-amber-700 gap-2"
                    >
                      {saving[row.key] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : saved[row.key] ? (
                        <><Check className="h-4 w-4" /> Allocated</>
                      ) : (
                        'Allocate'
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
