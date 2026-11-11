'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, PlusCircle, Search, UserCheck } from 'lucide-react';

export interface StaffMember {
  email: string;
  role: 'co-organizer' | 'usg' | 'director' | 'observer';
}

interface ExecutiveBoardAssignerProps {
  staff: StaffMember[];
  onChange: (staff: StaffMember[]) => void;
}

export function ExecutiveBoardAssigner({ staff, onChange }: ExecutiveBoardAssignerProps) {
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<StaffMember['role']>('director');

  const handleAdd = () => {
    if (!newEmail.trim()) return;
    if (staff.some(s => s.email === newEmail.trim())) {
      alert('This user is already on the board.');
      return;
    }
    onChange([...staff, { email: newEmail.trim(), role: newRole }]);
    setNewEmail('');
  };

  const handleRemove = (index: number) => {
    const updated = staff.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleRoleChange = (index: number, role: StaffMember['role']) => {
    const updated = [...staff];
    updated[index].role = role;
    onChange(updated);
  };

  return (
    <div className="space-y-4 bg-secondary p-4 rounded-xl border border-border">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">User Email</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="user@example.com" 
              className="pl-8"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            />
          </div>
        </div>
        <div className="w-full sm:w-48 space-y-1">
          <Label className="text-xs">Role</Label>
          <Select value={newRole} onValueChange={(val: any) => setNewRole(val)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="co-organizer">Co-Organizer</SelectItem>
              <SelectItem value="usg">Under-Secretary-General</SelectItem>
              <SelectItem value="director">Director</SelectItem>
              <SelectItem value="observer">Observer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end pb-0.5">
          <Button type="button" onClick={handleAdd} className="w-full sm:w-auto">
            <PlusCircle className="w-4 h-4 mr-2" /> Add
          </Button>
        </div>
      </div>

      {staff.length > 0 && (
        <div className="mt-4 space-y-2">
          <Label className="text-xs text-muted-foreground">Current Board Members</Label>
          {staff.map((member, idx) => (
            <div key={idx} className="flex items-center justify-between p-2.5 bg-card rounded-lg border shadow-sm">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-primary/10 dark:bg-primary/30 p-1.5 rounded-full text-primary dark:text-primary shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-sm font-medium truncate">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select value={member.role} onValueChange={(val: any) => handleRoleChange(idx, val)}>
                  <SelectTrigger className="h-8 text-xs w-[130px] border-none shadow-none bg-secondary focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="co-organizer" className="text-xs">Co-Organizer</SelectItem>
                    <SelectItem value="usg" className="text-xs">USG</SelectItem>
                    <SelectItem value="director" className="text-xs">Director</SelectItem>
                    <SelectItem value="observer" className="text-xs">Observer</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(idx)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
