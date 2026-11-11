import * as dotenv from 'dotenv';
import * as path from 'path';
import * as admin from 'firebase-admin';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

try {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (privateKey?.startsWith('"') && privateKey?.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
  }

  console.log("Client Email:", process.env.FIREBASE_CLIENT_EMAIL);
  console.log("Private Key first 30 chars:", privateKey?.substring(0, 30));

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
  console.log("Successfully initialized admin!");
} catch (e: any) {
  console.error("Initialization Error:", e.message);
}
