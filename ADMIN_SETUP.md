# Admin User Setup Guide

Two ways to create first admin user: **CLI script** (easiest) or **Cloud Function**.

---

## Method 1: Node Script (Recommended)

### Setup

1. **Download Firebase Service Account Key**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Project Settings → Service Accounts → Generate New Private Key
   - Save as `firebase-key.json` in project root

2. **Run Script**
   ```bash
   node scripts/setupAdmin.js <UID> <EMAIL> <DISPLAY_NAME> [FIRST_NAME] [LAST_NAME]
   ```

### Example

```bash
node scripts/setupAdmin.js Fpkm5f2OliREZJPTj5j admin@example.com "Admin User" "Admin" "User"
```

### What It Does
- ✓ Checks if admin already exists (prevents overwrite)
- ✓ Verifies user exists in Firebase Auth
- ✓ Creates Firestore user doc with all required fields:
  - `uid`, `email`, `displayName`, `firstName`, `lastName`
  - `role: "App Admin"` (required for access)
  - `onboardingComplete: true` (prevents redirect to /onboarding)
  - `createdAt`, `photoURL`

---

## Method 2: Cloud Function (After Deploying)

After deploying Cloud Functions (`firebase deploy --only functions`):

### Via Node/JavaScript Client

```typescript
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const setupFirstAdmin = httpsCallable(functions, "setupFirstAdmin");

try {
  const result = await setupFirstAdmin({
    uid: "Fpkm5f2OliREZJPTj5j",
    email: "admin@example.com",
    displayName: "Admin User",
    firstName: "Admin",
    lastName: "User",
  });
  console.log("Admin created:", result.data);
} catch (error) {
  console.error("Error:", error.message);
}
```

### Via Firebase CLI

```bash
firebase functions:shell
> setupFirstAdmin({uid: "abc123", email: "admin@test.com", displayName: "Admin"})
```

### Security
- ✓ Requires Firebase authentication (must be logged in)
- ✓ Fails if admin already exists
- ✓ Validates all required fields before writing

---

## Verification

After setup, verify in [Firebase Console](https://console.firebase.google.com):

**Firestore → users collection → [Your UID]:**
```json
{
  "uid": "Fpkm5f2OliREZJPTj5j",
  "email": "admin@example.com",
  "displayName": "Admin User",
  "firstName": "Admin",
  "lastName": "User",
  "role": "App Admin",
  "onboardingComplete": true,
  "createdAt": "2026-05-19T...",
  "photoURL": null
}
```

Then navigate to `/dashboard/admin` in the app.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `firebase-key.json not found` | Download from Firebase Console > Project Settings > Service Accounts |
| `User not found in Firebase Auth` | User must be created in Firebase Auth first |
| `Admin user already exists` | Delete existing admin doc or use a different uid |
| `404 on /admin` | Navigate to `/dashboard/admin` not `/admin` |
| Admin nav doesn't show | Ensure `role: "App Admin"` (exact case match) |
| Redirected to /onboarding | Ensure `onboardingComplete: true` is set |
