"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import type { WritingSurface } from "@/components/shared/ai/aiWritingClient";

/**
 * Click-to-edit text. On the owner's profile a field becomes an input/textarea on
 * click and auto-saves on blur / Enter (Esc cancels). For viewers it renders as
 * plain text. Pass `renderDisplay` when the read view differs from the raw value
 * (e.g. a markdown bio rendered to HTML).
 */
export function InlineText({
  value,
  onSave,
  editable,
  multiline,
  placeholder = "Add",
  emptyText = "—",
  className,
  inputClassName,
  renderDisplay,
  ariaLabel,
  aiSurface,
}: {
  value?: string;
  onSave: (v: string) => Promise<void>;
  editable?: boolean;
  multiline?: boolean;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  inputClassName?: string;
  renderDisplay?: React.ReactNode;
  ariaLabel?: string;
  /** Multiline only: shows the AI improve/suggest bar under the textarea while editing. */
  aiSurface?: WritingSurface;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value || "");
      setError(null);
      const t = setTimeout(() => ref.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editable) {
    if (renderDisplay !== undefined && value) return <>{renderDisplay}</>;
    if (!value) return <span className={cn("text-muted-foreground italic", className)}>{emptyText}</span>;
    return <span className={cn("whitespace-pre-wrap", className)}>{value}</span>;
  }

  async function commit() {
    const next = draft.trim();
    if (next === (value || "").trim()) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    const cls = cn(
      "w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
      inputClassName
    );
    return (
      <span className="block">
        {multiline ? (
          // Blur is handled on the wrapper so clicking into the AI bar (improve /
          // suggest) doesn't count as leaving the field and auto-committing.
          <span
            className="block"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) commit();
            }}
          >
            <textarea
              ref={ref as React.RefObject<HTMLTextAreaElement>}
              rows={5}
              className={cls}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }}
              disabled={busy}
              aria-label={ariaLabel}
            />
            {aiSurface && (
              <AiTextareaAssist value={draft} onPick={setDraft} surface={aiSurface} className="mt-1" />
            )}
          </span>
        ) : (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            className={cls}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={commit}
            disabled={busy}
            aria-label={ariaLabel}
          />
        )}
        <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          {busy ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </>
          ) : (
            <>{multiline ? "Click away to save" : "Enter to save"} · Esc to cancel</>
          )}
          {error && <span className="text-destructive">{error}</span>}
        </span>
      </span>
    );
  }

  const display = renderDisplay !== undefined && value ? renderDisplay : null;
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel || "Edit"}
      className={cn(
        "group/inline inline-flex items-start gap-1.5 text-left rounded-md -mx-1 px-1 hover:bg-secondary transition-colors",
        className
      )}
    >
      {display ? (
        <span>{display}</span>
      ) : (
        <span className={cn("whitespace-pre-wrap", !value && "text-primary")}>{value || `+ ${placeholder}`}</span>
      )}
      {saved ? (
        <Check className="w-3.5 h-3.5 text-emerald-500 mt-1 shrink-0" />
      ) : (
        <Pencil className="w-3 h-3 text-transparent group-hover/inline:text-muted-foreground mt-1 shrink-0 transition-colors" />
      )}
    </button>
  );
}
