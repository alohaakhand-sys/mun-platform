"use client";

/**
 * AI writing assist for every free-text field at the HEAD of the live-session
 * participation → marks pipeline: motion topics, point notes, caucus topics.
 *
 * Deliberately ONE primitive rather than three features. What a delegate types here
 * flows on: a motion topic becomes the caucus topic on the projector (executeMotion →
 * startModCaucus) and the motion itself bumps participation.motions, which feeds
 * marking autofill. The same field, the same stakes, wherever it appears.
 *
 * Degrades to nothing when GEMINI_API_KEY is unset — `useAiAssistEnabled` asks the
 * route itself, so there is no second env flag to drift out of sync.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import { Sparkles, Wand2, Lightbulb, Loader2, Plus, Undo2, X } from "lucide-react";
import type {
  AiAssistField, AiAssistContext, AiAssistMode,
} from "@/app/api/ai/session-assist/route";
import { currentAiEventId } from "@/components/shared/ai/aiEventScope";

const ENDPOINT = "/api/ai/session-assist";

// ── Availability probe ──────────────────────────────────────────────────────────
// Module-level promise so every mounted instance shares ONE request per page load.
let enabledPromise: Promise<boolean> | null = null;

function probeEnabled(): Promise<boolean> {
  if (!enabledPromise) {
    enabledPromise = fetch(ENDPOINT)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => !!d?.enabled)
      .catch(() => false);
  }
  return enabledPromise;
}

/** True once the server confirms an AI key is configured. Never throws. */
export function useAiAssistEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    probeEnabled().then((v) => { if (alive) setEnabled(v); });
    return () => { alive = false; };
  }, []);
  return enabled;
}

async function callAssist(payload: {
  mode: AiAssistMode;
  field: AiAssistField;
  text?: string;
  context: AiAssistContext;
  exclude?: string[];
}): Promise<string[]> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    // The event in the address: AI inside a Pro event doesn't count against the daily quota.
    body: JSON.stringify({ eventId: currentAiEventId(), ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `AI request failed (${res.status})`);
  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

// ── Component ───────────────────────────────────────────────────────────────────
export function AiAssistBar({
  value, onPick, field, context, className, suggestLabel = "AI suggestions",
}: {
  /** Current draft — "Improve mine" is disabled while empty. */
  value: string;
  onPick: (text: string) => void;
  field: AiAssistField;
  context: AiAssistContext;
  className?: string;
  suggestLabel?: string;
}) {
  const enabled = useAiAssistEnabled();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<AiAssistMode | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<string[]>([]);
  /** Pre-improve draft, so the model can never hijack what the delegate wrote. */
  const [undoTo, setUndoTo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape (same behaviour as the other console popovers).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const suggest = useCallback(async (more: boolean) => {
    if (busy) return;
    setBusy("suggest");
    setErr(null);
    try {
      // "More ideas" excludes everything already shown, and APPENDS so the delegate
      // can still see the earlier options.
      const next = await callAssist({
        mode: "suggest", field, context, exclude: more ? ideas : [],
      });
      setIdeas(more ? [...ideas, ...next] : next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach the AI.");
    } finally {
      setBusy(null);
    }
  }, [busy, field, context, ideas]);

  const improve = useCallback(async () => {
    const draft = value.trim();
    if (busy || !draft) return;
    setBusy("improve");
    setErr(null);
    try {
      const [best] = await callAssist({ mode: "improve", field, text: draft, context });
      if (best) {
        setUndoTo(draft);
        onPick(best);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach the AI.");
    } finally {
      setBusy(null);
    }
  }, [busy, value, field, context, onPick]);

  if (!enabled) return null;

  return (
    <div ref={ref} className={className}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title="AI assist"
          className={cn(
            "inline-flex items-center gap-1 h-6 px-1.5 rounded-md border text-[11px] font-semibold transition-colors",
            open
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5",
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI
        </button>

        {undoTo !== null && (
          <button
            type="button"
            onClick={() => { onPick(undoTo); setUndoTo(null); }}
            className="inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            title="Restore what you wrote"
          >
            <Undo2 className="w-3 h-3" /> Undo
          </button>
        )}
      </div>

      {/*
        Rendered INLINE, not absolutely positioned: the motion popover that hosts this is
        `max-h-[60vh] overflow-y-auto`, which would clip an absolute child. Flowing in the
        document instead means it scrolls with its host and fits the tight vice-chair column.
      */}
      {open && (
        <div className="mt-1.5 w-full rounded-xl border border-border/70 bg-card p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => suggest(false)}
              className="h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 text-[11px] font-semibold hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              {busy === "suggest" && ideas.length === 0
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Lightbulb className="w-3.5 h-3.5" />}
              Suggest
            </button>
            <button
              type="button"
              disabled={busy !== null || !value.trim()}
              onClick={improve}
              title={value.trim() ? "Improve what you wrote" : "Write something first"}
              className="h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 text-[11px] font-semibold hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              {busy === "improve"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Wand2 className="w-3.5 h-3.5" />}
              Improve
            </button>
          </div>

          {ideas.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-border/50 space-y-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {suggestLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setIdeas([])}
                  className="text-muted-foreground hover:text-foreground"
                  title="Clear"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              {ideas.map((s, i) => (
                <button
                  key={`${s}-${i}`}
                  type="button"
                  onClick={() => { onPick(s); setUndoTo(null); setOpen(false); }}
                  className="w-full text-left px-2 py-1.5 rounded-lg border border-transparent text-[12px] leading-snug hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => suggest(true)}
                className="w-full h-7 inline-flex items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              >
                {busy === "suggest"
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Plus className="w-3 h-3" />}
                More ideas
              </button>
            </div>
          )}

          {err && <p className="mt-1.5 px-1 text-[11px] text-amber-600 dark:text-amber-400 leading-snug">{err}</p>}
        </div>
      )}
    </div>
  );
}
