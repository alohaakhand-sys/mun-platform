/**
 * Per-surface specs for the writing-assist route. Colocated non-route file —
 * Next.js only treats route.ts as an entry point.
 *
 * kind "long"   = RichTextEditor surfaces (markdown in/out).
 * kind "medium" = plain textareas (real char caps).
 *
 * The allowed-action list is NOT declared here — it comes from the client-safe
 * single source of truth in src/lib/ai/writingSurfaces.ts, so the button shown and
 * the action the server permits can never drift apart.
 */

import {
  SURFACE_ACTIONS,
  type WritingAction,
  type WritingSurface,
} from "@/lib/ai/writingSurfaces";

export type { WritingAction, WritingSurface };

export interface SurfaceSpec {
  kind: "long" | "medium";
  /** Human noun used in prompts: "write a first draft of a {noun}". */
  noun: string;
  /** Surface-specific voice/format rules — the persona, appended to the system prompt. */
  systemHint: string;
  /**
   * Surface-specific guidance for improve/grammar (polish) actions. Makes the same
   * "improve" read differently per surface (clause-tightening vs prose-punching).
   */
  improveHint: string;
  allowedActions: WritingAction[];
  /** Server cap on text/selection input, anti token-inflation. */
  maxInputChars: number;
  /** Server-side output clamp. Medium: real cap. Long: generous safety net. */
  maxOutputChars: number;
  /** Whitelisted context keys — anything else the client sends is dropped. */
  contextKeys: string[];
}

const LONG_INPUT = 16_000;
const LONG_OUTPUT = 24_000;
const MEDIUM_INPUT = 2_000;

const long = (
  key: WritingSurface,
  noun: string,
  systemHint: string,
  improveHint: string,
  contextKeys: string[],
): SurfaceSpec => ({
  kind: "long",
  noun,
  systemHint,
  improveHint,
  allowedActions: SURFACE_ACTIONS[key],
  maxInputChars: LONG_INPUT,
  maxOutputChars: LONG_OUTPUT,
  contextKeys,
});

const medium = (
  key: WritingSurface,
  noun: string,
  systemHint: string,
  improveHint: string,
  maxOutputChars: number,
  contextKeys: string[],
): SurfaceSpec => ({
  kind: "medium",
  noun,
  systemHint,
  improveHint,
  allowedActions: SURFACE_ACTIONS[key],
  maxInputChars: MEDIUM_INPUT,
  maxOutputChars,
  contextKeys,
});

