"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/client";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { getEventById, EventData } from "@/lib/services/eventService";
import { collection, query, orderBy, limit, startAfter, getDocs, documentId } from "firebase/firestore";

// 50 events at a time (Spark read budget), oldest id first; "Load more" for the next page.
async function eventsPage(after?: string | null): Promise<{ events: EventData[]; next: string | null }> {
  const parts = [orderBy(documentId()), ...(after ? [startAfter(after)] : []), limit(50)];
  const snap = await getDocs(query(collection(db, "events"), ...parts));
  return { events: snap.docs.map(d => ({ id: d.id, ...d.data() } as EventData)), next: snap.size === 50 ? snap.docs[snap.size - 1].id : null };
}
import { logAudit } from "@/lib/services/auditService";
import { PlanEditorDialog } from "@/components/features/admin/PlanEditorDialog";
import { resolvePlan, planLabel } from "@/lib/data/eventPlan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, Loader2, Search, FlaskConical } from "lucide-react";

export default function AdminEventsPage() {
  const { authorized, profile } = useAdminGuard();
  const router = useRouter();
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; eventId: string; title: string }>({ open: false, eventId: "", title: "" });
  const [deleting, setDeleting] = useState(false);
  const [planFor, setPlanFor] = useState<EventData | null>(null);
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      const page = await eventsPage();
      setEvents(page.events);
      setNext(page.next);
      setLoading(false);
    })();
  }, [authorized]);

  async function toggleStatus(eventId: string, currentStatus: string) {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    await updateDoc(doc(db, "events", eventId), { status: newStatus });
    const ev = events.find(e => e.id === eventId);
    if (profile) void logAudit({
      actorUid: profile.uid || "", actorEmail: profile.email || "", actorRole: profile.role || "",
      action: "event_status_changed", targetType: "event", targetId: eventId, targetName: ev?.title,
      before: JSON.stringify({ status: currentStatus }), after: JSON.stringify({ status: newStatus }),
    });
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: newStatus as any } : e));
  }

  async function confirmDelete() {
    if (!deleteDialog.eventId) return;
    setDeleting(true);
    // The server removes the event with everything under it and its applications, and audits it.
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/admin/events/${deleteDialog.eventId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      alert((await res.json().catch(() => ({})))?.error || "Couldn't delete the event.");
      setDeleting(false);
      return;
    }
    setEvents(prev => prev.filter(e => e.id !== deleteDialog.eventId));
    setDeleting(false);
    setDeleteDialog({ open: false, eventId: "", title: "" });
  }

  const filtered = events.filter(e => {
    const q = search.toLowerCase();
    return !q || (e.title || "").toLowerCase().includes(q) || (e.status || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Events</h1>
        <p className="text-muted-foreground mt-1">Manage every conference across the platform.</p>
      </div>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>All Events</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${filtered.length} of ${events.length} events`}</CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or status" className="pl-9" />
          </div>
        </CardHeader>
        {loading ? (
          <CardContent><Skeleton className="h-64 w-full rounded-xl" /></CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">Title</th>
                  <th className="px-6 py-4 hidden md:table-cell">Organizer</th>
                  <th className="px-6 py-4 hidden sm:table-cell">Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 hidden sm:table-cell">Plan</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map(event => (
                  <tr key={event.id} className="hover:bg-secondary transition-colors">
                    <td className="px-6 py-4 font-medium text-sm">{event.title}</td>
                    <td className="px-6 py-4 text-xs text-muted-foreground font-mono hidden md:table-cell">{event.organizerId?.slice(0, 8)}…</td>
                    <td className="px-6 py-4 text-sm hidden sm:table-cell">{event.date}</td>
                    <td className="px-6 py-4">
                      <Badge variant={event.status === "published" ? "default" : "secondary"} className="capitalize">{event.status || "draft"}</Badge>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <Badge variant="outline">{planLabel(resolvePlan(event))}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                          <MoreVertical className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Manage Event</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toggleStatus(event.id, event.status || "draft")}>
                            {event.status === "published" ? "Move to Draft" : "Publish"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPlanFor(event)}>Plan &amp; limits…</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/events/${event.id}/test-allocate`)}>
                            <FlaskConical className="w-4 h-4 mr-2" /> Test allocation
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialog({ open: true, eventId: event.id, title: event.title })}>
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="py-16 text-center text-muted-foreground text-sm">No events match your search.</div>}
            {next && (
              <div className="p-4 text-center">
                <Button variant="outline" onClick={async () => { const page = await eventsPage(next); setEvents(prev => [...prev, ...page.events]); setNext(page.next); }}>Load more</Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <PlanEditorDialog
        open={!!planFor}
        onOpenChange={(v) => { if (!v) setPlanFor(null); }}
        eventId={planFor?.id || ""}
        eventTitle={planFor?.title}
        onSaved={async () => { if (planFor && profile) void logAudit({ actorUid: profile.uid || "", actorEmail: profile.email || "", actorRole: profile.role || "", action: "event_plan_set", targetType: "event", targetId: planFor.id, targetName: planFor.title }); const fresh = planFor ? await getEventById(planFor.id) : null; if (fresh) setEvents(prev => prev.map(e => e.id === fresh.id ? fresh : e)); }}
      />

      <Dialog open={deleteDialog.open} onOpenChange={open => !open && setDeleteDialog(prev => ({ ...prev, open: false }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Event</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Permanently delete <strong>{deleteDialog.title}</strong> with its applications, staff, sessions and documents? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, eventId: "", title: "" })}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
