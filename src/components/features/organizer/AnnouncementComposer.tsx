import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Send, Save, Users, AlertCircle, Search, X, Building2, Eye, Pencil, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { marked } from 'marked';
import { useAuth } from '@/contexts/AuthContext';
import { useEventPlan } from '@/lib/hooks/useEventPlan';
import { ProGate } from '@/components/ProGate';
import { RichTextEditor } from '@/components/features/shared/RichTextEditor';
import { AiAssistBar } from '@/components/session/ai/AiAssist';
import { buildAnnouncementEmailHtml } from '@/lib/email/announcementTemplate';
import { getApplicationsByEvent, ApplicationData } from '@/lib/services/applicationService';
import { getEventById } from '@/lib/services/eventService';
import { belongsToCommittee } from '@/lib/utils/committee';

interface AnnouncementComposerProps {
  eventId: string;
  onSend: (announcement: any) => Promise<void>;
  onSaveDraft: (announcement: any) => Promise<void>;
  onSchedule?: (announcement: any) => Promise<void>;
  /** A draft being edited: the composer starts from its subject, body and audience. */
  initial?: { subject?: string; body?: string; audience?: { roles?: string[]; committees?: string[]; userIds?: string[]; paymentStatus?: string } };
}

const ROLES = [
  { id: 'delegate', label: 'Delegates' },
  { id: 'chair', label: 'Chairs & Directors' },
  { id: 'observer', label: 'Observers' },
  { id: 'faculty-advisor', label: 'Faculty Advisors' },
  { id: 'staff', label: 'Staff & Team' }
];

const ROLE_KEYWORDS: Record<string, string[]> = {
  'delegate': ['delegate'],
  'chair': ['chair', 'director', 'vice-chair'],
  'observer': ['observer'],
  'faculty-advisor': ['faculty advisor', 'faculty-advisor'],
  'staff': ['staff', 'co-organizer', 'usg'],
};

/** True if the application belongs to any of the selected committees (empty = all). */
function appInCommittees(app: ApplicationData, committees: string[]): boolean {
  if (committees.length === 0) return true;
  // Effective committee only — a migrated delegate must not match their old committee
  // via the stale preference mirror.
  return committees.some(c => belongsToCommittee(app, c));
}

function appRoleMatches(app: ApplicationData, roles: string[]): boolean {
  return roles.some(rid =>
    ROLE_KEYWORDS[rid]?.some(kw => app.role?.toLowerCase().includes(kw))
  );
}

// 'paid' = settled; 'unpaid' = anything not settled.
function appPaymentMatches(app: ApplicationData, status: string): boolean {
  if (status === 'all') return true;
  const isPaid = app.paymentStatus === 'paid';
  return status === 'paid' ? isPaid : !isPaid;
}

