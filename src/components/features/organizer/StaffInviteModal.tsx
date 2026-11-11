import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Search, Loader2 } from 'lucide-react';

interface StaffInviteModalProps {
  onSendInvite: (email: string, role: string) => Promise<void>;
  children?: React.ReactNode;
}

export function StaffInviteModal({ onSendInvite, children }: StaffInviteModalProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('chair');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!email) return;
    setLoading(true);
    try {
      await onSendInvite(email, role);
      setOpen(false);
      setEmail('');
      setRole('chair');
    } catch (e) {
      console.error(e);
      alert('Failed to send invite.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div onClick={() => setOpen(true)} className="inline-block cursor-pointer">
        {children || (
          <Button className="bg-primary hover:bg-primary text-white gap-2">
            <UserPlus className="w-4 h-4" />
            Invite Staff
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite Staff Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your conference team. They will receive an email notification.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                id="email" 
                placeholder="colleague@example.com" 
                className="pl-8" 
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(val) => setRole(val || '')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="co-organizer">Co-Organizer</SelectItem>
                <SelectItem value="usg">Under-Secretary-General</SelectItem>
                <SelectItem value="director">Director</SelectItem>
                <SelectItem value="chair">Chair</SelectItem>
                <SelectItem value="vice-chair">Vice Chair</SelectItem>
                <SelectItem value="observer">Observer</SelectItem>
                <SelectItem value="faculty-advisor">Faculty Advisor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={!email || loading} className="bg-primary text-white hover:bg-primary">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Send Invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}
