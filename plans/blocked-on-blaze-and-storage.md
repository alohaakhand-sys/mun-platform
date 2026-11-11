# Deferred: tasks blocked on Firebase Blaze + Storage

**Status as of 2026-06-16:** project `mun-saas` is on the free **Spark** plan. Firebase **Cloud Functions** and **Cloud Storage** both require the **Blaze** (pay-as-you-go) plan. Storage is also not yet provisioned. Everything below is **code-complete and committed** — it just can't be **deployed/run** until Blaze is enabled. This doc is the checklist to finish it then.

> Hand this file to Claude Code after upgrading and say "do the Blaze tasks in plans/blocked-on-blaze-and-storage.md".

---

## What already works WITHOUT Blaze (no action needed)
- All dashboards, auth, events, applications + approval, committees, capacity/tiers, staff/permissions, country assignment (manual + heuristic), messaging, admin, chair marking, optional modules, partners.
- **Stripe** checkout + webhook (Next.js API routes, not Cloud Functions).
- **Transactional emails** (approval / country-assigned / certificate-ready / waitlist-offer / complaint-escalation) — these go through the Next.js route `src/app/api/send-email` + Resend, so they send today.
- **Certificate PRINT** — `CertificateDownload` "Print Certificate" uses the browser (`window.print`) on the HTML preview, so delegates can still get a certificate. Only the server-rendered **PDF download** is blocked (see below).
- Image uploads (covers, logos, avatars) — go through imgBB / `src/app/api/upload`, NOT Firebase Storage.
- **Delegate migration requests + in-app notifications** (committee/country move, organizer approval, occupant swap, deadline) — runs entirely on Next.js API routes (`src/app/api/migrations/*`) + the `notifications` collection. Swap-deadline expiry works via **lazy expiry** (`/api/migrations/expire`, called from the organizer Migrations tab + the respond guard). Only the hourly backstop cron is blocked (below).

---

## What's BLOCKED until Blaze (and the one-time setup)

### Step 0 — enable Blaze + Storage (one-time, you)
1. Upgrade `mun-saas` to **Blaze**: https://console.firebase.google.com/project/mun-saas/usage/details (set a budget alert).
2. **Enable Storage**: https://console.firebase.google.com/project/mun-saas/storage → **Get Started** → pick a bucket location (⚠️ irreversible).
3. Deploy everything that was waiting:
   ```
   firebase deploy --only storage,functions
   ```
   (`firestore:rules` and `database` are already deployed. `.firebaserc` default project = `mun-saas`, so no `--project` flag needed.)

### Step 1 — Cloud Functions (all need Blaze; code exists in `functions/src/`, exported in `functions/src/index.ts`)
| Function | Purpose | Verify after deploy |
|---|---|---|
| `generateCertificate` | Renders delegate certificate PDF → Storage | Delegate with an **approved** result clicks "Download PDF" on conference portal → PDF opens |
| `generateBulkIdCards` | Renders all-participant ID-card PDF → Storage | Organizer → event → Tools → ID Cards → "Generate ID Cards (PDF)" → PDF opens |
| `processAnnouncement` | Sends bulk announcement emails (Resend) | Organizer sends an announcement → recipients get email |
| `complaintSlaCheck` | Hourly: auto-escalate complaints >48h | Leave an open complaint 48h → it escalates |
| `assignmentDeadlineCheck` | Every 5 min: flag overdue country assignment | Pass an event's assignment deadline → status flips to "overdue" |
| `checkProExpiry` | Daily: downgrade expired Pro memberships | A Pro past expiry → downgraded |
| `expireWaitlistOffers` | **(new)** Hourly: expire 48h waitlist offers + advance queue | Offer a seat, wait 48h (or temporarily lower TTL to test) → expires, next waiting person becomes "offered" |
| `expireMigrationSwaps` | **(2026-06-21)** Hourly backstop: mark overdue `awaiting_swap` migration requests `failed` + notify requester. **Lazy expiry already covers this without Blaze** — cron only matters if nobody opens the Migrations tab. | Create a swap request, let the organizer-set deadline pass → request flips to `failed`, requester gets a dashboard notification |
| `setupFirstAdmin` | One-time admin bootstrap | n/a |

### Step 2 — Storage rules (need Storage enabled)
- `storage.rules` is written and referenced in `firebase.json`. It deploys as part of `firebase deploy --only storage`.
- Contents: default-deny; user avatars (owner, ≤5MB images); event files (signed-in, ≤20MB); ID cards + certificates **read-only to clients, written only by Cloud Functions**.

### Step 3 — Storage-dependent UI (code already wired; works once functions run)
- **Certificate PDF download** — `src/components/features/delegate/CertificateDownload.tsx` (`generateCertificate` callable). Print works without Blaze; PDF download needs it.
- **Bulk ID cards** — `src/lib/services/idCardService.ts` + `src/app/dashboard/organizer/events/[id]/tools/id-cards/page.tsx`.

---

## Behavior while still on Spark (so nothing looks broken)
- Certificate tab: "Print Certificate" works; "Download PDF" will error with a caught message (no crash). Tell users to use Print for now.
- ID Cards page: "Generate" will show a caught error message (no crash).
- The hourly/daily crons simply don't run — manual organizer actions still work (e.g. organizer can still escalate complaints, offer waitlist seats, send announcements via the page which uses the Next API).
- Do NOT run a full `firebase deploy` (it will fail on the `storage` target). Use targeted `--only firestore:rules` until Blaze.

---

## Optional follow-ups once on Blaze (not blockers)
- Add the composite indexes if any cron query prompts for one (`firestore.indexes.json` is not currently deployed — `firebase deploy --only firestore:indexes` if needed).
- Waitlist cron currently advances the queue but does not email the newly-offered person from within the function — add a Resend call in `functions/src/expireWaitlistOffers.ts` mirroring `complaintSlaCheck.ts` if you want that email.
- `expireMigrationSwaps` only writes the requester's **dashboard** notification on expiry (no email from the function). The Next-side lazy expiry DOES email. If the cron becomes the primary expirer, add an email send (Resend / `APP_URL`/api/send-email) inside `functions/src/expireMigrationSwaps.ts`.
- Certificate generation does not re-check `result.status === approved` server-side (UI gates it). Add the check inside `generateCertificate` for defense-in-depth.
