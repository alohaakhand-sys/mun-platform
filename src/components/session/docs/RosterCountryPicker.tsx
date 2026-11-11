"use client";

/**
 * Committee-scoped country multi-select for sponsor / signatory marking.
 *
 * Deliberately NOT the global `CountryPicker` (all ~200 countries — wrong scope). The caller
 * supplies the roster, and there are two legitimate sources: IN a session, `session.attendance`
 * values (who is actually present — the one roster a delegate can always read, since they cannot
 * list applications); OFF-session, the committee's own `countries` array on the event. Same
 * component, same stored shape, so a paper written from the dashboard and one written from the
 * console are indistinguishable in the data.
 *
 * `locked` entries are rendered selected and un-toggleable but are NOT written into `value` — the
 * author's own delegation is a sponsor by construction, not by consent, and must not end up in the
 * endorsement fan-out.
 *
 * Styled from semantic tokens only, so it reads in the console's dark stage and on the dashboard.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getCountryName } from "@/lib/data/countries";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { Search, Lock } from "lucide-react";

export function RosterCountryPicker({
  countries, value, onChange, exclude = [], locked = [],
}: {
  /** Roster country strings (deduped attendance values). */
  countries: string[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Countries claimed by the other list (sponsor ↔ signatory mutual exclusion). */
  exclude?: string[];
  /** Always-selected, non-removable (the author's own country in Sponsors). */
  locked?: string[];
}) {
  const [q, setQ] = useState("");

  const options = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const c of countries) {
      const v = (c || "").trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      list.push(v);
    }
    return list.sort((a, b) => (getCountryName(a) || a).localeCompare(getCountryName(b) || b));
  }, [countries]);

  const needle = q.trim().toLowerCase();
  const visible = needle
    ? options.filter((c) => (getCountryName(c) || c).toLowerCase().includes(needle))
    : options;

  const toggle = (c: string) => {
    if (locked.includes(c)) return;
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  };

  return (
    <div className="space-y-2">
      {options.length > 12 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search countries…"
            className="w-full h-8 pl-8 pr-2.5 rounded-md bg-background border border-border/60 text-[12.5px] outline-none focus:border-primary/50"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-0.5">
        {visible.map((c) => {
          const isLocked = locked.includes(c);
          const on = isLocked || value.includes(c);
          const off = !on && exclude.includes(c);
          return (
            <button
              key={c}
              type="button"
              disabled={off || isLocked}
              onClick={() => toggle(c)}
              aria-pressed={on}
              title={off ? "Already on the other list" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[12px] font-medium transition-colors",
                on
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                off && "opacity-35 cursor-not-allowed",
                isLocked && "cursor-default",
              )}
            >
              <CountryFlag code={c} size={14} />
              <span className="truncate max-w-[130px]">{getCountryName(c) || c}</span>
              {isLocked && <Lock className="w-2.5 h-2.5 opacity-70" />}
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No countries match.</p>
        )}
      </div>
      <p className="text-[10.5px] text-muted-foreground">
        {value.length + locked.filter((l) => !value.includes(l)).length} selected
      </p>
    </div>
  );
}
