/**
 * Single source of truth for writing-assist surfaces and which AI actions each one
 * exposes. Client-safe (zero server imports) so BOTH the server route (registry.ts)
 * and the client UI (RichTextEditorAi, AiTextareaAssist) import the same lists — the
 * button you see and the action the server permits can never drift apart.
 *
 * Academic-integrity rule: delegate/academic surfaces (committee docs, position
 * papers, personal statements, peer recommendations) are locked to improve + grammar
 * — the delegate writes; AI only polishes existing text. It never generates their
 * graded work from scratch. Content-creation surfaces (blog, guides, announcements)
 * keep full generate powers.
 */

export type WritingAction = "improve" | "continue" | "draft" | "grammar" | "suggest" | "convert-resolution" | "shorten" | "expand";

export type WritingSurface =
  // long-form (markdown editors)
  | "committee-doc"
  | "study-guide"
  | "rules-guide"
  | "blog-article"
  | "announcement-email"
  | "position-paper"
  // medium (plain textareas)
  | "blog-excerpt"
  | "blog-comment"
  | "application-experience"
  | "application-motivation"
  | "pro-apply-motivation"
  | "profile-bio"
  | "event-description"
  | "committee-description"
  | "chair-feedback"
  | "marking-note"
  | "complaint"
  | "complaint-resolution"
  | "recommendation"
  | "partner-description"
  | "dress-code-note";

// Action presets ------------------------------------------------------------------
/** Full long-form editor: generate from scratch, continue, polish. */
const LONG_FULL: WritingAction[] = ["improve", "continue", "draft", "grammar"];
/** Blog posts: full long-form powers, plus shorten / expand a selected passage. */
const BLOG_FULL: WritingAction[] = [...LONG_FULL, "shorten", "expand"];
/** Full medium textarea: polish or generate one suggestion. */
const MEDIUM_FULL: WritingAction[] = ["improve", "suggest"];
/** Locked (academic integrity): polish only — never generate. Empty field → disabled. */
const POLISH_ONLY: WritingAction[] = ["improve", "grammar"];

/**
 * The ONE list of allowed actions per surface. Registry reads it for server-side
 * enforcement; the editor/textarea read it to decide which buttons to render.
 */
export const SURFACE_ACTIONS: Record<WritingSurface, WritingAction[]> = {
  // Long-form — locked delegate work (plus AI conversion from Working Paper to Draft Resolution)
  "committee-doc": ["improve", "grammar", "convert-resolution"],
  "position-paper": POLISH_ONLY,
  // Long-form — content creation, full powers
  "study-guide": LONG_FULL,
  "rules-guide": LONG_FULL,
  "blog-article": BLOG_FULL,
  "announcement-email": LONG_FULL,

  // Medium — locked personal/graded statements
  "application-experience": POLISH_ONLY,
  "application-motivation": POLISH_ONLY,
  recommendation: POLISH_ONLY,
  // Medium — full powers
  "blog-excerpt": MEDIUM_FULL,
  "blog-comment": MEDIUM_FULL,
  "pro-apply-motivation": MEDIUM_FULL,
  "profile-bio": MEDIUM_FULL,
  "event-description": MEDIUM_FULL,
  "committee-description": MEDIUM_FULL,
  "chair-feedback": MEDIUM_FULL,
  "marking-note": MEDIUM_FULL,
  complaint: MEDIUM_FULL,
  "complaint-resolution": MEDIUM_FULL,
  "partner-description": MEDIUM_FULL,
  "dress-code-note": MEDIUM_FULL,
};

/** Does this surface allow the given action? Safe on unknown surfaces (returns false). */
export function surfaceAllows(surface: WritingSurface, action: WritingAction): boolean {
  return SURFACE_ACTIONS[surface]?.includes(action) ?? false;
}
