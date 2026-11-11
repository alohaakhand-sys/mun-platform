import { cn } from "@/lib/utils";
import { LOGO_DOT, LOGO_MUN, LOGO_PILOT } from "./logoPaths";

/**
 * Full-page boot loader (munpilot-web-redesign/assets/munpilot-preloader.svg).
 * The diamond hops and turns every 1.6s while "mun" and "pilot" breathe; reduced-motion
 * users get the still logo. Only for whole-app loads — everything else uses <Skeleton>.
 *
 * Colours live on `.mp-preloader` itself (globals.css), not on the `.mun-paper` scope, so
 * it renders correctly before AppWrapper has put the scope class on <body>.
 */
export function Preloader({
  label = "Loading MUN Pilot",
  fullScreen = true,
  className,
}: {
  label?: string;
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("mp-preloader", fullScreen && "mp-preloader-full", className)}
    >
      <svg viewBox="0 -130 492 160" width="190" height="62" aria-hidden="true" focusable="false">
        <path className="mp-pl-mun" d={LOGO_MUN} />
        <path className="mp-pl-pilot" d={LOGO_PILOT} />
        <ellipse className="mp-pl-shadow" cx="331.1" cy="-66" rx="10" ry="2.2" />
        <path className="mp-pl-dot" d={LOGO_DOT} />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}
