import { NextResponse } from "next/server";
import { getLatestAndroidRelease, pickApk } from "@/lib/server/appRelease";

// A stable link to the newest Android APK: /download/android (arm64) or ?abi=x86_64.
export async function GET(request: Request) {
  const release = await getLatestAndroidRelease();
  const apk = release ? pickApk(release, new URL(request.url).searchParams.get("abi")) : null;
  if (!apk) {
    return NextResponse.json({ error: "No release published" }, { status: 503 });
  }
  return NextResponse.redirect(apk.url, 302);
}
