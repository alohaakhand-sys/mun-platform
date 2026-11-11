"use client";

/**
 * Board primitives — the projector's own vocabulary.
 *
 * These deliberately do NOT reuse the console atoms (`PanelCard`, `SubCard`, `QueueRow`, the
 * `glass-card` utility). Those are tuned for a 376px rail on a laptop 60cm away: translucent
 * fills, 1px borders, 10-12px muted labels. Every one of those choices fails on a beamer, which
 * crushes black level, blurs hairlines, and bands large blurred gradients. The rules here are
 * solid fills, 2px minimum strokes, and a hard floor on secondary type — see `.mun-projector` in
 * globals.css.
 */
import { useEffect, useState } from "react";
import { flagUrl, getCountry, isCountryCode } from "@/lib/data/countries";
import { timerRemainingMs, type TimerState } from "@/lib/services/sessionService";
import { cn } from "@/lib/utils";
import { Globe2 } from "lucide-react";

export type BoardTone = "ink" | "accent" | "amber" | "emerald" | "red" | "violet";

/** Solid, not alpha — a tint over paper is the first thing a weak lamp washes out. */
export const BOARD_TONE: Record<BoardTone, { text: string; fill: string; soft: string; on: string }> = {
  ink:     { text: "text-proj-ink",       fill: "bg-proj-ink",       soft: "bg-proj-sunk",         on: "text-proj-field" },
  accent:  { text: "text-primary",        fill: "bg-primary",        soft: "bg-primary/12",        on: "text-white" },
  amber:   { text: "text-amber-600",      fill: "bg-amber-500",      soft: "bg-amber-500/15",      on: "text-black" },
  emerald: { text: "text-emerald-600",    fill: "bg-emerald-500",    soft: "bg-emerald-500/15",    on: "text-white" },
  red:     { text: "text-red-600",        fill: "bg-red-500",        soft: "bg-red-500/15",        on: "text-white" },
  violet:  { text: "text-violet-600",     fill: "bg-violet-500",     soft: "bg-violet-500/15",     on: "text-white" },
};

/** Uppercase micro-label. The only type on the board allowed under `--t-rail`. */
export function Eyebrow({
  children, tone = "ink", className, dim = true,
}: { children: React.ReactNode; tone?: BoardTone; className?: string; dim?: boolean }) {
  return (
    <p
      className={cn(
        "font-heading font-extrabold uppercase leading-none",
        dim && tone === "ink" ? "text-proj-dim" : BOARD_TONE[tone].text,
        className,
      )}
      style={{ fontSize: "var(--t-eyebrow)", letterSpacing: "0.16em" }}
    >
      {children}
    </p>
  );
}

/**
 * Flag sized by CSS, not by a pixel prop.
 *
 * `ui/CountryFlag` writes `width`/`height` inline from a number, which is right everywhere else in
 * the product and useless here — the board's sizes are `vw`-derived and change with `--proj-scale`.
 * Same data source (`flagUrl` / `getCountry`), fluid box.
 */
export function BoardFlag({ code, className }: { code?: string; className?: string }) {
  const country = code ? getCountry(code) : null;
  if (!country || !isCountryCode(country.code)) {
    return (
      <span className={cn("grid place-items-center bg-proj-sunk text-proj-dim", className)}>
        <Globe2 className="w-[38%] h-[38%]" />
      </span>
    );
  }
  return (
    <img
      src={flagUrl(country.code)}
      alt={`${country.name} flag`}
      loading="eager"
      decoding="async"
      className={cn("object-cover", className)}
    />
  );
}

/**
 * THE PLACARD — the board's signature.
 *
 * A delegation in a real chamber is a physical nameplate on a desk: flag, then the country in
 * heavy caps. This is that object, inverted — ink card on the paper field — because maximum
 * figure/ground separation is the one thing that survives a washed-out projector image.
 *
 * Long names shrink in fixed steps rather than being measured. Deterministic, no layout thrash,
 * no flash of oversized text: "Chad" and "Saint Vincent and the Grenadines" both fit their line.
 */
