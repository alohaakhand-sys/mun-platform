# Firebase Project Setup / Swap Guide

How to point this app at a **different Firebase project**, including one owned by a
**different Google account**. Written after doing exactly that (`mun-saas` →
`mun-platform-saas`) so the traps below are observed, not theoretical.

> **No secrets in this file.** It is committed to git. Real values live in `.env.local`,
> which is gitignored via `.env*`.

---

## 1. Current state

| | |
|---|---|
| Active project | `mun-platform-saas` |
| Owning Google account | `akhandfoundationseo@gmail.com` |
| Previous project | `mun-saas` (account `akhanddigitaldhaka@gmail.com`) |
| Previous env config | `.env.local.stop` — rename back to `.env.local` to revert |
| RTDB region | `asia-southeast1` (both projects) |
| Plan | Spark (free) — no Cloud Functions, no Blaze features |
| Firebase CLI | v15.22.4 |

`.firebaserc` holds three aliases:

```json
{ "projects": { "default": "mun-platform-saas", "new": "mun-platform-saas", "old": "mun-saas" } }
```

---

## 2. Console checklist (do this first)

In the **new** project's Firebase console:

- [ ] **Firestore** → Create database
- [ ] **Realtime Database** → Create database → pick the region deliberately; the app's
      presence features need `NEXT_PUBLIC_FIREBASE_DATABASE_URL` and the region is baked into it
- [ ] **Authentication** → Sign-in method → enable **Email/Password** *and* **Google**
      (the app uses both — `src/contexts/AuthContext.tsx`, `src/app/signup/page.tsx`,
      `src/app/forgot-password/page.tsx`)
- [ ] **Authentication → Settings → Authorized domains** → add `localhost` **and the production
      domain**. Missing the prod domain fails only in production, with `auth/unauthorized-domain`
- [ ] **Project settings → Service accounts** → Generate new private key (keep the JSON)
- [ ] **Storage** → only if you actually use it. This app does **not** — uploads go through
      Cloudinary, and `storage.rules` has never been deployed on either project

---

## 3. Steps

### 3.1 Park the old env, write the new one

```bash
mv .env.local .env.local.stop
```

Copy it to a new `.env.local` and replace **only** the Firebase block. Everything else
(Cloudinary, SMTP, Stripe, Agora, DataForSEO, Gemini/Groq/OpenRouter) is project-agnostic and
carries over verbatim. Key names: see `.env.example`.

The 6 client values come from Console → Project settings → Your apps → Web app → SDK config.
`measurementId` is **not** used — `src/lib/firebase/client.ts` builds no Analytics.

### 3.2 Pull the remaining values from the CLI instead of hunting the console

```bash
firebase apps:sdkconfig WEB          # prints databaseURL, storageBucket, appId, ...
firebase firestore:databases:list    # confirms Firestore exists
firebase database:instances:list     # confirms RTDB exists
```

`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` come from the service-account JSON
(`client_email`, `private_key`).

### 3.3 Point the CLI at the new project

**Skip this and every deploy fails** — see §4.1.

```bash
firebase login:add                      # browser; sign in with the OWNING account
firebase login:use <owning-account>     # binds that account to THIS directory
firebase projects:list                  # the new project MUST appear
```

Update `.firebaserc` aliases as above.

### 3.4 Deploy

