"use client";

/**
 * AI controls for RichTextEditor — kept in a sibling file so the editor's own diff
 * stays tiny. Three pieces, all no-ops unless the host passes an `ai` config AND a
 * provider key is configured server-side (useAiWritingEnabled probe):
 *
 * - AiToolbarMenu: sparkle button in the ribbon. Which items appear is driven by
 *   SURFACE_ACTIONS: content surfaces get Improve document / Continue writing /
 *   Generate draft… / Fix grammar; academic surfaces (committee docs, position
 *   papers) get ONLY Improve document + Fix grammar — no generating from scratch.
 * - AiSelectionBubble: tiptap BubbleMenu on selection → Improve / Shorten / Expand / Fix grammar
 *   (only the allowed ones), for just the selected passage.
 * - AiDraftDialog: topic/notes → preview → insert or replace (only when draft allowed).
 *
 * Every mutation goes through tiptap commands, so the editor's own history covers
 * undo (Ctrl+Z) — no bespoke undo state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BubbleMenu, type Editor } from "@tiptap/react";
import { marked } from "marked";
import {
  Sparkles, Wand2, SpellCheck, Loader2, FileText, ArrowRightToLine, Replace, PenLine, Minimize2, Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useAiWritingEnabled, callWritingAssist, type WritingSurface,
} from "@/components/shared/ai/aiWritingClient";
import { surfaceAllows } from "@/lib/ai/writingSurfaces";

export interface EditorAiConfig {
  surface: WritingSurface;
  /** For surface "committee-doc": working-paper | draft-resolution | amendment. */
  docType?: string;
  context?: Record<string, string>;
  onConvertedToDraftResolution?: () => void;
}

type EditorAiAction = "continue" | "grammar" | "draft" | "improve" | "grammar-selection" | "convert-resolution" | "shorten" | "expand";

const getMarkdown = (editor: Editor): string => editor.storage.markdown.getMarkdown();

// ── Toolbar menu ────────────────────────────────────────────────────────────────

