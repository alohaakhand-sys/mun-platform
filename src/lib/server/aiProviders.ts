/**
 * Multi-provider AI text generation with automatic fallback.
 *
 * Chain: Gemini → Groq → OpenRouter. Each provider is skipped when its key is
 * unset, so ANY single key enables AI platform-wide. Raw fetch only — no SDKs,
 * same doctrine as the original session-assist proxy.
 *
 * Free-tier guardrails:
 * - Groq: free tier only (default llama-3.1-8b-instant, 14.4K req/day).
 * - OpenRouter: model ids MUST end ":free" — anything else is dropped before the
 *   request is built, so a typo'd env var can never spend money.
 *
 * Server-only. Import from API routes, never from client components.
 */

export type AiProviderId = "gemini" | "groq" | "openrouter";

export interface AiGenRequest {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  /**
   * JSON-object output required. Appends a JSON instruction to `system`, enables
   * native JSON modes where reliable, and validates parseability before returning.
   */
  wantJson: boolean;
  /** Gemini-only structured schema (responseSchema passthrough). Ignored elsewhere. */
  geminiSchema?: Record<string, unknown>;
  /** Overall wall-clock budget across ALL attempts. Default 20s. */
  deadlineMs?: number;
}

export interface AiGenResult {
  /** Raw model text — guaranteed JSON.parse-able when wantJson. */
  text: string;
  provider: AiProviderId;
  model: string;
  ms: number;
}

/** Thrown when every provider/candidate is exhausted. */
export class AiChainError extends Error {
  status: 429 | 502 | 504;
  constructor(message: string, status: 429 | 502 | 504) {
    super(message);
    this.name = "AiChainError";
    this.status = status;
  }
}

const DEFAULT_DEADLINE_MS = 20_000;
const PER_ATTEMPT_MS = 8_000;
/** Don't bother starting an attempt with less runway than this. */
const MIN_ATTEMPT_MS = 2_500;

// Auto-updating alias — always the current stable flash-lite, so a model shutdown
// (2.5-flash-lite retired 2026-07-22) never 404s us again. Pin via GEMINI_MODEL only
// if a specific version is needed.
const GEMINI_DEFAULT_MODEL = "gemini-flash-lite-latest";
const GROQ_DEFAULT_MODEL = "llama-3.1-8b-instant";
/**
 * OpenRouter's free lineup rotates — this list is a best-effort default, overridable
 * via OPENROUTER_MODELS (comma-separated). A 400/404 on one id tries the next.
 */
const OPENROUTER_DEFAULT_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
];
const OPENROUTER_MAX_CANDIDATES = 3;

// ── Availability ────────────────────────────────────────────────────────────────

/** Any one key enables AI. The GET probes on the AI routes call this. */
export function aiEnabled(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
}

// ── Per-uid throttle factory ────────────────────────────────────────────────────
// Module-level and therefore PER SERVERLESS INSTANCE on Vercel — a spam brake, not
// a hard cap. Paired with clients disabling buttons while a call is in flight.
// `cost` lets expensive actions (e.g. long-form draft) count as multiple hits.

export function createUidThrottle(windowMs: number, maxPerWindow: number) {
  const hits = new Map<string, number[]>();
  return function throttled(uid: string, cost = 1): boolean {
    const now = Date.now();
    const recent = (hits.get(uid) || []).filter((t) => now - t < windowMs);
    if (recent.length + cost > maxPerWindow) {
      hits.set(uid, recent);
      return true;
    }
    for (let i = 0; i < cost; i++) recent.push(now);
    hits.set(uid, recent);
    // Opportunistic sweep so the map cannot grow unbounded across a long-lived instance.
    if (hits.size > 500) {
      for (const [k, v] of hits) {
        if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      }
    }
    return false;
  };
}

// ── Soft per-provider daily counters (observability only, per instance) ─────────

const dayCounts = new Map<AiProviderId, { day: string; n: number }>();

