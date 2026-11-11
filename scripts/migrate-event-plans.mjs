// Event plans (src/lib/data/eventPlan.ts) ship with a participant cap that firestore.rules check
// against `event.approvedCount`. Run this BEFORE deploying those rules:
//
//   node --env-file=.env.local scripts/migrate-event-plans.mjs                  dry run: counts only
//   node --env-file=.env.local scripts/migrate-event-plans.mjs --apply          recount seats
//   node --env-file=.env.local scripts/migrate-event-plans.mjs --legacy --apply also mark every
//                                                                               event without a plan
//                                                                               as legacy (custom, no caps)
//
//   node --env-file=.env.local scripts/migrate-event-plans.mjs --add-feature passes --apply
//                                                                               turn a feature added
//                                                                               later on for every
//                                                                               legacy event
//
// --legacy is the one-off at ship time: events that exist then keep working as before (the owner
// chose "make them Pro"). Recounting is always safe to repeat: approvedCount becomes the number of
// approved, non-staff applications (the same rule as seatOf in firestore.rules).
//
// Uses the admin credentials in the env file (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
// NEXT_PUBLIC_FIREBASE_PROJECT_ID), so it migrates THAT project.

import admin from "firebase-admin";

const APPLY = process.argv.includes("--apply");
const LEGACY = process.argv.includes("--legacy");
// Legacy plans store each feature explicitly, so a feature added later reads as OFF for them
// until this sets it (the owner made early events Pro: they get every feature).
const ADD_FEATURE = process.argv.includes("--add-feature") ? process.argv[process.argv.indexOf("--add-feature") + 1] : null;
let privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (privateKey?.startsWith('"') && privateKey?.endsWith('"')) privateKey = privateKey.slice(1, -1);
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) });
const db = admin.firestore();

console.log(`${APPLY ? "APPLYING" : "DRY RUN"}${LEGACY ? " + legacy plans" : ""}${ADD_FEATURE ? ` + feature "${ADD_FEATURE}" for legacy` : ""} on project ${projectId}`);

const STAFF = /(staff|co-organizer|usg|chair|director|vice-chair)/i;
const seats = new Map();
for (const a of (await db.collection("applications").where("status", "==", "approved").get()).docs) {
  const d = a.data();
  if (!d.eventId || STAFF.test(d.role || "")) continue;
  seats.set(d.eventId, (seats.get(d.eventId) || 0) + 1);
}

const LEGACY_PLAN = {
  tier: "custom", source: "legacy",
  limits: { participants: null, committees: null },
  features: { video: true, ai: true, bulkEmail: true, ornate: true, customTheme: true, passes: true },
};

let recounted = 0, legacied = 0, free = 0, featured = 0;
let batch = db.batch(), inBatch = 0;
async function flush() { if (APPLY && inBatch) await batch.commit(); batch = db.batch(); inBatch = 0; }

for (const e of (await db.collection("events").get()).docs) {
  const d = e.data();
  const patch = {};
  const count = seats.get(e.id) || 0;
  if (d.approvedCount !== count) { patch.approvedCount = count; recounted++; }
  if (!d.plan) {
    if (LEGACY) { patch.plan = { ...LEGACY_PLAN, activatedAt: admin.firestore.FieldValue.serverTimestamp() }; legacied++; }
    else free++;
  }
  if (ADD_FEATURE && d.plan?.source === "legacy" && d.plan?.features?.[ADD_FEATURE] !== true) {
    patch[`plan.features.${ADD_FEATURE}`] = true;
    featured++;
  }
  if (Object.keys(patch).length) {
    console.log(`  ${e.id}  ${(d.title || "").slice(0, 40).padEnd(40)}  seats ${count}${patch.plan ? "  → legacy plan" : ""}${ADD_FEATURE && patch[`plan.features.${ADD_FEATURE}`] ? `  + ${ADD_FEATURE}` : ""}`);
    batch.update(e.ref, patch);
    if (++inBatch >= 400) await flush();
  }
}
await flush();
console.log(`\n${recounted} recounted · ${legacied} marked legacy · ${free} left Free (no plan)${ADD_FEATURE ? ` · ${featured} got ${ADD_FEATURE}` : ""}${APPLY ? "" : " — dry run, nothing written"}`);
process.exit(0);
