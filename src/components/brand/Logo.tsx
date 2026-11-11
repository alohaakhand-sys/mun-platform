import { cn } from "@/lib/utils";
import { LOGO_DOT, LOGO_MUN, LOGO_PILOT } from "./logoPaths";

/**
 * MUN Pilot wordmark. Two-tone by default: ink for "mun" + the dot, seal green for
 * "pilot" — both read from `.mp-logo` tokens in globals.css, so it follows light/dark.
 * `tone="mono"` paints everything currentColor (footer watermark, on-slab use).
 */
export function Logo({
  height = 28,
  tone = "brand",
  className,
  title = "MUN Pilot",
}: {
  height?: number;
  tone?: "brand" | "mono";
  className?: string;
  /** Accessible name. Pass "" when a visible label already names the link. */
  title?: string;
}) {
  const width = Math.round((height * 492) / 130);
  return (
    <svg
      viewBox="0 -100 492 130"
      width={width}
      height={height}
      className={cn("mp-logo", tone === "mono" && "mp-logo-mono", className)}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path className="mp-logo-ink" d={LOGO_MUN} />
      <path className="mp-logo-seal" d={LOGO_PILOT} />
      <path className="mp-logo-ink" d={LOGO_DOT} />
    </svg>
  );
}
