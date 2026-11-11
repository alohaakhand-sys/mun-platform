import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Clock, CheckCircle2, XCircle } from 'lucide-react';

export interface WaitlistEntry {
  id: string;
  applicantName: string;
  applicantEmail: string;
  position: number;
  appliedDate: string;
  status: 'waiting' | 'offered' | 'accepted' | 'expired';
}

interface WaitlistTableProps {
  committeeName: string;
  entries: WaitlistEntry[];
  onOfferSeat: (entryId: string) => void;
}

export function WaitlistTable({ committeeName, entries, onOfferSeat }: WaitlistTableProps) {
  if (!entries || entries.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-md flex items-center gap-2">
          {committeeName} Waitlist
          <Badge variant="secondary" className="ml-2 font-normal">{entries.length} waiting</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left font-medium p-3 w-12 text-center">#</th>
                <th className="text-left font-medium p-3">Applicant</th>
                <th className="text-left font-medium p-3">Applied Date</th>
                <th className="text-center font-medium p-3">Status</th>
                <th className="text-right font-medium p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-secondary">
                  <td className="p-3 text-center font-semibold text-muted-foreground">{entry.position}</td>
                  <td className="p-3">
                    <p className="font-medium">{entry.applicantName}</p>
                    <p className="text-xs text-muted-foreground">{entry.applicantEmail}</p>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{entry.appliedDate}</td>
                  <td className="p-3 text-center">
                    {entry.status === 'waiting' && <Badge variant="outline" className="text-slate-500"><Clock className="w-3 h-3 mr-1" /> Waiting</Badge>}
                    {entry.status === 'offered' && <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200"><Mail className="w-3 h-3 mr-1" /> Offered (48h)</Badge>}
                    {entry.status === 'accepted' && <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Accepted</Badge>}
                    {entry.status === 'expired' && <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200"><XCircle className="w-3 h-3 mr-1" /> Expired</Badge>}
                  </td>
                  <td className="p-3 text-right">
                    <Button 
                      size="sm" 
                      variant={entry.status === 'waiting' ? 'default' : 'outline'}
                      disabled={entry.status !== 'waiting'}
                      onClick={() => onOfferSeat(entry.id)}
                      className={entry.status === 'waiting' ? "bg-primary hover:bg-primary text-white" : ""}
                    >
                      {entry.status === 'waiting' ? 'Offer Seat' : 'Offered'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
