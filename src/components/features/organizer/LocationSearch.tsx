"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, Loader2, Star, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { PlaceResult } from "@/app/api/locations/search/route";
import { auth } from "@/lib/firebase/client";

export type SelectedPlace = Pick<
  PlaceResult,
  "name" | "address" | "latitude" | "longitude" | "placeId"
>;

interface LocationSearchProps {
  /** Current display text (free-typed or a picked place's label). */
  value: string;
  /** Free-text edits — clears any previously selected place in the parent. */
  onTextChange: (text: string) => void;
  /** A place was picked from the results. */
  onSelectPlace: (place: SelectedPlace) => void;
  placeholder?: string;
  /** Optional "City,Region,Country" scope passed to DataForSEO to sharpen results. */
  locationName?: string;
  /** True once a place is picked — shows the captured-coordinates confirmation. */
  hasCoordinates?: boolean;
}

export function LocationSearch({
  value,
  onTextChange,
  onSelectPlace,
  placeholder = "Search for a venue or address",
  locationName,
  hasCoordinates,
}: LocationSearchProps) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function runSearch() {
    const query = value.trim();
    if (query.length < 2) {
      setError("Type at least 2 characters to search.");
      setOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    setOpen(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch("/api/locations/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ query, locationName }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Search failed.");
        setResults([]);
      } else {
        setResults(data.places || []);
      }
    } catch {
      setError("Could not reach the search service.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function pick(place: PlaceResult) {
    onSelectPlace({
      name: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      placeId: place.placeId,
    });
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runSearch();
          }
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        className="h-12 rounded-xl pl-10 pr-12 text-sm"
      />
      <button
        type="button"
        onClick={runSearch}
        disabled={loading}
        aria-label="Search location"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
      </button>

      {/* Captured-coordinates confirmation */}
      {hasCoordinates && !open && (
        <p className="mt-1.5 ml-1 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
          <MapPin className="w-3 h-3" /> Location pinned with map coordinates
        </p>
      )}

      {/* Results dropdown */}
      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-border/50 bg-popover shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              {loading ? "Searching…" : "Results"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close results"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching Google Maps…
              </div>
            ) : error ? (
              <p className="px-3 py-5 text-sm text-destructive text-center">{error}</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-5 text-sm text-muted-foreground text-center">
                {searched ? "No places found. Refine your search or type the address manually." : "Press Enter to search."}
              </p>
            ) : (
              <ul className="divide-y divide-border/30">
                {results.map((place, i) => (
                  <li key={`${place.placeId ?? place.cid ?? i}`}>
                    <button
                      type="button"
                      onClick={() => pick(place)}
                      className="w-full text-left px-3 py-2.5 hover:bg-secondary transition-colors flex items-start gap-3"
                    >
                      <div className="grid place-items-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{place.name}</p>
                        {place.address && (
                          <p className="text-xs text-muted-foreground truncate">{place.address}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {place.rating != null && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600 font-medium">
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                              {place.rating}
                              {place.ratingCount != null && (
                                <span className="text-muted-foreground">({place.ratingCount})</span>
                              )}
                            </span>
                          )}
                          {place.category && (
                            <span className="text-[11px] text-muted-foreground truncate">{place.category}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LocationSearch;