function bumpDayCount(provider: AiProviderId): number {
  const day = new Date().toISOString().slice(0, 10);
  const cur = dayCounts.get(provider);
  const n = cur && cur.day === day ? cur.n + 1 : 1;
  dayCounts.set(provider, { day, n });
  return n;
}

// ── JSON extraction ─────────────────────────────────────────────────────────────

/**
 * Free/openai-compat models love code fences and preambles even when told not to.
 * Strip fences, then take the first "{" through the last "}".
 */
function extractJson(text: string): string | null {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const candidate = stripped.slice(start, end + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

// ── Provider adapters ───────────────────────────────────────────────────────────
// Each returns the raw text on success and throws AttemptError on any failure the
// chain should route around. Never throws anything user-facing.

type FailKind = "next-provider" | "next-candidate" | "skip-provider";

class AttemptError extends Error {
  kind: FailKind;
  status?: number;
  constructor(message: string, kind: FailKind, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

function failKindFor(status: number): FailKind {
  if (status === 400 || status === 404) return "next-candidate"; // bad/retired model id
  if (status === 401 || status === 403) return "skip-provider"; // bad key — no point retrying models
  return "next-provider"; // 429 / 402 / 5xx / anything else
}

async function callGemini(
  model: string,
  req: AiGenRequest,
  system: string,
  signal: AbortSignal,
): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          ...(req.wantJson
            ? {
                responseMimeType: "application/json",
                ...(req.geminiSchema ? { responseSchema: req.geminiSchema } : {}),
              }
            : {}),
          // NOT temperature — starting with Gemini 3.6 Flash / 3.5 Flash-Lite (and the
          // "-latest" aliases now hot-swapped onto that generation), temperature/top_p/top_k
          // are hard-rejected with a 400 instead of merely ignored. Determinism now goes
          // through the system instruction instead.
          maxOutputTokens: req.maxTokens,
        },
      }),
    },
  );

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new AttemptError(`gemini ${resp.status}: ${detail.slice(0, 300)}`, failKindFor(resp.status), resp.status);
  }

  const data = await resp.json();
  // Safety block = unusable response; route around it.
  const blocked = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason === "SAFETY";
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (blocked || typeof text !== "string" || !text.trim()) {
    throw new AttemptError("gemini empty/blocked response", "next-provider");
  }
  return text;
}

/** Groq and OpenRouter share the OpenAI chat-completions shape. */
async function callOpenAiCompat(
  provider: AiProviderId,
  endpoint: string,
  apiKey: string,
  model: string,
  req: AiGenRequest,
  system: string,
  signal: AbortSignal,
  extraHeaders: Record<string, string> = {},
  supportsJsonMode = false,
): Promise<string> {
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...extraHeaders },
    signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: req.user },
      ],
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      // OpenRouter free models often 400 on response_format — prompt-only there.
      ...(req.wantJson && supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new AttemptError(
      `${provider} ${resp.status}: ${detail.slice(0, 300)}`,
      failKindFor(resp.status),
      resp.status,
    );
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new AttemptError(`${provider} empty response`, "next-provider");
  }
  return text;
}

// ── Candidate lists ─────────────────────────────────────────────────────────────

function geminiCandidates(): string[] {
  return [process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL];
}

function groqCandidates(): string[] {
  const custom = (process.env.GROQ_MODEL || "").trim();
  // If a custom model 400/404s (typo / retired), fall back to the known-good default.
  return [...new Set([custom, GROQ_DEFAULT_MODEL].filter(Boolean))];
}

