import { NextResponse } from "next/server";
import { getLatestAndroidRelease } from "@/lib/server/appRelease";

// The Android app's latest release (see src/lib/server/appRelease.ts). Public: the phone calls it
// as a fallback when the bucket itself can't be reached.
export async function GET() {
  const release = await getLatestAndroidRelease();
  if (!release) {
    return NextResponse.json({ error: "No release published" }, { status: 503 });
  }
  return NextResponse.json(release, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