Run targets **separately** so one failure doesn't mask the others:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes    # composite indexes AND fieldOverrides
firebase deploy --only database             # database.rules.json
# firebase deploy --only storage            # only if Storage was provisioned
```

Or via the npm scripts in `package.json`: `deploy:rules`, `deploy:indexes`, `deploy:dbrules`,
`deploy:firebase`.

**Cloud Functions are excluded on purpose.** `functions/` (certificates, bulk ID cards, cron
jobs) requires the Blaze plan and hard-fails on Spark. `certificateService.ts` and
`idCardService.ts` call them via `httpsCallable`; those two features stay dead.

### 3.5 Restart the dev server

```bash
npm run dev
```

Mandatory — see §4.3.

### 3.6 Seed the first admin

A fresh project has **zero** users and zero data. Nothing is migrated. Nobody can reach
`/dashboard/admin` until a user doc with `role: "App Admin"` exists.

1. Sign up once through the app (creates the Firebase Auth user)
2. Put the service-account JSON at the repo root as **`firebase-key.json`** — that exact
   filename is hardcoded in `scripts/setupAdmin.js:15`
3. Run:

```bash
node scripts/setupAdmin.js <uid> <email> "<Display Name>" [firstName] [lastName]
```

The script refuses to run if an `App Admin` already exists, and it `merge`s onto the existing
signup doc rather than replacing it. To find the UID without copying it by hand, see §5.1.

### 3.7 Production cutover (Vercel)

Separate and manual. Replace `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY` in Vercel → Settings → Environment Variables, **then trigger a redeploy**.
`NEXT_PUBLIC_*` are inlined at build time — without a redeploy, production silently keeps using
the old project while appearing healthy.

---

## 4. Traps (all of these actually bit)

### 4.1 A different Google account is an auth axis, not a config axis

`.firebaserc` aliases hold **project IDs only**. They carry no credentials. If the CLI is logged
into the wrong account, deploys fail with:

```
Failed to get Firebase project <id>. Make sure the project exists and your account has permission to access it.
```

which reads like a typo'd project ID but is an auth problem. Diagnose with:

```bash
firebase login:list      # which account is active
firebase projects:list   # what that account can actually see
```

`firebase login:add` **adds** an account without activating it — `login:use` is the step that
actually switches. To reach the *old* project afterwards you need **both** flags:

```bash
firebase deploy --only firestore:rules --project old --account <old-account-email>
```

Fallback if browser login is impossible: `GOOGLE_APPLICATION_CREDENTIALS=./firebase-key.json`.
Needs **Firebase Rules Admin** + **Cloud Datastore Index Admin** granted in GCP IAM; the default
`firebase-adminsdk` agent lacks them.

### 4.2 `firestore.indexes.json` drifts from reality — badly

Indexes created by clicking a console "create index" error link are **not** written back to the
repo. This repo had **9** indexes declared while the live project had **23**. Deploying the repo
file to a fresh project silently reproduces only 9; the other 14 queries then fail at runtime
with `The query requires an index`.

There are also **two separate index categories**, and the console shows them on different tabs:

- **Composite indexes** — the `indexes` array
- **Single-field exemptions** — the `fieldOverrides` array. Firestore auto-creates single-field
  indexes at `COLLECTION` scope but **never** at `COLLECTION_GROUP` scope. Any
  `collectionGroup(X).where(field, ...)` query needs an explicit override. This repo needs one:
  `staff.email` at `COLLECTION_GROUP` scope.

Before trusting the repo file, diff it against the live project with the script in §5.2.

### 4.3 Next.js reads env only at process start

A dev server started **before** the env swap keeps serving the **old** project. Signing up on it
creates the account in the wrong project and looks entirely successful. Always kill and restart:

```powershell
Get-Process -Id <pid> | Select-Object StartTime   # compare against .env.local LastWriteTime
```

### 4.4 The private key must stay a single escaped line

`src/lib/firebase/admin.ts` does `process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')`, so
the value must be one line with **literal `\n`** sequences, wrapped in double quotes. Writing it
with real newlines splits it across ~27 lines and can leave an orphan `"` that breaks env parsing.

Beware: shell escaping mangles this. `node -e "...\\n..."` through bash does **not** survive —
write a `.js` file and run `node file.js` instead. This mistake produced
`Failed to parse private key: Invalid PEM formatted message` twice.

### 4.5 Two key filenames, two gitignore patterns

`.gitignore` covers `*-firebase-adminsdk-*.json` and `serviceAccountKey.json`. It did **not**
cover `firebase-key.json` — the exact name `scripts/setupAdmin.js` requires. That pattern has
since been added. Verify before saving any key:

```bash
git check-ignore -v firebase-key.json
```

### 4.6 Firestore Admin API rejects `pageSize`

The fields-list endpoint accepts `pageSize=0` only. Any other value returns
`400 Invalid page size. Only 0 is supported.` Just omit the parameter.

