'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AnnouncementComposer } from '@/components/features/organizer/AnnouncementComposer';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Mail, Plus, History, CheckCircle2, Clock, Eye, Trash2, Users, AlertCircle, Search, User, CalendarClock } from 'lucide-react';
import { marked } from 'marked';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeAnnouncements, deleteAnnouncement, Announcement,
} from '@/lib/services/announcementService';

const getRoleBadgeColor = (role: string) => {
  const r = (role || '').toLowerCase();
  if (r.includes('delegate') || r.includes('lead')) {
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800';
  }
  if (r.includes('chair') || r.includes('director') || r.includes('vice-chair')) {
    return 'bg-primary/10 text-primary border-primary dark:bg-primary/20 dark:text-primary dark:border-primary';
  }
  if (r.includes('observer')) {
    return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800';
  }
  if (r.includes('advisor') || r.includes('faculty')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
  }
  if (r.includes('staff') || r.includes('organizer') || r.includes('usg')) {
    return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/20 dark:text-slate-300 dark:border-slate-800';
};

export default function AnnouncementsPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isComposing, setIsComposing] = useState(false);
  // The draft open in the composer (Edit on a draft): saving updates it, sending replaces it.
  const [editingDraft, setEditingDraft] = useState<Announcement | null>(null);
  const closeComposer = () => { setIsComposing(false); setEditingDraft(null); };
  const [selectedAnn, setSelectedAnn] = useState<Announcement | null>(null);
  const [sending, setSending] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');

  useEffect(() => {
    setRecipientSearch('');
  }, [selectedAnn]);

  useEffect(() => {
    const unsubscribe = subscribeAnnouncements(eventId, (list) => {
      setAnnouncements(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [eventId]);


  const handleSend = async (data: any) => {
    setSending(true);
    try {
      const idToken = await user?.getIdToken();
      await fetch('/api/announcements/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          eventId,
          subject: data.subject,
          body: data.body,
          audience: {
            roles: data.audience.roles,
            committees: data.audience.committees ?? [],
            userIds: data.audience.userIds ?? [],
            paymentStatus: data.audience.paymentStatus,
          },
          sentBy: user?.uid ?? '',
          recipientCount: data.recipientCount,
        }),
      });
      if (editingDraft?.id) await deleteAnnouncement(eventId, editingDraft.id);
    } catch (err) {
      console.error('Announcement send error:', err);
    } finally {
      setSending(false);
      closeComposer();
    }
  };

  const handleSaveDraft = async (data: any) => {
    const { saveAnnouncement, updateAnnouncement } = await import('@/lib/services/announcementService');
    if (editingDraft?.id) {
      await updateAnnouncement(eventId, editingDraft.id, {
        subject: data.subject,
        body: data.body,
        audience: {
          roles: data.audience.roles,
          committees: data.audience.committees ?? [],
          userIds: data.audience.userIds ?? [],
          paymentStatus: data.audience.paymentStatus,
        },
        recipientCount: data.recipientCount,
      });
      closeComposer();
      return;
    }
    await saveAnnouncement(eventId, {
      subject: data.subject,
      body: data.body,
      audience: {
        roles: data.audience.roles,
        committees: data.audience.committees ?? [],
        userIds: data.audience.userIds ?? [],
        paymentStatus: data.audience.paymentStatus,
      },
      status: 'draft',
      sentBy: user?.uid ?? '',
      recipientCount: data.recipientCount,
    });
    closeComposer();
  };

  const handleSchedule = async (data: any) => {
    const { saveAnnouncement } = await import('@/lib/services/announcementService');
    if (editingDraft?.id) await deleteAnnouncement(eventId, editingDraft.id);
    await saveAnnouncement(eventId, {
      subject: data.subject,
      body: data.body,
      audience: {
        roles: data.audience.roles,
        committees: data.audience.committees ?? [],
        userIds: data.audience.userIds ?? [],
        paymentStatus: data.audience.paymentStatus,
      },
      status: 'scheduled',
      scheduledAt: data.scheduledAt,
      sentBy: user?.uid ?? '',
      recipientCount: data.recipientCount,
    });
    closeComposer();
  };

  const handleDeleteDraft = async (id: string) => {
    await deleteAnnouncement(eventId, id);
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  };

  const formatDate = (val: any) => {
    if (!val) return '—';
    try {
      return new Date(val.toDate ? val.toDate() : val).toLocaleString();
    } catch {
      return '—';
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto py-10 max-w-5xl space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Communication</h1>
            <p className="text-muted-foreground mt-1">
              Send email blasts to participants and manage your announcement history.
            </p>
          </div>
          {!isComposing && (
            <Button onClick={() => setIsComposing(true)} className="bg-primary hover:bg-primary text-white gap-2">
              <Plus className="w-4 h-4" /> New Announcement
            </Button>
          )}
        </div>

        {isComposing ? (
          <div className="space-y-4">
            <Button variant="ghost" onClick={closeComposer} className="mb-2">
              ← Back to History
            </Button>
            <AnnouncementComposer
              key={editingDraft?.id ?? 'new'}
              eventId={eventId}
              initial={editingDraft ?? undefined}
              onSend={handleSend}
              onSaveDraft={handleSaveDraft}
              onSchedule={handleSchedule}
            />
            {sending && (
              <p className="text-sm text-muted-foreground text-center">Sending emails…</p>
            )}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Announcement History
              </CardTitle>
              <CardDescription>View previously sent emails and saved drafts.</CardDescription>
            </CardHeader>
            <CardContent>
              {announcements.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Mail className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No announcements sent yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {announcements.map(ann => (
                    <div
                      key={ann.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl hover:bg-secondary transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{ann.subject}</h4>
                          {ann.status === 'sent' && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Sent
                            </Badge>
                          )}
                          {ann.status === 'sending' && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              <Clock className="w-3 h-3 mr-1 animate-spin" /> Sending...
                            </Badge>
                          )}
                          {ann.status === 'queued' && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              <Clock className="w-3 h-3 mr-1" /> Queued
                            </Badge>
                          )}
                          {ann.status === 'failed' && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              <AlertCircle className="w-3 h-3 mr-1" /> Failed
                            </Badge>
                          )}
                          {ann.status === 'partial' && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              Partial Delivery
                            </Badge>
                          )}
                          {ann.status === 'draft' && (
                            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                              <Clock className="w-3 h-3 mr-1" /> Draft
                            </Badge>
                          )}
                          {ann.status === 'scheduled' && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary">
                              <CalendarClock className="w-3 h-3 mr-1" />
                              {ann.scheduledAt ? `Scheduled · ${new Date(ann.scheduledAt).toLocaleString()}` : 'Scheduled'}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-4">
                          <span>
                            <strong>To:</strong>{' '}
                            {ann.audience.userIds && ann.audience.userIds.length > 0
                              ? `${ann.audience.userIds.length} specific user(s)`
                              : `${ann.audience.roles.join(', ') || 'All'}${
                                  ann.audience.committees && ann.audience.committees.length > 0
                                    ? ` · ${ann.audience.committees.join(', ')}`
                                    : ''
                                } (${ann.audience.paymentStatus})`}
                          </span>
                          <span>•</span>
                          <span>{ann.recipientCount} recipients</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4 sm:mt-0 text-sm">
                        {ann.status === 'draft' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => { setEditingDraft(ann); setIsComposing(true); }}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-red-600"
                              onClick={() => handleDeleteDraft(ann.id!)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {ann.status === 'scheduled' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                            onClick={() => handleDeleteDraft(ann.id!)}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Cancel
                          </Button>
                        )}
                        {['queued', 'sending', 'sent', 'partial', 'failed'].includes(ann.status) && (
                          <span className="text-muted-foreground text-xs flex flex-col text-right">
                            <span>{formatDate(ann.sentAt)}</span>
                            {ann.deliveryStats && (
                              <span className="text-[10px] mt-0.5">
                                {ann.deliveryStats.sent} sent, {ann.deliveryStats.failed} failed
                              </span>
                            )}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedAnn(ann)}
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Announcement detail drawer */}
      <Sheet open={!!selectedAnn} onOpenChange={(open: boolean) => { if (!open) setSelectedAnn(null); }}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="pr-8">{selectedAnn?.subject}</SheetTitle>
            <SheetDescription>
              {selectedAnn?.sentAt ? formatDate(selectedAnn.sentAt) : 'Draft'}
            </SheetDescription>
          </SheetHeader>

          {selectedAnn && (
            <div className="p-4 space-y-6">
              {/* Status */}
              <div className="flex items-center gap-2">
                {selectedAnn.status === 'sent' && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Sent
                  </Badge>
                )}
                {selectedAnn.status === 'failed' && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    <AlertCircle className="w-3 h-3 mr-1" /> Failed
                  </Badge>
                )}
                {selectedAnn.status === 'partial' && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Partial Delivery
                  </Badge>
                )}
                {selectedAnn.status === 'draft' && (
                  <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                    Draft
                  </Badge>
                )}
                {selectedAnn.status === 'sending' && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    <Clock className="w-3 h-3 mr-1 animate-spin" /> Sending...
                  </Badge>
                )}
                {selectedAnn.status === 'queued' && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    <Clock className="w-3 h-3 mr-1" /> Queued
                  </Badge>
                )}
              </div>

              {/* Audience + stats */}
              <div className="bg-secondary rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span className="font-medium">Audience</span>
                </div>
                {selectedAnn.audience.userIds && selectedAnn.audience.userIds.length > 0 ? (
                  <p className="text-sm">
                    <strong>Target:</strong> {selectedAnn.audience.userIds.length} specifically selected user(s)
                  </p>
                ) : (
                  <>
                    <p className="text-sm">
                      <strong>Roles:</strong> {selectedAnn.audience.roles.join(', ') || 'All'}
                    </p>
                    {selectedAnn.audience.committees && selectedAnn.audience.committees.length > 0 && (
                      <p className="text-sm">
                        <strong>Committees:</strong> {selectedAnn.audience.committees.join(', ')}
                      </p>
                    )}
                    <p className="text-sm">
                      <strong>Payment:</strong> {selectedAnn.audience.paymentStatus}
                    </p>
                  </>
                )}
                <p className="text-sm">
                  <strong>Recipients:</strong> {selectedAnn.recipientCount}
                </p>
                {selectedAnn.deliveryStats && (
                  <div className="flex gap-4 pt-1 border-t">
                    <span className="text-green-600 font-medium">
                      ✓ {selectedAnn.deliveryStats.sent} delivered
                    </span>
                    {selectedAnn.deliveryStats.failed > 0 && (
                      <span className="text-red-600 font-medium">
                        ✗ {selectedAnn.deliveryStats.failed} failed
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Recipients list */}
              {selectedAnn.status !== 'draft' && (() => {
                // Only the list the sender recorded. (Guessing from roles alone ignored the
                // committee, payment and specific-people filters, so it named the wrong people.)
                const getRecipientsList = (ann: Announcement) => ann.recipients ?? [];

                const recipientsList = getRecipientsList(selectedAnn);
                const filteredRecipients = recipientsList.filter(r => {
                  const q = recipientSearch.toLowerCase();
                  return (r.name || '').toLowerCase().includes(q) ||
                         (r.email || '').toLowerCase().includes(q) ||
                         (r.role || '').toLowerCase().includes(q);
                });

                return (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Recipients ({recipientsList.length})
                    </p>
                    <div className="border rounded-lg bg-secondary p-3 space-y-3">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by name, email, or role..."
                          className="pl-8 text-sm h-9 bg-card"
                          value={recipientSearch}
                          onChange={(e) => setRecipientSearch(e.target.value)}
                        />
                      </div>
                      
                      <div className="max-h-60 overflow-y-auto border rounded-md divide-y bg-card">
                        {filteredRecipients.length === 0 ? (
                          <div className="text-center py-6 text-sm text-muted-foreground">
                            {recipientSearch ? 'No matching recipients found' : "The recipient list wasn't recorded for this announcement."}
                          </div>
                        ) : (
                          filteredRecipients.map((rec, idx) => (
                            <div key={rec.uid || idx} className="flex items-center justify-between p-2.5 hover:bg-secondary transition-colors">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-primary/10 dark:bg-primary/50 flex items-center justify-center flex-shrink-0 text-primary dark:text-primary font-semibold text-xs uppercase">
                                  {rec.name ? rec.name.charAt(0) : 'U'}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate leading-none mb-1">
                                    {rec.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {rec.email}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 font-medium whitespace-nowrap ${getRoleBadgeColor(rec.role)}`}>
                                {rec.role}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Body */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Message
                </p>
                {selectedAnn.body ? (
                  <div
                    className="markdown-content rounded-lg border p-4 text-sm leading-relaxed bg-card"
                    dangerouslySetInnerHTML={{ __html: marked.parse(selectedAnn.body, { async: false }) as string }}
                  />
                ) : (
                  <div className="rounded-lg border p-4 text-sm bg-card">
                    <span className="text-muted-foreground italic">No content</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
