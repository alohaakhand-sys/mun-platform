"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker as LeafletMarker, LeafletMouseEvent } from "leaflet";

interface LocationMapProps {
  lat: number | null;
  lng: number | null;
  /** Fired when the user drags the pin or clicks a new spot on the map. */
  onChange: (lat: number, lng: number) => void;
  className?: string;
}

// Dhaka — neutral default center until a place is picked or the map is clicked.
const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

// Themed teardrop pin (avoids Leaflet's default-marker image 404 under bundlers).
const PIN_HTML = `
<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,0.25))">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 12.1 22.6 12.6 23.2a1.9 1.9 0 0 0 2.8 0C15.9 36.6 28 23.5 28 14 28 6.27 21.73 0 14 0z" fill="#4f46e5"/>
  <circle cx="14" cy="14" r="5" fill="#fff"/>
</svg>`;

export function LocationMap({ lat, lng, onChange, className }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  // Set when the coord change originated inside the map (drag/click) so the prop-sync
  // effect moves the pin WITHOUT re-centering (otherwise the map jumps on every drag).
  const skipRecenterRef = useRef(false);
  // Keep the latest onChange without re-running the init effect.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Initialise the map once (client-side; Leaflet touches window so import lazily).
  useEffect(() => {
    let disposed = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
        lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER,
        lat != null && lng != null ? 15 : 11
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({ html: PIN_HTML, className: "", iconSize: [28, 38], iconAnchor: [14, 38] });

      const placeMarker = (la: number, ln: number) => {
        if (markerRef.current) {
          markerRef.current.setLatLng([la, ln]);
        } else {
          const m = L.marker([la, ln], { icon, draggable: true }).addTo(map);
          m.on("dragend", () => {
            const p = m.getLatLng();
            skipRecenterRef.current = true;
            onChangeRef.current(p.lat, p.lng);
          });
          markerRef.current = m;
        }
      };

      if (lat != null && lng != null) placeMarker(lat, lng);

      map.on("click", (e: LeafletMouseEvent) => {
        placeMarker(e.latlng.lat, e.latlng.lng);
        skipRecenterRef.current = true;
        onChangeRef.current(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      // Dialog open/animation can leave the container at 0px — recalc once mounted.
      setTimeout(() => map.invalidateSize(), 200);
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync the pin to the external coords (search select, edit-mode load, manual clear).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Place cleared (user typed in the search box) → drop the pin so map stays in sync.
    if (lat == null || lng == null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    (async () => {
      const L = (await import("leaflet")).default;
      const icon = L.divIcon({ html: PIN_HTML, className: "", iconSize: [28, 38], iconAnchor: [14, 38] });
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else {
        const m = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        m.on("dragend", () => {
          const p = m.getLatLng();
          skipRecenterRef.current = true;
          onChangeRef.current(p.lat, p.lng);
        });
        markerRef.current = m;
      }
      // Drag/click already moved the map — only re-centre for external changes (search).
      if (skipRecenterRef.current) skipRecenterRef.current = false;
      else map.setView([lat, lng], Math.max(map.getZoom(), 15));
    })();
  }, [lat, lng]);

  return (
    <div className={className}>
      <div ref={containerRef} className="h-56 w-full rounded-xl overflow-hidden border border-border/50 z-0" />
      <p className="mt-1.5 ml-1 text-[11px] text-muted-foreground">
        Drag the pin or click the map to fine-tune the exact spot.
      </p>
    </div>
  );
}

export default LocationMap;
