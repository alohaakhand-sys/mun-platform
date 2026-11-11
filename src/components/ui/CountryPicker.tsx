"use client";

import { useMemo, useState } from "react";
import { COUNTRIES, getCountry, flagUrl, type Country } from "@/lib/data/countries";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { Search, X, Check } from "lucide-react";

interface CountryPickerProps {
  value: string[];
  onChange: (codes: string[]) => void;
  max?: number;
  className?: string;
}

export function CountryPicker({ value, onChange, max, className = "" }: CountryPickerProps) {
  const [query, setQuery] = useState("");

  const normalized = useMemo(
    () =>
      value
        .map(v => getCountry(v)?.code ?? v.toLowerCase())
        .filter(Boolean),
    [value]
  );

  const selectedSet = useMemo(() => new Set(normalized), [normalized]);

  // Display the selected roster sorted A–Z by country name.
  const sortedSelected = useMemo(
    () =>
      [...normalized].sort((a, b) =>
        (getCountry(a)?.name ?? a).localeCompare(getCountry(b)?.name ?? b)
      ),
    [normalized]
  );

  // Prefix-first: countries whose name/code STARTS WITH the query rank on top,
  // then substring matches (so "korea" still finds "South Korea").
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const starts: Country[] = [];
    const contains: Country[] = [];
    for (const c of COUNTRIES) {
      const n = c.name.toLowerCase();
      const code = c.code.toLowerCase();
      if (n.startsWith(q) || code.startsWith(q)) starts.push(c);
      else if (n.includes(q) || code.includes(q)) contains.push(c);
    }
    return [...starts, ...contains];
  }, [query]);

  function toggle(code: string) {
    if (selectedSet.has(code)) {
      onChange(normalized.filter(c => c !== code));
    } else {
      if (max && normalized.length >= max) return;
      onChange([...normalized, code]);
    }
  }

  function clearAll() {
    onChange([]);
  }

  const atMax = !!max && normalized.length >= max;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Selected — table layout with counter */}
      <div className="rounded-lg border border-border/40 bg-secondary/5 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-secondary/10 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Selected Countries
            </span>
            <Badge variant={atMax ? "destructive" : "secondary"} className="text-[10px]">
              {normalized.length}{max ? ` / ${max}` : ""}
            </Badge>
          </div>
          {normalized.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
              onClick={clearAll}
            >
              Clear all
            </Button>
          )}
        </div>

        {normalized.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No countries selected.
          </div>
        ) : (
          <div className="max-h-[220px] overflow-y-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground [&_th]:bg-background [&_th]:border-b [&_th]:border-border/40">
                  <th className="px-3 py-1.5 font-medium w-10">#</th>
                  <th className="px-3 py-1.5 font-medium w-10">Flag</th>
                  <th className="px-3 py-1.5 font-medium">Country</th>
                  <th className="px-3 py-1.5 font-medium w-16">Code</th>
                  <th className="px-3 py-1.5 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedSelected.map((code, i) => {
                  const country = getCountry(code);
                  return (
                    <tr key={code} className="hover:bg-secondary/10 [&>td]:border-t [&>td]:border-border/30">
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <CountryFlag code={code} size={18} />
                      </td>
                      <td className="px-3 py-1.5 font-medium">{country?.name ?? code}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground uppercase">{code}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => toggle(code)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${country?.name ?? code}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search countries by name or code..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Grid */}
      <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border/40 bg-secondary/5 p-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
          {filtered.map(c => {
            const selected = selectedSet.has(c.code);
            const disabled = !selected && !!max && normalized.length >= max;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => toggle(c.code)}
                disabled={disabled}
                title={`${c.name} (${c.code})`}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors border ${
                  selected
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "bg-background border-border/30 hover:bg-secondary/30"
                } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <img
                  src={flagUrl(c.code)}
                  alt=""
                  width={20}
                  height={15}
                  loading="lazy"
                  decoding="async"
                  className="rounded-sm border border-border/20 shrink-0"
                  style={{ width: 20, height: 15 }}
                />
                <span className="truncate flex-1">{c.name}</span>
                {selected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-xs text-muted-foreground py-6">
              No countries match "{query}".
            </div>
          )}
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground flex justify-between">
        <span>{atMax ? "Capacity reached — remove a country to add another." : `${normalized.length} selected${max ? ` / ${max}` : ""}`}</span>
        <span>{filtered.length} shown</span>
      </div>
    </div>
  );
}

export default CountryPicker;
