"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Check, EyeOff } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { SectionCard } from "./_shared";
import { RecommendDialog } from "./RateRecommendDialogs";
import {
  getApprovedRecommendations, getGivenRecommendations, getPendingRecommendations,
  decideRecommendation, submitRecommendation, type Recommendation,
} from "@/lib/services/reputationService";

function RecCard({ r, footer }: { r: Recommendation; footer?: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Avatar className="w-11 h-11 shrink-0">
        <AvatarImage src={r.authorPhotoURL || ""} alt={r.authorName} />
        <AvatarFallback>{(r.authorName || "?").charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <Link href={`/dashboard/profile/${r.authorUid}`} className="font-semibold text-[15px] leading-tight hover:underline">
          {r.authorName}
        </Link>
        {(r.authorHeadline || r.relationship) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {[r.relationship, r.authorHeadline].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="text-sm text-foreground/85 mt-2 leading-relaxed">{r.body}</p>
        {footer}
      </div>
    </div>
  );
}

export function RecommendationsSection({
  ownerUid, ownerName, editable, canRecommend,
}: {
  ownerUid: string;
  ownerName: string;
  editable: boolean;
  canRecommend: boolean;
}) {
  const [tab, setTab] = useState<"received" | "given">("received");
  const [received, setReceived] = useState<Recommendation[]>([]);
  const [given, setGiven] = useState<Recommendation[]>([]);
  const [pendingList, setPendingList] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [ap, gv, pd] = await Promise.all([
      getApprovedRecommendations(ownerUid),
      getGivenRecommendations(ownerUid),
      editable ? getPendingRecommendations(ownerUid) : Promise.resolve([] as Recommendation[]),
    ]);
    setReceived(ap);
    setGiven(gv);
    setPendingList(pd);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [ownerUid, editable]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(id: string, action: "approve" | "hide") {
    setBusyId(id);
    try {
      await decideRecommendation(id, action);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const hasAny = received.length > 0 || given.length > 0 || pendingList.length > 0;
  if (!editable && !canRecommend && !hasAny && !loading) return null;

  const items = tab === "received" ? received : given;

  return (
    <SectionCard
      title="Recommendations"
      action={
        canRecommend ? (
          <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>Recommend</Button>
        ) : undefined
      }
    >
      {editable && pendingList.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Pending approval ({pendingList.length})
          </p>
          {pendingList.map((r) => (
            <RecCard
              key={r.id}
              r={r}
              footer={
                <div className="mt-2 flex gap-2">
                  <Button size="sm" className="gap-1.5" disabled={busyId === r.id} onClick={() => decide(r.id, "approve")}>
                    {busyId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5" disabled={busyId === r.id} onClick={() => decide(r.id, "hide")}>
                    <EyeOff className="size-3.5" /> Hide
                  </Button>
                </div>
              }
            />
          ))}
        </div>
      )}

      <SegmentedTabs
        layoutId="recTabs"
        value={tab}
        onChange={(v) => setTab(v as "received" | "given")}
        items={[
          { id: "received", label: "Received", count: received.length },
          { id: "given", label: "Given", count: given.length },
        ]}
      />

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {tab === "received" ? "No recommendations yet." : "No recommendations given yet."}
          </p>
        ) : (
          <div className="space-y-5">
            {items.map((r) => <RecCard key={r.id} r={r} />)}
          </div>
        )}
      </div>

      {showDialog && (
        <RecommendDialog
          targetName={ownerName}
          onClose={() => setShowDialog(false)}
          onSubmit={async (body, rel) => { await submitRecommendation(ownerUid, body, rel); }}
        />
      )}
    </SectionCard>
  );
}