export function AnnouncementComposer({ eventId, onSend, onSaveDraft, onSchedule, initial }: AnnouncementComposerProps) {
  const { profile } = useAuth();
  // Sends over 50 come with the event's plan (eventPlan.ts), not the sender.
  const { plan } = useEventPlan(eventId);
  const isPro = !!plan?.features.bulkEmail;

  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [preview, setPreview] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');   // datetime-local string
  const [selectedRoles, setSelectedRoles] = useState<string[]>(initial?.audience?.roles ?? ['delegate']);
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>(initial?.audience?.committees ?? []);
  const [paymentStatus, setPaymentStatus] = useState(initial?.audience?.paymentStatus ?? 'all');
  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [committees, setCommittees] = useState<string[]>([]);
  const [eventTitle, setEventTitle] = useState('MUN Event');

  // Specific-user targeting (overrides role/committee filters when non-empty).
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(initial?.audience?.userIds ?? []);

  useEffect(() => {
    getApplicationsByEvent(eventId).then(apps => {
      setApplications(apps.filter(a => a.status === 'approved' || a.status === 'pending'));
    });
    getEventById(eventId).then(ev => {
      setCommittees((ev?.committees ?? []).map(c => c.name).filter(Boolean));
      if (ev?.title) setEventTitle(ev.title);
    });
  }, [eventId]);

  const usingSpecificUsers = selectedUserIds.length > 0;

  const estimatedRecipients = useMemo(() => {
    if (usingSpecificUsers) return new Set(selectedUserIds).size;
    if (applications.length === 0) return selectedRoles.length * 45;
    const matched = applications.filter(app =>
      appRoleMatches(app, selectedRoles) &&
      appInCommittees(app, selectedCommittees) &&
      appPaymentMatches(app, paymentStatus)
    );
    return new Set(matched.map(a => a.userId)).size;
  }, [applications, selectedRoles, selectedCommittees, selectedUserIds, usingSpecificUsers, paymentStatus]);

  // Distinct applicants matching the user search box (for specific targeting).
  const searchResults = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: { userId: string; name: string; email: string; role: string }[] = [];
    for (const app of applications) {
      const uid = app.userId;
      if (!uid || seen.has(uid)) continue;
      const name = app.applicantName || '';
      const email = app.applicantEmail || '';
      if (
        name.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        (app.role || '').toLowerCase().includes(q)
      ) {
        seen.add(uid);
        out.push({ userId: uid, name: name || 'User', email, role: app.role || 'Participant' });
      }
      if (out.length >= 30) break;
    }
    return out;
  }, [userSearch, applications]);

  const selectedUsers = useMemo(() => {
    const byId = new Map<string, { userId: string; name: string; email: string }>();
    for (const app of applications) {
      if (app.userId && selectedUserIds.includes(app.userId) && !byId.has(app.userId)) {
        byId.set(app.userId, {
          userId: app.userId,
          name: app.applicantName || 'User',
          email: app.applicantEmail || '',
        });
      }
    }
    return selectedUserIds.map(id => byId.get(id) ?? { userId: id, name: 'User', email: '' });
  }, [selectedUserIds, applications]);

  const handleRoleToggle = (roleId: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };

  const handleCommitteeToggle = (name: string) => {
    setSelectedCommittees(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const handleUserToggle = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const buildAudience = () => ({
    roles: selectedRoles,
    committees: selectedCommittees,
    userIds: selectedUserIds,
    paymentStatus,
  });

  // Live email preview — exactly the template recipients receive (markdown → HTML).
  const previewHtml = useMemo(
    () => buildAnnouncementEmailHtml({
      subject: subject || 'Subject line',
      eventTitle,
      senderName: profile?.displayName || 'Organizer',
      bodyHtml: marked.parse(body || '*Your message preview…*', { async: false }) as string,
    }),
    [subject, body, eventTitle, profile?.displayName]
  );

  // Millis for a scheduled send, or null if not a valid future time.
  const scheduleMs = useMemo(() => {
    if (!scheduleAt) return null;
    const ms = new Date(scheduleAt).getTime();
    return Number.isFinite(ms) && ms > Date.now() ? ms : null;
  }, [scheduleAt]);
  const scheduleInvalid = !!scheduleAt && scheduleMs === null;

  const handleSchedule = async () => {
    if (!subject || !body || !scheduleMs || !onSchedule) return;
    if (estimatedRecipients > 50 && !isPro) return;
    setLoading(true);
    await onSchedule({
      subject, body,
      audience: buildAudience(),
      recipientCount: estimatedRecipients,
      status: 'scheduled',
      scheduledAt: scheduleMs,
      sentAt: null,
    });
    setLoading(false);
    setSubject(''); setBody(''); setScheduleAt('');
  };

  const handleSend = async () => {
    if (!subject || !body) return;
    if (estimatedRecipients > 50 && !isPro) {
      return;
    }
    setLoading(true);
    await onSend({
      subject, body,
      audience: buildAudience(),
      recipientCount: estimatedRecipients,
      status: 'queued',
      sentAt: new Date().toISOString(),
    });
    setLoading(false);
    setSubject(''); setBody('');
  };

  const handleDraft = async () => {
    if (!subject) return;
    setLoading(true);
    await onSaveDraft({
      subject, body,
      audience: buildAudience(),
      recipientCount: estimatedRecipients,
      status: 'draft',
      sentAt: null,
    });
    setLoading(false);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>New Announcement</CardTitle>
        <CardDescription>Compose and send emails to specific participant groups.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="subject">Subject Line</Label>
          <Input
            id="subject"
            placeholder="e.g. Conference Schedule Update"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
          <AiAssistBar
            value={subject}
            onPick={setSubject}
            field="announcement_subject"
            context={{ subject: body.slice(0, 160) }}
            suggestLabel="Subject ideas"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="body">Email Body</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => setPreview(p => !p)}
            >
              {preview ? <><Pencil className="w-3.5 h-3.5" /> Edit</> : <><Eye className="w-3.5 h-3.5" /> Preview email</>}
            </Button>
          </div>
          {preview ? (
            <div className="rounded-xl border overflow-hidden bg-white">
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                className="w-full h-[520px] border-0"
                sandbox=""
              />
            </div>
          ) : (
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Write your announcement… use the toolbar or Ctrl+B / Ctrl+I / Ctrl+U"
              minHeightClass="min-h-[220px]"
              ai={{ surface: "announcement-email", context: { subject } }}
            />
          )}
        </div>

        <div className="bg-secondary p-4 rounded-xl border space-y-4">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Audience Filtering
          </h4>

          <fieldset disabled={usingSpecificUsers} className={usingSpecificUsers ? 'opacity-50 pointer-events-none space-y-4' : 'space-y-4'}>
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Target Roles</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {ROLES.map(role => (
                  <div key={role.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`role-${role.id}`}
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={() => handleRoleToggle(role.id)}
                    />
                    <label htmlFor={`role-${role.id}`} className="text-sm font-medium leading-none cursor-pointer">
                      {role.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t">
              <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Target Committees
                <span className="font-normal normal-case">(none selected = all committees)</span>
              </Label>
              {committees.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No committees configured for this event.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-44 overflow-y-auto pr-1">
                  {committees.map(name => (
                    <div key={name} className="flex items-center space-x-2">
                      <Checkbox
                        id={`cmt-${name}`}
                        checked={selectedCommittees.includes(name)}
                        onCheckedChange={() => handleCommitteeToggle(name)}
                      />
                      <label htmlFor={`cmt-${name}`} className="text-sm leading-none cursor-pointer truncate" title={name}>
                        {name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t">
              <Label className="text-xs text-muted-foreground mb-2 block">Payment Status</Label>
              <div className="flex gap-4">
                {['all', 'paid', 'unpaid'].map(status => (
                  <div key={status} className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id={`pay-${status}`}
                      name="paymentStatus"
                      value={status}
                      checked={paymentStatus === status}
                      onChange={() => setPaymentStatus(status)}
                      className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                    />
                    <label htmlFor={`pay-${status}`} className="text-sm cursor-pointer capitalize">{status}</label>
                  </div>
                ))}
              </div>
            </div>
          </fieldset>

          {/* Specific user targeting */}
          <div className="pt-2 border-t space-y-3">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" /> Search Specific Users
              <span className="font-normal normal-case">(overrides filters above)</span>
            </Label>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or role..."
                className="pl-8 h-9 text-sm bg-card"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
              />
            </div>

            {userSearch.trim() && (
              <div className="max-h-52 overflow-y-auto border rounded-lg divide-y bg-card">
                {searchResults.length === 0 ? (
                  <div className="text-center py-5 text-sm text-muted-foreground">No matching users found</div>
                ) : (
                  searchResults.map(u => {
                    const checked = selectedUserIds.includes(u.userId);
                    return (
                      <button
                        type="button"
                        key={u.userId}
                        onClick={() => handleUserToggle(u.userId)}
                        className="w-full flex items-center gap-2.5 p-2.5 text-left hover:bg-secondary transition-colors"
                      >
                        <Checkbox checked={checked} className="pointer-events-none" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate leading-none mb-1">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 whitespace-nowrap">{u.role}</Badge>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {selectedUsers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary dark:text-primary">
                    {selectedUsers.length} user{selectedUsers.length > 1 ? 's' : ''} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds([])}
                    className="text-xs text-muted-foreground hover:text-red-600"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map(u => (
                    <span
                      key={u.userId}
                      className="inline-flex items-center gap-1.5 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary border border-primary dark:border-primary/30 rounded-full pl-2.5 pr-1.5 py-1 text-xs"
                    >
                      <span className="truncate max-w-[160px]" title={u.email || u.name}>{u.name}</span>
                      <button
                        type="button"
                        onClick={() => handleUserToggle(u.userId)}
                        className="rounded-full hover:bg-primary/60 dark:hover:bg-primary/40 p-0.5"
                        aria-label={`Remove ${u.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 p-3 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center justify-between border border-primary dark:border-primary/30">
            <div className="text-sm">
              <span className="font-medium text-primary dark:text-primary">Estimated Recipients: </span>
              <span className="font-bold text-primary dark:text-primary">{estimatedRecipients}</span>
              {usingSpecificUsers && (
                <span className="ml-2 text-xs text-primary dark:text-primary">(specific users)</span>
              )}
            </div>
            {estimatedRecipients > 50 && !isPro && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                <AlertCircle className="w-3 h-3 mr-1" /> Pro Required (&gt;50)
              </Badge>
            )}
          </div>
        </div>

        {/* Schedule for later — flips to a "scheduled" doc a cloud function dispatches. */}
        {onSchedule && (
          <div className="p-4 rounded-xl border border-border/60 space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" /> Schedule for later
              <span className="font-normal text-xs text-muted-foreground">(optional — leave empty to send now)</span>
            </Label>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={e => setScheduleAt(e.target.value)}
                className="max-w-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSchedule}
                disabled={loading || !subject || !body || !scheduleMs || (estimatedRecipients > 50 && !isPro)}
                className="gap-1.5"
              >
                <CalendarClock className="w-4 h-4" /> Schedule Send
              </Button>
              {scheduleAt && (
                <button type="button" onClick={() => setScheduleAt('')} className="text-xs text-muted-foreground hover:text-red-600">
                  Clear
                </button>
              )}
            </div>
            {scheduleInvalid && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Pick a date &amp; time in the future.</p>
            )}
            {scheduleMs && (
              <p className="text-xs text-muted-foreground">Will send {new Date(scheduleMs).toLocaleString()}.</p>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between border-t pt-6">
        <Button variant="outline" onClick={handleDraft} disabled={loading || !subject}>
          <Save className="w-4 h-4 mr-2" /> Save Draft
        </Button>
        {estimatedRecipients > 50 ? (
          <ProGate
            feature="Bulk Emails (>50)"
            allowed={isPro}
            lockedFallback={
              <Button disabled className="bg-primary text-white opacity-50">
                <Send className="w-4 h-4 mr-2" /> Send Now
              </Button>
            }
          >
            <Button
              onClick={handleSend}
              disabled={loading || !subject || !body}
              className="bg-primary hover:bg-primary text-white"
            >
              <Send className="w-4 h-4 mr-2" /> Send Now
            </Button>
          </ProGate>
        ) : (
          <Button
            onClick={handleSend}
            disabled={loading || !subject || !body}
            className="bg-primary hover:bg-primary text-white"
          >
            <Send className="w-4 h-4 mr-2" /> Send Now
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
