'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { StaffInviteModal } from '@/components/features/organizer/StaffInviteModal';
import { PermissionsEditor, PermissionsMap } from '@/components/features/organizer/PermissionsEditor';
import { Users, UserCheck, Shield, CheckCircle2, XCircle, Trash2, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  subscribeEventStaff, addStaffMember, updateStaffMember, removeStaffMember,
  StaffMember, DEFAULT_PERMISSIONS, ROLE_PRESETS, STAFF_ROLE_OPTIONS, roleLabel,
} from '@/lib/services/staffService';
import { getEventById, updateEvent } from '@/lib/services/eventService';
import { auth } from '@/lib/firebase/client';

export default function StaffManagementPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current');
  const [applyMode, setApplyMode] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [savingApplyMode, setSavingApplyMode] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [roleChange, setRoleChange] = useState<{ staff: StaffMember; newRole: StaffMember['role'] } | null>(null);
  const [changingRole, setChangingRole] = useState(false);

  useEffect(() => {
    getEventById(eventId).then(eventData => {
      setEvent(eventData);
      if (eventData) {
        setApplyMode((eventData as any).allowPublicStaff || false);
      }
    });
    // Live roster: accepting an invite re-keys the staff doc (auto-id → uid), so a
    // one-shot fetch leaves this page writing to a deleted doc.
    const unsub = subscribeEventStaff(eventId, staff => {
      setStaffList(staff);
      setLoading(false);
    });
    return () => unsub();
  }, [eventId]);

  const accepted = staffList.filter(s => s.inviteStatus === 'accepted' || s.inviteStatus === 'invited');
  const applied = staffList.filter(s => s.inviteStatus === 'applied');

  const handleSaveApplyMode = async () => {
    setSavingApplyMode(true);
    try {
      await updateEvent(eventId, { allowPublicStaff: applyMode });
      setShowSavedFeedback(true);
      setTimeout(() => setShowSavedFeedback(false), 3000);
    } catch (e) {
      console.error("Error saving allowPublicStaff toggle:", e);
    } finally {
      setSavingApplyMode(false);
    }
  };

  const handleSendInvite = async (rawEmail: string, role: string) => {
    // Normalize so it matches the invitee's auth email exactly (Firestore == is
    // case-sensitive; a casing/whitespace mismatch silently hides the invite).
    const email = rawEmail.trim().toLowerCase();
    const member: Omit<StaffMember, 'id' | 'addedAt'> = {
      uid: '',
      name: 'Pending User',
      email,
      role: role as StaffMember['role'],
      committeeId: null,
      permissions: { ...DEFAULT_PERMISSIONS, ...(ROLE_PRESETS[role] ?? {}) },
      inviteStatus: 'invited',
    };
    const result = await addStaffMember(eventId, member);
    if (result.success && result.id) {
      // No optimistic append — subscribeEventStaff already delivers the new doc
      // (latency-compensated), and appending here renders it twice under one key.

      // Trigger email sending
      try {
        const eventTitle = event?.title || 'MUN Conference';
        const roleName = roleLabel(role);
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            eventId,
            to: email,
            subject: `Staff Invitation: Join ${eventTitle}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
                <h2 style="color: #6d28d9; margin-top: 0;">Staff Invitation</h2>
                <p>Hello,</p>
                <p>You have been invited to join the staff team for <strong>${eventTitle}</strong> as a <strong>${roleName}</strong>.</p>
                <p>To accept this invitation, please log in to your account on the MUN Platform dashboard and check your notifications (the bell icon in the top right).</p>
                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
                  This is an automated notification from MUN Platform.
                </div>
              </div>
            `
          })
        });
      } catch (err) {
        console.error('Failed to send staff invitation email:', err);
      }
    }
  };

  const handlePermissionChange = async (staffId: string, key: keyof PermissionsMap, value: boolean) => {
    const staff = staffList.find(s => s.id === staffId);
    if (!staff) return;
    const newPerms = { ...staff.permissions, [key]: value };
    setStaffList(prev => prev.map(s => s.id === staffId ? { ...s, permissions: newPerms } : s));
    await updateStaffMember(eventId, staffId, { permissions: newPerms }, staff);
  };

  const handleAssignCommittee = async (staff: StaffMember, val: string | null) => {
    const committeeIdVal = !val || val === "none" ? null : val;
    await updateStaffMember(eventId, staff.id!, { committeeId: committeeIdVal }, staff);
    setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, committeeId: committeeIdVal } : s));
  };

  // Vice-chair "delegate power" mode toggle — lets them proxy for delegations in the live session.
  const handleDelegatePower = async (staff: StaffMember, on: boolean) => {
    await updateStaffMember(eventId, staff.id!, { delegatePower: on }, staff);
    setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, delegatePower: on } : s));
  };

  const handleAcceptApp = async (staffId: string) => {
    const staff = staffList.find(s => s.id === staffId);
    const res = await updateStaffMember(eventId, staffId, { inviteStatus: 'accepted' }, staff);
    if (!res.success) return;
    setStaffList(prev => prev.map(s => s.id === staffId ? { ...s, inviteStatus: 'accepted' as const } : s));
    if (staff?.email) {
      try {
        const eventTitle = event?.title || 'MUN Conference';
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            eventId,
            to: staff.email,
            subject: `You're on the team: ${eventTitle}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
                <h2 style="color: #0B6E4F; margin-top: 0;">Application accepted</h2>
                <p>Hello,</p>
                <p>Your application to join the staff of <strong>${eventTitle}</strong> as a <strong>${roleLabel(staff.role)}</strong> has been accepted.</p>
                <p>The organizer will assign your committee. Your staff tools are now on your MUN Pilot dashboard.</p>
              </div>
            `,
          }),
        });
      } catch (err) {
        console.error('Failed to send staff acceptance email:', err);
      }
    }
  };

  const handleRejectApp = async (staffId: string) => {
    await removeStaffMember(eventId, staffId, staffList.find(s => s.id === staffId));
    setStaffList(prev => prev.filter(s => s.id !== staffId));
  };

  const handleRemoveStaff = async () => {
    if (!removeTarget?.id) return;
    setRemoving(true);
    const result = await removeStaffMember(eventId, removeTarget.id, removeTarget);
    if (result.success) {
      setStaffList(prev => prev.filter(s => s.id !== removeTarget.id));
      setRemoveTarget(null);
    }
    setRemoving(false);
  };

  const sendRoleUpdateEmail = async (email: string, newRole: StaffMember['role']) => {
    try {
      const eventTitle = event?.title || 'MUN Conference';
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          eventId,
          to: email,
          subject: `Role Updated: ${eventTitle}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
              <h2 style="color: #6d28d9; margin-top: 0;">Your Role Has Been Updated</h2>
              <p>Hello,</p>
              <p>Your role for <strong>${eventTitle}</strong> has been changed to <strong>${roleLabel(newRole)}</strong>.</p>
              <p>To apply this change and update your access, please log in to your MUN Platform dashboard and accept the update from your notifications (the bell icon in the top right).</p>
              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
                This is an automated notification from MUN Platform.
              </div>
            </div>
          `,
        }),
      });
    } catch (err) {
      console.error('Failed to send role-update email:', err);
    }
  };

  const handleConfirmRoleChange = async () => {
    if (!roleChange?.staff.id) return;
    const { staff, newRole } = roleChange;
    setChangingRole(true);

    const newPerms = { ...DEFAULT_PERMISSIONS, ...(ROLE_PRESETS[newRole] ?? {}) };

    // Accepted members must re-accept (their access changes, so revoke until they confirm).
    // Pending invites just have their role/permissions updated in place.
    const wasAccepted = staff.inviteStatus === 'accepted';
    const update: Partial<StaffMember> & Record<string, any> = wasAccepted
      ? {
          role: newRole,
          permissions: newPerms,
          inviteStatus: 'invited',
          isRoleUpdate: true,
          previousRole: staff.role,
          previousPermissions: staff.permissions,
        }
      : { role: newRole, permissions: newPerms };

    const result = await updateStaffMember(eventId, staff.id!, update, staff);
    if (result.success) {
      setStaffList(prev => prev.map(s =>
        s.id === staff.id ? { ...s, ...update } as StaffMember : s
      ));
      await sendRoleUpdateEmail(staff.email, newRole);
      setRoleChange(null);
    }
    setChangingRole(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff & Permissions</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Executive Board, Chairs, and their specific access rights.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border p-2 rounded-lg bg-card shadow-sm">
            <Label htmlFor="apply-mode" className="text-sm cursor-pointer whitespace-nowrap">Allow Public Applications</Label>
            <Switch id="apply-mode" checked={applyMode} onCheckedChange={setApplyMode} />
            <Button size="sm" onClick={handleSaveApplyMode} disabled={savingApplyMode} className="ml-2 bg-primary hover:bg-primary text-white">
              {savingApplyMode ? 'Saving...' : 'Save'}
            </Button>
            {showSavedFeedback && (
              <span className="text-xs text-green-600 font-medium ml-1 animate-pulse">Saved!</span>
            )}
          </div>
          <StaffInviteModal onSendInvite={handleSendInvite} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="current" className="gap-2">
            <Users className="w-4 h-4 hidden sm:block" /> Current & Invited
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-2 relative">
            <UserCheck className="w-4 h-4 hidden sm:block" /> Applications
            {applied.length > 0 && (
              <span className="absolute top-1 right-1 sm:top-2 sm:right-2 flex h-2 w-2 rounded-full bg-primary" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-4">
          {accepted.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-xl bg-secondary">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No Staff Yet</h3>
              <p className="text-muted-foreground mb-4">Invite people to help manage your conference.</p>
              <StaffInviteModal onSendInvite={handleSendInvite} />
            </div>
          ) : (
            <div className="grid gap-4">
              {accepted.map(staff => (
                <div key={staff.id} className="border rounded-xl bg-card shadow-sm overflow-hidden">
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/30 flex items-center justify-center text-primary dark:text-primary shrink-0 font-bold">
                        {(staff.name || staff.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{staff.name || 'Pending User'}</h4>
                          {staff.inviteStatus === 'invited' && (
                            <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200">Pending Invite</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{staff.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center flex-wrap gap-3">
                      <Select
                        value={staff.role}
                        onValueChange={(val) => {
                          if (val && val !== staff.role) {
                            setRoleChange({ staff, newRole: val as StaffMember['role'] });
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-[160px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_ROLE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Executive Board (director / USG / EB) is scoped by the same field: a
                          committee limits them to it, none means every committee. */}
                      {["chair", "vice-chair", "director", "usg", "eb"].includes(staff.role) && (
                        // Committee names are long enough to truncate to nonsense ("United
                        // Nations Sec…"), which made this read as decoration rather than the
                        // control that assigns a chair to their committee. Label it.
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Committee
                          </span>
                          <Select
                            value={staff.committeeId || "none"}
                            onValueChange={(val) => handleAssignCommittee(staff, val)}
                          >
                            <SelectTrigger className="h-8 w-[210px] text-xs" title={staff.committeeId || "No committee assigned"}>
                              <SelectValue placeholder="Committee" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                {["director", "usg", "eb"].includes(staff.role) ? "All committees" : "No Committee"}
                              </SelectItem>
                              {(event?.committees || []).map((c: any) => (
                                <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {staff.role === "vice-chair" && (
                        <Select
                          value={staff.delegatePower ? "delegate" : "standard"}
                          onValueChange={(val) => handleDelegatePower(staff, val === "delegate")}
                        >
                          <SelectTrigger className="h-8 w-[190px] text-xs" title="Vice-chair delegate power mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard Vice Chair</SelectItem>
                            <SelectItem value="delegate">+ Delegate Power</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedUser(expandedUser === staff.id ? null : staff.id!)}
                      >
                        {expandedUser === staff.id ? 'Hide Permissions' : 'Edit Permissions'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => setRemoveTarget(staff)}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="sr-only">Remove staff member</span>
                      </Button>
                    </div>
                  </div>
                  {expandedUser === staff.id && (
                    <div className="p-4 bg-secondary space-y-4">
                      <PermissionsEditor
                        role={staff.role}
                        permissions={staff.permissions}
                        onChange={(k, v) => handlePermissionChange(staff.id!, k, v)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="applications">
          <Card>
            <CardHeader>
              <CardTitle>Staff Applications</CardTitle>
              <CardDescription>
                Review people who have applied to join your staff team. Public applications are currently
                <strong className={applyMode ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                  {applyMode ? 'ENABLED' : 'DISABLED'}
                </strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {applied.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No pending applications.</div>
              ) : (
                <div className="space-y-4">
                  {applied.map(app => (
                    <div key={app.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4">
                      <div>
                        <h4 className="font-semibold">{app.name} <span className="font-normal text-muted-foreground">({app.email})</span></h4>
                        <Badge variant="outline" className="capitalize mt-1">Applied for: {app.role}</Badge>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleRejectApp(app.id!)}>
                          <XCircle className="w-4 h-4 mr-2" /> Reject
                        </Button>
                        <Button className="bg-green-600 text-white hover:bg-green-700" onClick={() => handleAcceptApp(app.id!)}>
                          <CheckCircle2 className="w-4 h-4 mr-2" /> Accept
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </span>
              Remove staff member?
            </DialogTitle>
            <DialogDescription>
              {removeTarget && (
                <>
                  <strong>{removeTarget.name || removeTarget.email}</strong> will lose all access to this
                  event{['co-organizer'].includes(removeTarget.role) ? ', including co-organizer privileges' : ''}. This
                  cannot be undone — you can re-invite them later.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>Cancel</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleRemoveStaff}
              disabled={removing}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {removing ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleChange} onOpenChange={(open) => { if (!open) setRoleChange(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role?</DialogTitle>
            <DialogDescription>
              {roleChange && (
                <>
                  Change <strong>{roleChange.staff.name || roleChange.staff.email}</strong> from{' '}
                  <span className="capitalize">{roleLabel(roleChange.staff.role)}</span> to{' '}
                  <strong>{roleLabel(roleChange.newRole)}</strong>.
                  {roleChange.staff.inviteStatus === 'accepted' ? (
                    <> They will be emailed and notified, and must <strong>re-accept</strong> before the new
                    role and dashboard take effect. Their access is paused until they accept.</>
                  ) : (
                    <> Their pending invitation will be updated to the new role.</>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChange(null)} disabled={changingRole}>Cancel</Button>
            <Button
              className="bg-primary text-white hover:bg-primary"
              onClick={handleConfirmRoleChange}
              disabled={changingRole}
            >
              {changingRole ? 'Updating...' : 'Update Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
