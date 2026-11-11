"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { UserProfile } from "@/lib/services/userService";
import { logAudit } from "@/lib/services/auditService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCog, Crown, Loader2, Search } from "lucide-react";

import { auth } from "@/lib/firebase/client";
import { ASSIGNABLE_ROLES } from "@/lib/utils/roles";

const ROLES = ASSIGNABLE_ROLES;

export default function AdminUsersPage() {
  const { authorized, profile } = useAdminGuard();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // 50 at a time from /api/admin/users (emails from Firebase Auth, no whole-collection reads).
  const [next, setNext] = useState<string | null>(null);
  const [findEmail, setFindEmail] = useState("");
  const [finding, setFinding] = useState(false);

  async function loadPage(after?: string | null, email?: string) {
    const token = await auth.currentUser?.getIdToken();
    const qs = email ? `email=${encodeURIComponent(email)}` : after ? `after=${encodeURIComponent(after)}` : "";
    const res = await fetch(`/api/admin/users${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({ users: [], next: null }));
    return { users: (data.users || []) as UserProfile[], next: (data.next ?? null) as string | null };
  }

  const [roleDialog, setRoleDialog] = useState<{ open: boolean; user: UserProfile | null; newRole: string }>({ open: false, user: null, newRole: "" });
  const [savingRole, setSavingRole] = useState(false);
  const [roleError, setRoleError] = useState("");


  useEffect(() => {
    if (!authorized) return;
    (async () => {
      const page = await loadPage();
      setUsers(page.users);
      setNext(page.next);
      setLoading(false);
    })();
  }, [authorized]);

  async function applyRoleChange() {
    if (!roleDialog.user || !roleDialog.newRole) return;
    setSavingRole(true);
    setRoleError("");
    // The server checks the guard rails (not yourself, not the last admin) and writes the audit entry.
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch("/api/admin/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uid: roleDialog.user.uid, role: roleDialog.newRole }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingRole(false);
    if (!res.ok) { setRoleError(data.error || "Couldn't change the role."); return; }
    setUsers(prev => prev.map(u => u.uid === roleDialog.user!.uid ? { ...u, role: roleDialog.newRole } : u));
    setRoleDialog({ open: false, user: null, newRole: "" });
  }


  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || (u.displayName || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.role || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground mt-1">Manage members and their roles. Pro belongs to events (Events → Plan & limits).</p>
      </div>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>All Users</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${filtered.length} of ${users.length} loaded`}</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter loaded users" className="pl-9" />
            </div>
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!findEmail.trim()) return;
              setFinding(true);
              const page = await loadPage(null, findEmail.trim());
              setFinding(false);
              if (page.users.length) setUsers(prev => [...page.users, ...prev.filter(u => u.uid !== page.users[0].uid)]);
              else alert("No member with that email.");
            }}>
              <Input value={findEmail} onChange={e => setFindEmail(e.target.value)} placeholder="Find by exact email" className="sm:w-56" />
              <Button type="submit" variant="outline" disabled={finding}>{finding ? "…" : "Find"}</Button>
            </form>
          </div>
        </CardHeader>
        {loading ? (
          <CardContent><Skeleton className="h-64 w-full rounded-xl" /></CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4 hidden sm:table-cell">Email</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map(u => (
                  <tr key={u.uid} className="hover:bg-secondary transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {(u.displayName || u.email || "?").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <Link href={`/dashboard/admin/users/${u.uid}`} className="text-sm font-medium hover:underline">{u.displayName || "—"}</Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground hidden sm:table-cell">{u.email}</td>
                    <td className="px-6 py-4"><Badge variant="outline" className="capitalize">{u.role}</Badge></td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" className="gap-2 text-xs" onClick={() => setRoleDialog({ open: true, user: u, newRole: u.role })}>
                        <UserCog className="w-3.5 h-3.5" /> Role
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="py-16 text-center text-muted-foreground text-sm">No users match your search.</div>}
            {next && !search && (
              <div className="p-4 text-center">
                <Button variant="outline" onClick={async () => { const page = await loadPage(next); setUsers(prev => [...prev, ...page.users]); setNext(page.next); }}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Dialog open={roleDialog.open} onOpenChange={open => !open && setRoleDialog(prev => ({ ...prev, open: false }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Change Role</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{roleDialog.user?.displayName || roleDialog.user?.email}</p>
            <Select value={roleDialog.newRole} onValueChange={val => setRoleDialog(prev => ({ ...prev, newRole: val as string }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            {roleError && <p className="text-sm text-destructive">{roleError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog({ open: false, user: null, newRole: "" })}>Cancel</Button>
            <Button onClick={applyRoleChange} disabled={savingRole}>{savingRole && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
