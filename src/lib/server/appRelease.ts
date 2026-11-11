// The Android app's latest release, as published to the Cloudflare R2 bucket by
// android-native/tools/release.mjs (`android/latest.json`). The phone checks the bucket itself;
// the site mirrors the same manifest at /api/app/latest and points /download/android at the APK,
// so the release can be checked or downloaded from the website too.
//
// APP_RELEASES_URL = the bucket's public base URL (r2.dev or a custom domain), no trailing slash.
// Server-only, so changing it needs a restart, not a rebuild.

export type ReleaseApk = { url: string; sha256: string; size: number };

export type ChangelogEntry = {
  versionCode: number;
  versionName: string;
  date: string;
  notes: string[];
};

export type AndroidRelease = {
  versionCode: number;
  versionName: string;
  publishedAt: string;
  minSdk: number;
  /** Keyed by ABI ("arm64-v8a", "x86_64"). */
  apks: Record<string, ReleaseApk>;
  changelog: ChangelogEntry[];
};

const TTL_MS = 60_000;
let memo: { at: number; value: AndroidRelease | null } | null = null;

export function releasesBaseUrl(): string | null {
  const base = process.env.APP_RELEASES_URL?.trim().replace(/\/+$/, "");
  return base || null;
}

/** The manifest, cached for a minute in this process. Null when unconfigured or unreachable. */
export async function getLatestAndroidRelease(): Promise<AndroidRelease | null> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  const base = releasesBaseUrl();
  if (!base) return null;
  let value: AndroidRelease | null = null;
  try {
    const res = await fetch(`${base}/android/latest.json`, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as AndroidRelease;
      if (typeof json?.versionCode === "number" && json.apks) value = json;
    }
  } catch {
    value = null;
  }
  memo = { at: Date.now(), value };
  return value;
}

/** The APK for an ABI, falling back to arm64 (every current phone) and then any. */
export function pickApk(release: AndroidRelease, abi?: string | null): ReleaseApk | null {
  return (
    (abi ? release.apks[abi] : undefined) ??
    release.apks["arm64-v8a"] ??
    Object.values(release.apks)[0] ??
    null
  );
}