function openrouterCandidates(): string[] {
  const fromEnv = (process.env.OPENROUTER_MODELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = fromEnv.length ? fromEnv : OPENROUTER_DEFAULT_MODELS;
  // HARD GUARD: free-tier only. A paid id with credits on the account would bill —
  // never let one through, even from a typo'd env var.
  const free = list.filter((m) => {
    if (m.endsWith(":free")) return true;
    console.warn(`[aiProviders] dropping non-free OpenRouter model "${m}" — only :free ids are allowed`);
    return false;
  });
  return free.slice(0, OPENROUTER_MAX_CANDIDATES);
}

// ── The chain ───────────────────────────────────────────────────────────────────

interface ProviderPlan {
  id: AiProviderId;
  candidates: string[];
  call: (model: string, req: AiGenRequest, system: string, signal: AbortSignal) => Promise<string>;
}

function buildPlans(): ProviderPlan[] {
  const plans: ProviderPlan[] = [];
  if (process.env.GEMINI_API_KEY) {
    plans.push({ id: "gemini", candidates: geminiCandidates(), call: callGemini });
  }
  if (process.env.GROQ_API_KEY) {
    plans.push({
      id: "groq",
      candidates: groqCandidates(),
      call: (model, req, system, signal) =>
        callOpenAiCompat(
          "groq",
          "https://api.groq.com/openai/v1/chat/completions",
          process.env.GROQ_API_KEY!,
          model,
          req,
          system,
          signal,
          {},
          true,
        ),
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    plans.push({
      id: "openrouter",
      candidates: openrouterCandidates(),
      call: (model, req, system, signal) =>
        callOpenAiCompat(
          "openrouter",
          "https://openrouter.ai/api/v1/chat/completions",
          process.env.OPENROUTER_API_KEY!,
          model,
          req,
          system,
          signal,
          { "X-Title": "MUN Platform" },
          false,
        ),
    });
  }
  return plans;
}

/**
 * Try providers in order until one yields usable text. Throws AiChainError with the
 * best user-facing status when everything is exhausted.
 */
export async function generateWithFallback(req: AiGenRequest): Promise<AiGenResult> {
  const plans = buildPlans();
  if (!plans.length) throw new AiChainError("No AI provider configured.", 502);

  const system = req.wantJson
    ? `${req.system}\nRespond with a single JSON object only — no code fences, no commentary.`
    : req.system;

  const deadline = Date.now() + (req.deadlineMs ?? DEFAULT_DEADLINE_MS);
  let sawRateLimit = false;
  let sawTimeout = false;

  for (const plan of plans) {
    for (const model of plan.candidates) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_ATTEMPT_MS) {
        sawTimeout = true;
        break;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(PER_ATTEMPT_MS, remaining));
      const started = Date.now();

      try {
        const raw = await plan.call(model, req, system, controller.signal);
        const text = req.wantJson ? extractJson(raw) : raw;
        if (!text) {
          // Unparseable JSON is an unusable response — treat like empty and move on.
          console.warn(`[aiProviders] ${plan.id}/${model} returned non-JSON output — trying next`);
          continue;
        }
        const ms = Date.now() - started;
        const n = bumpDayCount(plan.id);
        console.log(`[aiProviders] served by ${plan.id}/${model} in ${ms}ms (${plan.id} day#${n})`);
        return { text, provider: plan.id, model, ms };
      } catch (e: unknown) {
        const ms = Date.now() - started;
        if (e instanceof AttemptError) {
          if (e.status === 429) sawRateLimit = true;
          console.warn(`[aiProviders] ${plan.id}/${model} failed (${e.status ?? e.kind}) in ${ms}ms — ${e.message.slice(0, 200)}`);
          if (e.kind === "next-candidate") continue; // bad model id → next candidate, same provider
          break; // next-provider / skip-provider → leave the candidate loop
        }
        if (e instanceof Error && e.name === "AbortError") {
          sawTimeout = true;
          console.warn(`[aiProviders] ${plan.id}/${model} timed out after ${ms}ms — trying next provider`);
          break;
        }
        console.warn(`[aiProviders] ${plan.id}/${model} network error in ${ms}ms:`, e);
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  // Every attempt failed. Surface the most honest status: rate-limit if any provider
  // said 429, timeout if we ran out of clock, otherwise a generic upstream failure.
  if (sawRateLimit) throw new AiChainError("All AI providers are busy.", 429);
  if (sawTimeout) throw new AiChainError("AI timed out.", 504);
  throw new AiChainError("All AI providers failed.", 502);
}
