"use client";

import { useState } from "react";
import { Loader2, Star } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";

/** Viewer picks a 1–5 star rating for another delegate. */
export function RateDialog({
  targetName, initialStars = 0, onSubmit, onClose,
}: {
  targetName: string;
  initialStars?: number;
  onSubmit: (stars: number) => Promise<void>;
  onClose: () => void;
}) {
  const [stars, setStars] = useState(initialStars);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!stars) {
      setError("Pick a star rating first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(stars);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your rating.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate {targetName}</DialogTitle>
          <DialogDescription>Ratings roll up into their average score. You can change yours anytime.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-1.5 py-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setStars(i)}
              className="p-1"
              aria-label={`${i} star${i > 1 ? "s" : ""}`}
            >
              <Star
                className={cn(
                  "w-8 h-8 transition-colors",
                  (hover || stars) >= i ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"
                )}
              />
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="size-4 animate-spin" />} Submit rating
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Viewer writes a recommendation; it lands pending until the recipient approves. */
export function RecommendDialog({
  targetName, onSubmit, onClose,
}: {
  targetName: string;
  onSubmit: (body: string, relationship: string) => Promise<void>;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [relationship, setRelationship] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!body.trim()) {
      setError("Write a short recommendation.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body.trim(), relationship.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send. Try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recommend {targetName}</DialogTitle>
          <DialogDescription>They review it before it appears on their profile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="How you know them — e.g. Chaired alongside at DUNMUN 2025"
          />
          <textarea
            className="min-h-32 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Write about your experience working with ${targetName}…`}
          />
          <AiTextareaAssist value={body} onPick={setBody} surface="recommendation" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="size-4 animate-spin" />} Send recommendation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
