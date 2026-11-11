import { NextResponse } from "next/server";
import { requireUid } from "@/lib/server/migrationServer";
import { aiQuotaRefusal } from "@/lib/server/aiQuota";
import { aiEnabled, generateWithFallback, AiChainError, createUidThrottle } from "@/lib/server/aiProviders";
import { SURFACES, DOC_TYPE_DRAFT_HINTS } from "./registry";
import type { WritingAction, WritingSurface, SurfaceSpec } from "./registry";

export const dynamic = "force-dynamic";

/**
 * Platform-wide AI writing assist for paragraph/document-scale text — the long-form
 * sibling of /api/ai/session-assist (which stays the 7-word suggester). One route,
 * many surfaces: each surface is registered in ./registry.ts with its own voice,
 * allowed actions, and char budgets. Generation goes through the Gemini → Groq →
 * OpenRouter fallback chain in src/lib/server/aiProviders.ts.
 *
 * Response is a single text (`result`) — no JSON envelope to break, so the chain
 * runs with wantJson:false and free-tier models can't fail on format.
 */

export type { WritingAction, WritingSurface };

export interface WritingAssistRequest {
  action: WritingAction;
  surface: WritingSurface;
  /** Full current content (markdown for long surfaces, plain for medium). */
  text?: string;
  /** Selected text — used by long-form improve/grammar. Absent = whole document. */
  selection?: string;
  /** Extra instruction for "draft" (topic / notes typed in the dialog). */
  instruction?: string;
  /** Doc type for surface "committee-doc": working-paper | draft-resolution | amendment. */
  docType?: string;
  /** Per-surface whitelisted keys only — see registry contextKeys. */
  context?: Record<string, string>;
  /** The event this is written in: AI inside a Pro event doesn't count against the daily quota. */
  eventId?: string;
  /** Previous suggest result, so "Try another" differs. */
  avoid?: string;
}

export interface WritingAssistResponse {
  /** Markdown (long surfaces) or plain text (medium surfaces). */
  result: string;
}

const ACTIONS: WritingAction[] = ["improve", "continue", "draft", "grammar", "suggest", "convert-resolution", "shorten", "expand"];

const MAX_INSTRUCTION_CHARS = 1_000;
const MAX_AVOID_CHARS = 600;
const MAX_CONTEXT_VALUE_CHARS = 200;
/** "Continue" only needs the tail of the document to match voice. */
const CONTINUE_TAIL_CHARS = 3_000;

// Draft & convert-resolution are ~10x the tokens of a short suggest — count double.
const throttled = createUidThrottle(60_000, 8);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

// ── Prompt building ─────────────────────────────────────────────────────────────

function buildSystem(spec: SurfaceSpec): string {
  const format =
    spec.kind === "long"
      ? "Write in markdown."
      : "Plain text only — no markdown headings, no bullet lists unless the text already uses them.";
  return [
    `You are a writing assistant for a Model UN platform. You are helping with a ${spec.noun}.`,
    spec.systemHint,
    format,
    "Return only the requested text — no preamble, no explanation, no code fences, no quotes around the output.",
  ].join("\n");
}

function contextBlock(spec: SurfaceSpec, raw: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const key of spec.contextKeys) {
    const value = str(raw[key]).trim().slice(0, MAX_CONTEXT_VALUE_CHARS);
    if (value) lines.push(`${key}: ${value}`);
  }
  return lines.length ? `Context:\n${lines.join("\n")}` : "";
}

interface PromptInput {
  action: WritingAction;
  spec: SurfaceSpec;
  content: string;
  instruction: string;
  docType: string;
  avoid: string;
  ctx: string;
}