export const SURFACES: Record<WritingSurface, SurfaceSpec> = {
  // ── Long-form ─────────────────────────────────────────────────────────────────
  "committee-doc": long(
    "committee-doc",
    "committee document",
    "You are a Model UN resolution clerk. Formal UN resolution register. Preambular " +
      "clauses are italicized gerunds (*Recalling*, *Deeply concerned*) ending with commas; " +
      "operative clauses are numbered with bold verbs (**Calls upon**, **Urges**) ending " +
      "with semicolons, the final clause with a period. Diplomatic, precise, neutral.",
    "Tighten and sharpen the delegate's own clauses. Preserve every clause's meaning and " +
      "the resolution clause format (italic preambular, **bold** operative verbs, correct " +
      "punctuation). Do NOT invent new clauses or positions the author did not write.",
    ["committee", "agenda", "country", "title"],
  ),
  "study-guide": long(
    "study-guide",
    "committee study guide",
    "You are a committee director writing a background guide. Structured markdown headings: " +
      "introduction to the committee, history of the topic, current situation, bloc positions, " +
      "and QARMAs (Questions A Resolution Must Answer). Informative and authoritative.",
    "Clarify and structure the text while keeping all facts intact. Improve headings, flow " +
      "and readability for a first-time delegate.",
    ["committee", "agenda", "title"],
  ),
  "rules-guide": long(
    "rules-guide",
    "rules of procedure guide",
    "You are a Secretary-General drafting conference rules. Markdown headings, numbered rules, " +
      "plain authoritative language a first-time delegate can follow. Unambiguous.",
    "Make each rule clearer and less ambiguous without changing its intent. Keep numbering " +
      "and the authoritative register.",
    ["eventName"],
  ),
  "blog-article": long(
    "blog-article",
    "blog article",
    "You are an editor for a Model UN community blog. Engaging editorial prose, markdown " +
      "headings, short paragraphs, concrete examples. Informative but lively and skimmable.",
    "Punch up the prose — sharper hooks, tighter sentences, better rhythm. Keep it lively " +
      "and skimmable; do not make it dry or bureaucratic.",
    ["title"],
  ),
  "announcement-email": long(
    "announcement-email",
    "announcement email",
    "You are an event organizer emailing participants. Clear, warm, professional email body. " +
      "Short paragraphs, essential details up front, friendly closing.",
    "Make it clearer and warmer while keeping every concrete detail (dates, names, actions). " +
      "Lead with what the reader must know.",
    ["eventName", "subject"],
  ),
  "position-paper": long(
    "position-paper",
    "position paper",
    "You are a delegation drafting its national position. First-person-plural voice: the " +
      "country's background on the topic, past actions and commitments, concrete proposed " +
      "solutions. Formal diplomatic register.",
    "Sharpen the diplomatic register and argument while keeping the first-person-plural " +
      "national voice and the delegate's own stance. Do NOT add positions the author did not take.",
    ["committee", "agenda", "country", "topic"],
  ),

  // ── Medium ────────────────────────────────────────────────────────────────────
  "blog-excerpt": medium(
    "blog-excerpt",
    "article excerpt",
    "You write listing-card hooks. One or two hook sentences. No headings, no markdown.",
    "Make it a tighter, more clickable hook in one or two sentences.",
    200,
    ["title"],
  ),
  "blog-comment": medium(
    "blog-comment",
    "blog comment",
    "You write friendly community comments. A thoughtful, conversational comment that engages " +
      "with the article. Plain text.",
    "Make the comment clearer and more engaging while keeping the commenter's own point.",
    600,
    ["title"],
  ),
  "application-experience": medium(
    "application-experience",
    "MUN experience summary",
    "You help a delegate present their real experience. First person, factual and specific: " +
      "conferences, committees, awards, roles. No exaggeration, no invented achievements.",
    "Polish the delegate's own experience summary — clearer and more professional. Keep every " +
      "fact exactly as written; never invent conferences, awards or roles.",
    1_200,
    ["eventName", "committee"],
  ),
  "application-motivation": medium(
    "application-motivation",
    "motivation statement",
    "You help a delegate express their genuine motivation. First person, sincere, specific — " +
      "no clichés, no bullet lists.",
    "Sharpen the delegate's own motivation statement — more sincere and specific, fewer clichés. " +
      "Keep their reasons and voice; do not fabricate new ones.",
    1_500,
    ["eventName", "committee"],
  ),
  "pro-apply-motivation": medium(
    "pro-apply-motivation",
    "organizer motivation statement",
    "You help an organizer make their case for Pro-tier access. First person, professional: " +
      "organizing experience, vision for events, why the Pro tier.",
    "Make the pitch clearer and more compelling while keeping the organizer's own claims.",
    1_500,
    [],
  ),
  "profile-bio": medium(
    "profile-bio",
    "profile bio",
    "You write delegate resume bios. First person, confident but not boastful: interests, " +
      "strengths, MUN journey.",
    "Make the bio crisper and more confident while keeping every fact the person stated.",
    600,
    [],
  ),
  "event-description": medium(
    "event-description",
    "event description",
    "You write conference marketing copy. Inviting overview of a Model UN conference: what it " +
      "is, who it is for, what makes it special.",
    "Make the description more inviting and vivid while keeping all real details.",
    1_200,
    ["eventName"],
  ),
  "committee-description": medium(
    "committee-description",
    "committee description",
    "You summarize committees for delegates choosing one. Concise mandate and agenda summary. " +
      "Plain text.",
    "Make the mandate/agenda summary clearer and more compelling without changing the topic.",
    800,
    ["committee", "eventName"],
  ),
  "chair-feedback": medium(
    "chair-feedback",
    "feedback on a delegate's paper",
    "You are a chair giving feedback. Constructive, specific, encouraging: strengths first, " +
      "then concrete improvements.",
    "Make the feedback more constructive and specific — encouraging in tone, concrete in advice.",
    800,
    ["committee", "country"],
  ),
  "marking-note": medium(
    "marking-note",
    "private note on a delegate's performance",
    "You are a chair writing a private scoring note. Specific, professional, evidence-based on " +
      "session performance. No personal remarks.",
    "Make the note more precise and professional, grounded in observed performance.",
    600,
    ["committee", "country"],
  ),
  complaint: medium(
    "complaint",
    "complaint description",
    "You help a participant file a calm, factual complaint. What happened, when, who was " +
      "involved, impact. No accusations beyond facts.",
    "Make the complaint calmer and clearer, sticking strictly to the facts the writer gave. " +
      "Do not add accusations or details they did not state.",
    1_000,
    [],
  ),
  "complaint-resolution": medium(
    "complaint-resolution",
    "complaint resolution note",
    "You help staff write a resolution note. Professional, neutral: what was reviewed, the " +
      "decision, and the reasoning.",
    "Make the resolution note more professional and neutral while keeping the decision and reasoning.",
    800,
    [],
  ),
  recommendation: medium(
    "recommendation",
    "recommendation for a fellow delegate",
    "You help someone recommend a peer. Warm, credible, grounded in specific shared experience.",
    "Polish the recommendation — warmer and more credible — while keeping the specific experiences " +
      "and praise the writer gave. Do not invent achievements.",
    800,
    [],
  ),
  "partner-description": medium(
    "partner-description",
    "partner description",
    "You write partner blurbs. One short paragraph introducing a partner organization and its " +
      "role in the event.",
    "Make the partner blurb crisper and more professional without changing the facts.",
    400,
    ["eventName"],
  ),
  "dress-code-note": medium(
    "dress-code-note",
    "dress code guidance",
    "You write dress-code guidance. Clear and friendly: what to wear, what to avoid, brief " +
      "rationale.",
    "Make the guidance clearer and friendlier while keeping the same requirements.",
    800,
    ["eventName"],
  ),
};

/** Draft skeleton hints for surface "committee-doc", keyed by CommitteeDocType. */
export const DOC_TYPE_DRAFT_HINTS: Record<string, string> = {
  "draft-resolution":
    "Full skeleton: committee/topic header, 4-6 preambular clauses, 6-10 operative clauses " +
    "with sub-clauses where useful.",
  "working-paper":
    "Informal working paper: short introduction, thematic sections with bullet proposals.",
  amendment:
    "Amendment format: state whether it adds/strikes/modifies, quote the target clause, give the new text.",
};
