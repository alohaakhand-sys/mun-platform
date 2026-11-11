#!/usr/bin/env node

/**
 * Setup First Admin User
 * Usage: node scripts/setupAdmin.js <uid> <email> <displayName> [firstName] [lastName]
 *
 * Example:
 * node scripts/setupAdmin.js Fpkm5f2OliREZJPTj5j admin@example.com "Admin User" "Admin" "User"
 */

const admin = require("firebase-admin");
const path = require("path");

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, "../firebase-key.json");

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (err) {
  console.error(
    "Error: firebase-key.json not found. Download it from Firebase Console > Project Settings > Service Accounts > Generate New Private Key"
  );
  process.exit(1);
}

const db = admin.firestore();

async function setupAdmin() {
  const [, , uid, email, displayName, firstName, lastName] = process.argv;

  if (!uid || !email || !displayName) {
    console.error(
      "Usage: node scripts/setupAdmin.js <uid> <email> <displayName> [firstName] [lastName]"
    );
    console.error("Example: node scripts/setupAdmin.js abc123 admin@test.com 'Admin' 'Admin' 'User'");
    process.exit(1);
  }

  try {
    // Check if admin exists
    const adminQuery = await db
      .collection("users")
      .where("role", "==", "App Admin")
      .limit(1)
      .get();

    if (!adminQuery.empty) {
      console.error("❌ Admin user already exists. Aborting.");
      process.exit(1);
    }

    // Verify user exists in Auth
    const user = await admin.auth().getUser(uid);
    console.log(`✓ User found: ${user.email}`);

    // Create admin user document
    const adminData = {
      uid,
      displayName: displayName || user.displayName || email.split("@")[0],
      firstName: firstName || displayName.split(" ")[0],
      lastName: lastName || displayName.split(" ")[1] || "",
      role: "App Admin",
      onboardingComplete: true,
      createdAt: new Date().toISOString(),
      photoURL: user.photoURL || null,
    };

    await db.collection("users").doc(uid).set(adminData, { merge: true });
    // Email is private: users/{uid}/private/contact, never on the profile doc.
    await db.collection("users").doc(uid).collection("private").doc("contact")
      .set({ email: email || user.email || "" }, { merge: true });

    console.log("✓ Admin user created successfully!");
    console.log(JSON.stringify(adminData, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

setupAdmin();
