# MUN Platform — Deep Scan Report & Vibe Coding Roadmap

> **Generated:** 2026-05-17
> **Project:** Model UN SaaS Platform
> **Stack:** Next.js 15 (App Router) + Tailwind v4 + Shadcn/Base UI + Firebase (Auth/Firestore/Storage/RTDB) + Cloud Functions (Resend, @react-pdf/renderer)
> **Source of truth files cross-checked:** `plans/project.md`, `plans/draft-progress.md`, `plans/progress-2026-05-16.md`, `plans/organizer-implementation-plan.md`, `plans/next-update-to-do.md`, plus actual `src/` and `functions/` directories.
> **Current overall completion:** ~72-78%
> **Critical project-wide rule:** **DO NOT DELETE OR BREAK ANY EXISTING FEATURE.** Every change in every phase below is purely additive or in-place refactor. Preserve all existing routes, components, services, Firestore fields, and security rules.

---

## TABLE OF CONTENTS

1. [Executive Summary — Where the Project Stands](#1-executive-summary)
2. [Completed Features Inventory (DO NOT TOUCH)](#2-completed-features-inventory)
3. [Critical Remaining Gaps — Master Checklist](#3-critical-remaining-gaps)
4. [Known Bugs & Technical Debt](#4-known-bugs--technical-debt)
5. [Improvements / Polish Recommendations](#5-improvements--polish-recommendations)
6. [Non-Negotiable Project-Wide Rules](#6-non-negotiable-project-wide-rules)
7. **Vibe Coding Phase Prompts (A → N)** — each is a fully self-contained, copy-paste-ready block
   - [PHASE A — LinkedIn + Facebook OAuth](#phase-a)
   - [PHASE B — Real PDF Certificate Generation](#phase-b)
   - [PHASE C — Complaint Hierarchy & Escalation Engine](#phase-c)
   - [PHASE D — Admin System Settings + Audit Logs](#phase-d)
   - [PHASE E — Firebase Storage Security Rules](#phase-e)
   - [PHASE F — Position Paper Inline Viewer for Chairs](#phase-f)
   - [PHASE G — Faculty Advisor + Team Delegation Flows](#phase-g)
   - [PHASE H — Pro Gate Comprehensive Enforcement](#phase-h)
   - [PHASE I — Waitlist 48h Cloud Function](#phase-i)
   - [PHASE J — Real Stripe Connect + Webhook Integration](#phase-j)
   - [PHASE K — LLM-Based Country Assignment](#phase-k)
   - [PHASE L — Mobile Responsive QA Pass](#phase-l)
   - [PHASE M — Optional Modules Hardening + Organizer Editor](#phase-m)
   - [PHASE N — Performance, Indexes, Error Boundaries & E2E Tests](#phase-n)
   - [PHASE O — Email Notification Triggers (bonus)](#phase-o)
8. [Sprint Execution Order](#8-sprint-execution-order)
9. [Verification Checklist Per PR](#9-verification-checklist-per-pr)

---

## 1. Executive Summary

### Overall Health Snapshot

| Phase | Name | % Done | Status |
|-------|------|--------|--------|
| 1 | Initialization & Foundation | **95%** | ✅ Solid — only LinkedIn/Facebook OAuth missing |
| 2 | Public & Auth Modules | **95%** | ✅ Solid — only LinkedIn/Facebook OAuth missing |
| 3 | Core Dashboards & Discovery | **95%** | ✅ Strong — real-time msging, presence, follow/block, read receipts live |
| 4 | Delegate Flow | **80-85%** | ⚠️ Mostly built — optional modules, room notifs, study guide upload+viewer, announcement viewer all live. Remaining: complaint escalation chain, Faculty Advisor/Team Delegation distinct flows |
| 5 | Organizer & Chair Workflows | **85%** | ⚠️ Comprehensive — event creation/edit, financials, Pro, chair tools, daily marking, AI assignment (heuristic), real announcement emails, bulk ID cards. Remaining: position paper viewer for chairs (partial), waitlist 48h Cloud Function |
| 6 | Post-Event & Admin | **55%** | ⚠️ Half done — admin dashboard, security rules, organizer approvals ✅. Missing: real PDF certs, Storage rules, System Settings, Audit Logs, responsive QA |
| 7 | Future Refinements | **0%** | ❌ Not started — real Stripe, LLM country assignment |

### What changed on 2026-05-16 (latest known checkpoint)
+15 percentage points in a single day. The following went from ❌ to ✅:
- Forgot password flow
- Onboarding role picker
- Profile page
- Group messaging
- Online/active presence indicators (RTDB)
- Follow/block/disconnect
- Read receipts
- Hardened Firestore security rules
- Edit-event flow
- Real announcement emails (Resend)
- Conflict detection & 24h deadline cron
- Custom marking templates + daily marking
- Chair "View All Papers" + "Final Awards"
- Bulk ID card generation Cloud Function
- Admin "Organizer Applications" tab

### What was secretly already built (not in older progress doc)
Cross-checking source against `plans/draft-progress.md`, these are **DONE** but marked incomplete in the old doc — update tracking:
- ✅ Food Coupons module — `src/components/features/delegate/modules/FoodCouponsModule.tsx`
- ✅ Transport module — `TransportModule.tsx`
- ✅ Accommodation module — `AccommodationModule.tsx`
- ✅ Live MUN module — `LiveMUNModule.tsx`
- ✅ Dress Code module — `DressCodeModule.tsx`
- ✅ Room notifications for delegates — `RoomNotifications.tsx`
- ✅ Announcement viewer for delegates — `AnnouncementViewer.tsx`
- ✅ Study guide upload for chairs — wired in `chair/committee/[id]/page.tsx`
- ✅ Study guide viewer for delegates — `StudyGuideViewer.tsx`

This means Phase 4 is closer to **80-85% done**, not 55%.

---

## 2. Completed Features Inventory

> **DO NOT TOUCH OR REMOVE ANY OF THESE.** Every prompt below must preserve them.

### Phase 1 — Foundation ✅
- Next.js 15 + Tailwind v4 + OKLCH theme + dark mode (`globals.css`)
- Shadcn-style UI on Base UI: button, card, input, label, dialog, dropdown, select, tabs, sheet, skeleton, badge, avatar, checkbox, switch, radio-group, tooltip, textarea, carousel, progress
- Firebase client (`lib/firebase/client.ts`) + admin (`lib/firebase/admin.ts`)
- Global layout with Navbar/Footer + AppWrapper hiding chrome on `/dashboard` and `/onboarding`

### Phase 2 — Public & Auth ✅
- Home `/` with hero + features + framer motion
- `/events` listing + `/events/[eventId]` detail with cover, description, committees grid, partner carousel, sticky apply card
- `/articles` listing + detail page with comments
- `/login` + `/signup` with email + Google OAuth + session cookie sync to `/api/auth/session`
- `/onboarding` with personal info, address, occupation, socials, role picker (Delegate/Chair/Organizer)
- `/forgot-password` with Firebase Auth reset email, 60s cooldown
- `/dashboard/profile` with hero block, stats, social links, recent activity
- Header dropdown split into Profile + Settings

### Phase 3 — Dashboards & Messaging ✅
- `/dashboard` discovery with welcome, stat cards, activity feed, recommended events
- `ActivityFeed` reading from `activities` collection
- My Conferences page with active/past tabs and `ConferenceCard`
- `/dashboard/conferences/[id]` with Documents / Schedule / Requests / Certificates / Results tabs
- Real-time messaging: `getUserConversations`, `getConversationMessages` via `onSnapshot`, 1-1 + group convos
- `ChatSidebar`, `ChatWindow`, unread badge
- Group messaging: `createGroupConversation`, "New Group" dialog, auto-group on application approval
- Online presence: `presenceService.ts` using Firebase RTDB; green/amber/grey dots
- Auto-follow: `autoFollowParticipants()` in `applicationService.ts`, mutual connections
- Block/disconnect: `connectionService.ts` with connect/block/disconnect/unblock; ChatSidebar filters blocked convos
- Read receipts: ✓ sent / ✓✓ read in `ChatWindow`

### Phase 4 — Delegate Flow ✅ (80-85%)
- `ApplicationWizard` with 4 steps (Role → Preferences → Experience → Review), validation, success state
- `PositionPaperUpload` (Firebase Storage, progress bar)
- Schedule viewer with type icons
- `ComplaintSystem` submission
- `CertificateDownload` preview + window.print() (REAL PDF still pending — see Phase B)
- Delegate sees marking results in Results tab
- All 5 optional modules: Food, Transport, Accommodation, Live MUN, Dress Code
- `RoomNotifications` (toast + bell + RTDB subscription)
- `AnnouncementViewer` with unread count
- `StudyGuideViewer`

### Phase 5 — Organizer & Chair Workflows ✅ (85%)
- Event creation wizard (5 tabs: Basic / Committees / Schedule / Financials / Settings)
- Cover photo upload via imgBB
- Executive Board assigner
- Ticketing tier editor + Schedule item editor
- Organizer event hub `/dashboard/organizer/events/[id]` with Overview, Applications, Country assignments (manual + AI), inline schedule editor
- Dedicated organizer sub-pages: `/committees`, `/countries` (with 24h countdown), `/staff`, `/capacity`, `/announcements`, `/partners`, `/tools/{id-cards,certificates,theme,results}`
- Organizer dashboard `/dashboard/organizer` with stats, role breakdown, recent events
- Financials dashboard (currently mock revenue calc)
- Pro Membership landing + application form
- Chair dashboard `/dashboard/chair`
- Chair committee management with evaluation dialog
- AI country assignment — heuristic-based (`aiAssignmentService`)
- Edit-event flow with `?edit=eventId` mode, `lastEditedAt`/`lastEditedBy` audit fields
- Sticky tab nav via `events/[id]/layout.tsx`
- Chair "View All Papers" Sheet
- Chair "Final Awards" Dialog
- Daily Marking Matrix with `dateStr` field on `Marking`
- Custom marking templates (`MarkingTemplate` on `EventData`, `Record<string, number>` scoring)
- Real conflict detection (`conflictService.ts` queries `collectionGroup('applications')`)
- Real 24h deadline cron (`assignmentDeadlineCheck`)
- Real announcement emails (`processAnnouncement` Cloud Function via Resend)
- Bulk ID card generation (`generateBulkIdCards` Cloud Function using `@react-pdf/renderer`)
- Study guide upload for chairs (Storage upload, progress bar, delete)

### Phase 6 — Post-Event & Admin ✅ (55%)
- `/dashboard/admin` with stats, activity feed, events table (publish/delete), users table (role change)
- Firestore Security Rules — fully hardened with user privacy, conversation participant-only access, block-list filtering, collectionGroup rules for `results`
- Admin "Organizer Applications" tab with approve/reject + role promotion
- Cert page renders + prints (real PDF still pending — see Phase B)

### Cloud Functions Live
- `processAnnouncement` — Resend email batch sender
- `assignmentDeadlineCheck` — cron every 5 min flagging overdue
- `generateBulkIdCards` — @react-pdf/renderer bulk ID card PDFs

---

## 3. Critical Remaining Gaps

### 🔴 HIGH PRIORITY (User-Visible / Blocking)
- [ ] **Real PDF Certificate Generation** — currently `window.print()`; need `@react-pdf/renderer` Cloud Function → Phase B
- [ ] **Firebase Storage Security Rules** — `storage.rules` file missing; uploads currently open by default → Phase E
- [ ] **Full Complaint Escalation Engine** — Chair → Organizer → Main Organizer → App Admin with auto-routing, SLA timers, notifications → Phase C
- [ ] **Admin "System Settings" Page** — button exists but route returns 404 → Phase D
- [ ] **Admin "Audit Logs" Page** — button exists but route returns 404 → Phase D
- [ ] **Position Paper Inline Viewer for Chairs** — only Sheet with download link; need in-browser PDF viewer with grading sidebar → Phase F

### 🟡 MEDIUM PRIORITY (Feature Completion)
- [ ] **LinkedIn + Facebook OAuth providers** — only Google + Email/Password wired → Phase A
- [ ] **Faculty Advisor / Team Delegation distinct flows** — currently just string values in role field → Phase G
- [ ] **Waitlist 48h Cloud Function** — `expireOffers` scheduled function not yet created → Phase I
- [ ] **Pro Gate consistent enforcement** — inconsistent across Pro-only features → Phase H
- [ ] **Email notification triggers** — Resend integrated for announcements only; need triggers for application approved, country assigned, waitlist offer, payment success, certificate unlocked, complaint received/escalated → Phase O
- [ ] **Responsive QA pass** — organizer event sub-pages with long tables cramped on mobile → Phase L
- [ ] **Optional modules organizer editor** — content editors for the 5 modules missing → Phase M

### 🟢 LOW PRIORITY (Future / Phase 7)
- [ ] **Real Stripe Connect Payment + Webhook** — currently dummy revenue calc (approvedCount × $50) → Phase J
- [ ] **LLM-Based Country Assignment** — currently heuristic only → Phase K

---

## 4. Known Bugs & Technical Debt

- [ ] Some `Base UI render` patterns still inconsistent — verify all `<Button render={<Link/>}>` usages have `nativeButton={false}`
- [ ] `applicationService.ts` returns `ApplicationData` without `id` typed (uses `as unknown as ApplicationData`) — clean up types
- [ ] `Marking` interface uses `Record<string, number>` for scores but some chair UI still references hardcoded keys
- [ ] `optionalModules` array stored on events, read in `conferences/[id]` page, but no editor UI to enable/disable per-event in create/edit flow (Settings tab has only a "Live MUN" toggle)
- [ ] `Announcement.deliveryStats` field not surfaced anywhere in admin oversight
- [ ] `firestore.indexes.json` may be missing indexes for new queries added in May 16 push — verify with `firebase deploy --only firestore:indexes`
- [ ] `autoFollowParticipants()` runs on application approval — verify idempotency (doesn't double-create connections if approved twice)
- [ ] Edit-event mode doesn't validate capacity reduction below `filledSeats` in all committees — partial check exists, may miss waitlisted seats
- [ ] `tools/id-cards` page says template selector + preview but generation flow uses the new Cloud Function — verify UI wiring matches
- [ ] No error boundaries — single Firebase error crashes whole route → Phase N
- [ ] No E2E tests → Phase N
- [ ] No `<Image>` component usage in event covers — using raw `<img>` → Phase N

---

## 5. Improvements / Polish Recommendations

- [ ] Add a "Last edited" indicator on edit-event mode (already storing `lastEditedAt`/`lastEditedBy` — surface them)
- [ ] Add complaint count badges to: Chair committee page header, Organizer event hub Overview tab, Admin dashboard sidebar
- [ ] Add Pro status badge in Navbar/Header dropdown for Pro users
- [ ] Add loading skeletons to every page that doesn't have one yet
- [ ] Add empty-state illustrations (centered icon + label) where missing
- [ ] Bigger tap targets (`h-12` minimum) for file upload inputs
- [ ] Drag-and-drop on `/partners` page provide arrow-button reorder alternative on touch devices
- [ ] Hero text should scale down on mobile (`text-4xl → text-2xl`)
- [ ] Mobile padding reduction (`py-20 → py-10`)
- [ ] Replace `<table>` heavy tables with cards on mobile via `useMediaQuery`
- [ ] Add 7-day-out Pro expiry reminder email
- [ ] Track LLM token cost in `/llmCostLogs` (when Phase K ships)

---

## 6. Non-Negotiable Project-Wide Rules

These apply to **EVERY** phase prompt. Reiterate at the top of every vibe prompt.

1. **PRESERVE EVERYTHING.** No deletion of existing routes, components, services, fields, or rules unless explicitly listed in the prompt.
2. **BACKWARDS-COMPATIBLE SCHEMAS.** New Firestore fields are optional. Old documents must keep reading.
3. **BASE UI PATTERNS.** Use `render` prop pattern, not `asChild`. Add `nativeButton={false}` when wrapping Buttons in Links.
4. **NEXT 15 ASYNC APIs.** Always `await cookies()`, `await headers()`. Use `useParams` only in client components with hydration guards.
5. **READ AGENTS.md FIRST.** Before editing any Next.js-specific code, check `node_modules/next/dist/docs/` for breaking changes.
6. **TYPESCRIPT INTERFACES.** Add new fields to existing interfaces; don't redefine.
7. **MOBILE RESPONSIVE.** Test every new feature at 375px width before declaring it done.
8. **AUDIT EVERY ADMIN ACTION.** Use `auditService` (from Phase D onwards) for every admin action.
9. **GIT HYGIENE.** One phase = one feature branch = one PR with conventional commits.
10. **TECH STACK ADHERENCE (from agent.md):**
    - Tailwind + Shadcn (extend, don't rebuild)
    - Firebase Client SDK frontend; Admin SDK in API routes only
    - React Hooks state management; SWR/React Query for client-side Firestore caching
    - TypeScript everywhere with clear interfaces
    - RBAC on BOTH client UI and Firestore rules

---

# VIBE CODING PHASE PROMPTS

> Every prompt below is **standalone** and **copy-paste-ready**. Paste it into Cursor, Windsurf, Claude Code, or any vibe coding agent. Each prompt restates the preservation rules so you don't have to.

---

<a name="phase-a"></a>
## 🅰️ PHASE A — LinkedIn + Facebook OAuth

**Estimated effort:** 2 days
**Branch:** `feat/phase-a-oauth-providers`
**Files affected:**
- `src/contexts/AuthContext.tsx` (modify, additive)
- `src/app/login/page.tsx` (additive)
- `src/app/signup/page.tsx` (additive)
- Firebase Console config (LinkedIn OIDC + Facebook app)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
This is a Model UN SaaS platform built with Next.js 15 (App Router), Tailwind v4, Shadcn/Base UI, and Firebase (Auth/Firestore/Storage/RTDB). Email/Password + Google OAuth already work end-to-end. The plan in plans/project.md lists Google + LinkedIn + Facebook + Email/Password as required providers.

GLOBAL PROJECT RULES (DO NOT VIOLATE):
1. DO NOT delete or break any existing feature, route, component, service, or Firestore field.
2. Every change here is additive. Preserve every existing export, prop, behavior, and UI element.
3. Use Base UI `render` prop pattern (not `asChild`). Add `nativeButton={false}` when wrapping Buttons in Links.
4. Use Next.js 15 async APIs: `await cookies()`, `await headers()`.
5. Mobile responsive at 375px width.

TASK:
Add LinkedIn and Facebook OAuth providers to the existing Firebase Auth flow without touching any working Google/Email auth code.

CURRENT STATE:
- AuthContext.tsx currently exports `signInWithGoogle()`.
- Email/Password flows live directly in /login/page.tsx and /signup/page.tsx via Firebase modular SDK.
- Session cookie is synced via `POST /api/auth/session` after every successful sign-in. PRESERVE this flow exactly.

WHAT TO BUILD:

1. In `src/contexts/AuthContext.tsx`, ADD two new exported functions ALONGSIDE signInWithGoogle (DO NOT modify signInWithGoogle):
   - `signInWithFacebook()` using `FacebookAuthProvider` from `firebase/auth`
   - `signInWithLinkedIn()` using `OAuthProvider("oidc.linkedin")` — LinkedIn requires custom OIDC config in Firebase Console, NOT a built-in Firebase provider
   - Both must:
     * Use `signInWithPopup` (same as Google)
     * Call the same session cookie sync POST `/api/auth/session` pattern after popup success
     * Call `fetchProfile(uid)` (or whatever the existing pattern is) after auth to populate profile state
     * Surface errors via the same toast/state mechanism as Google
   - Update the `AuthContextValue` TypeScript interface to include both new functions (additive — keep all existing properties exactly as-is)

2. In `src/app/login/page.tsx`, ADD two new buttons BELOW the existing Google button (don't replace, ADD beside):
   - "Continue with Facebook" — brand-blue color from `globals.css` palette, include INLINE Facebook SVG (do NOT import from lucide-react — it was removed; use inline `<svg>`)
   - "Continue with LinkedIn" — brand-blue, include INLINE LinkedIn SVG
   - Both buttons must share the same error-handling, loading-spinner, and post-success `router.push("/dashboard")` behavior as the Google button

3. Do the same additions in `src/app/signup/page.tsx`.

4. ADD a comment block at the top of `AuthContext.tsx` documenting:
   - LinkedIn OIDC setup requirement (LinkedIn Developer app + provider config in Firebase Console with custom claims)
   - The exact provider ID string to use: `"oidc.linkedin"`
   - That Facebook app needs domains whitelist in Facebook Developer Console

5. Update the user profile creation flow so new OAuth signups (Facebook / LinkedIn) get the same `users/{uid}` document scaffold (displayName, photoURL, role: "Delegate" default, createdAt) as Google signups currently do.

DO NOT:
- Modify `signInWithGoogle()` or any existing email/password handler in any way
- Change the AuthContextValue signature for existing properties — ONLY add new ones
- Remove or reposition the "Continue with Google" button
- Modify `/api/auth/session/route.ts`
- Import Linkedin / Facebook from lucide-react (those exports were removed; use inline SVG)

VERIFY (acceptance criteria):
- [ ] Existing Google sign-in flow still works end-to-end: popup → cookie sync → /dashboard redirect
- [ ] Existing email/password flow still works on both /login and /signup
- [ ] New Facebook button renders with correct branding and triggers popup
- [ ] New LinkedIn button renders with correct branding and triggers popup
- [ ] Browser console shows no Firebase config errors for either provider
- [ ] User profile doc is created in Firestore for new OAuth signups
- [ ] Existing tests (if any) still pass
- [ ] Mobile width 375px: all 3 buttons stack cleanly without overflow

GIT:
- Branch: feat/phase-a-oauth-providers
- Conventional commit: `feat(auth): add LinkedIn and Facebook OAuth providers`
- One PR
```

---

<a name="phase-b"></a>
## 🅱️ PHASE B — Real PDF Certificate Generation Engine

**Estimated effort:** 3-4 days
**Branch:** `feat/phase-b-real-pdf-certificates`
**Files affected:**
- `functions/src/generateCertificate.tsx` (new)
- `functions/src/index.ts` (additive export)
- `src/components/features/delegate/CertificateDownload.tsx` (modify — keep HTML preview)
- `src/lib/services/certificateService.ts` (new)
- `firestore.rules` (additive read rule)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS on Next.js 15 + Firebase. Certificates already render as an HTML preview with a `window.print()` button. The "Download PDF" button currently does nothing. @react-pdf/renderer is already a dependency (used in functions/src/generateBulkIdCards.tsx). Three certificate template styles exist: diploma, modern, ornate — configured per event in /tools/certificates.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE the existing HTML certificate preview render entirely — it is the visual confirmation.
3. PRESERVE the existing "Print Certificate" (window.print) button as a fallback.
4. PRESERVE the existing 3 template selection UI in /tools/certificates.
5. Backwards-compatible schemas only.

TASK:
Replace the broken "Download PDF" button with a real server-side PDF generation pipeline using @react-pdf/renderer in a Cloud Function. Generated PDF is uploaded to Firebase Storage and the URL returned to the client.

CURRENT STATE:
- src/components/features/delegate/CertificateDownload.tsx renders an HTML certificate preview with "Print Certificate" (window.print) and a decorative "Download PDF" button that does nothing.
- Templates: diploma / modern / ornate, stored in event.certificateTemplate.
- Award types: Best Delegate, Outstanding Delegate, Honorable Mention, Verbal Commendation, Participation.
- Marking awards live in Firestore under markings/{markingId}.award.
- Certificate download should unlock only after organizer approves results (existing tools/results page).

WHAT TO BUILD:

1. NEW CLOUD FUNCTION `functions/src/generateCertificate.tsx`:
   - Type: HTTPS callable (`onCall`)
   - Input: `{ eventId: string, delegateUid: string, applicationId: string }`
   - Auth check: caller must be either the delegate themselves OR the event organizer OR an admin
   - Reads:
     * event data (title, dates, organizerName, secretaryGeneralName from executiveBoard)
     * application data (applicantName, assignedCommittee, assignedCountry, role)
     * marking doc (for award if exists)
   - Builds a `<Document><Page>` using @react-pdf/renderer that matches the THREE template styles:
     * Port the look from /tools/certificates Card previews (same border/colors/layout)
     * If event.proStatus === "active", allow custom template hex colors; else force base templates
   - Renders to PDF buffer
   - Uploads to Firebase Storage at `certificates/{eventId}/{applicationId}.pdf`
   - Returns `{ url: string }` (signed URL or public if storage rule allows)
   - On failure, logs to NEW collection `certificateGenerationLogs` with `{ eventId, applicationId, error, timestamp }` for retry

2. EXPORT in `functions/src/index.ts` (additive — don't touch existing exports):
   ```ts
   export { generateCertificate } from "./generateCertificate";
   ```

3. NEW SERVICE `src/lib/services/certificateService.ts`:
   - `generateCertificate({ eventId, delegateUid, applicationId })` — calls the httpsCallable, returns `{ url }`
   - `getCertificateUrl(eventId, applicationId)` — reads Storage URL if already generated (returns null if not)

4. MODIFY `src/components/features/delegate/CertificateDownload.tsx`:
   - KEEP the entire existing HTML certificate preview render exactly as-is
   - KEEP the "Print Certificate" button using window.print()
   - REPLACE the broken "Download PDF" button onClick to:
     a. First check `getCertificateUrl()` — if cached URL exists, open it in new tab
     b. Otherwise call `certificateService.generateCertificate()`, show loading spinner (typical 3-10s)
     c. On success, set cachedUrl state and open the returned downloadUrl in new tab
     d. On error, show toast: "Failed to generate certificate. Please try again later."
   - Use `useState` for `cachedUrl` and `isGenerating`
   - Button label changes: "Download PDF" → "Generating PDF..." (during) → "Download PDF Again" (after first success)

5. UPDATE `firestore.rules` (ADDITIVE only):
   - Add: `match /certificateGenerationLogs/{logId} { allow read: if isAdmin(); allow write: if false; }`

6. UPDATE storage rules (will be created in Phase E):
   - Pre-emptively note: `certificates/{eventId}/{filename}` should allow read for the application owner only.

DO NOT:
- Remove the existing HTML preview render
- Change the certificate template selection UI in /tools/certificates
- Modify the existing award assignment flow in chair pages
- Break the print flow (window.print must still work)
- Touch generateBulkIdCards or any other existing Cloud Function

VERIFY (acceptance criteria):
- [ ] Delegate sees the same HTML preview as before (no visual regression)
- [ ] "Print Certificate" still works (window.print prints the preview)
- [ ] Clicking "Download PDF" triggers Cloud Function, returns URL, opens PDF that matches template style
- [ ] PDF includes: delegate name, conference name, committee, country, role, date, award if assigned
- [ ] Award unlocks only after organizer result approval (test by toggling result.status in console)
- [ ] Re-clicking after generation opens cached URL without re-running the function
- [ ] Failures appear in certificateGenerationLogs collection
- [ ] Non-applicant cannot generate a cert for someone else's application (auth check)
- [ ] Mobile 375px: buttons stack cleanly

GIT:
- Branch: feat/phase-b-real-pdf-certificates
- Commits: `feat(certificates): add real PDF generation Cloud Function`, `feat(certificates): wire download button to Cloud Function`
- One PR
```

---

<a name="phase-c"></a>
## 🅲️ PHASE C — Complaint System Hierarchy & Escalation Engine

**Estimated effort:** 4-5 days
**Branch:** `feat/phase-c-complaint-escalation`
**Files affected:**
- `src/lib/services/complaintService.ts` (new)
- `src/components/features/delegate/ComplaintSystem.tsx` (modify — preserve UI)
- `src/app/dashboard/chair/committee/[id]/page.tsx` (modify resolve/escalate handlers in-place)
- `src/app/dashboard/organizer/events/[id]/complaints/page.tsx` (new)
- `src/app/dashboard/admin/complaints/page.tsx` (new)
- `functions/src/complaintSlaCheck.ts` (new)
- `functions/src/index.ts` (additive export)
- `firestore.rules` (additive)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS. Delegates currently file complaints via src/components/features/delegate/ComplaintSystem.tsx. The complaint schema has: type, subject, description, status, escalationLevel, assignedRole, history[], resolution, createdAt, assignedTo. ESCALATION_STEPS const exists with 4 levels. Chair-side resolve/escalate handlers partially exist in /chair/committee/[id]/page.tsx but only escalate to organizer (level 1).

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE the existing delegate-side ComplaintSystem.tsx UI completely — only swap the submit handler.
3. PRESERVE the existing 4-step ESCALATION_STEPS visual timeline.
4. PRESERVE the existing chair-side resolve/escalate dialog — only route the handlers through the new service.
5. Schema: only ADD fields; don't rename existing ones.

TASK:
Build the full Chair → Organizer → Main Organizer → App Admin escalation flow on top of the existing complaint submission system. Include 48h SLA auto-escalation via Cloud Function.

WHAT TO BUILD:

1. NEW SERVICE `src/lib/services/complaintService.ts`:
   - `submitComplaint(data)` — encapsulates what was inline in ComplaintSystem
   - `escalateComplaint(complaintId, fromLevel, reason, actorUid, actorRole)` — handles level transitions:
     * Level 0 (Chair) → Level 1 (Organizer): assignedTo = event.organizerId, assignedRole = "organizer"
     * Level 1 (Organizer) → Level 2 (Main Organizer): if event.mainOrganizerId exists assign to it, else jump to level 3
     * Level 2 (Main Organizer) → Level 3 (App Admin): assignedTo = first user with role "App Admin"
     * Each escalation appends a HistoryEntry: `{ action: "escalated", actorUid, actorRole, message: reason, timestamp }`
     * Each escalation sets `escalatedAt: serverTimestamp()`
   - `resolveComplaint(complaintId, resolution, actorUid, actorRole)` — sets status="resolved", appends history
   - `rejectComplaint(complaintId, reason, actorUid, actorRole)` — sets status="rejected", appends history
   - `addAddendum(complaintId, message, actorUid)` — delegate-only; appends history without changing status
   - `getComplaintsForUser(uid, role)` — returns complaints where assignedTo === uid OR assignedRole matches user's current role

2. NEW PAGE `src/app/dashboard/organizer/events/[id]/complaints/page.tsx`:
   - Lists all complaints for the event where assignedRole === "organizer" OR (assignedRole === "mainOrganizer" if user is mainOrganizer)
   - Each complaint card shows: delegate name, committee, type, subject, full description, full history timeline
   - Action buttons: "Resolve" (textarea + submit), "Escalate to Main Org" (or "Escalate to Admin" if no main org), "Reject" (textarea)
   - Filter tabs: Active / Escalated to Me / Resolved
   - Use existing glass-card + Tabs UI patterns

3. NEW PAGE `src/app/dashboard/admin/complaints/page.tsx`:
   - Lists all complaints with escalationLevel === 3 (admin-assigned)
   - Same Resolve/Reject buttons as organizer page
   - Plus: "View Full Trail" button → Dialog showing every prior actor and message in the history array

4. NEW CLOUD FUNCTION `functions/src/complaintSlaCheck.ts`:
   - Scheduled: every 6 hours (`onSchedule("every 6 hours")`)
   - Query: complaints where status === "open" OR "escalated" AND escalatedAt < (now - 48h)
   - Auto-escalates by calling the same level-transition logic server-side with reason = "SLA: auto-escalated after 48h inactivity"
   - Sends Resend email notification to the new assignee
   - Logs to /auditLogs (Phase D) with action="complaint_auto_escalated"

5. EXPORT in functions/src/index.ts (additive):
   ```ts
   export { complaintSlaCheck } from "./complaintSlaCheck";
   ```

6. ADD complaint count BADGES (additive UI):
   - Chair committee page header (next to existing "Open Complaints" stat if any)
   - Organizer event hub Overview tab — small red dot with count
   - Admin dashboard sidebar — same pattern

7. UPDATE existing `ComplaintSystem.tsx`:
   - Swap the inline `addDoc(...)` submit handler to call `complaintService.submitComplaint(data)`
   - KEEP the UI exactly as-is — no visual changes

8. UPDATE existing `/dashboard/chair/committee/[id]/page.tsx`:
   - Replace handlers in-place to call `complaintService.resolveComplaint` and `complaintService.escalateComplaint`
   - KEEP the resolve/escalate dialog UI exactly as-is

9. UPDATE `firestore.rules` (additive):
   - Add rule on /complaints/{id}: `allow read if request.auth.uid in resource.data.history[*].actorUid` (anyone who acted on it can re-view)
   - Keep existing rules intact

DO NOT:
- Remove the existing 4-step ESCALATION_STEPS visual timeline in delegate's ComplaintSystem
- Remove the existing chair-side resolve/escalate dialog (just route handlers through new service)
- Change the complaint schema field names (only ADD fields; don't rename)
- Delete the existing escalation buttons in chair page — replace handlers in-place

VERIFY:
- [ ] Delegate files complaint → sees it appear with status="open", assignedRole="chair"
- [ ] Chair resolves → delegate sees status="resolved" with resolution text
- [ ] Chair escalates → organizer sees it in /dashboard/organizer/events/[id]/complaints
- [ ] Organizer escalates → main org (if exists) or admin sees it
- [ ] Admin sees it on /dashboard/admin/complaints
- [ ] 48h timeout auto-escalates via Cloud Function (test by manually setting escalatedAt to 49h ago)
- [ ] Full history timeline preserved across all escalations
- [ ] Email notification sent at each escalation step
- [ ] Complaint count badges update in real time
- [ ] Existing delegate complaint UI unchanged visually

GIT:
- Branch: feat/phase-c-complaint-escalation
- Commits: `feat(complaints): add complaintService with escalation`, `feat(complaints): organizer + admin complaint pages`, `feat(complaints): SLA cron auto-escalation`
- One PR
```

---

<a name="phase-d"></a>
## 🅳️ PHASE D — Admin System Settings + Audit Logs Pages

**Estimated effort:** 3 days
**Branch:** `feat/phase-d-admin-settings-audit`
**Files affected:**
- `src/app/dashboard/admin/settings/page.tsx` (new)
- `src/app/dashboard/admin/audit-logs/page.tsx` (new)
- `src/lib/services/auditService.ts` (new)
- `src/lib/services/systemSettingsService.ts` (new)
- `src/app/dashboard/admin/page.tsx` (modify — wire 2 buttons)
- `firestore.rules` (additive)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS admin dashboard at /dashboard/admin has two non-functional buttons in the header: "System Settings" (Settings icon) and "Audit Logs" (ShieldAlert icon). They currently do nothing. Admin role check is `profile?.role === "App Admin" || profile.isAdmin === true`. Existing admin tabs: stats, users, events, organizer-apps, activities.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE every existing stat card, tab, and table in /dashboard/admin/page.tsx.
3. PRESERVE the existing "Change Role" / "Delete Event" / "Approve Organizer" handlers — only WRAP them with audit.logAudit() calls.
4. Backwards-compatible schemas only.

TASK:
Build the two missing admin pages, wire them from the existing admin dashboard header, and add a global audit log service that logs every admin action.

WHAT TO BUILD:

1. NEW SERVICE `src/lib/services/systemSettingsService.ts`:
   - Single document at `/systemSettings/global`
   - Fields (all optional, defaults below):
     * platformFeePercent: number (default 7)
     * maxEventCapacity: number (default 5000)
     * allowGuestArticleComments: boolean (default false)
     * maintenanceMode: boolean (default false)
     * maintenanceMessage: string (default "")
     * defaultEventTheme: string (default "indigo")
     * supportEmail: string (default "support@yourplatform.com")
     * termsLastUpdated: Timestamp
     * privacyLastUpdated: Timestamp
   - Exports:
     * `getSystemSettings()` returns Settings with defaults filled
     * `updateSystemSettings(partial: Partial<Settings>)`
     * `subscribeSystemSettings(callback)` for real-time

2. NEW SERVICE `src/lib/services/auditService.ts`:
   - Collection: `/auditLogs/{logId}` (auto-id)
   - Schema: `{ actorUid, actorName, actorRole, action: string, targetId?: string, targetType?: string, details?: any, timestamp: serverTimestamp(), ipAddress?: string }`
   - Exports:
     * `logAudit({ actorUid, actorName, actorRole, action, targetId?, targetType?, details? })`
     * `getAuditLogs({ limit?, startAfter?, filterByActor?, filterByAction? })`
     * `subscribeRecentAuditLogs(limit, callback)` — for live admin view

3. NEW PAGE `src/app/dashboard/admin/settings/page.tsx`:
   - Use existing admin layout (sidebar/header preserved)
   - Form sections (Cards):
     * Platform — fee %, max capacity, default theme, support email
     * Content — allow guest comments toggle
     * Maintenance — toggle + message textarea
     * Legal — terms / privacy "last updated" date inputs
   - "Save Changes" button calls `updateSystemSettings()` and logs to `auditService.logAudit({ action: "update_system_settings", details: diff })`
   - Show toast on success
   - Guard: redirect non-admins to /dashboard

4. NEW PAGE `src/app/dashboard/admin/audit-logs/page.tsx`:
   - Use existing admin layout
   - Table: timestamp, actorName (with role badge), action, target, details (expandable JSON)
   - Filters: by action type (dropdown), by actor (search), date range
   - Pagination: 50 per page, "Load More" button
   - Export to CSV button (additive)
   - Guard: redirect non-admins

5. MODIFY `src/app/dashboard/admin/page.tsx` (in-place, preserve everything):
   - Replace the dead "System Settings" button with:
     ```tsx
     <Button render={<Link href="/dashboard/admin/settings"/>} nativeButton={false} variant="outline" className="gap-2">
       <Settings className="w-4 h-4"/> System Settings
     </Button>
     ```
   - Same pattern for "Audit Logs" → /dashboard/admin/audit-logs
   - WRAP existing handlers with audit.logAudit() calls:
     * Change Role → log action="user_role_change", targetType="user", details={ oldRole, newRole }
     * Delete Event → action="event_deleted", targetType="event", details={ eventTitle }
     * Approve Organizer → action="organizer_approved", targetType="user"
     * Publish/Unpublish event → action="event_published" or "event_unpublished"
   - DO NOT modify the existing handler logic — just call logAudit before or after

6. UPDATE `firestore.rules` (additive):
   - `/systemSettings/global`: `allow read: if isSignedIn(); allow write: if isAdmin();`
   - `/auditLogs/{logId}`: `allow read: if isAdmin(); allow write: if isAdmin();` (ideally server-side via Admin SDK, client-write as fallback)

DO NOT:
- Modify any existing admin dashboard tab content (stats / users / events / organizer-apps stay identical)
- Remove or change the existing "Change Role" / "Delete Event" / "Approve Organizer" handlers — only wrap with audit calls
- Delete existing skeleton loaders or layout structure
- Modify other parts of the admin dashboard

VERIFY:
- [ ] Two header buttons now navigate correctly (no 404)
- [ ] System Settings changes persist (refresh page → values still there)
- [ ] Audit log entry appears in /dashboard/admin/audit-logs for every admin action (test: change a user's role, see log)
- [ ] Non-admin users get redirected away from both new pages
- [ ] Existing admin tabs (stats/users/events/etc.) still work identically — no visual or functional regression
- [ ] Maintenance mode toggle, when set, should be readable elsewhere (don't yet enforce site-wide block — just persist the flag)
- [ ] Mobile 375px: settings form usable, audit table horizontally scrollable

GIT:
- Branch: feat/phase-d-admin-settings-audit
- Commits: `feat(admin): add systemSettings + audit services`, `feat(admin): system settings page`, `feat(admin): audit logs page`, `feat(admin): wire audit logging into existing admin actions`
- One PR
```

---

<a name="phase-e"></a>
## 🅴️ PHASE E — Firebase Storage Security Rules

**Estimated effort:** 1 day
**Branch:** `feat/phase-e-storage-rules`
**Files affected:**
- `storage.rules` (new — currently missing!)
- `firebase.json` (additive — reference rules file)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS uses Firebase Storage for: position papers, study guides, event cover photos, partner logos, generated ID cards, generated certificates. NO storage.rules file currently exists in the repo. Default Firebase rules are "open to public" which is a critical security hole.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE all existing upload/download flows in PositionPaperUpload, study guide upload, cover photo upload, and ID card / certificate generation.
3. Public reads on event covers and partner logos MUST still work (the public /events page needs them).

TASK:
Create a comprehensive storage.rules file that locks down all Firebase Storage paths to their intended audience.

KNOWN STORAGE PATHS (from codebase):
- `positionPapers/{eventId}/{applicationId}/{filename}` — uploaded by delegate
- `studyGuides/{eventId}/{committeeName}/{filename}` — uploaded by chair
- `events/{eventId}/cover.jpg` (note: cover photos actually use imgBB, not Storage — verify)
- `events/{eventId}/partners/{partnerId}/logo.png` — partner logos (verify if imgBB or Storage)
- `idCards/{eventId}/batch_{timestamp}.zip` — bulk ID card output (server-written)
- `certificates/{eventId}/{applicationId}.pdf` — server-written from Phase B

WHAT TO BUILD:

1. NEW FILE `storage.rules` at project root:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // ── Helpers ──────────────────────────────────────────────
    function isSignedIn() {
      return request.auth != null;
    }
    function isAdmin() {
      return isSignedIn() && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'App Admin';
    }
    function isOrganizer(eventId) {
      return isSignedIn() && firestore.get(/databases/(default)/documents/events/$(eventId)).data.organizerId == request.auth.uid;
    }
    function isChairOf(eventId, committeeName) {
      return isSignedIn() && exists(/databases/(default)/documents/events/$(eventId)/committees) &&
        request.auth.uid in firestore.get(/databases/(default)/documents/events/$(eventId)).data.committees[committeeName].chairUids;
    }
    function isApplicant(applicationId) {
      return isSignedIn() && firestore.get(/databases/(default)/documents/applications/$(applicationId)).data.userId == request.auth.uid;
    }

    // ── Position Papers ──────────────────────────────────────
    // Delegates upload their own; chairs/organizers/admins read for grading
    match /positionPapers/{eventId}/{applicationId}/{filename} {
      allow read: if isApplicant(applicationId) || isOrganizer(eventId) || isChairOf(eventId, '*') || isAdmin();
      allow create: if isApplicant(applicationId) && request.resource.size < 10 * 1024 * 1024 && request.resource.contentType == 'application/pdf';
      allow update: if isApplicant(applicationId) && request.resource.size < 10 * 1024 * 1024 && request.resource.contentType == 'application/pdf';
      allow delete: if isApplicant(applicationId) || isOrganizer(eventId) || isAdmin();
    }

    // ── Study Guides ─────────────────────────────────────────
    // Chairs upload; all signed-in users in the event can read
    match /studyGuides/{eventId}/{committeeName}/{filename} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.resource.size < 20 * 1024 * 1024 && request.resource.contentType == 'application/pdf';
      allow delete: if isOrganizer(eventId) || isAdmin();
    }

    // ── Event Cover Photos & Partner Logos ───────────────────
    // Public read for public /events pages
    match /events/{eventId}/{path=**} {
      allow read: if true;
      allow write, delete: if isOrganizer(eventId) || isAdmin();
    }

    // ── ID Cards (server-generated, organizer downloads) ─────
    match /idCards/{eventId}/{filename} {
      allow read: if isOrganizer(eventId) || isAdmin();
      allow write: if false; // Cloud Functions only via Admin SDK
      allow delete: if isOrganizer(eventId) || isAdmin();
    }

    // ── Certificates (server-generated, applicant downloads) ─
    match /certificates/{eventId}/{filename} {
      allow read: if isSignedIn(); // refine later by parsing applicationId from filename if needed
      allow write: if false; // Cloud Functions only
      allow delete: if isOrganizer(eventId) || isAdmin();
    }

    // ── Default deny ─────────────────────────────────────────
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

2. UPDATE `firebase.json` (additive, don't break existing config):
   - Add top-level "storage" block:
     ```json
     {
       "storage": { "rules": "storage.rules" }
     }
     ```

3. TEST upload flows in dev:
   - Position paper upload still works as a delegate
   - Study guide upload still works as a chair
   - Cover photo upload still works as the event organizer (whether imgBB or Storage)
   - Non-applicants cannot fetch another delegate's position paper URL
   - Non-organizers cannot delete event covers
   - Anonymous users can still view event cover photos on the public event page

DO NOT:
- Block public reads on event covers or partner logos (the public /events page needs them)
- Change any client-side upload code in PositionPaperUpload.tsx, chair study guide handler, or ImageUploader.tsx
- Require admin-only access to position papers — chairs must still read them for grading
- Modify firestore.rules in this phase (separate concern)

VERIFY:
- [ ] Run `firebase deploy --only storage` in staging — succeeds
- [ ] Delegate uploads position paper — succeeds
- [ ] Chair downloads delegate's position paper — succeeds
- [ ] Another delegate tries to download someone else's paper — 403
- [ ] Anonymous user views public event cover — 200 (still public)
- [ ] Oversized upload (>10MB PDF for position paper) — rejected
- [ ] Non-PDF upload to position paper path — rejected
- [ ] Existing chair study guide upload UI — still works end-to-end

GIT:
- Branch: feat/phase-e-storage-rules
- Commit: `feat(security): add Firebase Storage rules`
- One PR
```

---

<a name="phase-f"></a>
## 🅵 PHASE F — Position Paper Inline Viewer for Chairs

**Estimated effort:** 2-3 days
**Branch:** `feat/phase-f-position-paper-viewer`
**Files affected:**
- `src/components/features/chair/PositionPaperViewer.tsx` (new)
- `src/app/dashboard/chair/committee/[id]/page.tsx` (modify additively)
- `src/lib/services/markingService.ts` (additive)
- `src/components/features/delegate/PositionPaperUpload.tsx` (small status-display update)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS chair page already has a Sheet that lists all submitted position papers with download links and status badges. Currently a chair clicks "Download" to open the PDF in a new tab — there's no way to grade the paper inline or leave comments. Marking templates exist on EventData as `markingTemplates: { id, name, maxScore }[]` and Marking schema has `scores: Record<string, number>` and a `feedback: string` field.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE the existing Sheet listing of position papers — it's the entry point.
3. PRESERVE the chair's existing Daily Marking Matrix.
4. PRESERVE the position paper upload flow on delegate side — only update the status display.

TASK:
Build an inline PDF position paper viewer with a grading/comment sidebar. Extend (don't replace) the existing Sheet-based "View All Papers" feature.

WHAT TO BUILD:

1. NEW COMPONENT `src/components/features/chair/PositionPaperViewer.tsx`:
   - Two-column layout: left 70% = PDF iframe; right 30% = grading sidebar
   - Left side:
     * `<iframe src={paperUrl + "#toolbar=0"}>` for the PDF
     * Status badge bar at top (Under Review / Approved / Needs Revision / Plagiarism Concern)
     * "Open in new tab" button as fallback
   - Right side (Grading Sidebar):
     * Delegate info card: name, country, committee
     * Status select: Under Review / Approved / Needs Revision / Plagiarism Concern
     * Position Paper Score input (separate dimension from debate scores)
     * Feedback textarea (visible to delegate after submission)
     * "Save Grade" button
     * "Internal Chair Notes" section — comment thread between chairs only (new sub-collection)
       - Comment list with author + timestamp + text
       - Input + Send button

2. EXTEND `src/lib/services/markingService.ts` (additive only):
   - Add to Marking interface (optional, additive):
     ```ts
     positionPaperScore?: number;
     paperStatus?: "review" | "approved" | "revision" | "flagged";
     paperFeedback?: string;
     paperGradedAt?: Timestamp;
     paperGradedBy?: string;
     ```
   - Add functions:
     * `savePositionPaperGrade(applicationId, { score, feedback, status, gradedBy })` — upserts the new fields into the marking doc
     * `addPaperComment(markingId, comment: { text, authorId, authorName })` — adds to `/markings/{markingId}/comments` sub-collection
     * `getPaperComments(markingId)` — onSnapshot subscription
   - DO NOT modify existing `submitMarking`, `saveDailyMarking`, or any other current functions

3. UPDATE `src/app/dashboard/chair/committee/[id]/page.tsx`:
   - KEEP the existing Sheet "View All Papers" list exactly as-is
   - When a chair clicks a paper row, open a FULL-SCREEN Dialog (not Sheet — Sheet too narrow for PDF) containing `<PositionPaperViewer />`
   - Pass props: `eventId`, `applicationId`, `paperUrl`, `committeeName`, `application`

4. UPDATE `src/components/features/delegate/PositionPaperUpload.tsx`:
   - KEEP the entire existing upload flow
   - ONLY enhance the "Under review by the Chairs" status display:
     * If `paperStatus === "approved"` → show green check + "Approved by Chairs ✓"
     * If `paperStatus === "revision"` → show yellow icon + "Revision Requested" + display the `paperFeedback` text
     * If `paperStatus === "flagged"` → show red icon + "Under Concern Review" (don't show plagiarism specifics to delegate)
     * If `paperStatus === "review"` or undefined → existing message stays as-is

DO NOT:
- Remove the existing Sheet listing of papers
- Change the chair's existing Daily Marking Matrix
- Modify the position paper UPLOAD flow on delegate side (only update the status display)
- Break the existing markingService.submitMarking or saveDailyMarking flows
- Use Sheet for the viewer — Dialog full-screen is correct

VERIFY:
- [ ] Chair clicks paper row → full-screen viewer Dialog opens
- [ ] PDF renders in iframe with zoom controls available
- [ ] Grade input saves to Marking doc with paperGradedAt timestamp
- [ ] Comments save with timestamp + author and other chairs see them in real-time
- [ ] Delegate sees paper status update on their side (approved/revision/flagged)
- [ ] Delegate sees feedback text when status is "revision"
- [ ] Existing daily marking matrix unaffected — still functions identically
- [ ] Existing Sheet listing unchanged visually
- [ ] Mobile 375px: viewer stacks vertically (PDF on top, sidebar below)

GIT:
- Branch: feat/phase-f-position-paper-viewer
- Commits: `feat(chair): add PositionPaperViewer with grading sidebar`, `feat(chair): comment thread for paper notes`, `feat(delegate): paper status display`
- One PR
```

---

<a name="phase-g"></a>
## 🅶 PHASE G — Faculty Advisor & Team Delegation Distinct Flows

**Estimated effort:** 4-5 days
**Branch:** `feat/phase-g-faculty-team-roles`
**Files affected:**
- `src/components/dashboard/wizard/ApplicationWizard.tsx` (modify additively — add cards + conditional steps)
- `src/lib/services/applicationService.ts` (additive — new submit functions)
- `src/app/dashboard/conferences/[id]/page.tsx` (conditional panel render)
- `src/components/features/delegate/FacultyAdvisorPanel.tsx` (new)
- `src/components/features/delegate/TeamDelegationPanel.tsx` (new)
- `src/lib/services/aiAssignmentService.ts` (skip Faculty role)
- `firestore.rules` (additive — institutional scope read)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS ApplicationWizard.tsx step 0 currently offers: Delegate / Head Delegate / Observer. "Faculty Advisor" and "Team Delegation" are mentioned in plans/project.md as roles but never built as distinct flows. ApplicationData has `role: string` field.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE the Delegate / Head Delegate / Observer cards exactly.
3. PRESERVE the existing 4-step wizard structure — only swap step content based on role selection.
4. PRESERVE the existing `applicationService.submitApplication` for normal delegates.
5. PRESERVE country assignment for delegates who still need it.

TASK:
Build distinct application flows and dashboard tabs for "Faculty Advisor" and "Team Delegation Lead" roles.

WHAT TO BUILD:

1. EXTEND `ApplicationWizard.tsx` step 0 (additive — add cards, don't remove existing ones):
   - Add a 4th card: "Faculty Advisor" — description: "Accompany and supervise a delegation from your institution. No country preferences required."
   - Add a 5th card: "Team Delegation Lead" — description: "Apply as a group of 3-15 delegates from one institution; one application covers all."

2. CONDITIONAL FORM STEPS based on role selection:
   - If `role === "Faculty Advisor"`:
     * Step 1 is REPLACED with: Institution Name, # Students Accompanying, Faculty Position, Years Teaching MUN (no country preferences)
     * Step 2: experience + motivation rephrased to focus on supervisor role
   - If `role === "Team Delegation Lead"`:
     * Step 1 is EXTENDED with: Team Size (3-15), Team Name, optional CSV upload for team member emails + names + countries (3-choice each)
     * Step 2: shared motivation + institution-level info
   - For all other roles (Delegate / Head Delegate / Observer): existing flow unchanged

3. EXTEND `ApplicationData` interface (additive — keep ALL existing fields):
   - `institutionName?: string`
   - `studentsAccompanying?: number`
   - `facultyPosition?: string`
   - `yearsTeaching?: number`
   - `teamSize?: number`
   - `teamName?: string`
   - `teamMembers?: { name: string; email: string; choices: { primary, secondary, tertiary } }[]`
   - `teamApplicationParentId?: string` (links child apps to parent for team submissions)

4. NEW COMPONENT `src/components/features/delegate/FacultyAdvisorPanel.tsx`:
   - Rendered on /dashboard/conferences/[id] when `application.role === "Faculty Advisor"`
   - Shows list of delegates from the same institution who applied to the same event
   - Read-only access per delegate: status, committee, country, position paper status, daily marks (aggregate view only — no individual score breakdown)
   - "Send Bulk Message" button — uses existing messageService to create a group conversation with all institution delegates
   - Don't show country assignment card (faculty doesn't get one)

5. NEW COMPONENT `src/components/features/delegate/TeamDelegationPanel.tsx`:
   - Rendered for team lead on /dashboard/conferences/[id]
   - Team roster table: name, status per member, assigned country, payment status
   - "Add Team Member" button (only before event approval deadline) — sends invite emails via Resend
   - Aggregate position paper submission tracker (X of N submitted)

6. UPDATE `applicationService.ts` (additive new functions, don't modify existing):
   - `submitTeamApplication(parentAppData, teamMembers[])` — creates 1 parent application + N child applications linked via `teamApplicationParentId`
   - `submitFacultyApplication(parentAppData)` — uses `isFaculty: true` flag, sets `role: "Faculty Advisor"`
   - Original `submitApplication` stays exactly as-is

7. UPDATE `conferences/[id]/page.tsx` to conditionally render the right panel:
   - If `role === "Faculty Advisor"` → render `<FacultyAdvisorPanel/>` instead of standard committee/country card
   - If part of a team delegation (has `teamApplicationParentId` or is team lead) → render `<TeamDelegationPanel/>` in addition to standard panel
   - Otherwise: existing flow

8. UPDATE `firestore.rules` (additive):
   - Allow Faculty Advisor read on applications where `resource.data.institutionName == get(/databases/(default)/documents/users/$(request.auth.uid)).data.institutionName`

9. UPDATE `aiAssignmentService.ts` (additive):
   - In `suggestCountryAssignments`, SKIP applications with `role === "Faculty Advisor"` (they don't need a country)
   - All other behavior unchanged

DO NOT:
- Remove the Delegate / Head Delegate / Observer cards
- Change the existing 4-step wizard structure — only swap step content
- Break the existing applicationService.submitApplication for normal delegates
- Modify the existing country assignment for delegates who DO need it
- Remove the existing complaint/messaging flows for any role

VERIFY:
- [ ] Selecting Faculty Advisor swaps wizard content (no country prefs)
- [ ] Selecting Team Lead extends step 1 with team fields
- [ ] Faculty Advisor sees institutional roster on conference page
- [ ] Team Lead can manage team members
- [ ] AI assignment skips faculty roles
- [ ] Existing normal Delegate flow unaffected end-to-end
- [ ] Existing complaint/messaging flows work for all role types
- [ ] Mobile 375px: new wizard cards stack cleanly

GIT:
- Branch: feat/phase-g-faculty-team-roles
- Commits: `feat(application): add Faculty Advisor + Team Lead wizard cards`, `feat(application): conditional wizard steps for new roles`, `feat(application): FacultyAdvisorPanel + TeamDelegationPanel`
- One PR
```

---

<a name="phase-h"></a>
## 🅷 PHASE H — Pro Gate Comprehensive Enforcement

**Estimated effort:** 2-3 days
**Branch:** `feat/phase-h-pro-gate`
**Files affected:**
- `src/lib/hooks/useProStatus.ts` (new)
- `src/components/ProGate.tsx` (new or verify exists)
- Various Pro-locked feature entry points (modify additively — just wrap)
- `functions/src/checkProExpiry.ts` (new scheduled function)
- `functions/src/index.ts` (additive export)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS Pro Membership. plans/project.md mentions "Pro Membership: Form to apply/upgrade via MyMUN. Pro unlocks advanced features." plans/organizer-implementation-plan.md Pro-locked list:
- AI Country Assignment
- Live MUN module
- Advanced certificate templates (Ornate)
- Bulk email announcements (>50 recipients)
- Custom event themes (custom hex colors)
Existing `proStatus` field on user profile: "none" | "pending" | "active". Pro application form exists at /dashboard/organizer/apply.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE all non-Pro feature behaviors.
3. PRESERVE the existing /dashboard/organizer/apply Pro application form.
4. DO NOT make any non-Pro feature dependent on isPro.
5. DO NOT block non-Pro organizers from creating free events (basic event creation must remain free).

TASK:
Audit every Pro-locked feature, enforce consistent gating via a single ProGate HOC, and add automated expiry handling.

WHAT TO BUILD:

1. NEW HOOK `src/lib/hooks/useProStatus.ts`:
   ```ts
   export function useProStatus() {
     // returns { isPro: boolean, status: "none"|"pending"|"active"|"expired", expiresAt: Date|null, refresh: () => void }
     // reads from AuthContext profile.proStatus and profile.proExpiresAt
     // listens to profile snapshot updates
   }
   ```

2. NEW COMPONENT `src/components/ProGate.tsx`:
   - Props: `{ children: ReactNode, feature: string, lockedFallback?: ReactNode }`
   - If `isPro` → render `children`
   - Otherwise → render a beautiful upgrade card with:
     * Feature name displayed prominently
     * "Upgrade to Pro" Button linking to /dashboard/organizer/apply (use Base UI render pattern)
     * `lockedFallback` (if provided) shown below in muted/disabled state
   - Style matches existing glass-card aesthetic

3. WRAP these features with ProGate (additive — just wrap the entry point, don't delete the feature):
   - `/dashboard/organizer/events/[id]/countries/page.tsx` → Wrap "Run AI Assignment" button with `<ProGate feature="AI Country Assignment">`
   - `/dashboard/conferences/[id]/page.tsx` → Wrap the Live MUN tab content with `<ProGate feature="Live MUN Streaming">`
   - `/dashboard/organizer/events/[id]/tools/certificates/page.tsx` → Wrap the "Ornate" template option (leave Classic + Modern free)
   - `/dashboard/organizer/events/[id]/announcements/page.tsx` → In composer, if recipient count > 50, disable Send button and show inline ProGate message
   - `/dashboard/organizer/events/[id]/tools/theme/page.tsx` → Wrap the custom hex color picker; preset themes remain free

4. PRO STATUS BADGE (additive UI):
   - In Navbar / Header dropdown, add a small "PRO" gold badge next to user name if `isPro`
   - In organizer sidebar/dashboard, show "Pro Member" status block with expiry date

5. EXPIRY HANDLING:
   - NEW Cloud Function `functions/src/checkProExpiry.ts`:
     * Scheduled daily
     * Query users where `proStatus === "active"` AND `proExpiresAt < now`
     * Set `proStatus = "expired"` and log to /auditLogs
     * Send 7-day-out reminder email via Resend (separate query for users expiring within 7 days)
   - Export from `functions/src/index.ts` (additive)

6. ADMIN OVERSIGHT (additive to admin dashboard):
   - In admin/organizer-apps tab, show pro applications with "renewal" vs "new" badge
   - "Extend Pro" button (manual grant N months) — useful for partners
   - Log "extend_pro" action to audit logs

DO NOT:
- Make any non-Pro feature dependent on isPro
- Block non-Pro organizers from creating free events (basic event creation must remain free)
- Remove or hide the Pro-locked features — only gate them with the upgrade prompt
- Change the existing /dashboard/organizer/apply Pro application form
- Wrap features that aren't actually Pro-locked

VERIFY:
- [ ] Non-Pro user sees lockedFallback in muted state on Pro features with clear upgrade CTA
- [ ] Pro user sees full feature unchanged
- [ ] Expiry cron triggers downgrade on next day's run (test by manually setting proExpiresAt to past)
- [ ] 7-day reminder email sent
- [ ] Free events still creatable without Pro
- [ ] Basic announcements (<50 recipients) still send without Pro
- [ ] 2 cert templates (Classic + Modern) still work without Pro
- [ ] Admin can extend Pro manually
- [ ] Pro badge displays in Navbar for Pro users

GIT:
- Branch: feat/phase-h-pro-gate
- Commits: `feat(pro): useProStatus hook`, `feat(pro): ProGate component`, `feat(pro): wrap Pro features with gate`, `feat(pro): expiry cron`
- One PR
```

---

<a name="phase-i"></a>
## 🅸 PHASE I — Waitlist Lifecycle & 48h Cloud Function

**Estimated effort:** 2 days
**Branch:** `feat/phase-i-waitlist-expiry`
**Files affected:**
- `functions/src/expireWaitlistOffers.ts` (new)
- `functions/src/index.ts` (additive export)
- `src/lib/services/waitlistService.ts` (extend — already exists)
- `src/app/dashboard/organizer/events/[id]/capacity/page.tsx` (modify in-place)
- Email template (Resend)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS /dashboard/organizer/events/[id]/capacity/page.tsx has CapacityCard + WaitlistTable visible. waitlistService.ts already exists with basic CRUD. Schema: /events/{eventId}/waitlist/{entryId} with fields: applicantUid, applicantName, applicantEmail, committeeId, position, notifiedAt, status ("waiting"|"offered"|"accepted"|"expired"). Currently "Offer Seat" button sets status="offered" and notifiedAt, but nothing auto-expires after 48h.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE the existing CapacityCard and WaitlistTable component designs.
3. PRESERVE the existing "Add Seats" reactivation flow.
4. DO NOT touch any other Cloud Function (processAnnouncement, assignmentDeadlineCheck, generateBulkIdCards).

TASK:
Complete the waitlist lifecycle — UI exists but 48h offer expiry Cloud Function does not.

WHAT TO BUILD:

1. EXTEND `src/lib/services/waitlistService.ts` (additive — existing functions stay as-is):
   - `acceptOffer(eventId, committeeId, entryId)` — sets status=accepted, creates application doc with status=approved, advances queue (next-in-line position decrements)
   - `declineOffer(eventId, entryId)` — sets status=expired (treated same as timeout), advances queue
   - `expireOffer(eventId, entryId)` — sets status=expired, automatically calls offerSeat on next position
   - `getOfferTimeLeft(entryId)` — utility for countdown display

2. NEW CLOUD FUNCTION `functions/src/expireWaitlistOffers.ts`:
   - Scheduled: every 1 hour
   - Query: `collectionGroup('waitlist')` WHERE `status == "offered"` AND `notifiedAt < (now - 48h)`
   - For each: call expireOffer(), advance queue, log to /auditLogs (Phase D)
   - Send Resend email to next-in-line offer recipient (templated "You've been offered a waitlist seat")

3. EXPORT in `functions/src/index.ts` (additive):
   ```ts
   export { expireWaitlistOffers } from "./expireWaitlistOffers";
   ```

4. NEW DELEGATE-SIDE ENTRY POINT:
   - When delegate has a waitlist offer (subscribe to waitlist sub-collection where applicantUid === currentUser.uid AND status === "offered"):
     * Show banner on /dashboard or /dashboard/conferences/[id]:
       "You've been offered a seat in [Event Name] — [Committee]. Accept by [time remaining countdown]"
     * "Accept" button (calls acceptOffer)
     * "Decline" button (calls declineOffer)

5. EMAIL TEMPLATE in Resend:
   - Subject: "You've been offered a waitlist seat — [Event Name]"
   - Body: event name, committee, country if assigned, 48h deadline, accept link

6. UPDATE WaitlistTable in capacity page (in-place, preserve design):
   - Show current offer status with live countdown timer per row (using setInterval)
   - "Offer Seat" button disabled while existing offer is pending

7. UPDATE CapacityCard (in-place):
   - Display waitlist count alongside filled seats

DO NOT:
- Change the visual CapacityCard / WaitlistTable design
- Modify the existing "Add Seats" reactivation flow
- Touch any other Cloud Function

VERIFY:
- [ ] Offering seat sets 48h timer, sends email
- [ ] After 48h (test by setting notifiedAt to 49h ago), function expires offer and advances queue
- [ ] Delegate accepts → application auto-created as approved, status updates
- [ ] Manual decline by delegate also advances queue
- [ ] Multiple committees handled independently per event
- [ ] Countdown timer updates live in WaitlistTable
- [ ] Banner appears on delegate dashboard when offer pending

GIT:
- Branch: feat/phase-i-waitlist-expiry
- Commit: `feat(waitlist): 48h expiry cron + accept/decline flow`
- One PR
```

---

<a name="phase-j"></a>
## 🅹 PHASE J — Real Stripe Connect + Webhook Integration

**Estimated effort:** 5-6 days
**Branch:** `feat/phase-j-stripe-integration`
**Files affected:**
- `functions/src/createStripeAccount.ts` (new)
- `functions/src/createPaymentIntent.ts` (new)
- `functions/src/stripeWebhook.ts` (new — HTTPS endpoint)
- `functions/src/index.ts` (additive exports)
- `src/lib/services/stripeService.ts` (new)
- `src/app/dashboard/organizer/financials/page.tsx` (modify in-place — same UI, real data)
- `firebase.json` (rewrite to webhook)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS /dashboard/organizer/financials/page.tsx currently derives revenue from approvedCount × $50 hardcoded. "Request Payout" button does nothing (alert + 800ms fake delay). "Connect Stripe Account" button does nothing. Schema docs in plans/organizer-implementation-plan.md outline /events/{eventId}/payments/{paymentId} + organizers/{uid}/wallet.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE all existing UI cards, tier display, payment table, and wallet panel layout — only swap the data source.
3. PRESERVE the existing tier editor in event creation wizard.
4. PRESERVE the existing manual payment registration flow (organizer can still mark a delegate as paid manually).
5. KEEP the mock derivation as a fallback when stripeAccountId is absent (banner: "Mock data — connect Stripe to track real payments").

TASK:
Replace the mock Stripe stub with a real Stripe Connect Express integration including OAuth onboarding, Payment Intents, and webhooks.

WHAT TO BUILD:

1. STRIPE SETUP (manual configuration — not code):
   - Create Stripe Connect platform account in Stripe Dashboard
   - Get publishable key + secret + webhook signing secret
   - Store secrets:
     ```
     firebase functions:config:set stripe.secret=sk_test_... stripe.webhook_secret=whsec_...
     ```

2. NEW Cloud Function `functions/src/createStripeAccount.ts`:
   - HTTPS callable
   - Input: `{ uid }`
   - Creates Stripe Express account via Stripe SDK
   - Returns onboarding URL via `accountLinks.create()`
   - Stores stripeAccountId on `organizers/{uid}` doc

3. NEW Cloud Function `functions/src/createPaymentIntent.ts`:
   - HTTPS callable
   - Input: `{ eventId, applicationId, tierId, amount, currency }`
   - Calculates 7% platform fee
   - Creates PaymentIntent with `transfer_data: { destination: organizerStripeAccountId }`
   - Returns `{ clientSecret }` for Stripe Elements

4. NEW Cloud Function `functions/src/stripeWebhook.ts`:
   - HTTPS endpoint (not callable — raw request)
   - Verifies signature with webhook secret
   - Handles events:
     * `payment_intent.succeeded` → write to /events/{eventId}/payments/{paymentId}, increment organizers/{uid}/wallet.balance
     * `payment_intent.payment_failed` → log + notify
     * `account.updated` → update organizer onboarding status
     * `payout.paid` → log payout completion
   - Idempotent (checks if event already processed)

5. EXPORT in `functions/src/index.ts` (additive — keep existing exports):
   ```ts
   export { createStripeAccount, createPaymentIntent, stripeWebhook } from "./...";
   ```

6. NEW SERVICE `src/lib/services/stripeService.ts`:
   - `connectStripeAccount()` — calls createStripeAccount callable, opens onboarding URL
   - `getPaymentIntent({ eventId, applicationId, tierId, amount })` — calls createPaymentIntent callable
   - `getPayments(eventId)` — reads /events/{eventId}/payments
   - `getWalletBalance(uid)` — reads /organizers/{uid}/wallet
   - `requestPayout(uid, amount)` — calls Stripe Transfer (or queues for admin)

7. UPDATE `/dashboard/organizer/financials/page.tsx` (in-place — same UI):
   - Replace mock revenue calc with real data from /events/{eventId}/payments
   - "Connect Stripe Account" button → calls connectStripeAccount, redirects to Stripe onboarding
   - "Request Payout" → calls requestPayout
   - Show banner if `!organizer.stripeAccountId`: "Mock data — connect Stripe to track real payments"

8. UPDATE applicant payment flow:
   - When delegate clicks "Apply" on a paid event, after application form submit, redirect to a new checkout step
   - Stripe Elements card form
   - On success → application status="pending_payment" → "pending_review" (transition)

9. UPDATE `firebase.json` — add rewrite from `/api/stripe-webhook` to the stripeWebhook Cloud Function

10. MIGRATION SAFETY:
    - Keep the existing "mock" derivation as fallback when stripeAccountId is absent
    - Add banner explaining mock state

DO NOT:
- Remove the existing "Mock Stripe — Phase 7" UI elements until real flow proven end-to-end
- Change the existing tier editor in event creation
- Delete the existing financials Tabs structure (overview / payments / wallet)
- Break the existing manual payment registration flow (organizer can still mark a delegate as paid manually)

VERIFY:
- [ ] Organizer onboards Stripe Express in test mode end-to-end
- [ ] Test payment via Stripe test card (4242 4242 4242 4242) shows webhook firing
- [ ] Payment lands in /events/{id}/payments collection with real status
- [ ] Wallet balance increases by (amount × 0.93) after 7% platform fee
- [ ] Payout request transfers to test bank
- [ ] Refunds reverse wallet correctly
- [ ] 7% platform fee correctly deducted
- [ ] Existing manual payment registration still works
- [ ] Mock fallback banner visible when not connected

GIT:
- Branch: feat/phase-j-stripe-integration
- Commits: `feat(stripe): createStripeAccount + onboarding`, `feat(stripe): PaymentIntent flow`, `feat(stripe): webhook handler`, `feat(financials): wire real Stripe data`
- One PR
```

---

<a name="phase-k"></a>
## 🅺 PHASE K — LLM-Based Country Assignment

**Estimated effort:** 3-4 days
**Branch:** `feat/phase-k-llm-country-assignment`
**Files affected:**
- `functions/src/llmCountryAssignment.ts` (new)
- `functions/src/index.ts` (additive)
- `src/lib/services/aiAssignmentService.ts` (additive — heuristic stays)
- `src/app/dashboard/organizer/events/[id]/countries/page.tsx` (in-place modify)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS aiAssignmentService.ts currently uses a heuristic for country assignment: try primary → secondary → any free. conflictService.ts already exists. AI assignment is gated as a Pro feature (Phase H).

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE the existing heuristic function — it remains the fallback and free-tier path.
3. PRESERVE the existing /countries page UI — only add LLM mode chip and reasoning display.
4. DO NOT auto-assign without organizer confirmation.
5. DO NOT skip the conflict check — feed past assignments into the prompt.
6. DO NOT hardcode the LLM provider — make it switchable via env config.

TASK:
Upgrade heuristic country assignment to use an LLM (Claude or OpenAI) to evaluate applicant motivation, experience, and choices. Fall back to heuristic on any failure.

WHAT TO BUILD:

1. NEW Cloud Function `functions/src/llmCountryAssignment.ts`:
   - HTTPS callable
   - Input: `{ eventId }`
   - Verify caller is event organizer AND has active Pro status
   - Pulls: event committees + countries + all pending applications
   - For each committee, builds a prompt:
     ```
     You are a Model UN country assignment specialist. Given these applicants:
     [JSON list: { uid, name, role, experience, motivation, choices: { primary, secondary, tertiary }, pastAssignments: [...from conflictService] }]
     
     And these available countries in {committeeName}: [list]
     
     Assign each applicant ONE country, balancing:
     1. Applicant preference (prefer primary > secondary > tertiary > any)
     2. Past assignment diversity (avoid repeat assignments per applicant)
     3. Experience level — give P5/critical countries to experienced delegates
     4. Motivation quality — match applicants with strong motivation to their preferred countries
     
     Return ONLY JSON: { assignments: [{ uid, country, reasoning }] }
     ```
   - Call Anthropic Claude API (or OpenAI) — store API key in `functions.config().llm.api_key`
   - Parse response, validate every country is in the committee's pool
   - Write `assignedCountry` to each application doc
   - On any failure (timeout / invalid JSON / country mismatch), FALL BACK to existing heuristic `aiAssignmentService.suggestCountryAssignments`

2. EXPORT in `functions/src/index.ts` (additive):
   ```ts
   export { llmCountryAssignment } from "./llmCountryAssignment";
   ```

3. UPDATE `src/lib/services/aiAssignmentService.ts` (additive only):
   - KEEP existing `suggestCountryAssignments` heuristic exactly as-is — rename to `heuristicSuggestCountryAssignments` if cleaner, but provide a same-name export alias for backwards compat
   - ADD `llmSuggestCountryAssignments(eventId)` — calls the new Cloud Function
   - ADD `suggestCountryAssignmentsAuto(eventId, useLLM=true)` — tries LLM first, falls back to heuristic
   - The /countries page button "Run AI Assignment" calls `suggestCountryAssignmentsAuto` with `useLLM = isPro`

4. UPDATE `/dashboard/organizer/events/[id]/countries/page.tsx` (in-place):
   - Add chip near AI button: "LLM Mode" (Pro) or "Heuristic Mode" (Free) based on isPro
   - On AI button click, show "Running AI..." spinner (1-30s for LLM)
   - Results Dialog: per-applicant reasoning text from LLM (or "Matched primary choice" from heuristic)
   - Allow manual override of any LLM suggestion before confirming
   - PRESERVE the existing manual assignment Select dropdown

5. AUDIT LOGGING (via Phase D auditService):
   - Log each LLM call with action="ai_country_assignment_llm", details={ promptPreview, responsePreview, tokenCost }
   - Track token usage cost per call in new collection /llmCostLogs

DO NOT:
- Remove the heuristic function — it's the fallback and the free-tier path
- Auto-assign without organizer confirmation (always show suggestions Dialog first)
- Skip the conflict check — feed past assignments into the prompt
- Hardcode the LLM provider — make it switchable via env config

VERIFY:
- [ ] Pro organizer clicks AI button → real LLM call → reasoning shown per applicant
- [ ] Non-Pro organizer falls through to heuristic (no LLM cost)
- [ ] LLM failure (e.g., invalid JSON) gracefully degrades to heuristic
- [ ] All assignments still respect committee country pools
- [ ] Past assignment conflicts surfaced in reasoning text
- [ ] Token cost logged in /llmCostLogs
- [ ] Existing manual assignment dropdown unchanged

GIT:
- Branch: feat/phase-k-llm-country-assignment
- Commits: `feat(ai): LLM country assignment Cloud Function`, `feat(ai): auto fallback to heuristic`, `feat(ai): UI mode chip + reasoning display`
- One PR
```

---

<a name="phase-l"></a>
## 🅻 PHASE L — Mobile Responsive QA Pass & Polish

**Estimated effort:** 3-4 days
**Branch:** `feat/phase-l-mobile-responsive`
**Files affected:** WIDE — all organizer sub-pages with tables, conferences/[id] tabs, admin dashboard tables, chair committee page

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS has many heavy tables (Applications, Country Assignments, Audit Logs, Payments) that get cramped on mobile (<640px) and tablet (640-1024px) viewports. Hero text doesn't scale down. Drag-and-drop on /partners is unusable on touch.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE all desktop layouts — wrap mobile fixes in responsive utilities, don't replace.
3. DO NOT change any business logic.
4. DO NOT remove the desktop sidebar nav for organizer dashboard.
5. DO NOT modify any color palette.

TASK:
Audit every dashboard page on mobile (≤640px) and tablet (640-1024px) viewports. Fix cramped tables, scaling issues, and touch interaction problems.

WHAT TO BUILD:

1. TABLES → MOBILE CARDS:
   - For every table in the app (Applications, Country Assignments, Audit Logs, Payments, Waitlist, Users, Events), wrap with responsive switch:
     * `<div className="hidden md:block">` → existing table
     * `<div className="block md:hidden space-y-3">` → card view with key fields
   - Use `useMediaQuery` hook where state-driven needed
   - Card layout: title row + 2-3 stat rows + action buttons full-width

2. HORIZONTAL SCROLL FOR TABLES THAT CAN'T BECOME CARDS:
   - Wrap with `<div className="overflow-x-auto">` for compatibility
   - Add scroll shadow indicator (gradient on edges)

3. HERO + LONG CARD PADDING:
   - Hero text in /events/[id] and /: `text-4xl md:text-5xl lg:text-6xl` → `text-2xl sm:text-3xl md:text-5xl`
   - Long detail pages (Event Detail, Conference Portal): `py-20` → `py-10 md:py-20`

4. TOUCH FIXES:
   - Drag-and-drop on /partners: provide arrow-up/arrow-down button alternatives on touch devices (detect via `'ontouchstart' in window`)
   - File upload inputs: `h-12` minimum

5. DIALOG / SHEET FULL-SCREEN ON MOBILE:
   - For Dialog content with form, use `className="max-w-full md:max-w-2xl h-full md:h-auto"` so mobile gets full-screen modal

6. SIDEBAR NAV:
   - Organizer dashboard sidebar collapses to icon-only on tablet (`md:w-16 lg:w-64`)
   - Hamburger nav on mobile (use Sheet component already in UI library)
   - PRESERVE desktop sidebar exactly as-is at `lg:` breakpoint

7. EMPTY STATES & SKELETONS:
   - Verify every loading state has a skeleton — add if missing
   - Verify every empty state has centered icon + label

8. TEST DEVICES:
   - Chrome DevTools toolbar: iPhone 12, iPhone SE, Pixel 5, iPad Mini
   - Safari iOS simulator if Mac available
   - Capture before/after screenshots per route

PAGES TO AUDIT (minimum list):
- /dashboard
- /dashboard/profile
- /dashboard/conferences/[id]
- /dashboard/admin (and all admin sub-pages)
- /dashboard/chair/committee/[id]
- /dashboard/organizer (and all sub-pages including events/[id]/*)
- /events, /events/[id]
- /articles, /articles/[id]
- /login, /signup, /forgot-password, /onboarding

DO NOT:
- Remove desktop layouts — wrap mobile fixes in `md:` reverse modifiers
- Change any business logic
- Remove the desktop sidebar nav for organizer dashboard (just collapse to icon-only on tablet, hamburger on mobile)
- Modify any color palette

VERIFY (checklist per page):
- [ ] Renders without horizontal scroll at 375px width
- [ ] All tables either show cards or scroll cleanly with shadow indicators
- [ ] No text touches viewport edges
- [ ] All tap targets ≥ 44px height
- [ ] Modals/Dialogs full-screen on mobile
- [ ] Sticky tab navs work without overflow
- [ ] Existing desktop UX is visually identical (compare before/after screenshots)

GIT:
- Branch: feat/phase-l-mobile-responsive
- Commits: per-page or per-section, e.g. `fix(mobile): admin tables to cards on small screens`, `fix(mobile): hero text scaling`, etc.
- One PR
```

---

<a name="phase-m"></a>
## 🅼 PHASE M — Optional Modules Hardening + Organizer Editor

**Estimated effort:** 3-4 days
**Branch:** `feat/phase-m-optional-modules-editor`
**Files affected:**
- `src/app/dashboard/organizer/events/[id]/modules/page.tsx` (new)
- `src/app/dashboard/organizer/events/create/page.tsx` (Settings tab extension)
- `src/lib/services/optionalModulesService.ts` (additive write functions)
- `firestore.rules` (additive)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS optional modules — Food Coupons, Transport, Accommodation, Live MUN, Dress Code — have delegate-side viewers fully built. But the organizer-side configuration / content editor is missing. The Settings tab in event creation has only a "Live MUN" toggle. The full `optionalModules` array exists on EventData but no UI lets the organizer toggle individual modules or seed their content.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE the existing delegate-side module components: FoodCouponsModule, TransportModule, AccommodationModule, LiveMUNModule, DressCodeModule.
3. PRESERVE the existing read functions in optionalModulesService.ts.
4. Don't hide modules that aren't enabled — they should simply not have a tab.
5. DO NOT change the existing schema of FoodSlot, TransportRoute, AccommodationBlock, LiveSession interfaces — only ADD fields.

TASK:
Build the organizer-side panels for each of the 5 optional modules (currently only readable, not writable). Wire enable/disable toggles into event creation Settings tab.

WHAT TO BUILD:

1. EXTEND `src/app/dashboard/organizer/events/create/page.tsx` Settings tab:
   - Add "Optional Modules" section with 5 toggle switches:
     * Food Coupons
     * Transport
     * Accommodation
     * Live MUN (Pro feature — disabled if !isPro, wrap in <ProGate>)
     * Dress Code
   - Each saves to `event.optionalModules` array (e.g., `["food", "transport"]`)
   - PRESERVE the existing "Live MUN" toggle behavior — just generalize the storage

2. NEW HUB PAGE `src/app/dashboard/organizer/events/[id]/modules/page.tsx`:
   - Linked from the organizer event hub navigation (add tab/link to the existing layout.tsx)
   - Tabs: Food | Transport | Accommodation | Live MUN | Dress Code
   - Only tabs for enabled modules are visible
   - Per-tab editors (cards in tab content):

     **Food Tab:**
     * Add slots: meal name, date, time window, capacity per slot
     * List of registered delegates per slot
     * Export to CSV button

     **Transport Tab:**
     * Add routes: departure point, arrival point, schedule, capacity
     * Registered delegates per route
     * Notes field

     **Accommodation Tab:**
     * Add blocks: hotel name, room type, capacity, price, check-in/out
     * Pending accommodation requests with approve/reject
     * Roommate matching display

     **Live MUN Tab (Pro):**
     * Add session: committee, day, stream URL, status (scheduled / live / ended)
     * "Go Live" toggle
     * Auto-update via existing subscribeLiveSessions

     **Dress Code Tab:**
     * Rich text editor for general guidelines
     * Per-day dress code (formal / business casual / cultural)
     * Image uploads for examples (to existing Storage)
     * Saves to `event.dressCode` field (new optional field on EventData)

3. EXTEND `src/lib/services/optionalModulesService.ts` (additive — keep all existing reads):
   - `addFoodSlot(eventId, slot)`, `updateFoodSlot(...)`, `deleteFoodSlot(...)`
   - `addTransportRoute(...)`, `updateTransportRoute(...)`, `deleteTransportRoute(...)`
   - `addAccommodationBlock(...)`, `updateAccommodationBlock(...)`, `approveAccommodationRequest(...)`
   - `addLiveSession(...)`, `updateLiveSession(...)` (with live status toggle)
   - `saveDressCode(eventId, dressCode)`

4. UPDATE `firestore.rules` (additive):
   - Allow organizer of event to write to all module sub-collections:
     - /events/{eventId}/foodSlots/{slotId}
     - /events/{eventId}/transportRoutes/{routeId}
     - /events/{eventId}/accommodationBlocks/{blockId}
     - /events/{eventId}/liveSessions/{sessionId}

5. DELEGATE-SIDE VERIFY:
   - Confirm `/dashboard/conferences/[id]` tabs only show modules that are in `event.optionalModules` array (already implemented; verify with new content)
   - Confirm `DressCodeModule` reads from `event.dressCode` (new field)

DO NOT:
- Remove or modify any delegate-side module component
- Hide modules that aren't enabled — they should simply not have a tab
- Change the existing schema of FoodSlot, TransportRoute, AccommodationBlock, LiveSession interfaces (only ADD fields)

VERIFY:
- [ ] Organizer enables food + transport → only those tabs appear in modules hub
- [ ] Adding food slots persists and shows on delegate side immediately
- [ ] Pro gate enforced on Live MUN tab in organizer panel
- [ ] Live MUN session goes live → delegate sees status badge update in real-time
- [ ] Existing delegate viewers display new content correctly
- [ ] Mobile 375px: module tabs scroll horizontally without breaking

GIT:
- Branch: feat/phase-m-optional-modules-editor
- Commits: `feat(modules): organizer enable/disable toggles in Settings`, `feat(modules): organizer module hub page`, `feat(modules): write functions for each module type`
- One PR
```

---

<a name="phase-n"></a>
## 🅽 PHASE N — Performance, Indexes, Error Boundaries & E2E Tests

**Estimated effort:** 3-4 days
**Branch:** `feat/phase-n-performance-tests`
**Files affected:**
- `firestore.indexes.json` (additive)
- `next.config.js`
- Various service files (memoization, dynamic imports)
- `src/components/ErrorBoundary.tsx` (new)
- `e2e/` directory (new)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS has no error boundaries — one Firebase error crashes the whole route. No automated tests exist. firestore.indexes.json was added May 16 but may be missing indexes for queries added in newer features (waitlist, complaints, audit logs).

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE existing onSnapshot listeners — do NOT replace working hooks with React Query.
3. PRESERVE existing error handling — only add boundaries on top.
4. DO NOT wrap every component in memo — only the proven hot spots.
5. DO NOT add Sentry/observability without env-var gating (so local dev doesn't ping production logs).

TASK:
Final pass to make the app production-ready. Add error boundaries, missing Firestore indexes, performance optimizations, and a basic E2E test suite.

WHAT TO BUILD:

1. ERROR BOUNDARIES:
   - NEW `src/components/ErrorBoundary.tsx` — React class component with `componentDidCatch`
   - Logs to Firestore `/errorLogs` collection: `{ message, stack, route, userUid, userAgent, timestamp }`
   - Optional Sentry integration gated by `process.env.NEXT_PUBLIC_SENTRY_DSN`
   - Wrap each major route group:
     * `/dashboard/layout.tsx` (or top-level dashboard wrapper)
     * `/dashboard/organizer/events/[id]/layout.tsx`
     * `/dashboard/conferences/[id]/page.tsx`
     * `/dashboard/chair/committee/[id]/page.tsx`
   - Fallback UI: glass-card with "Something went wrong" + "Reload Page" button + chat support link

2. FIRESTORE INDEXES — audit and add missing composite indexes:
   - Run all queries in services through `firebase emulators:start` and capture missing-index errors
   - Add composite indexes for:
     * conversations: `participants` (array-contains) + `lastMessageAt` desc
     * applications: `eventId` + `status` + `createdAt` desc
     * markings: `eventId` + `committeeId` + `dateStr`
     * complaints: `assignedTo` + `status`, AND `userId` + `createdAt` desc
     * waitlist (collectionGroup): `status` + `notifiedAt`
     * auditLogs: `actorUid` + `timestamp` desc, AND `action` + `timestamp` desc
     * activities: `userId` + `createdAt` desc
   - Deploy with `firebase deploy --only firestore:indexes`

3. PERFORMANCE:
   - Lazy-load heavy components via `next/dynamic`:
     * `ApplicationWizard` (large multi-step form)
     * `CertificateDownload` (heavy preview render)
     * `AnnouncementComposer` (potentially Tiptap)
     * `PositionPaperViewer` (PDF iframe)
     * Modal/Dialog content not immediately needed
   - `React.memo` for proven hot spots only:
     * `EventBrowseCard`
     * `ConferenceCard`
     * `ChatSidebar` message rows
   - Add `useCallback` for event handlers passed deep into trees
   - Replace any `<img>` with Next.js `<Image>` (width/height required); add blur placeholder for cover photos

4. CACHING:
   - Add `revalidate: 60` to /events page (public, server-rendered)
   - Where appropriate, use SWR for client-side fetches that re-fetch on focus

5. CLOUD FUNCTION EFFICIENCY:
   - Verify announcement emails batch to 100 at a time
   - Add retry logic with exponential backoff for Resend failures
   - Audit Function logs for cold starts; consider min instances if pricing allows

6. SENTRY / MONITORING (optional but recommended):
   - Wire up Sentry in next.config.js + functions
   - Gate with `process.env.NEXT_PUBLIC_SENTRY_DSN` so local dev doesn't ping
   - Capture errors in Cloud Functions via `Sentry.init`

7. E2E TESTS with Playwright:
   - Set up Playwright: `npm i -D @playwright/test`, init config in `e2e/playwright.config.ts`
   - Run against Firebase Emulator Suite
   - Tests:
     * Auth: signup with email → onboarding → dashboard
     * Delegate flow: apply to event → status pending → see in My Conferences
     * Organizer: create event → publish → see in /events
     * Chair: grade delegate → delegate sees result
     * Admin: change user role → audit log entry created (Phase D)
   - Add `npm run test:e2e` script

8. ACCESSIBILITY (a11y):
   - Run axe-core on each route (in dev tools)
   - Fix any missing alt text on images
   - Ensure form labels are associated with inputs (`htmlFor`)
   - Verify focus rings on all interactive elements
   - Keyboard-only nav through application wizard works

DO NOT:
- Replace working hooks with React Query if existing onSnapshot listeners work fine
- Wrap every component in memo (only proven hot spots)
- Add Sentry/observability without env-var gating
- Remove existing error handling — only add boundaries on top

VERIFY:
- [ ] Error boundaries catch a simulated `throw new Error("test")` without crashing the whole app
- [ ] Lighthouse score > 85 on /dashboard
- [ ] Firestore emulator runs with no missing-index errors during test suite
- [ ] All Playwright E2E tests pass in CI
- [ ] Bundle size analysis shows lazy-loaded chunks for heavy components
- [ ] No accessibility errors from axe-core on key routes

GIT:
- Branch: feat/phase-n-performance-tests
- Commits: `feat(infra): error boundaries`, `feat(infra): firestore composite indexes`, `perf: lazy load heavy components`, `chore(test): Playwright E2E suite`, `feat(a11y): fixes from axe-core`
- Possibly multiple PRs (split if large)
```

---

<a name="phase-o"></a>
## 🅾 PHASE O — Email Notification Triggers (Bonus / fills a gap)

**Estimated effort:** 2-3 days
**Branch:** `feat/phase-o-email-notifications`
**Files affected:**
- `functions/src/emailNotifications.ts` (new — Firestore triggers)
- `functions/src/emailTemplates/` (new directory with templates)
- `functions/src/index.ts` (additive exports)
- `src/app/dashboard/settings/page.tsx` (verify notification toggles already wired)

### 📝 VIBE CODING PROMPT (copy this whole block):

```
PROJECT CONTEXT:
MUN SaaS has Resend integrated only for announcement emails (processAnnouncement Cloud Function). Many other lifecycle events should trigger emails: application approved, country assigned, waitlist offer, payment success, certificate unlocked, complaint received, complaint escalated. User profile has notification preference toggles in /dashboard/settings.

GLOBAL PROJECT RULES:
1. DO NOT delete or break any existing feature.
2. PRESERVE the existing processAnnouncement Cloud Function.
3. RESPECT user notification preferences from /dashboard/settings (emailOnApproval, emailOnRejection, emailOnNewEvent, etc.).
4. Backwards-compatible — new emails are gated by feature flag.

TASK:
Add Firestore-trigger Cloud Functions that send transactional emails via Resend for key lifecycle events, respecting user notification preferences.

WHAT TO BUILD:

1. NEW DIRECTORY `functions/src/emailTemplates/`:
   - One template file per event type, each exporting `{ subject, html, text }`
   - Templates needed:
     * `applicationApproved.ts`
     * `applicationRejected.ts`
     * `countryAssigned.ts`
     * `waitlistOffer.ts` (used by Phase I)
     * `paymentSuccess.ts` (used by Phase J)
     * `certificateUnlocked.ts` (used by Phase B)
     * `complaintReceived.ts`
     * `complaintEscalated.ts` (used by Phase C)
     * `proExpiringIn7Days.ts` (used by Phase H)
   - Each uses simple HTML with inline styles for max email client compatibility

2. NEW Cloud Function `functions/src/emailNotifications.ts` — Firestore triggers:
   - `onApplicationStatusChange` — triggers on `/applications/{id}` update; sends approved/rejected email if status changed
   - `onCountryAssigned` — triggers on `/applications/{id}` update where `assignedCountry` was just set; sends country email
   - `onComplaintCreate` — triggers on `/complaints/{id}` create; emails assigned chair/organizer
   - `onComplaintEscalate` — triggers on `/complaints/{id}` update where `escalationLevel` increased
   - Each function:
     * Reads recipient's notification preferences from /users/{uid}
     * If preference is OFF → skip
     * Otherwise call Resend with appropriate template
     * Log delivery to /emailLogs

3. EXPORT all in `functions/src/index.ts` (additive):
   ```ts
   export {
     onApplicationStatusChange,
     onCountryAssigned,
     onComplaintCreate,
     onComplaintEscalate
   } from "./emailNotifications";
   ```

4. VERIFY existing /dashboard/settings notification toggles:
   - User can toggle: emailOnApproval, emailOnRejection, emailOnNewEvent, pushNotifications
   - All triggers above respect these flags
   - ADD new toggles if missing: emailOnComplaintUpdate, emailOnCountryAssigned, emailOnWaitlistOffer

DO NOT:
- Send emails to users who have opted out
- Spam — single status change should send exactly one email
- Hardcode user emails — always read from profile

VERIFY:
- [ ] Organizer approves application → delegate gets email (if opted in)
- [ ] Country assigned via manual or AI → delegate gets email
- [ ] Complaint filed → chair receives email
- [ ] Complaint escalated → new assignee receives email
- [ ] Opt-out toggles in settings work (no email sent)
- [ ] /emailLogs has delivery records
- [ ] Resend rate limits respected (batching where needed)

GIT:
- Branch: feat/phase-o-email-notifications
- Commits: `feat(email): templates`, `feat(email): Firestore-triggered notification functions`, `feat(settings): expand notification toggles`
- One PR
```

---

## 8. Sprint Execution Order

Each sprint is roughly a 1-2 week unit; effort sums up to ~5 working weeks total.

### Sprint 1 (week 1-2): Security & Compliance Foundation
- **Phase E** — Storage Rules (1 day)
- **Phase A** — LinkedIn / Facebook OAuth (2 days)
- **Phase D** — Admin Settings + Audit Logs (3 days)

### Sprint 2 (week 2-3): Critical UX Completion
- **Phase B** — Real PDF Certificates (4 days)
- **Phase F** — Position Paper Viewer (3 days)
- **Phase C** — Complaint Hierarchy (5 days)

### Sprint 3 (week 3-4): Feature Polish & Modules
- **Phase M** — Optional Modules Editor (4 days)
- **Phase H** — Pro Gate Enforcement (3 days)
- **Phase I** — Waitlist 48h Function (2 days)
- **Phase O** — Email Notification Triggers (3 days)

### Sprint 4 (week 4-5): Pro Features
- **Phase G** — Faculty + Team Delegation (5 days)
- **Phase K** — LLM Country Assignment (4 days)

### Sprint 5 (week 5-6): Production Readiness
- **Phase J** — Real Stripe Integration (6 days)
- **Phase L** — Mobile Responsive QA (4 days)
- **Phase N** — Performance + Tests (4 days)

---

## 9. Verification Checklist Per PR

Run through this list before merging ANY phase PR:

- [ ] `git status` shows only files relevant to this phase
- [ ] `npm run build` succeeds (no TypeScript errors)
- [ ] `npm run lint` passes (or warnings reviewed)
- [ ] No existing features broken — smoke-test the most important flows:
  - [ ] Sign in (Google + Email + new providers if Phase A)
  - [ ] Browse /events (public)
  - [ ] Submit an application (delegate)
  - [ ] Approve an application (organizer)
  - [ ] Send a message (1-1 chat)
  - [ ] View chair committee page
  - [ ] View admin dashboard (if admin)
- [ ] Mobile width 375px: no horizontal scroll on changed pages
- [ ] Firebase emulator suite: no missing-index errors on new queries
- [ ] firestore.rules / storage.rules — `firebase deploy --only firestore:rules,storage` succeeds in staging
- [ ] Cloud Functions: `firebase deploy --only functions` succeeds and logs are clean
- [ ] Audit logs (post-Phase D): every admin action produces a log entry
- [ ] Documentation: update `plans/draft-progress.md` and `plans/progress-YYYY-MM-DD.md` checkpoint
- [ ] Conventional commit messages on all commits
- [ ] One PR per phase (link to this roadmap in PR description)

---

## End of Roadmap

**Summary:**
- You have ~72-78% of the platform built.
- 14 phases (A-N) plus bonus Phase O cover everything remaining.
- Every prompt is copy-paste-ready, restates preservation rules, and includes verification criteria.
- Estimated total effort: ~5 working weeks across 5 sprints.
- Throughout: **DO NOT DELETE OR BREAK ANY EXISTING FEATURE.** Every change is additive.

Good luck vibe coding. 🚀
