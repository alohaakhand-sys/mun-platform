"use client";

import { useId } from "react";

/**
 * Real brand marks (P01 footer, P03 organiser rail). Monochrome marks (X, GitHub) paint
 * with `.mp-soc-ink` so they follow the theme's ink; the rest keep their brand colours.
 */
type IconProps = { size?: number };

export function XIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path className="mp-soc-ink" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

export function InstagramIcon({ size = 20 }: IconProps) {
  // Two Instagram marks can share a page (footer + organiser rail): the gradient id must be unique.
  const id = `mp-igg-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset=".3" stopColor="#FA7E1E" />
          <stop offset=".6" stopColor="#D62976" />
          <stop offset=".85" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill={`url(#${id})`} />
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="16.3" cy="7.7" r="1.05" fill="#fff" />
    </svg>
  );
}

export function LinkedInIcon({ size = 20 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="#0A66C2" />
      <rect x="5.6" y="9.6" width="2.8" height="8.4" fill="#fff" />
      <circle cx="7" cy="6.6" r="1.65" fill="#fff" />
      <path fill="#fff" d="M10.6 9.6h2.7v1.2c.4-.75 1.4-1.4 2.8-1.4 2.4 0 3.1 1.5 3.1 3.7V18h-2.8v-4.3c0-1-.25-1.9-1.35-1.9s-1.65.8-1.65 1.9V18h-2.8z" />
    </svg>
  );
}

export function FacebookIcon({ size = 20 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#1877F2" />
      <path fill="#fff" d="M13.4 23v-8.2h2.7l.4-3.2h-3.1V9.6c0-.9.3-1.6 1.6-1.6h1.7V5.2c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4v3.2h2.7V23z" />
    </svg>
  );
}

export function YouTubeIcon({ size = 22 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0000" />
      <path d="M9.8 8.6v6.8l5.9-3.4z" fill="#fff" />
    </svg>
  );
}

export function GitHubIcon({ size = 19 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path className="mp-soc-ink" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
