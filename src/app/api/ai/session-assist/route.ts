import { NextResponse } from "next/server";
import { requireUid } from "@/lib/server/migrationServer";
import { aiQuotaRefusal } from "@/lib/server/aiQuota";
import { aiEnabled, generateWithFallback, AiChainError, createUidThrottle } from "@/lib/server/aiProviders";

export const dynamic = "force-dynamic";

/**
 * AI writing assist for the live-session floor pipeline (motion topics, point notes,
 * caucus topics). Proxied server-side so provider keys never reach the browser —
 * generation goes through the Gemini → Groq → OpenRouter fallback chain in
 * src/lib/server/aiProviders.ts.
 *
 * Why it matters: the text a delegate types here is not throwaway. A motion topic
 * becomes the caucus topic on the projector (executeMotion → startModCaucus), and the
 * act of motioning bumps participation.motions, which feeds marking autofill. Sharper
 * text = a better room AND a fairer score.
 *
 * Hard product constraint: EVERY item is 6-7 words. The prompt asks for it and the
 * server clamps it — never trust the model with a hard limit.
 */

const DEFAULT_MAX_WORDS = 7;

// Input bounds — a client cannot inflate our token spend by padding the prompt.
const MAX_TEXT_CHARS = 300;
const MAX_EXCLUDE = 12;
const MAX_RECENT = 8;

export type AiAssistMode = "suggest" | "improve";
export type AiAssistField =
  | "motion_topic"
  | "point_note"
  | "caucus_topic"
  // Short one-liners outside the session floor pipeline — same suggester, same clamp.
  | "vote_label"
  | "announcement_subject"
  | "dismiss_reason";

const MODES: AiAssistMode[] = ["suggest", "improve"];
const FIELDS: AiAssistField[] = [
  "motion_topic", "point_note", "caucus_topic",
  "vote_label", "announcement_subject", "dismiss_reason",
];

/** Per-field word cap — email subjects breathe a little wider than floor topics. */
const FIELD_MAX_WORDS: Partial<Record<AiAssistField, number>> = {
  announcement_subject: 12,
};

export interface AiAssistContext {
  committee?: string;
  country?: string;
  phase?: string;
  /** Human label of the selected motion type (e.g. "Moderated caucus"). */
  motionType?: string;
  /** Human label of the selected point type. */
  pointType?: string;
  caucusTopic?: string;
  agenda?: string;
  /** Generic "what is this about" for the non-floor fields (vote label, subject…). */
  subject?: string;
  /** Topics already on the floor — the model is told not to repeat these. */
  recentTopics?: string[];
}

export interface AiAssistRequest {
  mode: AiAssistMode;
  field: AiAssistField;
  /** The delegate's current draft. Required for "improve". */
  text?: string;
  context?: AiAssistContext;
  /** Suggestions already shown, so "More ideas" returns fresh ones. */
  exclude?: string[];
}

/** Uniform for both modes: "suggest" returns 3, "improve" returns 1. */
export interface AiAssistResponse {
  suggestions: string[];
}

// ── Per-uid throttle ────────────────────────────────────────────────────────────
// Per serverless instance — a spam brake, not a hard cap (see createUidThrottle).
const throttled = createUidThrottle(60_000, 10);

// ── Helpers ─────────────────────────────────────────────────────────────────────
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Pull the string list out of whatever JSON shape a model returned:
 *   {suggestions:[...]}  (the asked-for shape) → that array
 *   ["a","b"]            (bare array)          → itself
 *   {options:[...]}      (stray key)           → first array-valued property
 */
function extractItems(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.suggestions)) return obj.suggestions;
    const firstArray = Object.values(obj).find((v) => Array.isArray(v));
    if (firstArray) return firstArray;
  }
  return [];
}

const strList = (v: unknown, cap: number): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
       .map((s) => s.trim())
       .filter(Boolean)
       .slice(0, cap)
    : [];

