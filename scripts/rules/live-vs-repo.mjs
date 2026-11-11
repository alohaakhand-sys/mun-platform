// Read-only drift check: the rules and indexes LIVE on a Firebase project vs the repo's root files
// (firestore.rules, firestore.indexes.json, database.rules.json, storage.rules). Nothing is written.
//
//   node --env-file=.env.local      scripts/rules/live-vs-repo.mjs     (mun-platform-saas)
//   node --env-file=.env.local.stop scripts/rules/live-vs-repo.mjs     (old mun-saas)
//
// Uses the admin credentials in the env file. Indexes are compared field by field, ignoring order.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

let privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (privateKey?.startsWith('"') && privateKey?.endsWith('"')) privateKey = privateKey.slice(1, -1);
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const app = admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});
const norm = (s) => s.replace(/\r\n/g, "\n").trim();
console.log(`Project ${projectId}\n`);

async function rules(name, fetchLive, file) {
  try {
    const live = await fetchLive();
    const repo = readFileSync(file, "utf8");
    const same = norm(live) === norm(repo);
    console.log(`${same ? "SAME " : "DIFF "} ${name} (${file})`);
    if (!same) {
      const a = norm(live).split("\n"), b = norm(repo).split("\n");
      let shown = 0;
      for (let i = 0; i < Math.max(a.length, b.length) && shown < 6; i++) {
        if (a[i] !== b[i]) { console.log(`      line ${i + 1}\n        live: ${(a[i] ?? "<end>").trim().slice(0, 110)}\n        repo: ${(b[i] ?? "<end>").trim().slice(0, 110)}`); shown++; }
      }
      console.log(`      (live ${a.length} lines, repo ${b.length} lines)`);
    }
  } catch (e) {
    console.log(`?     ${name}: couldn't read live (${e.message?.split("\n")[0]})`);
  }
}

await rules("Firestore rules", async () => (await admin.securityRules().getFirestoreRuleset()).source[0].content, "firestore.rules");
await rules("Realtime DB rules", async () => await app.database().getRules(), "database.rules.json");
await rules("Storage rules", async () => (await admin.securityRules().getStorageRuleset()).source[0].content, "storage.rules");

// Indexes, through the Firestore admin REST API with the service account's token.
try {
  const { access_token } = await app.options.credential.getAccessToken();
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/-`;
  const get = async (path, query = "") => {
    let out = [], token = "";
    do {
      const qs = [query, token && `pageToken=${token}`].filter(Boolean).join("&");
      const r = await (await fetch(`${base}/${path}${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${access_token}` } })).json();
      if (r.error) throw new Error(r.error.message);
      out = out.concat(r.indexes || r.fields || []); token = r.nextPageToken || "";
    } while (token);
    return out;
  };
  const cg = (name) => name.split("/collectionGroups/")[1].split("/")[0];
  const key = (collectionGroup, scope, fields) => `${collectionGroup} [${scope}] ` +
    fields.filter((f) => f.fieldPath !== "__name__").map((f) => `${f.fieldPath}:${f.order || f.arrayConfig || f.vectorConfig && "vector"}`).join(", ");
  const liveIdx = (await get("indexes")).map((i) => key(cg(i.name), i.queryScope, i.fields));
  const repo = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));
  const repoIdx = (repo.indexes || []).map((i) => key(i.collectionGroup, i.queryScope || "COLLECTION", i.fields));
  const onlyLive = liveIdx.filter((k) => !repoIdx.includes(k)), onlyRepo = repoIdx.filter((k) => !liveIdx.includes(k));
  console.log(`${onlyLive.length || onlyRepo.length ? "DIFF " : "SAME "} Composite indexes: live ${liveIdx.length}, repo ${repoIdx.length}`);
  onlyLive.forEach((k) => console.log(`      only live: ${k}`));
  onlyRepo.forEach((k) => console.log(`      only repo: ${k}`));

  // Single-field overrides (fieldOverrides): the ones a project changed from the defaults.
  const liveFo = (await get("fields", "filter=" + encodeURIComponent("indexConfig.usesAncestorConfig:false"))).filter((f) => !f.name.endsWith("/fields/*"))
    .map((f) => `${cg(f.name)}.${f.name.split("/fields/")[1]}`);
  const repoFo = (repo.fieldOverrides || []).map((f) => `${f.collectionGroup}.${f.fieldPath}`);
  const foLive = liveFo.filter((k) => !repoFo.includes(k)), foRepo = repoFo.filter((k) => !liveFo.includes(k));
  console.log(`${foLive.length || foRepo.length ? "DIFF " : "SAME "} Field overrides: live ${liveFo.length}, repo ${repoFo.length}`);
  foLive.forEach((k) => console.log(`      only live: ${k}`));
  foRepo.forEach((k) => console.log(`      only repo: ${k}`));
} catch (e) {
  console.log(`?     Indexes: couldn't read live (${e.message})`);
}
await app.delete();
