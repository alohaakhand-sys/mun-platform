"use client";

import { flagUrl, getCountry, isCountryCode } from "@/lib/data/countries";
import { Globe2 } from "lucide-react";

interface CountryFlagProps {
  code: string;
  size?: number;
  className?: string;
  showName?: boolean;
  rounded?: boolean;
  title?: string;
}

export function CountryFlag({
  code,
  size = 20,
  className = "",
  showName = false,
  rounded = true,
  title,
}: CountryFlagProps) {
  const country = getCountry(code);
  const displayName = country?.name ?? code;

  if (!country || !isCountryCode(country.code)) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <Globe2 className="w-4 h-4 text-muted-foreground" style={{ width: size, height: size }} />
        {showName && <span className="text-sm">{displayName}</span>}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title={title ?? displayName}>
      <img
        src={flagUrl(country.code)}
        alt={`${displayName} flag`}
        width={size}
        height={Math.round(size * 0.75)}
        loading="lazy"
        decoding="async"
        className={`object-cover shadow-sm border border-border/30 ${rounded ? "rounded-sm" : ""}`}
        style={{ width: size, height: Math.round(size * 0.75) }}
      />
      {showName && <span className="text-sm">{displayName}</span>}
    </span>
  );
}

export default CountryFlag;
