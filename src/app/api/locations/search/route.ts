import { NextResponse } from "next/server";
import { requireUid } from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

// Live Google Maps search via DataForSEO SERP API. Instant (~4s), ~$0.002/request,
// returns up to `depth` places with name/address/coords/rating/place_id. We proxy it
// server-side so the Basic-auth credentials never reach the browser.
const DFS_URL = "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";
const TIMEOUT_MS = 15000;

export interface PlaceResult {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  ratingCount: number | null;
  placeId: string | null;
  cid: string | null;
  category: string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// Minimal shape of a DataForSEO maps_search item (only the fields we surface).
interface MapsItem {
  title?: string;
  address?: string;
  address_info?: { address?: string };
  latitude?: number;
  longitude?: number;
  rating?: { value?: number; votes_count?: number };
  place_id?: string;
  cid?: string;
  category?: string;
}

export async function POST(req: Request) {
  // Each search is a paid DataForSEO call: signed-in users only.
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Sign in to search places." }, { status: 401 });
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    return NextResponse.json({ error: "Location search is not configured." }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body → validation below */
  }

  const query = str(body.query).trim();
  if (query.length < 2) {
    return NextResponse.json({ error: "Type at least 2 characters to search." }, { status: 400 });
  }

  const languageCode = str(body.languageCode).trim() || "en";
  const locationName = str(body.locationName).trim();
  const locationCoordinate = str(body.locationCoordinate).trim();

  // DataForSEO requires a location anchor. Prefer caller-supplied scope; otherwise
  // fall back to a broad one. A tighter scope (city/country) improves relevance.
  const task: Record<string, unknown> = {
    keyword: query,
    language_code: languageCode,
    depth: 20,
  };
  if (locationCoordinate) task.location_coordinate = locationCoordinate;
  else task.location_name = locationName || "United States";

  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(DFS_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify([task]),
      signal: controller.signal,
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `Search provider error (${resp.status}).` }, { status: 502 });
    }

    const data = await resp.json();
    // Top-level 20000 = whole request OK; task-level 20000 = this task OK.
    if (data?.status_code !== 20000) {
      return NextResponse.json({ error: data?.status_message || "Search failed." }, { status: 502 });
    }
    const task0 = data?.tasks?.[0];
    if (task0?.status_code !== 20000) {
      // 40501 = invalid location_name etc. Surface a friendly hint.
      const msg = task0?.status_message || "Search failed.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const items: unknown[] = task0?.result?.[0]?.items ?? [];
    const places: PlaceResult[] = items
      .map((raw) => {
        const it = raw as MapsItem;
        return {
          name: str(it.title),
          address: str(it.address) || str(it.address_info?.address),
          latitude: num(it.latitude),
          longitude: num(it.longitude),
          rating: num(it.rating?.value),
          ratingCount: num(it.rating?.votes_count),
          placeId: it.place_id ?? null,
          cid: it.cid ?? null,
          category: it.category ?? null,
        } as PlaceResult;
      })
      .filter((p) => p.name)
      .slice(0, 12);

    return NextResponse.json({ places });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json({ error: "Search timed out. Please try again." }, { status: 504 });
    }
    console.error("Location search error:", e);
    return NextResponse.json({ error: "Could not reach the search provider." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
