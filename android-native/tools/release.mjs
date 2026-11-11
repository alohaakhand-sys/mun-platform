#!/usr/bin/env node
// Publishes a release of the Android app to the Cloudflare R2 bucket the phones check for updates
// (data/Updates.kt) and the website mirrors (/api/app/latest, /download/android).
//
//   1. Add the new version at the TOP of app/src/main/assets/changelog.json (versionCode +1).
//      That entry is the app's versionCode/versionName (build.gradle.kts) and its What's New.
//   2. node tools/release.mjs            build, upload the APKs, then android/latest.json
//      node tools/release.mjs --skip-build   upload what's already in app/build/outputs
//      node tools/release.mjs --dry-run      build and print the manifest, upload nothing
//
// Needs, in local.properties (git-ignored): CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN of the
// Cloudflare account that owns the bucket and munpilot.com (NOT whatever wrangler is logged in
// to), and UPDATE_BASE_URL, the bucket's public URL. Bucket: R2_BUCKET env, default "munpilot-app".
// The APKs are signed with the key in build.gradle.kts; every release MUST use the same key or
// installed phones refuse the update.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const bucket = process.env.R2_BUCKET || "munpilot-app";
const ABIS = ["arm64-v8a", "x86_64"];

function fail(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

function localProp(key) {
  const f = join(root, "local.properties");
  if (!existsSync(f)) return "";
  const line = readFileSync(f, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : "";
}

function run(cmd, cmdArgs, env) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: process.platform === "win32", env: env ? { ...process.env, ...env } : process.env });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs[0] ?? ""} failed (exit ${r.status})`);
}

function put(key, file, contentType, cacheControl) {
  console.log(`  -> r2://${bucket}/${key}`);
  run("wrangler", [
    "r2", "object", "put", `${bucket}/${key}`, `--file="${file}"`, "--remote",
    `--content-type=${contentType}`, `--cache-control="${cacheControl}"`,
  ], cloudflare);
}

const changelog = JSON.parse(readFileSync(join(root, "app/src/main/assets/changelog.json"), "utf8"));
const top = changelog[0];
if (!top?.versionCode || !top?.versionName || !top?.notes?.length) fail("changelog.json's first entry needs versionCode, versionName and notes");
if (changelog[1] && changelog[1].versionCode >= top.versionCode) fail("the first changelog entry must have the highest versionCode");

const base = localProp("UPDATE_BASE_URL").replace(/\/+$/, "");
if (!base) fail("set UPDATE_BASE_URL (the bucket's public URL) in local.properties");
// The token goes to wrangler through its environment only; it is never printed or written out.
const cloudflare = {
  CLOUDFLARE_ACCOUNT_ID: localProp("CLOUDFLARE_ACCOUNT_ID"),
  CLOUDFLARE_API_TOKEN: localProp("CLOUDFLARE_API_TOKEN"),
};
if (!cloudflare.CLOUDFLARE_ACCOUNT_ID || !cloudflare.CLOUDFLARE_API_TOKEN) fail("set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in local.properties");

// Never publish over a newer or equal release: phones would ignore it.
try {
  const res = await fetch(`${base}/android/latest.json`, { cache: "no-store" });
  if (res.ok) {
    const live = await res.json();
    if (live.versionCode >= top.versionCode && !args.has("--force")) {
      fail(`${live.versionName} (${live.versionCode}) is already published; add a newer entry to changelog.json`);
    }
  }
} catch {
  // first release, or the bucket isn't reachable yet
}

// Quoted: the shell must see the whole path, and it has a space in it ("SHUVO SOFTWARE").
if (!args.has("--skip-build")) run(`"${join(root, "build.cmd")}"`, ["assembleRelease"]);

const outDir = join(root, "app/build/outputs/apk/release");
const apks = {};
const uploads = [];
for (const abi of ABIS) {
  const file = join(outDir, `app-${abi}-release.apk`);
  if (!existsSync(file)) fail(`missing ${file}; build with build.cmd assembleRelease`);
  const key = `android/${top.versionName}/munpilot-${top.versionName}-${abi}.apk`;
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  apks[abi] = { url: `${base}/${key}`, sha256, size: statSync(file).size };
  uploads.push({ key, file });
}

const manifest = {
  versionCode: top.versionCode,
  versionName: top.versionName,
  publishedAt: new Date().toISOString(),
  minSdk: 26,
  apks,
  changelog,
};
console.log(JSON.stringify(manifest, null, 2));
if (args.has("--dry-run")) process.exit(0);

console.log(`Uploading MUN Pilot ${top.versionName} (${top.versionCode}) to ${bucket}…`);
for (const u of uploads) put(u.key, u.file, "application/vnd.android.package-archive", "public, max-age=31536000, immutable");

const tmp = join(mkdtempSync(join(tmpdir(), "munpilot-release-")), "latest.json");
writeFileSync(tmp, JSON.stringify(manifest, null, 2));
put(`android/${top.versionName}/release.json`, tmp, "application/json", "public, max-age=31536000, immutable");
// Last, so phones never see a manifest whose APKs aren't there yet.
put("android/latest.json", tmp, "application/json", "no-cache, max-age=0");
console.log(`Published. Phones pick it up within 15 minutes; ${base}/android/latest.json`);