function buildUserPrompt(p: PromptInput): string {
  const parts: string[] = [p.ctx];

  switch (p.action) {
    case "improve":
      parts.push(
        "Rewrite the passage below — sharper, clearer, same meaning, same approximate length, same language register. Return only the rewritten passage.",
        // Surface-specific polish guidance so the same "improve" reads differently
        // for a draft resolution vs a blog article.
        p.spec.improveHint,
        `Passage:\n${p.content}`,
      );
      break;
    case "shorten":
      parts.push(
        "Shorten the passage below to roughly half its length. Keep the key points, the meaning and the voice; cut repetition and filler. Return only the shortened passage.",
        `Passage:\n${p.content}`,
      );
      break;
    case "expand":
      parts.push(
        "Expand the passage below to roughly twice its length with concrete detail, examples or explanation that fit what it already says. Keep its voice and format; do not invent facts, names or figures. Return only the expanded passage.",
        `Passage:\n${p.content}`,
      );
      break;
    case "grammar":
      parts.push(
        "Fix grammar, spelling and punctuation only in the text below. Do not change meaning, tone, or word choice beyond what correctness requires. Return only the corrected text.",
        `Text:\n${p.content}`,
      );
      break;
    case "continue":
      parts.push(
        `Continue this ${p.spec.noun} naturally from where it stops. Match its style and format. Write 1-3 paragraphs (or clauses, if the document uses clauses). Return only the continuation — do not repeat existing text.`,
        `Document so far (may be truncated at the start):\n${p.content.slice(-CONTINUE_TAIL_CHARS)}`,
      );
      break;
    case "draft": {
      parts.push(`Write a first draft of a ${p.spec.noun}.`);
      const hint = p.docType ? DOC_TYPE_DRAFT_HINTS[p.docType] : "";
      if (hint) parts.push(hint);
      if (p.instruction) parts.push(`The author's notes/topic:\n${p.instruction}`);
      break;
    }
    case "convert-resolution": {
      parts.push(
        "Convert the Working Paper notes / content below into a formal Model UN Draft Resolution adhering strictly to standard UN resolution format:",
        "FORMATTING & STRUCTURE INSTRUCTIONS:",
        "1. Committee & Topic Header: Include Committee Name, Co-sponsors (if available in context), and Topic.",
        "2. Preambular Clauses: Precede with italicized gerund phrases (*Guided by*, *Deeply concerned*, *Noting with regret*, *Keeping in mind*, *Aware of*, *Alarmed by*, *Further recalling*). Each preambular clause MUST end with a comma (',').",
        "3. Operative Clauses: Use a numbered list (1., 2., 3., etc.). Each main operative clause MUST begin with bold operative verbs (**Reminds**, **Encourages**, **Suggests**, **Calls upon**, **Affirms**, **Demands**, **Requests**, etc.). Sub-clauses must be indented under their clause using lowercase letters (a., b., c.). End each main operative clause (or sub-clause set) with a semicolon (';'), and end the final operative clause with a period ('.').",
        "Preserve all original ideas and proposals from the working paper, transforming them into diplomatic, clear, and structured resolution clauses.",
        `Working Paper Content:\n${p.content}`
      );
      break;
    }
    case "suggest":
      parts.push(`Write one strong ${p.spec.noun} (at most ${p.spec.maxOutputChars} characters).`);
      if (p.instruction) parts.push(`The author's notes:\n${p.instruction}`);
      if (p.avoid) parts.push(`Do not repeat this earlier version:\n${p.avoid}`);
      break;
  }

  return parts.filter(Boolean).join("\n\n");
}

function maxTokensFor(action: WritingAction, spec: SurfaceSpec, contentLen: number): number {
  const clampInt = (min: number, v: number, max: number) => Math.max(min, Math.min(max, Math.ceil(v)));
  switch (action) {
    case "draft":
    case "convert-resolution":
      return spec.kind === "long" ? 2_500 : 600;
    case "suggest":
      return 400;
    case "continue":
      return 800;
    case "improve":
      // ~4 chars/token, 2x headroom so a rewrite is never cut mid-clause.
      return clampInt(300, contentLen / 2, 2_000);
    case "grammar":
    case "shorten":
      return clampInt(300, contentLen / 2.5, 2_000);
    case "expand":
      return clampInt(400, contentLen, 2_500);
  }
}

// ── Output cleanup ──────────────────────────────────────────────────────────────

