"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";

// Content moderation (/api/admin/moderation): blog articles and their comments, ratings,
// recommendations and skill endorsements. Newest 50, or one member's (by uid). Deleting a
// rating or endorsement also fixes the counters on that member's profile.

type Tab = "articles" | "ratings" | "recommendations" | "endorsements";
type Item = Record<string, any> & { id: string };

async function call(path: string, body?: unknown) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

const day = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString() : "");

export default function AdminModerationPage() {
  const { authorized } = useAdminGuard();
  const [tab, setTab] = useState<Tab>("articles");
  const [uid, setUid] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<Item | null>(null);
  const [comments, setComments] = useState<Item[] | null>(null);

  const load = useCallback(async () => {
    setItems(null); setError("");
    try {
      const data = await call(`/api/admin/moderation?type=${tab}${uid.trim() ? `&uid=${encodeURIComponent(uid.trim())}` : ""}`);
      setItems(data.items);
    } catch (e: any) { setError(e.message); setItems([]); }
  }, [tab, uid]);
  useEffect(() => { if (authorized) void load(); }, [authorized, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (type: string, id: string, action: string, articleId?: string) => {
    const label = action === "delete" ? "Delete" : action === "unpublish" ? "Unpublish" : "Hide";
    if (!confirm(`${label} this ${type.replace(/s$/, "")}?`)) return;
    setBusy(id);
    try {
      await call("/api/admin/moderation", { type, id, action, articleId });
      if (type === "comments" && commentsFor) await openComments(commentsFor); else await load();
    } catch (e: any) { alert(e.message); }
    setBusy(null);
  };

  const openComments = async (a: Item) => {
    setCommentsFor(a); setComments(null);
    try { setComments((await call(`/api/admin/moderation?type=comments&articleId=${a.id}`)).items); } catch { setComments([]); }
  };

  if (!authorized) return null;
  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><ShieldAlert className="w-7 h-7" /> Moderation</h1>
        <p className="text-muted-foreground mt-1">Blog posts, comments, ratings, recommendations and endorsements.</p>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(["articles", "ratings", "recommendations", "endorsements"] as Tab[]).map((t) => (
              <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)} className="capitalize">{t}</Button>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void load(); }}>
            <Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder={tab === "articles" ? "Author uid (optional)" : "Member uid (optional)"} className="w-56 h-9" />
            <Button type="submit" size="sm" variant="outline">Show</Button>
          </form>
        </CardHeader>
        <CardContent className="space-y-2">
          <CardDescription>{uid.trim() ? "This member's, newest first." : "Newest 50."}</CardDescription>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {items === null ? <Skeleton className="h-40 rounded-xl" /> : items.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Nothing here.</p> :
            items.map((it) => (
              <div key={it.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border rounded-lg p-3 text-sm">
                <div className="min-w-0">
                  {tab === "articles" && (<>
                    <p className="font-medium">{it.title || it.id} {it.hidden ? <Badge variant="destructive" className="ml-1">Hidden</Badge> : it.published ? <Badge variant="outline" className="ml-1">Published</Badge> : <Badge variant="secondary" className="ml-1">Draft</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{it.author} · {day(it.createdAt)}</p>
                  </>)}
                  {tab === "ratings" && <p>{it.from} gave <b>{it.stars}★</b> to <span className="font-mono text-xs">{it.to}</span> <span className="text-xs text-muted-foreground">· {day(it.createdAt)}</span></p>}
                  {tab === "recommendations" && (<>
                    <p>{it.from} → <span className="font-mono text-xs">{it.to}</span> <Badge variant="outline" className="ml-1 capitalize">{it.status}</Badge></p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{it.text}</p>
                  </>)}
                  {tab === "endorsements" && <p>{it.from} endorsed <span className="font-mono text-xs">{it.to}</span> for <b>{it.skill}</b> <span className="text-xs text-muted-foreground">· {day(it.createdAt)}</span></p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {tab === "articles" && <Button size="sm" variant="ghost" onClick={() => openComments(it)}>Comments</Button>}
                  {tab === "articles" && !it.hidden && <Button size="sm" variant="outline" disabled={busy === it.id} onClick={() => act("articles", it.id, "unpublish")}>Unpublish</Button>}
                  {tab === "recommendations" && it.status !== "hidden" && <Button size="sm" variant="outline" disabled={busy === it.id} onClick={() => act("recommendations", it.id, "hide")}>Hide</Button>}
                  <Button size="sm" variant="destructive" disabled={busy === it.id} onClick={() => act(tab, it.id, "delete")}>Delete</Button>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      <Dialog open={!!commentsFor} onOpenChange={(v) => { if (!v) setCommentsFor(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Comments</DialogTitle><DialogDescription>{commentsFor?.title}</DialogDescription></DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto space-y-2">
            {comments === null ? <Skeleton className="h-24" /> : comments.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No comments.</p> :
              comments.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 border rounded-lg p-3 text-sm">
                  <div className="min-w-0"><p className="font-medium">{c.author}</p><p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{c.text}</p></div>
                  <Button size="sm" variant="destructive" disabled={busy === c.id} onClick={() => act("comments", c.id, "delete", commentsFor?.id)}>Delete</Button>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
