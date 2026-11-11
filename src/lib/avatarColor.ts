/**
 * Deterministic camera-off avatar helpers: a 1–2 letter monogram + a stable gradient derived from
 * a seed (uid or name), so a person without a country flag always renders the same coloured tile.
 */

/** Two-letter monogram from a display name ("Akhand Foundation" → "AF"). */
export function getInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return letters || "?";
}

/** djb2 string hash → non-negative int. */
function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic CSS `linear-gradient` for a tile background (use in `style={{ background }}`). */
export function avatarGradient(seed: string): string {
  const hue = hash(seed || "?") % 360;
  return `linear-gradient(135deg, hsl(${hue} 60% 42%), hsl(${(hue + 40) % 360} 62% 30%))`;
}
