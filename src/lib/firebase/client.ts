import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

// Fail loud (in the browser) if the client config didn't get inlined at build time. NEXT_PUBLIC_*
// vars are baked in when `next build` runs on Vercel — if they were added/changed after the last
// build, the bundle ships with `undefined` and every auth/Firestore call silently fails. This turns
// that invisible failure into an obvious console error instead of a mystery ("works locally, not on Vercel").
if (typeof window !== "undefined") {
  const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(
      `[firebase] Missing client config: ${missing.join(", ")}. Set these NEXT_PUBLIC_FIREBASE_* ` +
      "env vars on Vercel and REDEPLOY (they are inlined at build time). Auth/Firestore won't work until then.",
    );
  }
}

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
// Auto-detect long polling avoids the benign-but-noisy "BloomFilterError" the Watch
// stream logs on certain networks/proxies; ignoreUndefinedProperties prevents writes
// from throwing on undefined fields. initializeFirestore must run once before getFirestore.
let db: Firestore;
try {
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    ignoreUndefinedProperties: true,
  });
} catch {
  // Already initialized (e.g. Fast Refresh) — reuse the existing instance.
  db = getFirestore(app);
}
const storage = getStorage(app);
const rtdb = getDatabase(app);
const functions = getFunctions(app);

export { app, auth, db, storage, rtdb, functions };