---

## 5. Verification

Put these in a scratch directory, not the repo. They read `.env.local` the same way
`src/lib/firebase/admin.ts` does.

### 5.1 Does the admin SDK actually connect, and who is registered?

```js
const fs = require('fs'), path = require('path');
const root = process.cwd();
const lines = fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n');
const get = (k) => {
  const l = lines.find((x) => x.startsWith(k + '='));
  if (!l) return null;
  let v = l.slice(k.length + 1);
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
};
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: get('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    clientEmail: get('FIREBASE_CLIENT_EMAIL'),
    privateKey: get('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
  databaseURL: get('NEXT_PUBLIC_FIREBASE_DATABASE_URL'),
});
(async () => {
  console.log('firestore:', (await admin.firestore().collection('users').limit(1).get()).size, 'docs');
  const users = await admin.auth().listUsers(50);
  users.users.forEach((u) => console.log(' ', u.uid, u.email, u.providerData.map(p => p.providerId).join(',')));
  console.log('rtdb:', (await admin.database().ref('/sessionPresence').limitToFirst(1).once('value')).exists());
  process.exit(0);
})();
```

Use this to grab the UID for §3.6 instead of copying it out of the console.

### 5.2 Diff live indexes against the repo

```bash
firebase firestore:indexes            # composite indexes currently live
```

For **field overrides**, hit the Admin API (`usesAncestorConfig=false` = explicit overrides only;
the `__default__.*` entry is Firestore's built-in default, not yours):

```
GET https://firestore.googleapis.com/v1/projects/<pid>/databases/(default)/collectionGroups/-/fields
    ?filter=indexConfig.usesAncestorConfig%3Dfalse
    Authorization: Bearer <token from cred.getAccessToken()>
```

Run it against **both** the old and new project and compare. Anything present live but absent
from `firestore.indexes.json` is drift — write it into the repo file, don't just click the link.

### 5.3 Auth providers, authorized domains, deployed rules

With a bearer token from `cred.getAccessToken()`:

| Check | Endpoint |
|---|---|
| Email/Password + authorized domains | `GET https://identitytoolkit.googleapis.com/v2/projects/<pid>/config` |
| Google / federated providers | `GET https://identitytoolkit.googleapis.com/v2/projects/<pid>/defaultSupportedIdpConfigs` |
| API key valid for project | `GET https://identitytoolkit.googleapis.com/v1/projects?key=<apiKey>` |
| Live RTDB rules | `GET <databaseURL>/.settings/rules.json?access_token=<token>` — compare to `database.rules.json` |
| Firestore ruleset released | `GET https://firebaserules.googleapis.com/v1/projects/<pid>/releases` |

### 5.4 Regression guard

```bash
npm test        # vitest, pure-logic suites — unaffected by the project swap
```

### 5.5 In-app smoke test

1. No `[firebase] Missing client config: …` in the browser console (guard at
   `src/lib/firebase/client.ts:26`)
2. Sign up → the doc must appear in the **new** project's Firestore, not the old one. This is the
   check that catches a half-swapped env or a stale dev server (§4.3)
3. Create an event → no `The query requires an index` in the console
4. Live session as chair + delegate in a second browser: presence pills prove RTDB rules;
   raise-hand / cast-vote prove Firestore rules. `Missing or insufficient permissions` here means
   rules did not deploy

---

## 6. Rollback

```bash
mv .env.local .env.local.new
mv .env.local.stop .env.local
firebase login:use <old-account-email>
# set .firebaserc "default" back to the old project id
npm run dev        # restart is mandatory — §4.3
```

Data does not move. Whatever was written to the new project stays there.

---

## 7. Known non-issues

- `firestore.rules` compiles with `[W] 116:37 - Unused variable: role`. Intentional —
  `appWindowOpen(eventId, role)` keeps the argument for call-site compatibility after the
  timing model became event-wide. Documented in the rules file.
- Storage rules are undeployed on both projects. The app uses Cloudinary.
- Cloud Functions are undeployed. Spark plan.
