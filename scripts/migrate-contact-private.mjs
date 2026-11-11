// Moves every member's email and phone off their public profile doc (users/{uid}, readable by any
// signed-in member) into users/{uid}/private/contact, where firestore.rules enforce
// privacySettings.contactVisibility. Also copies each applicant's phone onto their applications
// (applicantPhone), so organizers keep seeing it once profiles keep it private.
//
//   node --env-file=.env.local scripts/migrate-contact-private.mjs            dry run: counts only
//   node --env-file=.env.local scripts/migrate-contact-private.mjs --apply    writes
//
// Uses the admin credentials in the env file (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
// NEXT_PUBLIC_FIREBASE_PROJECT_ID), so it migrates THAT project. Safe to run again: a contact doc
// that already exists is merged, never overwritten with blanks, and nobody's setting changes
// (no contactVisibility = "everyone", today's behaviour).

import admin from "firebase-admin";

const APPLY = process.argv.includes("--apply");
let privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (privateKey?.startsWith('"') && privateKey?.endsWith('"')) privateKey = privateKey.slice(1, -1);
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

console.log(`${APPLY ? "APPLYING" : "DRY RUN"} on project ${projectId}`);

// Contact docs that already exist (written by the new site/app since the deploy) win: the old
// profile fields only fill what's missing, never overwrite a newer value.
const existing = new Map();
for (const c of (await db.collectionGroup("private").get()).docs) {
  if (c.id === "contact" && c.ref.parent.parent) existing.set(c.ref.parent.parent.id, c.data());
}

const users = await db.collection("users").get();
const phoneOf = new Map();
let moved = 0, alreadyClean = 0;
let batch = db.batch(), inBatch = 0;
async function flush() { if (APPLY && inBatch) await batch.commit(); batch = db.batch(); inBatch = 0; }

for (const u of users.docs) {
  const d = u.data();
  const email = typeof d.email === "string" ? d.email.trim() : "";
  const phone = typeof d.phoneNumber === "string" ? d.phoneNumber.trim() : "";
  const current = (existing.get(u.id)?.phoneNumber || phone || "").trim();
  if (current) phoneOf.set(u.id, current);
  if (!("email" in d) && !("phoneNumber" in d)) { alreadyClean++; continue; }
  const have = existing.get(u.id) || {};
  const contact = {};
  if (email && !have.email) contact.email = email;
  if (phone && !have.phoneNumber) contact.phoneNumber = phone;
  if (Object.keys(contact).length) batch.set(u.ref.collection("private").doc("contact"), { ...contact, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.update(u.ref, { email: FieldValue.delete(), phoneNumber: FieldValue.delete() });
  moved++;
  inBatch += 2;
  if (inBatch >= 400) await flush();
}
await flush();

// Phones only in contact docs (moved by an earlier run): also used for the application backfill.
for (const [uid, c] of existing) {
  const phone = (c.phoneNumber || "").trim();
  if (phone && !phoneOf.has(uid)) phoneOf.set(uid, phone);
}

const apps = await db.collection("applications").get();
let appsTagged = 0;
for (const a of apps.docs) {
  const d = a.data();
  const phone = phoneOf.get(d.userId);
  if (!phone || d.applicantPhone) continue;
  batch.update(a.ref, { applicantPhone: phone });
  appsTagged++;
  if (++inBatch >= 400) await flush();
}
await flush();

console.log(`users: ${users.size} (moved ${moved}, already clean ${alreadyClean})`);
console.log(`applications given applicantPhone: ${appsTagged} of ${apps.size}`);
if (!APPLY) console.log("Nothing written. Re-run with --apply.");
process.exit(0);
