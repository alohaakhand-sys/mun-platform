'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Clock, AlertCircle, Trophy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getEventResults, approveResult, requestRevision, bulkApprove, DelegateResult,
} from '@/lib/services/resultService';
import { getApplicationsByEvent } from '@/lib/services/applicationService';
import { getEventById } from '@/lib/services/eventService';
import { notifyCertificateReady } from '@/lib/services/notifyService';
import { getEventStandings, type CommitteeStandings } from '@/lib/services/standingsService';
import { CommitteeLeaderboard } from '@/components/marking/Leaderboard';

export default function ResultsApprovalPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();

  const [results, setResults] = useState<DelegateResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailByUid, setEmailByUid] = useState<Record<string, string>>({});
  const [eventTitle, setEventTitle] = useState("the conference");
  // Chair-published boards, one doc per committee — cheaper and safer than scanning every
  // marking doc in the event, and it shows exactly what the delegates were shown.
  const [standings, setStandings] = useState<CommitteeStandings[]>([]);
  const [boardCommittee, setBoardCommittee] = useState<string>("__all__");

  useEffect(() => {
    Promise.all([
      getEventResults(eventId), getApplicationsByEvent(eventId), getEventById(eventId), getEventStandings(eventId),
    ]).then(([list, apps, ev, boards]) => {
      setResults(list);
      const map: Record<string, string> = {};
      apps.forEach(a => { if (a.userId && a.applicantEmail) map[a.userId] = a.applicantEmail; });
      setEmailByUid(map);
      if (ev?.title) setEventTitle(ev.title);
      setStandings(boards);
      setLoading(false);
    });
  }, [eventId]);

  /** Every published entry, flattened, so the event-wide board can rank across committees. */
  const allEntries = useMemo(
    () => standings.flatMap(s => s.entries.map(e => ({ ...e, committeeId: s.committeeId }))),
    [standings],
  );
  const boardEntries = boardCommittee === "__all__"
    ? allEntries
    : allEntries.filter(e => e.committeeId === boardCommittee);

  const handleApprove = async (id: string) => {
    if (!user) return;
    await approveResult(eventId, id, user.uid);
    setResults(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' as const } : r));
    const r = results.find(x => x.id === id);
    if (r && emailByUid[r.delegateUid]) notifyCertificateReady(eventId, emailByUid[r.delegateUid], eventTitle);
  };

  const handleRequestRevision = async (id: string) => {
    const notes = window.prompt('Revision notes for the chair:');
    if (notes === null) return;
    await requestRevision(eventId, id, notes || 'Revision requested');
    setResults(prev => prev.map(r => r.id === id ? { ...r, status: 'revision_requested' as const } : r));
  };

  const handleBulkApprove = async () => {
    if (!user) return;
    const pending = results.filter(r => r.status === 'pending');
    await bulkApprove(eventId, pending.map(r => r.id!), user.uid);
    setResults(prev => prev.map(r => r.status === 'pending' ? { ...r, status: 'approved' as const } : r));
    // Notify each newly-approved delegate that their certificate is ready.
    const emailed = new Set<string>();
    for (const r of pending) {
      const to = emailByUid[r.delegateUid];
      if (to && !emailed.has(to)) { notifyCertificateReady(eventId, to, eventTitle); emailed.add(to); }
    }
  };

  const pendingCount = results.filter(r => r.status === 'pending').length;

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Result Approvals</h1>
          <p className="text-muted-foreground mt-1">
            Review and approve awards submitted by Chairs. Approval unlocks certificate downloads for delegates.
          </p>
        </div>
        <Button
          onClick={handleBulkApprove}
          disabled={pendingCount === 0}
          className="bg-green-600 hover:bg-green-700 text-white gap-2"
        >
          <CheckCircle2 className="w-4 h-4" /> Approve All Pending ({pendingCount})
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" /> Standings
              </CardTitle>
              <CardDescription>
                {standings.length === 0
                  ? "No chair has published a committee board yet."
                  : `Published by ${standings.length} committee${standings.length === 1 ? "" : "s"} — the same ranking those delegates can see.`}
              </CardDescription>
            </div>
            {standings.length > 1 && (
              <Select value={boardCommittee} onValueChange={(v) => setBoardCommittee(v || "__all__")}>
                <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All committees</SelectItem>
                  {standings.map(s => (
                    <SelectItem key={s.committeeId} value={s.committeeId}>{s.committeeId}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <CommitteeLeaderboard
            entries={boardEntries}
            emptyHint="Nothing published yet — chairs publish standings from their Awards & Results tab."
            maxRows={boardCommittee === "__all__" ? 25 : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submitted Awards</CardTitle>
          <CardDescription>Final review of committee results.</CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No results submitted yet.</div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b">
                  <tr>
                    <th className="text-left font-medium p-3">Delegate</th>
                    <th className="text-left font-medium p-3">Committee</th>
                    <th className="text-left font-medium p-3">Award</th>
                    <th className="text-center font-medium p-3">Score</th>
                    <th className="text-center font-medium p-3">Status</th>
                    <th className="text-right font-medium p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map(result => (
                    <tr key={result.id} className="hover:bg-secondary">
                      <td className="p-3">
                        <p className="font-medium">{result.delegateName}</p>
                        <p className="text-xs text-muted-foreground">{result.committeeId}</p>
                      </td>
                      <td className="p-3 font-medium">{result.committeeName}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{result.awardType.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="p-3 text-center font-mono">{result.score}/100</td>
                      <td className="p-3 text-center">
                        {result.status === 'pending' && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>
                        )}
                        {result.status === 'approved' && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>
                        )}
                        {result.status === 'revision_requested' && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><AlertCircle className="w-3 h-3 mr-1" /> Revision</Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {result.status === 'pending' && (
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleRequestRevision(result.id!)}>
                              Revise
                            </Button>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApprove(result.id!)}>
                              Approve
                            </Button>
                          </div>
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
