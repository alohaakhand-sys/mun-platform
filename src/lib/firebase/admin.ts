import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  // If the .env parser didn't strip the quotes, we remove them manually
  if (privateKey?.startsWith('"') && privateKey?.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    // RTDB holds live presence and its `/eventMembers` membership mirror (lib/server/membership).
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

const adminAuth = admin.auth();
const adminDb = admin.firestore();
/** Lazy: an environment without a database URL must still serve every Firestore-only route. */
const adminRtdb = () => admin.database();

export { adminAuth, adminDb, adminRtdb };
