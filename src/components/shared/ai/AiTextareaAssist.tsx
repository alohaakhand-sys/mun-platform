"use client";

/**
 * Paragraph-scale AI bar for plain textareas — the medium sibling of the session
 * console's AiAssistBar (same visual grammar: sparkle toggle → inline panel), built
 * on /api/ai/writing-assist. Which buttons appear is driven by SURFACE_ACTIONS:
 * - "Improve" / "Fix grammar" rewrite the current value in place (with Undo).
 * - "Suggest" shows ONE full-length suggestion with Use / Try another.
 * Academic surfaces (application statements, recommendations) get Improve + Grammar
 * only — no Suggest, so AI never writes the delegate's own statement from scratch.
 *
 * Renders null when no AI provider key is configured — a drop-in one-liner under
 * any textarea that costs nothing when AI is off.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Wand2, SpellCheck, Lightbulb, Undo2, X, RefreshCw, Check } from "lucide-react";
import {
  useAiWritingEnabled, callWritingAssist, type WritingSurface,
} from "./aiWritingClient";
import { surfaceAllows } from "@/lib/ai/writingSurfaces";

export function AiTextareaAssist({
  value, onPick, surface, context, className,
}: {
  /** Current textarea value — "Improve" is disabled while empty. */
  value: string;
  onPick: (text: string) => void;
  surface: WritingSurface;
  context?: Record<string, string>;
  className?: string;
}) {
  const enabled = useAiWritingEnabled();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"improve" | "grammar" | "suggest" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  /** Pre-polish value, so the model can never hijack what the user wrote. */
  const [undoTo, setUndoTo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const canImprove = surfaceAllows(surface, "improve");
  const canGrammar = surfaceAllows(surface, "grammar");
  const canSuggest = surfaceAllows(surface, "suggest");

  // Close on outside click / Escape (same behaviour as AiAssistBar).
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

  // Improve and Fix-grammar both rewrite the current value in place (with Undo).
  const polish = useCallback(async (action: "improve" | "grammar") => {
    const draft = value.trim();
    if (busy || !draft) return;
    setBusy(action);
    setErr(null);
    try {
      const result = await callWritingAssist({ action, surface, text: draft, context });
      if (result) {
        setUndoTo(draft);
        onPick(result);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach the AI.");
    } finally {
      setBusy(null);
    }
  }, [busy, value, surface, context, onPick]);

  const suggest = useCallback(async () => {
    if (busy) return;
    setBusy("suggest");
    setErr(null);
    try {
      // "Try another" passes the shown suggestion so the next one differs.
      const result = await callWritingAssist({
        action: "suggest", surface, context,
        instruction: value.trim() || undefined,
        avoid: suggestion || undefined,
      });
      if (result) setSuggestion(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach the AI.");
    } finally {
      setBusy(null);
    }
  }, [busy, surface, context, value, suggestion]);

  if (!enabled) return null;

  // Busy buttons say what they're doing instead of spinning (redesign rule).
  const label = (action: "improve" | "grammar" | "suggest", idle: string, verb: string) =>
    busy === action ? verb : idle;

  return (
    // `mun-chrome` carries the token scope with the component, so it renders the same
    // inside dialogs that portal outside the page scope. Violet is reserved for AI.
    <div ref={ref} className={cn("mun-chrome mp-ai", className)}>
      <div className="mp-ai-row">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title="AI assist"
          className={cn("mp-ai-chip", open && "is-open")}
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          AI
        </button>

        {undoTo !== null && (
          <button
            type="button"
            onClick={() => { onPick(undoTo); setUndoTo(null); }}
            className="mp-ai-chip"
            title="Restore what you wrote"
          >
            <Undo2 className="size-3.5" aria-hidden="true" /> Undo
          </button>
        )}
      </div>

      {/* Inline, not absolutely positioned — flows with dialogs and scrollable forms. */}
      {open && (
        <div className="mp-ai-panel">
          <div className="mp-ai-actions">
            {canImprove && (
              <button
                type="button"
                disabled={busy !== null || !value.trim()}
                onClick={() => polish("improve")}
                title={value.trim() ? "Improve what you wrote" : "Write something first"}
                className="mp-btn mp-btn-sec mp-btn-sm"
              >
                <Wand2 className="size-3.5" aria-hidden="true" />
                {label("improve", "Improve", "Improving…")}
              </button>
            )}
            {canGrammar && (
              <button
                type="button"
                disabled={busy !== null || !value.trim()}
                onClick={() => polish("grammar")}
                title={value.trim() ? "Fix grammar & spelling" : "Write something first"}
                className="mp-btn mp-btn-sec mp-btn-sm"
              >
                <SpellCheck className="size-3.5" aria-hidden="true" />
                {label("grammar", "Fix grammar", "Fixing…")}
              </button>
            )}
            {canSuggest && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={suggest}
                className="mp-btn mp-btn-sec mp-btn-sm"
              >
                <Lightbulb className="size-3.5" aria-hidden="true" />
                {label("suggest", "Suggest", suggestion ? "Suggest" : "Thinking…")}
              </button>
            )}
          </div>

          {suggestion && (
            <div className="mp-ai-sugg">
              <div className="mp-ai-sugg-head">
                <span>Suggestion</span>
                <button
                  type="button"
                  onClick={() => setSuggestion(null)}
                  className="mp-ai-x"
                  title="Clear"
                  aria-label="Clear suggestion"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              <p>{suggestion}</p>
              <div className="mp-ai-sugg-actions">
                <button
                  type="button"
                  onClick={() => { onPick(suggestion); setUndoTo(null); setOpen(false); }}
                  className="mp-btn mp-btn-solid mp-btn-sm"
                >
                  <Check className="size-3.5" aria-hidden="true" /> Use this
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={suggest}
                  className="mp-btn mp-btn-ghost mp-btn-sm"
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  {label("suggest", "Try another", "Thinking…")}
                </button>
              </div>
            </div>
          )}

          {err && <p className="mp-field-error" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
