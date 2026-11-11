// An event's look, set by the organizer under Tools: the theme colour (the public event page's
// header and Apply button; the app's conference header) and the certificate template (the
// certificate delegates download). Shared by the web and mirrored in the Kotlin app
// (domain/Tools.kt) so both read the same stored values.

export const THEME_PRESETS = [
  { id: "classic-blue", name: "Classic Blue", hex: "#2563eb" },
  { id: "dark-diplomat", name: "Dark Diplomat", hex: "#0f172a" },
  { id: "emerald", name: "Emerald", hex: "#059669" },
  { id: "sand", name: "Sand", hex: "#C2B280" },
] as const;

/** event.theme → a hex colour: a preset id, or a custom "#rrggbb" (Pro). null = the default look. */
export function themeColor(theme?: string | null): string | null {
  if (!theme) return null;
  const preset = THEME_PRESETS.find(p => p.id === theme);
  if (preset) return preset.hex;
  return /^#[0-9a-f]{6}$/i.test(theme) ? theme : null;
}

/** Readable text on [hex]: dark ink on light colours (Sand), white otherwise. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#1b1f2a" : "#ffffff";
}

export type CertificateTemplateId = "diploma" | "modern" | "ornate";

export const CERTIFICATE_TEMPLATES: { id: CertificateTemplateId; name: string; pro?: boolean }[] = [
  { id: "diploma", name: "Classic Diploma" },
  { id: "modern", name: "Modern Minimal" },
  { id: "ornate", name: "Ornate Gold", pro: true },
];

export function certificateTemplate(id?: string | null): CertificateTemplateId {
  return id === "modern" || id === "ornate" ? id : "diploma";
}
