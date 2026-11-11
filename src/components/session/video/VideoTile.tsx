"use client";

/**
 * A single video tile — plays one Agora track (local or remote) into a DOM node and
 * overlays a name/country label + mic/cam status. Track type is left loose (`any`) because
 * local camera, remote video, etc. all share the `.play(el, cfg)` / `.stop()` surface.
 */
import { useEffect, useRef } from "react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { Mic, MicOff, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function VideoTile({
  track, name, flagCode, micMuted, camOff, isLocal, highlight, compact, contain, badge,
}: {
  track?: any;
  name: string;
  flagCode?: string;
  micMuted?: boolean;
  camOff?: boolean;
  isLocal?: boolean;
  highlight?: boolean;
  compact?: boolean;
  /** Fit the video with letterboxing (screen share) instead of cropping to fill. */
  contain?: boolean;
  /** Optional corner tag, e.g. "Screen". */
  badge?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !track || camOff) return;
    try { track.play(el, { fit: contain ? "contain" : "cover", mirror: !!isLocal && !contain }); }
    catch (e) { console.error("[agora] tile play", e); }
    return () => { try { track.stop(); } catch { /* track may be closed already */ } };
  }, [track, camOff, isLocal, contain]);

  return (
    <div className={cn(
      "relative rounded-xl overflow-hidden border border-border/60 aspect-video",
      contain ? "bg-black" : "bg-secondary/50",
      highlight && "ring-2 ring-primary ring-offset-1 ring-offset-background",
    )}>
      {badge && (
        <span className="absolute top-1.5 left-1.5 z-10 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground">
          {badge}
        </span>
      )}
      <div ref={ref} className={cn("absolute inset-0 [&>*]:!w-full [&>*]:!h-full", camOff && "hidden")} />

      {camOff && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          {flagCode
            ? <div className="rounded-xl overflow-hidden ring-1 ring-border/60 opacity-80"><CountryFlag code={flagCode} size={compact ? 30 : 48} /></div>
            : <VideoOff className={compact ? "w-5 h-5" : "w-7 h-7"} />}
        </div>
      )}

      {/* Top-right identity glass pill */}
      <div className="absolute top-1.5 right-1.5 z-10 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-white shadow-sm max-w-[calc(100%-0.75rem)] min-w-0">
        {flagCode && !camOff && <CountryFlag code={flagCode} size={13} className="shrink-0" />}
        <span className="text-[10.5px] font-semibold text-white truncate">
          {name}{isLocal ? " · You" : ""}
        </span>
        <span className="shrink-0 ml-0.5">
          {micMuted ? (
            <MicOff className="w-3 h-3 text-red-400" />
          ) : (
            <Mic className="w-3 h-3 text-white/80" />
          )}
        </span>
      </div>
    </div>
  );
}