/** Strip list bullets/quotes/trailing punctuation, then hard-cut to the word cap. */
function clamp(s: string, maxWords: number): string {
  return s
    .trim()
    .replace(/^["'“”\s\-–—•*]+|^\d+[.)]\s*/g, "")
    .replace(/["'“”\s.,;:!]+$/g, "")
    .split(/\s+/)
    .slice(0, maxWords)
    .join(" ")
    .trim();
}

const SYSTEM = `You write short one-line items for a Model UN platform: motion topics, chair notes, vote labels, email subjects.
Hard rules:
- Respect the word limit given in the request. Never exceed it.
- No sentences, no trailing punctuation, no quotes, no numbering, no preamble, no explanation.
- Specific and appropriate to the committee and context provided.
- Never restate the motion or point type itself (do not write "moderated caucus on ...").
Return a JSON object of exactly this shape: {"suggestions": ["first item", "second item"]}
where each array element is one plain-string item. Use the "suggestions" key and nothing else.`;

const FIELD_NOUN: Record<AiAssistField, string> = {
  motion_topic: "motion topic",
  point_note: "note to the chair",
  caucus_topic: "caucus topic",
  vote_label: "vote motion label",
  announcement_subject: "email subject line",
  dismiss_reason: "brief dismissal reason for the delegate",
};

function contextBlock(ctx: AiAssistContext): string {
  const lines: string[] = [];
  if (ctx.committee) lines.push(`Committee: ${ctx.committee}`);
  if (ctx.agenda) lines.push(`Agenda: ${ctx.agenda}`);
  if (ctx.country) lines.push(`Delegation: ${ctx.country}`);
  if (ctx.phase) lines.push(`Phase: ${ctx.phase}`);
  if (ctx.motionType) lines.push(`Motion: ${ctx.motionType}`);
  if (ctx.pointType) lines.push(`Point: ${ctx.pointType}`);
  if (ctx.caucusTopic) lines.push(`Current caucus topic: ${ctx.caucusTopic}`);
  if (ctx.subject) lines.push(`About: ${ctx.subject}`);
  if (ctx.recentTopics?.length) {
    lines.push(`Already on the floor — do not repeat: ${ctx.recentTopics.join("; ")}`);
  }
  return lines.join("\n");
}

function buildPrompt(body: AiAssistRequest): string {
  const ctx = body.context || {};
  const noun = FIELD_NOUN[body.field];
  const maxWords = FIELD_MAX_WORDS[body.field] ?? DEFAULT_MAX_WORDS;
  const limit = `${maxWords - 1}-${maxWords} words`;
  const parts = [contextBlock(ctx)];

  if (body.exclude?.length) {
    parts.push(`Already suggested — do not repeat: ${body.exclude.join("; ")}`);
  }

  if (body.mode === "improve") {
    parts.push(
      `The author wrote: "${body.text}"`,
      `Rewrite it sharper and more diplomatic as a ${noun}, keeping their intent. ${limit}. Return exactly 1 item.`,
    );
  } else {
    parts.push(`Give 3 distinct options for this ${noun}. ${limit} each.`);
  }

  return parts.filter(Boolean).join("\n");
}

// ── Handlers ────────────────────────────────────────────────────────────────────

/**
 * Availability probe. The single source of truth for whether the client renders the
 * sparkle button — better than a second NEXT_PUBLIC_ flag that can drift from the key.
 * Any one provider key (Gemini/Groq/OpenRouter) enables AI.
 */
export async function GET() {
  return NextResponse.json({ enabled: aiEnabled() });
}

export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiEnabled()) {
    return NextResponse.json({ error: "AI assist is not configured." }, { status: 503 });
  }

  if (throttled(uid)) {
    return NextResponse.json({ error: "Slow down — try again in a moment." }, { status: 429 });
  }

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const mode = str(raw.mode) as AiAssistMode;
  const field = str(raw.field) as AiAssistField;
  if (!MODES.includes(mode) || !FIELDS.includes(field)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const quota = await aiQuotaRefusal(uid, raw.eventId);
  if (quota) return NextResponse.json({ error: quota }, { status: 429 });

  const text = str(raw.text).trim().slice(0, MAX_TEXT_CHARS);
  if (mode === "improve" && !text) {
    return NextResponse.json({ error: "Write something first, then improve it." }, { status: 400 });
  }

  const rawCtx = (raw.context && typeof raw.context === "object" ? raw.context : {}) as Record<string, unknown>;
  const context: AiAssistContext = {
    committee: str(rawCtx.committee).slice(0, 120),
    country: str(rawCtx.country).slice(0, 80),
    phase: str(rawCtx.phase).slice(0, 40),
    motionType: str(rawCtx.motionType).slice(0, 80),
    pointType: str(rawCtx.pointType).slice(0, 80),
    caucusTopic: str(rawCtx.caucusTopic).slice(0, 200),
    agenda: str(rawCtx.agenda).slice(0, 200),
    subject: str(rawCtx.subject).slice(0, 160),
    recentTopics: strList(rawCtx.recentTopics, MAX_RECENT).map((s) => s.slice(0, 120)),
  };
  const exclude = strList(raw.exclude, MAX_EXCLUDE).map((s) => s.slice(0, 120));

  const wanted = mode === "suggest" ? 3 : 1;

  try {
    const gen = await generateWithFallback({
      system: SYSTEM,
      user: buildPrompt({ mode, field, text, context, exclude }),
      maxTokens: 200,
      // High temp for variety across "More ideas"; low for a faithful rewrite.
      temperature: mode === "suggest" ? 1.0 : 0.4,
      wantJson: true,
      geminiSchema: {
        type: "OBJECT",
        properties: { suggestions: { type: "ARRAY", items: { type: "STRING" } } },
        required: ["suggestions"],
      },
    });

    // generateWithFallback guarantees parseable JSON when wantJson.
    const parsed = JSON.parse(gen.text) as unknown;

    // Gemini's schema forces {suggestions:[...]}. Free Groq/OpenRouter models are
    // only asked in the prompt, so salvage a bare array or a differently-keyed
    // array before giving up — never 502 over a stray JSON key.
    const rawItems = extractItems(parsed);

    const maxWords = FIELD_MAX_WORDS[field] ?? DEFAULT_MAX_WORDS;
    const seen = new Set(exclude.map((s) => s.toLowerCase()));
    const suggestions: string[] = [];
    for (const item of strList(rawItems, 12)) {
      const clamped = clamp(item, maxWords);
      const k = clamped.toLowerCase();
      if (!clamped || seen.has(k)) continue;
      seen.add(k);
      suggestions.push(clamped);
      if (suggestions.length >= wanted) break;
    }

    if (!suggestions.length) {
      return NextResponse.json({ error: "No usable suggestion — try again." }, { status: 502 });
    }

    return NextResponse.json({ suggestions } satisfies AiAssistResponse);
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
    console.error("[ai/session-assist] error:", e);
    return NextResponse.json({ error: "Could not reach the AI provider." }, { status: 502 });
  }
}