export function AiToolbarMenu({ editor, ai }: { editor: Editor; ai: EditorAiConfig }) {
  const enabled = useAiWritingEnabled();
  const [open, setOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [busy, setBusy] = useState<EditorAiAction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

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

  // Whole-document actions. `improve`, `grammar` and `convert-resolution` replace the doc; `continue`
  // appends. All operate on the current markdown, so all need non-empty content.
  const run = useCallback(async (action: "continue" | "grammar" | "improve" | "convert-resolution") => {
    const md = getMarkdown(editor).trim();
    if (busy || !md) return;
    setBusy(action);
    setErr(null);
    try {
      const result = await callWritingAssist({
        action, surface: ai.surface, text: md, docType: ai.docType, context: ai.context,
      });
      if (!result) throw new Error("No usable result — try again.");
      if (action === "continue") {
        // Append at the end; tiptap-markdown parses the markdown string on insert.
        editor.chain().focus("end").insertContent(`\n\n${result}`).run();
      } else {
        // Whole-document improve/grammar/convert-resolution — replace, emitting update so onChange fires.
        editor.commands.setContent(result, true);
        if (action === "convert-resolution" && ai.onConvertedToDraftResolution) {
          ai.onConvertedToDraftResolution();
        }
      }
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach the AI.");
    } finally {
      setBusy(null);
    }
  }, [busy, editor, ai]);

  if (!enabled) return null;

  const empty = !getMarkdown(editor).trim();
  const canImprove = surfaceAllows(ai.surface, "improve");
  const canContinue = surfaceAllows(ai.surface, "continue");
  const canDraft = surfaceAllows(ai.surface, "draft");
  const canGrammar = surfaceAllows(ai.surface, "grammar");
  const canConvertResolution = surfaceAllows(ai.surface, "convert-resolution");
  const item =
    "w-full h-8 inline-flex items-center gap-2 px-2 rounded-lg text-xs font-medium text-left " +
    "hover:bg-primary/5 hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="AI assist"
        className={cn(
          "inline-flex items-center gap-1 h-[26px] px-1.5 rounded transition-all text-xs font-semibold",
          open
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-background hover:text-primary",
        )}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        AI
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-xl border border-border/70 bg-card p-1.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
          {canConvertResolution && (
            <button
              type="button"
              className={cn(item, "text-primary dark:text-primary font-semibold")}
              disabled={busy !== null || empty}
              title={empty ? "Write or paste working paper notes first" : "Auto-convert working paper into standard UN Draft Resolution format"}
              onClick={() => run("convert-resolution")}
            >
              {busy === "convert-resolution" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Auto-Convert to Draft Resolution
            </button>
          )}
          {canImprove && (
            <button
              type="button"
              className={item}
              disabled={busy !== null || empty}
              title={empty ? "Write something first" : "Polish the whole document"}
              onClick={() => run("improve")}
            >
              {busy === "improve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              Improve document
            </button>
          )}
          {canContinue && (
            <button
              type="button"
              className={item}
              disabled={busy !== null || empty}
              title={empty ? "Write something first" : undefined}
              onClick={() => run("continue")}
            >
              {busy === "continue" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
              Continue writing
            </button>
          )}
          {canDraft && (
            <button
              type="button"
              className={item}
              disabled={busy !== null}
              onClick={() => { setOpen(false); setDraftOpen(true); }}
            >
              <FileText className="w-3.5 h-3.5" />
              Generate draft…
            </button>
          )}
          {canGrammar && (
            <button
              type="button"
              className={item}
              disabled={busy !== null || empty}
              title={empty ? "Write something first" : undefined}
              onClick={() => run("grammar")}
            >
              {busy === "grammar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SpellCheck className="w-3.5 h-3.5" />}
              Fix grammar (document)
            </button>
          )}
          {err && <p className="mt-1 px-2 text-[11px] text-amber-500 leading-snug">{err}</p>}
        </div>
      )}

      {canDraft && <AiDraftDialog editor={editor} ai={ai} open={draftOpen} onOpenChange={setDraftOpen} />}
    </div>
  );
}

// ── Selection bubble ────────────────────────────────────────────────────────────

export function AiSelectionBubble({ editor, ai }: { editor: Editor; ai: EditorAiConfig }) {
  const enabled = useAiWritingEnabled();
  const [busy, setBusy] = useState<EditorAiAction | null>(null);

  const runOnSelection = useCallback(async (action: "improve" | "grammar" | "shorten" | "expand") => {
    if (busy) return;
    const { from, to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!selection) return;
    setBusy(action === "grammar" ? "grammar-selection" : action);
    try {
      const result = await callWritingAssist({
        action, surface: ai.surface, selection, docType: ai.docType, context: ai.context,
      });
      if (result) {
        // Replace the selected range; Ctrl+Z restores via tiptap history.
        editor.chain().focus().deleteRange({ from, to }).insertContent(result).run();
      }
    } catch {
      // Bubble has no room for prose — the toolbar menu is the verbose path.
    } finally {
      setBusy(null);
    }
  }, [busy, editor, ai]);

  const canImprove = surfaceAllows(ai.surface, "improve");
  const canGrammar = surfaceAllows(ai.surface, "grammar");
  const canShorten = surfaceAllows(ai.surface, "shorten");
  const canExpand = surfaceAllows(ai.surface, "expand");
  if (!enabled || (!canImprove && !canGrammar)) return null;

  const pill =
    "inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold " +
    "text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50";

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, placement: "top" }}
      shouldShow={({ state }) => {
        const { from, to, empty } = state.selection;
        return !empty && state.doc.textBetween(from, to, "\n").trim().length > 0;
      }}
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-sm">
        {canImprove && (
          <button type="button" className={pill} disabled={busy !== null} onClick={() => runOnSelection("improve")}>
            {busy === "improve" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Improve
          </button>
        )}
        {canShorten && (
          <button type="button" className={pill} disabled={busy !== null} onClick={() => runOnSelection("shorten")}>
            {busy === "shorten" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minimize2 className="w-3 h-3" />}
            Shorten
          </button>
        )}
        {canExpand && (
          <button type="button" className={pill} disabled={busy !== null} onClick={() => runOnSelection("expand")}>
            {busy === "expand" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Maximize2 className="w-3 h-3" />}
            Expand
          </button>
        )}
        {canGrammar && (
          <button type="button" className={pill} disabled={busy !== null} onClick={() => runOnSelection("grammar")}>
            {busy === "grammar-selection" ? <Loader2 className="w-3 h-3 animate-spin" /> : <SpellCheck className="w-3 h-3" />}
            Fix grammar
          </button>
        )}
      </div>
    </BubbleMenu>
  );
}

// ── Draft dialog ────────────────────────────────────────────────────────────────

function AiDraftDialog({
  editor, ai, open, onOpenChange,
}: {
  editor: Editor;
  ai: EditorAiConfig;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await callWritingAssist({
        action: "draft", surface: ai.surface,
        instruction: instruction.trim() || undefined,
        docType: ai.docType, context: ai.context,
      });
      if (!result) throw new Error("No usable result — try again.");
      setDraft(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach the AI.");
    } finally {
      setBusy(false);
    }
  }, [busy, ai, instruction]);

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) { setDraft(null); setErr(null); }
  };

  const insert = (replace: boolean) => {
    if (!draft) return;
    if (replace) {
      editor.commands.setContent(draft, true);
    } else {
      editor.chain().focus().insertContent(draft).run();
    }
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Generate a draft
          </DialogTitle>
          <DialogDescription>
            Describe the topic or paste your notes — the AI writes a first draft you can edit.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-3">
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Topic, key points, anything the draft should cover…"
              rows={4}
            />
            {err && <p className="text-xs text-amber-500">{err}</p>}
            <div className="flex justify-end">
              <Button type="button" onClick={generate} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                Generate
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="markdown-content max-h-[50vh] overflow-y-auto rounded-xl border border-border/60 bg-secondary/[0.04] px-4 py-3"
              // Same render path as saved docs: markdown → marked → HTML.
              dangerouslySetInnerHTML={{ __html: marked.parse(draft) as string }}
            />
            {err && <p className="text-xs text-amber-500">{err}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                Back
              </Button>
              <Button type="button" variant="outline" onClick={generate} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Regenerate
              </Button>
              <Button type="button" variant="outline" onClick={() => insert(false)}>
                <ArrowRightToLine className="w-4 h-4 mr-1.5" /> Insert at cursor
              </Button>
              <Button type="button" onClick={() => insert(true)}>
                <Replace className="w-4 h-4 mr-1.5" /> Replace document
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