export function Placard({
  code, name, tone = "ink", className,
}: { code?: string; name: string; tone?: BoardTone; className?: string }) {
  const n = name.length;
  const shrink = n <= 12 ? 1 : n <= 18 ? 0.84 : n <= 26 ? 0.68 : 0.56;
  const t = BOARD_TONE[tone];

  return (
    <div
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-[0.35em] max-w-full",
        t.fill, t.on, className,
      )}
      style={{ fontSize: "var(--t-display)" }}
    >
      {/* 4:3, so the flag is never cropped — a cropped flag is a wrong flag. */}
      <span className="shrink-0 aspect-[4/3] self-stretch overflow-hidden">
        <BoardFlag code={code} className="w-full h-full" />
      </span>
      <span
        className="font-display font-black uppercase flex items-center min-w-0"
        style={{
          fontSize: `calc(var(--t-display) * ${shrink})`,
          lineHeight: 0.84,
          letterSpacing: "0.005em",
          padding: "0.42em 0.6em",
        }}
      >
        <span className="[text-wrap:balance]">{name}</span>
      </span>
    </div>
  );
}

/**
 * Board clock. Same contract as `CountdownTimer` — tick locally at 250ms against the synced
 * `endsAt`, never write per second — at room scale, and read-only by construction (there are no
 * transport controls on a wall). `CountdownTimer` stays as-is for the consoles: its `xl` step tops
 * out at `text-8xl` with a fixed `h-3` track and a `@container` row flip built for the tool rail.
 */
/** Sessions predating a given timer field read back undefined; 0:00 beats a crash on the wall. */
const NO_TIMER: TimerState = { running: false, endsAt: null, pausedRemainingMs: null, durationMs: 0 };

export function BoardClock({
  timer: maybeTimer, label, size = "hero", tone = "accent", className,
}: {
  timer: TimerState | undefined;
  label?: string;
  size?: "hero" | "sub";
  tone?: BoardTone;
  className?: string;
}) {
  const timer = maybeTimer ?? NO_TIMER;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer.running, timer.endsAt]);

  const remaining = timerRemainingMs(timer, now);
  const pct = timer.durationMs > 0 ? (remaining / timer.durationMs) * 100 : 0;
  const expired = timer.running && remaining <= 0;
  const urgent = timer.running && remaining > 0 && remaining < 10000;

  const total = Math.ceil(remaining / 1000);
  const mm = Math.floor(total / 60);
  const ss = (total % 60).toString().padStart(2, "0");

  const hero = size === "hero";
  const barTone = expired ? "bg-red-500" : urgent ? "bg-amber-500" : BOARD_TONE[tone].fill;

  return (
    <div className={cn("w-full flex flex-col items-center", className)}>
      {label && <Eyebrow className="mb-[0.35em]">{label}</Eyebrow>}
      <p
        className={cn(
          "font-mono font-bold tabular-nums leading-none",
          expired ? "text-red-600 animate-pulse" : urgent ? "text-amber-600" : "text-proj-ink",
        )}
        style={{ fontSize: hero ? "var(--t-clock)" : "var(--t-lead)", letterSpacing: "-0.03em" }}
      >
        {mm}:{ss}
      </p>
      <div
        className="w-full rounded-full overflow-hidden bg-proj-sunk"
        style={{ height: hero ? "calc(clamp(8px, 0.75vw, 18px) * var(--proj-scale))" : "calc(clamp(5px, 0.4vw, 9px) * var(--proj-scale))", marginTop: "0.3em" }}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-200", barTone)}
          style={{ width: `${Math.max(0, pct)}%` }}
        />
      </div>
    </div>
  );
}

/** A big number with its label under it. Numerals are always mono + tabular on this screen. */
export function Figure({
  value, label, tone = "ink", className,
}: { value: React.ReactNode; label: string; tone?: BoardTone; className?: string }) {
  return (
    <div className={cn("text-center", className)}>
      <p
        className={cn("font-mono font-bold tabular-nums leading-none", BOARD_TONE[tone].text)}
        style={{ fontSize: "var(--t-figure)", letterSpacing: "-0.03em" }}
      >
        {value}
      </p>
      <Eyebrow className="mt-[0.4em]">{label}</Eyebrow>
    </div>
  );
}

/** Recessed well — the board's only "surface". No border, no shadow: a value step, nothing else. */
export function Well({ className, children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className={cn("bg-proj-sunk rounded-[0.75em]", className)} style={style}>{children}</div>;
}
