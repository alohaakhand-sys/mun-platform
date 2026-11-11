import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export interface PermissionsMap {
  canViewApplications: boolean;
  canMarkDelegates: boolean;
  canSendAnnouncements: boolean;
  canManageSchedule: boolean;
  canViewFinancials: boolean;
  canApproveResults: boolean;
  canScanPasses: boolean;
}

interface PermissionsEditorProps {
  permissions: PermissionsMap;
  onChange: (key: keyof PermissionsMap, value: boolean) => void;
  role: string;
  disabled?: boolean;
}

export function PermissionsEditor({ permissions, onChange, role, disabled = false }: PermissionsEditorProps) {
  const permissionLabels: Record<keyof PermissionsMap, { label: string, description: string }> = {
    canViewApplications: { label: 'View Applications', description: 'See all delegate applications and waitlists.' },
    canMarkDelegates: { label: 'Mark Delegates', description: 'Grade delegates and submit daily scores.' },
    canSendAnnouncements: { label: 'Send Announcements', description: 'Use the bulk email system.' },
    canManageSchedule: { label: 'Manage Schedule', description: 'Edit the event timeline.' },
    canViewFinancials: { label: 'View Financials', description: 'See revenue and ticketing status (Co-organizer only).' },
    canApproveResults: { label: 'Approve Results', description: 'Approve final awards and unlock certificates.' },
    canScanPasses: { label: 'Scan Passes', description: 'Scan QR passes for meals, coupons and check-in.' },
  };

  return (
    <Card className="shadow-sm border-dashed">
      <CardHeader className="pb-3 bg-secondary">
        <CardTitle className="text-sm">Custom Permissions</CardTitle>
        <CardDescription className="text-xs">
          Overrides the default permissions for the <strong>{role}</strong> role. Changes take effect
          after the staff member re-accepts; chair/vice-chair marking is always scoped to their committee.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(permissionLabels) as Array<keyof PermissionsMap>).map((key) => {
          const { label, description } = permissionLabels[key];
          return (
            <div key={key} className="flex items-center justify-between space-x-2 p-2 rounded-md hover:bg-secondary transition-colors">
              <div className="flex flex-col space-y-0.5">
                <Label className="text-sm font-medium">{label}</Label>
                <span className="text-[10px] text-muted-foreground">{description}</span>
              </div>
              <Switch 
                checked={permissions[key]} 
                onCheckedChange={(val: boolean) => onChange(key, val)}
                disabled={disabled || (key === 'canViewFinancials' && role !== 'co-organizer')}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