/**
 * Same doctrine as the session route's 7-word clamp, at paragraph scale: never
 * trust the model with a limit. Strip fences and "Here is ...:" preambles, then
 * hard-cut to the surface budget, trimming back to the last sentence end.
 */
function cleanResult(raw: string, spec: SurfaceSpec): string {
  let out = raw.trim();

  // Fences (with or without language tag) wrapping the whole output.
  out = out.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  // A short first line ending in ":" is a preamble ("Here is the improved text:").
  const nl = out.indexOf("\n");
  if (nl > 0 && nl < 80 && out.slice(0, nl).trimEnd().endsWith(":")) {
    out = out.slice(nl + 1).trim();
  }

  if (out.length > spec.maxOutputChars) {
    out = out.slice(0, spec.maxOutputChars);
    // Trim back to the last sentence terminator so we never end mid-sentence.
    const lastEnd = Math.max(
      out.lastIndexOf("."), out.lastIndexOf("!"), out.lastIndexOf("?"), out.lastIndexOf(";"),
    );
    if (lastEnd > spec.maxOutputChars * 0.5) out = out.slice(0, lastEnd + 1);
    out = out.trim();
  }

  return out;
}

// ── Handlers ────────────────────────────────────────────────────────────────────

/** Availability probe — same contract as /api/ai/session-assist. */
export async function GET() {
  return NextResponse.json({ enabled: aiEnabled() });
}

export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiEnabled()) {
    return NextResponse.json({ error: "AI assist is not configured." }, { status: 503 });
  }

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const action = str(raw.action) as WritingAction;
  const surface = str(raw.surface) as WritingSurface;
  const spec = SURFACES[surface];
  if (!ACTIONS.includes(action) || !spec || !spec.allowedActions.includes(action)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (throttled(uid, action === "draft" || action === "convert-resolution" ? 2 : 1)) {
    return NextResponse.json({ error: "Slow down — try again in a moment." }, { status: 429 });
  }
  const quota = await aiQuotaRefusal(uid, raw.eventId, action === "draft" || action === "convert-resolution" ? 2 : 1);
  if (quota) return NextResponse.json({ error: quota }, { status: 429 });

  // Input bounds — a client cannot inflate token spend by padding the prompt.
  const text = str(raw.text).trim().slice(0, spec.maxInputChars);
  const selection = str(raw.selection).trim().slice(0, spec.maxInputChars);
  const instruction = str(raw.instruction).trim().slice(0, MAX_INSTRUCTION_CHARS);
  const avoid = str(raw.avoid).trim().slice(0, MAX_AVOID_CHARS);
  const docType = str(raw.docType).trim();
  const rawCtx = (raw.context && typeof raw.context === "object" ? raw.context : {}) as Record<string, unknown>;

  // What the action operates on: an explicit selection wins, else the whole text.
  const content = selection || text;
  if ((action === "improve" || action === "grammar" || action === "continue" || action === "shorten" || action === "expand") && !content) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }

  try {
    const gen = await generateWithFallback({
      system: buildSystem(spec),
      user: buildUserPrompt({
        action,
        spec,
        content,
        instruction,
        docType,
        avoid,
        ctx: contextBlock(spec, rawCtx),
      }),
      maxTokens: maxTokensFor(action, spec, content.length),
      temperature: action === "grammar" ? 0.2 : action === "suggest" ? 0.9 : 0.6,
      wantJson: false,
    });

    const result = cleanResult(gen.text, spec);
    if (!result) {
      return NextResponse.json({ error: "No usable result — try again." }, { status: 502 });
    }

    return NextResponse.json({ result } satisfies WritingAssistResponse);
  } catch (e: unknown) {
    if (e instanceof AiChainError) {
      const message =
        e.status === 429
          ? "AI is busy right now — try again shortly."
          : e.status === 504
            ? "AI timed out. Please try again."
            : "AI assist is unavailable right now.";
      return NextResponse.json({ error: message }, { status: e.status });
    }
    console.error("[ai/writing-assist] error:", e);
    return NextResponse.json({ error: "Could not reach the AI provider." }, { status: 502 });
  }
}
