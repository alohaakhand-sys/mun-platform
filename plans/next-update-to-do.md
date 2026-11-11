# MUN Platform (SaaS) — Complete Deep Scan & Vibe Coding Roadmap

> **Date generated:** May 17, 2026
> **Project:** Model UN SaaS Platform
> **Stack:** Next.js (App Router) + Tailwind v4 + Shadcn/Base UI + Firebase (Auth/Firestore/Storage/RTDB) + Cloud Functions (Resend, @react-pdf/renderer)
> **Current completion:** ~72-78% (last documented: 72% on May 16, 2026; several Phase 4 items were actually built since)

---

## 1. EXECUTIVE SUMMARY OF CURRENT STATE

### Overall Health Snapshot

| Phase | Name | Done % | Status |
|-------|------|--------|--------|
| 1 | Initialization & Foundation | **95%** | ✅ Solid — only LinkedIn/Facebook OAuth missing |
| 2 | Public & Auth Modules | **95%** | ✅ Solid — only LinkedIn/Facebook OAuth missing |
| 3 | Core Dashboards & Discovery | **95%** | ✅ Strong — real-time messaging, presence, follow/block, read receipts all live |
| 4 | Delegate Flow | **80-85%** | ⚠️ Mostly built — optional modules exist in code (food/transport/accom/dresscode/livemun), room notifs exist, study guide upload+viewer exist, announcement viewer exists. Remaining: full complaint hierarchy escalation, Faculty Advisor/Team Delegation distinct flows |
| 5 | Organizer & Chair Workflows | **85%** | ⚠️ Comprehensive — event creation/edit, financials, Pro membership, chair tools, daily marking, AI assignment (heuristic), real announcement emails, bulk ID cards. Remaining: position paper viewer for chairs (partial), waitlist 48h Cloud Function |
| 6 | Post-Event & Admin | **55%** | ⚠️ Half done — admin dashboard, security rules, organizer approvals ✅. Missing: real PDF certs, Storage rules, System Settings, Audit Logs, responsive QA |
| 7 | Future Refinements | **0%** | ❌ Not started — real Stripe, LLM country assignment |

### Tech Inventory Confirmed in Project

**Frontend:**
- Next.js 15+ (App Router, async `cookies()`, server components split)
- Tailwind v4 with OKLCH theme + dark mode in `globals.css`
- Shadcn-style UI built on **Base UI** (not Radix) — uses `render` prop pattern instead of `asChild`
- Framer Motion for transitions
- Lucide icons (with inline SVG fallbacks for removed brand icons)

**Backend:**
- Firebase Auth (Google + Email/Password wired)
- Firestore (collections: `users`, `events`, `articles`, `applications`, `conversations`, `messages`, `complaints`, `activities`, `markings`, `proApplications`, `organizerApplications`)
- Firebase Storage (`studyGuides/{eventId}/{committee}/`, `events/{eventId}/cover.jpg`, position papers)
- Firebase RTDB (presence service)
- Cloud Functions (in `functions/` directory): `processAnnouncement` (Resend), `assignmentDeadlineCheck` (cron), `generateBulkIdCards` (@react-pdf/renderer)

**Confirmed Folder Structure:**
```
src/
├── app/
│   ├── (public routes: /, /events, /articles, /login, /signup, /forgot-password)
│   ├── onboarding/page.tsx
│   ├── dashboard/
│   │   ├── page.tsx (server) + DashboardClient.tsx
│   │   ├── profile/page.tsx
│   │   ├── conferences/[id]/page.tsx (Documents/Announcements/Schedule/Complaints/Optional Modules/Cert/Results tabs)
│   │   ├── admin/page.tsx
│   │   ├── chair/committee/[id]/page.tsx
│   │   └── organizer/
│   │       ├── events/create/page.tsx (with ?edit=eventId mode)
│   │       ├── events/[id]/ (layout.tsx + page.tsx + sub-pages: applications, committees, countries, schedule, staff, capacity, announcements, partners, tools/{id-cards,certificates,theme,results})
│   │       ├── financials/page.tsx
│   │       ├── apply/page.tsx (Pro membership)
│   │       └── pro/page.tsx
│   └── api/auth/session/route.ts
├── components/
│   ├── ui/ (button, card, input, label, dialog, dropdown, select, tabs, sheet, skeleton, badge, avatar, checkbox, switch, radio-group, tooltip, textarea, carousel, progress)
│   ├── dashboard/ (ActivityFeed, ChatSidebar, ChatWindow, ConferenceCard, EventBrowseCard, wizard/ApplicationWizard)
│   └── features/
│       ├── delegate/ (PositionPaperUpload, StudyGuideViewer, ComplaintSystem, ScheduleViewer, CertificateDownload, RoomNotifications, AnnouncementViewer, modules/{FoodCouponsModule,TransportModule,AccommodationModule,DressCodeModule,LiveMUNModule})
│       └── organizer/ (CountryAssignmentRow, CapacityCard, WaitlistTable, StaffInviteModal, PermissionsEditor, PartnerCard, TierStatusCard, etc.)
├── contexts/AuthContext.tsx
├── lib/
│   ├── firebase/{client,admin}.ts
│   └── services/ (applicationService, eventService, userService, messageService, activityService, presenceService, connectionService, conflictService, markingService, optionalModulesService, roomNotificationService, aiAssignmentService)
functions/
├── src/{index, processAnnouncement, assignmentDeadlineCheck, generateBulkIdCards}.ts(x)
firestore.rules (hardened)
firestore.indexes.json
```

---

## 2. CRITICAL REMAINING GAPS (Master Checklist)

### 🔴 HIGH PRIORITY (User-Visible / Blocking)
- [ ] **Real PDF Certificate Generation** — currently just `window.print()`; need `@react-pdf/renderer` Cloud Function or `pdfme` client-side
- [ ] **Firebase Storage Security Rules** — `storage.rules` file missing; position papers, cover photos, study guides currently open by default
- [ ] **Full Complaint Escalation Engine** — Chair → Organizer → Main Organizer → App Admin with auto-routing, SLA timers, notifications
- [ ] **Admin "System Settings" Page** — button exists but route returns 404
- [ ] **Admin "Audit Logs" Page** — button exists but route returns 404
- [ ] **Position Paper Inline Viewer for Chairs** — currently just Sheet with download link; need in-browser PDF viewer with comment/grade-from-doc workflow

### 🟡 MEDIUM PRIORITY (Feature Completion)
- [ ] **LinkedIn + Facebook OAuth providers** — only Google + Email/Password wired
- [ ] **Faculty Advisor / Team Delegation distinct flows** — currently just string values in role field
- [ ] **Waitlist 48h Cloud Function** — `expireOffers` scheduled function not yet created
- [ ] **Stripe Connect Express onboarding** — UI hooks exist, real OAuth + webhook missing
- [ ] **Pro Gate consistent enforcement** — `ProGate` HOC inconsistent across Pro-only features (Live MUN, AI assignment, >50 recipient bulk emails, advanced cert templates, custom themes)
- [ ] **Email notification triggers** — Resend integrated for announcements only; need triggers for: application approved, country assigned, waitlist offer, payment success, certificate unlocked, complaint received/escalated
- [ ] **Responsive QA pass** — organizer event sub-pages with long tables cramped on mobile

### 🟢 LOW PRIORITY (Future / Phase 7)
- [ ] **Real Stripe Payment Intent + Webhook** — currently dummy revenue calc (approvedCount × $50)
- [ ] **LLM-Based Country Assignment** — currently heuristic only (primary → secondary → any free); needs Claude/OpenAI API call with applicant context

### 🐛 KNOWN BUGS / TECHNICAL DEBT
- [ ] Some `Base UI render` patterns still inconsistent — verify all `<Button render={<Link/>}>` usages have `nativeButton={false}`
- [ ] `applicationService.ts` returns `ApplicationData` without `id` typed (uses `as unknown as ApplicationData`) — clean up types
- [ ] `Marking` interface uses `Record<string, number>` for scores but some chair UI still references hardcoded keys
- [ ] `optionalModules` array stored on events, read in conferences/[id] page, but no editor UI to enable/disable them per-event in the create/edit flow (settings tab has only a "Live MUN" toggle)
- [ ] `Announcement` deliveryStats field not surfaced anywhere in admin oversight
- [ ] `firestore.indexes.json` may be missing indexes for new queries added in May 16 push — verify with `firebase deploy --only firestore:indexes`
- [ ] Auto-follow `autoFollowParticipants()` runs on application approval — verify it doesn't double-create connections if approved twice (idempotency check)
- [ ] Edit-event mode doesn't validate capacity reduction below `filledSeats` in all committees — partial check exists, may miss waitlisted seats

---

## 3. DEVELOPMENT PHASE PROMPTS FOR VIBE CODING

> **GLOBAL RULE FOR EVERY PROMPT BELOW:** Do NOT delete or break any existing feature. Every change is additive or refactors-in-place. Before starting any phase, run `git status` to confirm a clean working tree, then create a feature branch. Preserve every existing route, service function, component export, Firestore collection field, and security rule. If you need to change a schema, write a backwards-compatible migration that keeps old fields readable.

---

### 🅰️ PHASE A — Authentication Completion (LinkedIn + Facebook OAuth)

**Estimated effort:** 2 days
**Files affected:** `src/contexts/AuthContext.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`, Firebase Console config

**📝 VIBE CODING PROMPT:**

```
TASK: Add LinkedIn and Facebook OAuth providers to the existing Firebase Auth flow without touching any working Google/Email auth code.

CONTEXT:
- AuthContext.tsx currently exports `signInWithGoogle()`. Email/Password flows are handled directly in /login/page.tsx and /signup/page.tsx via Firebase modular SDK.
- Session cookie is synced via POST /api/auth/session after every successful sign-in. PRESERVE this flow exactly.
- The plan in plans/project.md lists Google + LinkedIn + Facebook + Email/Password as required providers.

WHAT TO BUILD:
1. In AuthContext.tsx, ADD two new exported functions ALONGSIDE signInWithGoogle:
   - `signInWithFacebook()` using `FacebookAuthProvider` from firebase/auth
   - `signInWithLinkedIn()` using OIDCProvider with providerId "oidc.linkedin" (LinkedIn requires custom OIDC config, NOT a built-in Firebase provider)
   - Both must call the same session cookie sync POST /api/auth/session pattern after popup success
   - Both must call fetchProfile(uid) after auth to populate the profile state
2. In src/app/login/page.tsx and src/app/signup/page.tsx, ADD two new buttons below the existing Google button:
   - "Continue with Facebook" — use the brand-blue color from existing globals.css palette, include inline Facebook SVG (do NOT import from lucide-react — it was removed)
   - "Continue with LinkedIn" — use brand-blue, include inline LinkedIn SVG
   - Both buttons share the same error-handling, loading-spinner, and post-success router.push behavior as the Google button
3. Add a comment block at the top of AuthContext.tsx documenting the LinkedIn OIDC setup requirement (LinkedIn app + provider config in Firebase Console with custom claims)

DO NOT:
- Modify signInWithGoogle() or any existing email/password handler
- Change the AuthContext signature shape — only add new properties
- Remove the existing "Continue with Google" button or change its placement
- Modify /api/auth/session/route.ts

VERIFY:
- Existing Google sign-in flow still works end-to-end (popup → cookie sync → /dashboard redirect)
- Existing email/password flow still works
- New Facebook/LinkedIn buttons render with correct branding
- Browser console shows no Firebase config errors
- Test that user profile creation still happens for new OAuth signups
```

---

### 🅱️ PHASE B — Real PDF Certificate Generation Engine

**Estimated effort:** 3-4 days
**Files affected:** `functions/src/generateCertificate.tsx` (new), `functions/src/index.ts`, `src/components/features/delegate/CertificateDownload.tsx`, `src/lib/services/certificateService.ts` (new), `firestore.rules`

**📝 VIBE CODING PROMPT:**

```
TASK: Replace the window.print() certificate flow with a real server-side PDF generation pipeline using @react-pdf/renderer Cloud Function. PRESERVE the existing certificate preview UI and templates entirely.

CONTEXT:
- src/components/features/delegate/CertificateDownload.tsx currently renders an HTML certificate preview with a "Print Certificate" button (window.print()) and a decorative "Download PDF" button that does nothing.
- Certificate templates are configured per event in src/app/dashboard/organizer/events/[id]/tools/certificates/page.tsx (three templates: diploma/modern/ornate, stored in event.certificateTemplate).
- @react-pdf/renderer is already a dependency (used in functions/src/generateBulkIdCards.tsx).
- Award types defined: Best Delegate, Outstanding Delegate, Honorable Mention, Verbal Commendation, Participation.
- Marking awards live in Firestore under markings/{markingId}.award field. Certificate download should unlock only when the organizer approves results (per existing tools/results page).

WHAT TO BUILD:
1. CLOUD FUNCTION at functions/src/generateCertificate.tsx:
   - Triggered onCall (HTTPS callable)
   - Input: { eventId, delegateUid, applicationId }
   - Reads event data, application data, marking award if any, organizer + secretary general names from event.executiveBoard
   - Builds a <Document><Page> using @react-pdf/renderer matching the THREE template styles (port the look from /tools/certificates Card previews — same border/colors/layout)
   - Renders to PDF buffer, uploads to Firebase Storage at `certificates/{eventId}/{applicationId}.pdf`
   - Returns { downloadUrl: string }
   - Add Pro gate: if event has `proStatus === "active"`, allow custom layouts; otherwise force the three base templates
   - On failure, log to a new `certificateGenerationLogs` collection for retry
2. EXPORT from functions/src/index.ts: `export { generateCertificate } from "./generateCertificate"`
3. NEW SERVICE src/lib/services/certificateService.ts:
   - `generateCertificate({ eventId, delegateUid, applicationId })` calls the httpsCallable
   - `getCertificateUrl(eventId, applicationId)` reads Storage URL if already generated
4. MODIFY src/components/features/delegate/CertificateDownload.tsx (DO NOT REMOVE the HTML preview):
   - Keep the entire existing HTML certificate preview render (it serves as the visual preview)
   - Replace the broken "Download PDF" button onClick to call certificateService.generateCertificate()
   - Show a loading spinner during generation (typical 3-10s)
   - On success, programmatically open the returned downloadUrl in a new tab
   - Cache the URL in component state so re-clicks don't regenerate
   - Keep "Print Certificate" button as a fallback (it still uses window.print() for the HTML preview)
5. UPDATE firestore.rules to allow read on certificateGenerationLogs only for admin
6. UPDATE storage.rules (create file if missing — see Phase E) to allow read on certificates/{eventId}/{filename} for the application owner only

DO NOT:
- Remove the existing HTML preview render (it's the visual confirmation)
- Change the certificate template selection UI in /tools/certificates
- Modify the existing award assignment flow in chair pages
- Break the print flow

VERIFY:
- Delegate sees the same HTML preview as before
- Clicking "Download PDF" triggers Cloud Function, returns URL, opens PDF that matches template style
- PDF includes delegate name, conference name, committee, country, role, date, and award if assigned
- Award unlocks only after organizer result approval
- Storage path is correctly secured
```

---

### 🅲️ PHASE C — Complaint System Hierarchy & Escalation Engine

**Estimated effort:** 4-5 days
**Files affected:** `src/components/features/delegate/ComplaintSystem.tsx`, `src/app/dashboard/chair/committee/[id]/page.tsx`, `src/app/dashboard/organizer/events/[id]/complaints/page.tsx` (new), `src/app/dashboard/admin/complaints/page.tsx` (new), `src/lib/services/complaintService.ts` (new), `functions/src/complaintSlaCheck.ts` (new), `functions/src/index.ts`, `firestore.rules`

**📝 VIBE CODING PROMPT:**

```
TASK: Build the full Chair → Organizer → Main Organizer → App Admin escalation flow on top of the existing complaint submission system. PRESERVE the existing delegate-side ComplaintSystem.tsx UI and the chair-side resolve/escalate buttons.

CONTEXT:
- Delegate already files complaints via src/components/features/delegate/ComplaintSystem.tsx. Existing schema has: type, subject, description, status, escalationLevel, assignedRole, history[], resolution, createdAt, assignedTo (uid).
- Chair-side resolveComplaint() and escalateComplaint() partially exist in /chair/committee/[id]/page.tsx but only escalate to organizer (level 1). Need full chain to mainOrganizer (level 2) and appAdmin (level 3).
- Firestore.rules already has /complaints/{id} read/write logic for assigned roles.
- ESCALATION_STEPS const exists in ComplaintSystem.tsx with 4 levels.

WHAT TO BUILD:
1. NEW SERVICE src/lib/services/complaintService.ts:
   - `submitComplaint(data)` — moved from inline ComplaintSystem
   - `escalateComplaint(complaintId, fromLevel, reason)` — handles level transitions:
     * Level 0 (Chair) → Level 1 (Organizer): assignedTo = event.organizerId, assignedRole = "organizer"
     * Level 1 (Organizer) → Level 2 (Main Organizer): if event.mainOrganizerId exists assign to it, else level 3
     * Level 2 (Main Organizer) → Level 3 (App Admin): assignedTo = first user with role "App Admin"
     * Each escalation appends a HistoryEntry with action="escalated", actorRole, message=reason
     * Each escalation sets `escalatedAt: serverTimestamp()`
   - `resolveComplaint(complaintId, resolution)` — sets status to "resolved", appends history entry
   - `rejectComplaint(complaintId, reason)` — sets status to "rejected", appends history
   - `addAddendum(complaintId, message)` — delegate-only, appends history without changing status
2. NEW PAGE src/app/dashboard/organizer/events/[id]/complaints/page.tsx:
   - Lists all complaints for the event where assignedRole = "organizer" OR "mainOrganizer" if user is mainOrganizer
   - Each complaint card shows: delegate name, committee, type, subject, full description, full history timeline
   - Buttons: "Resolve" (textarea + submit), "Escalate to Main Org" (or "to Admin" if no main org), "Reject" (textarea)
   - Filter tabs: Active / Escalated to Me / Resolved
3. NEW PAGE src/app/dashboard/admin/complaints/page.tsx:
   - Lists all complaints with escalationLevel === 3 (admin-assigned)
   - Same resolve/reject UI as organizer page
   - Plus: "View Full Trail" button showing every prior actor and message
4. NEW CLOUD FUNCTION functions/src/complaintSlaCheck.ts:
   - Scheduled function (every 6 hours)
   - Finds complaints where status === "open" or "escalated" AND escalatedAt < 48 hours ago
   - Auto-escalates by calling escalateComplaint server-side with reason "SLA: auto-escalated after 48h inactivity"
   - Sends Resend email notification to the new assignee
5. ADD complaint count badges to:
   - Chair committee page header (next to existing "Open Complaints" if exists)
   - Organizer event hub Overview tab
   - Admin dashboard sidebar
6. UPDATE existing ComplaintSystem.tsx to use the new complaintService.submitComplaint instead of inline addDoc (keep the UI exactly as-is, only swap the submit handler)
7. UPDATE firestore.rules to add: allow read on /complaints/{id} if request.auth.uid matches resource.data.history[*].actorUid (i.e. anyone who acted on it can re-view)

DO NOT:
- Remove the existing 4-step ESCALATION_STEPS visual timeline in delegate's ComplaintSystem
- Remove the existing chair-side resolve/escalate dialog (just route it through new service)
- Change the complaint schema field names (only add fields; don't rename)
- Delete the existing escalation buttons in chair page — replace handlers in-place

VERIFY:
- Delegate files complaint → sees it appear with status="open", assignedRole="chair"
- Chair resolves → delegate sees status="resolved" with resolution text
- Chair escalates → organizer sees it in their /complaints page
- Organizer escalates → main org or admin sees it
- 48h timeout auto-escalates via Cloud Function
- Full history timeline preserved across escalations
- Email notification sent at each escalation step
```

---

### 🅳️ PHASE D — Admin System Settings + Audit Logs Pages

**Estimated effort:** 3 days
**Files affected:** `src/app/dashboard/admin/settings/page.tsx` (new), `src/app/dashboard/admin/audit-logs/page.tsx` (new), `src/lib/services/auditService.ts` (new), `src/lib/services/systemSettingsService.ts` (new), `firestore.rules`, `src/app/dashboard/admin/page.tsx`

**📝 VIBE CODING PROMPT:**

```
TASK: Build the two missing admin pages whose buttons currently dead-link. Wire them up from the existing admin dashboard header. PRESERVE every existing stat card, tab, and table in /dashboard/admin/page.tsx.

CONTEXT:
- src/app/dashboard/admin/page.tsx header has two non-functional buttons: "System Settings" (Settings icon) and "Audit Logs" (ShieldAlert icon). They currently do nothing.
- Admin role check is `profile?.role === "App Admin" || profile.isAdmin === true`.
- Existing admin tabs: stats, users, events, organizer-apps, activities.

WHAT TO BUILD:
1. NEW SERVICE src/lib/services/systemSettingsService.ts:
   - Single document at /systemSettings/global
   - Fields: { platformFeePercent: number (default 7), maxEventCapacity: number (default 5000), allowGuestArticleComments: boolean, maintenanceMode: boolean, maintenanceMessage: string, defaultEventTheme: string, supportEmail: string, termsLastUpdated: timestamp, privacyLastUpdated: timestamp }
   - `getSystemSettings()`, `updateSystemSettings(partial)`

2. NEW PAGE src/app/dashboard/admin/settings/page.tsx:
   - Tabs: General | Pricing | Maintenance | Legal
   - General: editable inputs for supportEmail, defaultEventTheme (dropdown), allowGuestArticleComments (switch)
   - Pricing: editable platformFeePercent (slider 0-15%), maxEventCapacity
   - Maintenance: maintenanceMode switch + maintenanceMessage textarea, "Affects all non-admin users"
   - Legal: paste Terms of Service and Privacy Policy markdown; auto-updates termsLastUpdated/privacyLastUpdated
   - Save button per tab with debounced auto-save indicator
   - Admin-only route guard: redirect to /dashboard if profile.role !== "App Admin"

3. NEW SERVICE src/lib/services/auditService.ts:
   - Collection /auditLogs with fields: { actorUid, actorEmail, actorRole, action, targetType, targetId, targetName, before (json), after (json), timestamp, ip (optional) }
   - `logAudit({ action, targetType, targetId, ... })` — call this from every admin action (user role change, event delete, organizer approve, complaint escalation, system settings change, manual payment registration)
   - `getAuditLogs({ limit, cursor, filterByActor, filterByAction, dateRange })` — paginated query

4. INJECT auditService.logAudit calls at:
   - admin/page.tsx role change handler → action: "role_changed"
   - admin/page.tsx event delete handler → action: "event_deleted"
   - admin/page.tsx organizer application approve/reject → action: "organizer_approved" / "organizer_rejected"
   - complaintService.escalateComplaint when admin acts → action: "complaint_resolved_by_admin"

5. NEW PAGE src/app/dashboard/admin/audit-logs/page.tsx:
   - Table columns: Timestamp | Actor | Action | Target Type | Target Name | Diff (expandable JSON)
   - Filters: actor dropdown, action dropdown, date range picker
   - Pagination 50 rows per page, cursor-based
   - Export CSV button (client-side)
   - Real-time toggle: subscribe to onSnapshot for last 24h

6. UPDATE src/app/dashboard/admin/page.tsx:
   - Replace dead "System Settings" button with `<Button render={<Link href="/dashboard/admin/settings"/>} nativeButton={false} variant="outline" className="gap-2"><Settings className="w-4 h-4"/> System Settings</Button>`
   - Same pattern for "Audit Logs" button → /dashboard/admin/audit-logs

7. UPDATE firestore.rules:
   - /systemSettings/global: read for all signed in, write for admin only
   - /auditLogs/{logId}: read for admin only, write for admin only (logs created server-side via Admin SDK ideally; client write only as fallback)

DO NOT:
- Modify any existing admin dashboard tab content (stats/users/events/organizer-apps stay identical)
- Remove or change the existing "Change Role" / "Delete Event" / "Approve Organizer" handlers — only wrap them with audit.logAudit() calls
- Delete the existing skeleton loaders or layout structure

VERIFY:
- Two header buttons now navigate correctly
- System Settings changes persist and reflect on next page load
- Audit log entries appear for every admin action attempted
- Non-admin users get redirected away from both new pages
- Existing admin functions still work identically
```

---

### 🅴️ PHASE E — Firebase Storage Security Rules

**Estimated effort:** 1 day
**Files affected:** `storage.rules` (new), `firebase.json`

**📝 VIBE CODING PROMPT:**

```
TASK: Create a comprehensive storage.rules file that locks down all Firebase Storage paths to their intended audience. PRESERVE all existing upload/download flows in PositionPaperUpload, study guide upload, cover photo upload, and ID card / certificate generation.

CONTEXT:
- No storage.rules file currently exists in the repo. Default Firebase rules are "open to public" which is a security hole.
- Known storage paths from the codebase:
  * positionPapers/{eventId}/{applicationId}/{filename} — uploaded by delegate
  * studyGuides/{eventId}/{committeeName}/{filename} — uploaded by chair
  * events/{eventId}/cover.jpg or imgBB external URL (cover photos use imgBB, not Storage — verify)
  * events/{eventId}/partners/{partnerId}/logo.png — partner logos
  * idCards/{eventId}/batch_{timestamp}.zip — bulk ID card output
  * certificates/{eventId}/{applicationId}.pdf — new from Phase B
- firebase.json may need a "storage": { "rules": "storage.rules" } block.

WHAT TO BUILD:
1. NEW FILE storage.rules at project root:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    function isSignedIn() { return request.auth != null; }
    function isAdmin() {
      return isSignedIn() && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == "App Admin";
    }
    function isOrganizer(eventId) {
      return isSignedIn() && firestore.get(/databases/(default)/documents/events/$(eventId)).data.organizerId == request.auth.uid;
    }
    function isApplicant(applicationId) {
      return isSignedIn() && firestore.get(/databases/(default)/documents/applications/$(applicationId)).data.userId == request.auth.uid;
    }
    function isChairOfCommittee(eventId, committeeName) {
      return isSignedIn() && 
        firestore.exists(/databases/(default)/documents/applications/$(request.auth.uid + "_" + eventId)) ||
        // Simpler check: user has approved chair-role application for this event+committee
        true; // refine via Firestore query in client + admin enforcement
    }

    // Position Papers — delegate uploads, chair + organizer + delegate read
    match /positionPapers/{eventId}/{applicationId}/{filename} {
      allow read: if isSignedIn() && (isApplicant(applicationId) || isOrganizer(eventId) || isAdmin() || /* chair check */ isSignedIn());
      allow write: if isSignedIn() && isApplicant(applicationId) && request.resource.size < 10 * 1024 * 1024 && request.resource.contentType.matches('application/.*');
      allow delete: if isApplicant(applicationId) || isOrganizer(eventId) || isAdmin();
    }

    // Study Guides — chair upload, all signed-in users read
    match /studyGuides/{eventId}/{committeeName}/{filename} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.resource.size < 20 * 1024 * 1024 && request.resource.contentType == 'application/pdf';
      allow delete: if isOrganizer(eventId) || isAdmin();
    }

    // Event Cover Photos & Partner Logos
    match /events/{eventId}/{path=**} {
      allow read: if true;
      allow write, delete: if isOrganizer(eventId) || isAdmin();
    }

    // ID Cards (generated server-side, organizer downloads)
    match /idCards/{eventId}/{filename} {
      allow read: if isOrganizer(eventId) || isAdmin();
      allow write: if false; // only Cloud Functions write via Admin SDK
      allow delete: if isOrganizer(eventId) || isAdmin();
    }

    // Certificates (generated server-side, applicant downloads)
    match /certificates/{eventId}/{filename} {
      allow read: if isSignedIn(); // refine to applicantOnly using filename pattern check
      allow write: if false; // server-side only
    }

    // Default deny
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

2. UPDATE firebase.json to reference the rules file:
   - Add a top-level "storage" block: { "rules": "storage.rules" }

3. TEST upload flows in dev:
   - Position paper upload still works as a delegate
   - Study guide upload still works as a chair
   - Cover photo upload still works as the event organizer
   - Non-applicants cannot fetch another delegate's position paper URL
   - Non-organizers cannot delete event covers
   - Anonymous users can still view event cover photos and partner logos on the public event page

DO NOT:
- Block public reads on event covers or partner logos (the public /events page needs them)
- Change any client-side upload code in PositionPaperUpload.tsx, chair study guide handler, or ImageUploader.tsx
- Require admin-only access to position papers — chairs must still read them for grading

VERIFY:
- Run `firebase deploy --only storage` in a staging environment
- Confirm all existing upload tests pass
- Try unauthorized download — should 403
- Try oversized upload — should reject at the size cap (10MB papers, 20MB study guides)
```

---

### 🅵 PHASE F — Position Paper Inline Viewer for Chairs

**Estimated effort:** 2-3 days
**Files affected:** `src/components/features/chair/PositionPaperViewer.tsx` (new), `src/app/dashboard/chair/committee/[id]/page.tsx`, `src/lib/services/markingService.ts`

**📝 VIBE CODING PROMPT:**

```
TASK: Build an inline PDF position paper viewer with annotation/grading sidebar for chairs. EXTEND the existing Sheet-based "View All Papers" feature — DO NOT remove the current Sheet listing.

CONTEXT:
- src/app/dashboard/chair/committee/[id]/page.tsx already has a Sheet that lists all submitted position papers with download links and status badges.
- Currently a chair clicks "Download" to open the PDF in a new tab — there's no way to grade the paper inline or leave comments.
- Marking templates exist on EventData as `markingTemplates: { id, name, maxScore }[]` and Marking schema has `scores: Record<string, number>` and a `feedback: string` field.

WHAT TO BUILD:
1. NEW COMPONENT src/components/features/chair/PositionPaperViewer.tsx:
   - Two-column layout: left 70% = PDF iframe / react-pdf viewer; right 30% = grading sidebar
   - Left side: use react-pdf or simple <iframe src={paperUrl}> with zoom controls
   - Right side:
     * Delegate info card (name, country, committee)
     * Score inputs for each marking template (use existing event.markingTemplates)
     * Position Paper-specific score (separate dimension; add `positionPaperScore: number` to Marking schema)
     * Feedback textarea
     * "Save Draft" and "Submit Final" buttons
     * Comment thread (NEW) — chairs can leave timestamped comments visible to other chairs (use a new sub-collection /markings/{markingId}/comments)
2. UPDATE src/app/dashboard/chair/committee/[id]/page.tsx:
   - Keep the existing Sheet "View All Papers" list — it's the entry point
   - When chair clicks a paper row, open the new PositionPaperViewer in a full-screen Dialog (not Sheet) for proper space
   - Add a "Status" toggle in the viewer: Under Review / Approved / Needs Revision / Plagiarism Concern
3. EXTEND src/lib/services/markingService.ts:
   - `savePositionPaperGrade(applicationId, score, feedback, status)` — upserts the positionPaperScore into the marking doc
   - `addPaperComment(markingId, comment)` — adds to /markings/{markingId}/comments sub-collection
   - `getPaperComments(markingId)` — onSnapshot subscription
4. UPDATE Marking interface in markingService.ts (additive):
   - Add optional fields: `positionPaperScore?: number`, `paperStatus?: "review"|"approved"|"revision"|"flagged"`, `paperGradedAt?: Timestamp`
5. DELEGATE-SIDE: Update src/components/features/delegate/PositionPaperUpload.tsx existing "Under review by the Chairs" message — if paperStatus === "approved" show green check, "revision" show yellow + the feedback text from grading.

DO NOT:
- Remove the existing Sheet listing of papers
- Change the chair's existing Daily Marking Matrix
- Modify the position paper upload flow on delegate side (only update the status display)
- Break the existing markingService.submitMarking, saveDailyMarking flows

VERIFY:
- Chair clicks paper row → full-screen viewer opens
- PDF renders in iframe with zoom
- Grade input saves to Marking doc
- Comments save with timestamp + actor
- Delegate sees paper status update on their side
- Existing daily marking matrix unaffected
```

---

### 🅶 PHASE G — Faculty Advisor & Team Delegation Distinct Flows

**Estimated effort:** 4-5 days
**Files affected:** `src/components/dashboard/wizard/ApplicationWizard.tsx`, `src/lib/services/applicationService.ts`, `src/app/dashboard/conferences/[id]/page.tsx`, `src/components/features/delegate/TeamDelegationPanel.tsx` (new), `src/components/features/delegate/FacultyAdvisorPanel.tsx` (new), `firestore.rules`

**📝 VIBE CODING PROMPT:**

```
TASK: Build distinct application flows and dashboard tabs for "Faculty Advisor" and "Team Delegation" roles. Currently these are just string values in the role field with no special behavior. PRESERVE the existing Delegate, Head Delegate, Observer paths.

CONTEXT:
- ApplicationWizard.tsx step 0 currently offers: Delegate / Head Delegate / Observer.
- "Faculty Advisor" and "Team Delegation" are mentioned in plans/project.md as roles but never built.
- Existing ApplicationData has `role: "Delegate" | "Observer" | "Head Delegate" | string`.

WHAT TO BUILD:

1. EXTEND ApplicationWizard.tsx step 0:
   - Add two more cards: "Faculty Advisor" and "Team Delegation Lead"
   - Faculty Advisor description: "Accompany and supervise a delegation from your institution. No country preferences required."
   - Team Delegation description: "Apply as a group of 3-15 delegates from one institution; one application covers all."

2. CONDITIONAL FORM STEPS based on role:
   - If role === "Faculty Advisor":
     * Step 1 (Preferences) is REPLACED with: Institution Name, # Students Accompanying, Faculty Position, Years Teaching MUN
     * Step 2 unchanged (experience + motivation but rephrased to focus on their role as supervisor)
   - If role === "Team Delegation Lead":
     * Step 1 (Preferences) is EXTENDED with: Team Size (3-15), Team Name, optional CSV upload for team member emails + names + countries[3-choice each]
     * Step 2: shared motivation, plus institution-level info

3. EXTEND ApplicationData interface (additive — keep all existing fields):
   - Add optional: `institutionName?: string`, `studentsAccompanying?: number`, `teamSize?: number`, `teamName?: string`, `teamMembers?: { name, email, choices }[]`

4. NEW COMPONENT src/components/features/delegate/FacultyAdvisorPanel.tsx:
   - Renders on /dashboard/conferences/[id] when application.role === "Faculty Advisor"
   - Shows list of delegates from same institution who applied to same event
   - Read-only access to: each delegate's status, committee, country, position paper status, daily marks (aggregate view only)
   - "Send Bulk Message" button — uses existing messageService to create a group conversation with all institution delegates

5. NEW COMPONENT src/components/features/delegate/TeamDelegationPanel.tsx:
   - Renders for team lead role on /dashboard/conferences/[id]
   - Team roster table with status per member, assigned country, payment status
   - "Add Team Member" button (only before event approval deadline) — sends invite emails
   - Aggregate position paper submission tracker (X of N submitted)

6. UPDATE applicationService.ts:
   - `submitTeamApplication(parentAppData, teamMembers[])` — creates 1 parent application + N child applications linked via `teamApplicationParentId` field
   - `submitFacultyApplication(parentAppData)` — uses isFaculty flag, skips country assignment in AI flow

7. UPDATE conferences/[id]/page.tsx to conditionally render the right panel based on role.

8. UPDATE firestore.rules to allow Faculty Advisor read on applications where `applicationData.institutionName == userProfile.institutionName` (institutional scope).

9. UPDATE aiAssignmentService.ts to SKIP applications with role === "Faculty Advisor" (they don't need country assignment).

DO NOT:
- Remove the Delegate / Head Delegate / Observer cards
- Change the existing 4-step wizard structure — only swap step content based on role selection
- Break the existing applicationService.submitApplication for normal delegates
- Modify the existing country assignment for delegates who DO need it

VERIFY:
- Selecting Faculty Advisor swaps the wizard content correctly
- Faculty Advisor sees institutional roster on their conference page
- Team Lead can manage team members
- AI assignment skips faculty roles
- Existing normal Delegate flow unaffected end-to-end
- Existing complaint/messaging flows still work for all role types
```

---

### 🅷 PHASE H — Pro Gate Comprehensive Enforcement

**Estimated effort:** 2-3 days
**Files affected:** `src/components/ProGate.tsx` (verify exists or create), `src/lib/hooks/useProStatus.ts` (new), various Pro-locked feature entry points

**📝 VIBE CODING PROMPT:**

```
TASK: Audit every Pro-locked feature mentioned in plans/project.md and plans/organizer-implementation-plan.md, then enforce consistent gating via a single ProGate HOC. PRESERVE all non-Pro feature behaviors.

CONTEXT:
- plans/project.md mentions "Pro Membership: Form to apply/upgrade via MyMUN. Pro unlocks advanced features."
- plans/organizer-implementation-plan.md Pro-locked list:
  * AI Country Assignment
  * Live MUN module
  * Advanced certificate templates
  * Bulk email announcements (>50 recipients)
  * Custom event themes
- Existing `proStatus` field on user profile is likely "none" | "pending" | "active".
- Pro membership application form already exists at /dashboard/organizer/apply.

WHAT TO BUILD:
1. CREATE src/lib/hooks/useProStatus.ts:
   - Returns `{ isPro: boolean, status: "none"|"pending"|"active"|"expired", expiresAt: Date|null, refresh: () => void }`
   - Reads from AuthContext profile.proStatus and profile.proExpiresAt
   - Listens to profile snapshot updates

2. CREATE src/components/ProGate.tsx (if not present):
   - Props: { children, feature: string, lockedFallback?: ReactNode }
   - If isPro, render children
   - Otherwise render a beautiful upgrade card with feature name, "Upgrade to Pro" button linking to /dashboard/organizer/apply, and the lockedFallback (if provided) below in muted state
   - Style matches existing glass-card aesthetic

3. WRAP these features with ProGate (do NOT delete the feature; just wrap the entry point):
   - /dashboard/organizer/events/[id]/countries/page.tsx → Wrap the "Run AI Assignment" button with `<ProGate feature="AI Country Assignment">`
   - /dashboard/conferences/[id]/page.tsx → Wrap the Live MUN tab content with ProGate
   - /dashboard/organizer/events/[id]/tools/certificates/page.tsx → Wrap the "Ornate" template (and any future advanced templates) — leave Classic + Modern available to all
   - /dashboard/organizer/events/[id]/announcements/page.tsx → In the composer, if recipient count > 50, disable Send and show ProGate inline message
   - /dashboard/organizer/events/[id]/tools/theme/page.tsx → Wrap the custom hex color picker; preset themes remain free

4. PRO STATUS BADGE:
   - In Navbar / Header dropdown, add a small "PRO" gold badge next to user name if isPro
   - In organizer sidebar/dashboard, show "Pro Member" status block

5. EXPIRY HANDLING:
   - If profile.proExpiresAt < now, automatically downgrade by Cloud Function (new functions/src/checkProExpiry.ts scheduled daily)
   - 7-day-out reminder email via Resend

6. ADMIN OVERSIGHT:
   - In admin/organizer-apps tab, show pro applications with renewal vs new
   - "Extend Pro" button (manual grant N months) — useful for partners

DO NOT:
- Make any non-Pro feature dependent on isPro
- Block non-Pro organizers from creating free events (basic event creation must remain free)
- Remove or hide the Pro-locked features — only gate them with the upgrade prompt
- Change the existing /dashboard/organizer/apply Pro application form

VERIFY:
- Non-Pro user sees lockedFallback in muted state on Pro features with clear upgrade CTA
- Pro user sees full feature
- Expiry triggers downgrade on next day's cron run
- Free events, basic announcements (<50 recipients), 2 cert templates all work without Pro
```

---

### 🅸 PHASE I — Waitlist Lifecycle & 48h Cloud Function

**Estimated effort:** 2 days
**Files affected:** `functions/src/expireWaitlistOffers.ts` (new), `functions/src/index.ts`, `src/lib/services/waitlistService.ts` (new), `src/app/dashboard/organizer/events/[id]/capacity/page.tsx`

**📝 VIBE CODING PROMPT:**

```
TASK: Complete the waitlist lifecycle — the UI exists but the 48h offer expiry Cloud Function does not. PRESERVE the existing CapacityCard and WaitlistTable components.

CONTEXT:
- /dashboard/organizer/events/[id]/capacity/page.tsx has CapacityCard + WaitlistTable visible.
- Existing waitlist schema (per plans/organizer-implementation-plan.md): /events/{eventId}/waitlist/{entryId} with fields applicantUid, committeeId, position, notifiedAt, status ("waiting"|"offered"|"accepted"|"expired").
- Currently "Offer Seat" button likely sets status to "offered" and notifiedAt, but nothing auto-expires after 48h.

WHAT TO BUILD:
1. NEW SERVICE src/lib/services/waitlistService.ts (extract any inline logic from capacity/page.tsx):
   - `getWaitlist(eventId, committeeId)` — sorted by position
   - `addToWaitlist(eventId, committeeId, applicantUid)` — append at end position
   - `offerSeat(eventId, committeeId, entryId)` — sets status=offered, notifiedAt=now, sends email via existing announcement Resend infra
   - `acceptOffer(eventId, committeeId, entryId)` — sets status=accepted, creates application doc with status=approved, decrements next-in-line position
   - `expireOffer(eventId, committeeId, entryId)` — sets status=expired, automatically offerSeat to next position

2. NEW CLOUD FUNCTION functions/src/expireWaitlistOffers.ts:
   - Scheduled every 1 hour
   - Query collectionGroup('waitlist') WHERE status == "offered" AND notifiedAt < (now - 48h)
   - For each: call expireOffer(), advance queue
   - Log to auditLogs collection (from Phase D)

3. NEW DELEGATE-SIDE ENTRY POINT:
   - When delegate has a waitlist offer, show banner on /dashboard/conferences/[id] (or /dashboard if no conference yet): "You've been offered a seat in [Event Name] - [Committee]. Accept by [time remaining countdown]"
   - "Accept" and "Decline" buttons

4. EMAIL TEMPLATE in Resend:
   - "You've been offered a waitlist seat" — includes event name, committee, country if assigned, 48h deadline, accept link

5. ORGANIZER-SIDE UPDATE:
   - WaitlistTable shows current offer status with countdown timer per row
   - "Offer Seat" disabled while existing offer is pending

6. UPDATE existing CapacityCard component to reflect waitlist counts in addition to filled seats.

DO NOT:
- Change the visual CapacityCard / WaitlistTable design
- Modify the existing "Add Seats" reactivation flow
- Touch any other Cloud Function (processAnnouncement, assignmentDeadlineCheck, generateBulkIdCards)

VERIFY:
- Offering seat sets timer, sends email
- After 48h, function expires offer and advances queue
- Delegate accepts → application auto-created as approved
- Manual decline by delegate also advances queue
- Multiple committees handled independently per event
```

---

### 🅹 PHASE J — Real Stripe Connect + Webhook Integration

**Estimated effort:** 5-6 days
**Files affected:** `functions/src/stripeWebhook.ts` (new), `functions/src/createStripeAccount.ts` (new), `functions/src/createPaymentIntent.ts` (new), `src/app/dashboard/organizer/financials/page.tsx`, `src/lib/services/stripeService.ts` (new), `firebase.json`

**📝 VIBE CODING PROMPT:**

```
TASK: Replace the mock Stripe stub in /dashboard/organizer/financials with a real Stripe Connect Express integration. PRESERVE all existing UI cards, tier display, payment table, and wallet panel layout — only swap the data source.

CONTEXT:
- /dashboard/organizer/financials/page.tsx currently derives revenue from approvedCount × $50 hardcoded.
- "Request Payout" button does nothing (alert + 800ms fake delay).
- "Connect Stripe Account" button does nothing.
- Existing schema docs in plans/organizer-implementation-plan.md outline /events/{eventId}/payments/{paymentId} + organizers/{uid}/wallet.

WHAT TO BUILD:

1. STRIPE SETUP (manual config in Stripe Dashboard):
   - Create Stripe Connect platform account
   - Get publishable key + secret + webhook signing secret
   - Store secrets in Firebase Functions config: `firebase functions:config:set stripe.secret=sk_test_... stripe.webhook_secret=whsec_...`

2. NEW CLOUD FUNCTIONS:

   a) functions/src/createStripeAccount.ts (callable):
      - Input: { country, businessType }
      - Creates Stripe Express account via stripe.accounts.create()
      - Writes accountId to organizers/{uid}.stripeAccountId
      - Generates onboarding link via accounts.createLoginLink + returns URL
   
   b) functions/src/createPaymentIntent.ts (callable):
      - Input: { eventId, tierId, applicationId }
      - Resolves active tier price
      - Creates PaymentIntent with application_fee_amount = 7% of total
      - Transfers to organizer's stripeAccountId
      - Writes /events/{eventId}/payments/{paymentId} with status="pending"
      - Returns clientSecret to client for confirmCardPayment

   c) functions/src/stripeWebhook.ts (HTTPS):
      - Verifies webhook signature using stripe.webhooks.constructEvent
      - Handle event types:
        * `payment_intent.succeeded` → update payment status="paid", increment wallet balance
        * `payment_intent.payment_failed` → status="failed", notify applicant
        * `charge.refunded` → status="refunded", decrement wallet
        * `account.updated` → sync organizer account status
      - All writes via Admin SDK
   
   d) functions/src/requestPayout.ts (callable):
      - Input: { amount }
      - Verifies organizer wallet balance >= amount
      - Creates Stripe transfer to organizer's bank
      - Writes /organizers/{uid}/payouts/{payoutId}
      - Decrements wallet balance

3. NEW SERVICE src/lib/services/stripeService.ts:
   - All client-side callable wrappers
   - `initStripe()` loads @stripe/stripe-js once
   - `connectStripe()`, `payForApplication(eventId, tierId, applicationId)`, `requestPayout(amount)`

4. UPDATE src/app/dashboard/organizer/financials/page.tsx:
   - Read real payments from /events/{eventId}/payments via existing query pattern
   - Replace dummy revenue calc — sum payments where status==="paid"
   - "Connect Stripe Account" → calls stripeService.connectStripe(), redirects to onboarding link
   - "Request Payout" → opens dialog with amount input, calls stripeService.requestPayout
   - Show real payouts history in WalletPanel

5. UPDATE the applicant payment flow:
   - When delegate clicks "Apply" on a paid event, after application form submit, redirect to checkout step
   - Stripe Elements card form
   - On success → application status="pending_payment" → "pending_review"

6. WEBHOOK ROUTE in firebase.json — add rewrite from /api/stripe-webhook to the Cloud Function

7. MIGRATION SAFETY:
   - Keep the existing "mock" derivation as a fallback when stripeAccountId is absent (orgnaizer not yet onboarded)
   - Add a banner: "Mock data — connect Stripe to track real payments"

DO NOT:
- Remove the existing "Mock Stripe — Phase 7" UI elements until real flow proven end-to-end
- Change the existing tier editor in event creation
- Delete the existing financials Tabs structure (overview / payments / wallet)
- Break the existing manual payment registration flow (organizer can still mark a delegate as paid manually)

VERIFY:
- Organizer onboards Stripe Express in test mode end-to-end
- Test payment via Stripe test card (4242 4242 4242 4242) shows webhook firing
- Payment lands in payments collection with real status
- Wallet balance increases
- Payout request transfers to test bank
- Refunds reverse the wallet correctly
- 7% platform fee correctly deducted
```

---

### 🅺 PHASE K — LLM-Based Country Assignment

**Estimated effort:** 3-4 days
**Files affected:** `functions/src/llmCountryAssignment.ts` (new), `functions/src/index.ts`, `src/lib/services/aiAssignmentService.ts`

**📝 VIBE CODING PROMPT:**

```
TASK: Upgrade the heuristic country assignment to use Claude (or OpenAI) to evaluate applicant motivation, experience, and choices. PRESERVE the existing heuristic as a fallback when the LLM call fails or for non-Pro events.

CONTEXT:
- Current aiAssignmentService.ts uses simple heuristic: try primary, then secondary, then any free country.
- conflictService.ts already exists to check cross-event country history.
- AI assignment is a Pro feature (see Phase H).

WHAT TO BUILD:

1. NEW CLOUD FUNCTION functions/src/llmCountryAssignment.ts (callable):
   - Input: { eventId }
   - Pull event committees + countries + all pending applications
   - For each committee, build a prompt:
     ```
     You are a Model UN country assignment specialist. Given these applicants:
     [json list of applicant: { uid, name, role, experience, motivation, choices: { primary, secondary, tertiary }, pastAssignments: [...from conflictService] }]
     
     And these available countries in {committeeName}: [list]
     
     Assign each applicant ONE country, balancing:
     1. Applicant preference (prefer primary > secondary > tertiary > any)
     2. Past assignment diversity (avoid repeat assignments per applicant)
     3. Experience level — give P5/critical countries to experienced delegates
     4. Motivation quality — match applicants with strong motivation to their preferred countries
     
     Return JSON: { assignments: [{ uid, country, reasoning }] }
     ```
   - Call Anthropic Claude API (or OpenAI) — store API key in functions config
   - Parse response, validate every country is in the committee's pool
   - Write assignedCountry to each application doc
   - On any failure (timeout, invalid JSON, country mismatch), FALL BACK to existing heuristic aiAssignmentService

2. EXPORT from functions/src/index.ts: `export { llmCountryAssignment } from "./llmCountryAssignment"`

3. UPDATE src/lib/services/aiAssignmentService.ts:
   - Existing heuristic function STAYS as `heuristicAssignCountries()`
   - Add new `llmAssignCountries(eventId)` that calls the new Cloud Function
   - Add new `assignCountriesAuto(eventId, useLLM=true)` which tries LLM first, falls back to heuristic
   - The /countries page button "Run AI Assignment" calls assignCountriesAuto with useLLM=isPro

4. UPDATE /dashboard/organizer/events/[id]/countries/page.tsx:
   - Show a chip: "LLM Mode" or "Heuristic Mode" based on Pro status
   - On AI button click, show "Running AI..." spinner, then results dialog with per-applicant reasoning
   - Allow manual override of any LLM suggestion before confirming

5. AUDIT LOGGING:
   - Log each LLM call to /auditLogs with action="ai_country_assignment_llm" and the full prompt + response stored (for debugging)
   - Track token usage cost per call in /llmCostLogs

DO NOT:
- Remove the heuristic function — it's the fallback and the free-tier path
- Auto-assign without organizer confirmation
- Skip the conflict check — feed past assignments into the prompt
- Hardcode the LLM provider — make it switchable via env config

VERIFY:
- Pro organizer clicks AI button → real LLM call → reasoning shown per applicant
- Non-Pro organizer falls through to heuristic
- LLM failure (e.g., invalid JSON) gracefully degrades to heuristic
- All assignments still respect committee country pools
- Past assignment conflicts surfaced in the reasoning
- Token cost logged
```

---

### 🅻 PHASE L — Mobile Responsive QA Pass & Polish

**Estimated effort:** 3-4 days
**Files affected:** Wide — all organizer sub-pages with tables, conferences/[id] tabs, admin dashboard tables, chair committee page

**📝 VIBE CODING PROMPT:**

```
TASK: Audit every dashboard page on mobile (≤640px) and tablet (640-1024px) viewports. Fix cramped tables, overlapping toolbars, illegible long-form text. DO NOT redesign desktop — only make mobile work.

CONTEXT:
- plans/project.md requires "Fully responsive web application (Mobile & Desktop)".
- plans/draft-progress.md notes: "parts of organizer event page on mobile will be cramped — long tables, etc."
- Tailwind v4 with breakpoints sm:640, md:768, lg:1024, xl:1280.

WHAT TO BUILD:

1. ESTABLISH a mobile-first pattern for tables:
   - Above md: traditional <table> with all columns
   - Below md: render as stacked cards (one card per row, key fields with label-value pairs)
   - Create a reusable `<ResponsiveTable rows={...} columns={...}>` component in src/components/ui/

2. PAGES TO AUDIT AND FIX (preserve desktop, fix mobile):

   - /dashboard/admin/page.tsx — users table, events table, organizer-apps table → use ResponsiveTable
   - /dashboard/admin/audit-logs/page.tsx (from Phase D) — same pattern
   - /dashboard/organizer/events/[id]/applications/page.tsx — table → card list on mobile
   - /dashboard/organizer/events/[id]/countries/page.tsx — assignment matrix → vertical scroll on mobile + sticky committee name
   - /dashboard/organizer/events/[id]/capacity/page.tsx — CapacityCard already grid; verify waitlist table
   - /dashboard/organizer/events/[id]/staff/page.tsx — tabs + table
   - /dashboard/organizer/events/[id]/announcements/page.tsx — composer + history
   - /dashboard/organizer/events/[id]/tools/*  — already cards mostly
   - /dashboard/organizer/financials/page.tsx — payments table
   - /dashboard/chair/committee/[id]/page.tsx — Daily Marking Matrix is the big one; consider horizontal scroll with sticky delegate column
   - /dashboard/conferences/[id]/page.tsx — main culprit for tab bar overflow; the TabsList currently shows ~10 tabs in a row, doesn't scroll on mobile

3. NAVIGATION FIXES:
   - Sticky tab navs in /dashboard/organizer/events/[id]/layout.tsx need horizontal scroll on mobile (overflow-x-auto + scrollbar-hide)
   - Conferences/[id]/page.tsx TabsList same fix
   - Header dropdown menu should be full-width sheet on mobile, not absolute dropdown

4. TYPOGRAPHY:
   - Hero text in /events/[id] and / should scale down (text-4xl → text-2xl on mobile)
   - Long cards (Event Detail, Conference Portal) should reduce padding from py-20 to py-10 on mobile

5. INTERACTION FIXES:
   - Drag-and-drop on /partners page is unusable on touch — provide arrow-button reorder as alternative on touch devices (use useMediaQuery)
   - File upload inputs need bigger tap targets (h-12 minimum)

6. EMPTY STATES & SKELETONS:
   - Verify every loading state has a skeleton (most do)
   - Verify every empty state has a centered icon + label

7. TEST ON ACTUAL DEVICES:
   - Use Chrome DevTools device toolbar for iPhone 12, iPhone SE, Pixel 5, iPad Mini
   - Use Safari iOS simulator if Mac available
   - Take screenshots before/after each fix

DO NOT:
- Remove desktop layouts — wrap mobile fixes in `md:` reverse modifiers if needed
- Change any business logic
- Remove the desktop sidebar nav for organizer dashboard (just collapse it to icon-only on tablet, hamburger on mobile)
- Modify any color palette

VERIFY:
- Every page renders without horizontal scroll at 375px width
- All tables either show cards or scroll cleanly
- No text touches viewport edges
- Tap targets ≥ 44px height
- Modals/dialogs are full-screen on mobile
- Existing desktop UX is identical
```

---

### 🅼 PHASE M — Optional Modules Hardening + Organizer Editor

**Estimated effort:** 3-4 days
**Files affected:** `src/app/dashboard/organizer/events/[id]/modules/page.tsx` (new), `src/app/dashboard/organizer/events/create/page.tsx` (Settings tab extension), `src/lib/services/optionalModulesService.ts`, individual delegate-side module components

**📝 VIBE CODING PROMPT:**

```
TASK: The optional modules (Food, Transport, Accommodation, Live MUN, Dress Code) have delegate-side viewers built but the organizer-side configuration / content editor is missing. Build the organizer panels. PRESERVE the existing delegate-side viewers.

CONTEXT:
- src/lib/services/optionalModulesService.ts has read functions: getFoodSlots, getTransportRoutes, getAccommodationBlocks, subscribeLiveSessions, getStudyGuide.
- Delegate-side components exist for all 5 modules.
- Event creation Settings tab has only a "Live MUN" toggle. The full enable/disable array `optionalModules` exists on EventData but no UI lets the organizer toggle individual modules.

WHAT TO BUILD:

1. EXTEND src/app/dashboard/organizer/events/create/page.tsx Settings tab:
   - Add a "Optional Modules" section with 5 toggle switches:
     * Food Coupons
     * Transport
     * Accommodation
     * Live MUN (Pro feature — disabled if non-Pro)
     * Dress Code
   - Each saves to event.optionalModules array (e.g., ["food", "transport"])

2. NEW HUB PAGE src/app/dashboard/organizer/events/[id]/modules/page.tsx:
   - Linked from the organizer event hub
   - Tabs: Food | Transport | Accommodation | Live MUN | Dress Code
   - Only tabs for enabled modules are visible
   
3. PER-TAB CONTENT EDITORS (CRUD on each module's data):

   a) Food tab:
      - List + Add/Edit/Delete food slots
      - Fields per slot: mealName, timeWindow (e.g. "12:00-14:00"), venue, day
      - Bulk add via CSV
   
   b) Transport tab:
      - Add transport routes: routeName, pickup, dropoff, departure, return, capacity
      - View registered delegates per route
      - "Send Route Reminder" button (uses Resend)
   
   c) Accommodation tab:
      - Manage accommodation blocks: blockName, roomType, pricePerNight, availableRooms
      - View pending accommodation requests, approve/reject
   
   d) Live MUN tab (Pro):
      - Configure live streaming URL per session (link to YouTube/Twitch embed)
      - Schedule sessions: title, committeeName, topic, scheduled time
      - Toggle "Live Now" status
   
   e) Dress Code tab:
      - Rich text editor (Tiptap or simple textarea with markdown) for dress code text
      - Photo upload for dress code reference images (multiple)
      - Saves to events/{eventId}.dressCode = { text, images[] }

4. EXTEND optionalModulesService.ts with write functions:
   - addFoodSlot, updateFoodSlot, deleteFoodSlot
   - addTransportRoute, updateTransportRoute, deleteTransportRoute
   - addAccommodationBlock, updateAccommodationBlock, approveAccommodationRequest
   - addLiveSession, updateLiveSession (with live status toggle)
   - saveDressCode

5. UPDATE firestore.rules to allow organizer of event to write to all these sub-collections.

6. DELEGATE-SIDE VERIFY:
   - Confirm /dashboard/conferences/[id] tabs only show modules that are in event.optionalModules array (already implemented per the code; just verify with new content)
   - Confirm DressCodeModule reads from event.dressCode (new field)

DO NOT:
- Remove or modify any delegate-side module component
- Hide modules that aren't enabled — they should simply not have a tab
- Change the existing schema of FoodSlot, TransportRoute, AccommodationBlock, LiveSession interfaces (add fields only)

VERIFY:
- Organizer enables food + transport → only those tabs appear in modules hub
- Adding food slots persists and shows on delegate side immediately
- Pro gate enforced on Live MUN
- Existing delegate viewers display new content correctly
```

---

### 🅽 PHASE N — Performance, Indexes, Error Boundaries & E2E Testing

**Estimated effort:** 3-4 days
**Files affected:** `firestore.indexes.json`, `next.config.js`, various Service files for memoization, `src/components/ErrorBoundary.tsx` (new), `e2e/` tests directory (new)

**📝 VIBE CODING PROMPT:**

```
TASK: Final pass to make the app production-ready. Add error boundaries, performance optimizations, missing Firestore indexes, and a basic E2E test suite. PRESERVE all existing functionality.

CONTEXT:
- firestore.indexes.json was added on May 16 but may be missing indexes for queries added in newer features (waitlist, complaints, audit logs).
- No error boundaries currently wrap the dashboard tree — one Firebase error crashes the whole route.
- No automated tests exist.

WHAT TO BUILD:

1. ERROR BOUNDARIES:
   - src/components/ErrorBoundary.tsx — React class component with componentDidCatch, logs to Firestore /errorLogs collection + Sentry if configured
   - Wrap each major route group:
     * Wrap /dashboard layout
     * Wrap /dashboard/organizer/events/[id]/layout
     * Wrap /dashboard/conferences/[id]
     * Wrap /dashboard/chair/committee/[id]
   - Fallback UI: glass-card with "Something went wrong" + "Reload Page" button + chat support link

2. FIRESTORE INDEXES — audit and add:
   - Run all queries in services through `firebase emulators` and capture missing-index errors
   - Add composite indexes for:
     * conversations: array-contains participants + orderBy lastMessageAt desc
     * applications: eventId == X AND status == Y AND createdAt desc
     * markings: eventId AND committeeId AND dateStr
     * complaints: assignedTo AND status, OR userId AND createdAt desc
     * waitlist (collectionGroup): status AND notifiedAt
     * auditLogs: actorUid AND timestamp desc, action AND timestamp desc

3. PERFORMANCE:
   - Add `next/dynamic` lazy imports for heavy components: ApplicationWizard, CertificateDownload, AnnouncementComposer (Tiptap), modal/dialog content that's not immediately needed
   - Use React.memo on EventBrowseCard, ConferenceCard, ChatSidebar message rows
   - Add `useCallback` for event handlers passed deep into trees
   - Optimize images: replace any <img> with Next.js <Image> (with width/height); use blur placeholder for cover photos

4. CACHING:
   - Add `revalidate: 60` to /events page (public, server-rendered)
   - Use SWR or React Query for client-side fetches that re-fetch on focus (per agent.md tech stack rule)

5. CLOUD FUNCTION EFFICIENCY:
   - Batch the announcement emails to 100 at a time (already done?)
   - Add retry logic with exponential backoff for Resend failures

6. SENTRY / MONITORING:
   - Wire up Sentry in next.config.js + functions (optional but recommended)
   - Capture errors in Cloud Functions

7. E2E TESTS with Playwright:
   - Set up Playwright config in e2e/playwright.config.ts
   - Tests:
     * Auth: signup with email → onboarding → dashboard
     * Delegate flow: apply to event → status pending → see in My Conferences
     * Organizer: create event → publish → see in /events
     * Chair: grade delegate → delegate sees result
     * Admin: change user role → audit log entry created
   - Run against Firebase emulator suite

8. ACCESSIBILITY (a11y):
   - Run axe-core on each route
   - Fix any missing alt text on images
   - Ensure form labels are associated with inputs
   - Verify focus rings on all interactive elements
   - Keyboard-only nav through application wizard

DO NOT:
- Replace working hooks with React Query if existing onSnapshot listeners work fine
- Wrap every component in memo (only the proven hot spots)
- Add Sentry/observability without env-var gating (so local dev doesn't ping production logs)
- Remove existing error handling — only add boundaries on top

VERIFY:
- Error boundaries catch a simulated throw without crashing the whole app
- Lighthouse score > 85 on /dashboard
- Firestore emulator runs with no missing-index errors during test suite
- E2E tests pass in CI
```

---

## 4. RECOMMENDED EXECUTION ORDER

**Sprint 1 (week 1-2): Security & Compliance Foundation**
- Phase E (Storage Rules) — 1 day
- Phase A (LinkedIn/Facebook OAuth) — 2 days
- Phase D (Admin Settings + Audit Logs) — 3 days

**Sprint 2 (week 2-3): Critical UX Completion**
- Phase B (Real PDF Certificates) — 4 days
- Phase F (Position Paper Viewer) — 3 days
- Phase C (Complaint Hierarchy) — 5 days

**Sprint 3 (week 3-4): Feature Polish & Modules**
- Phase M (Optional Modules Editor) — 4 days
- Phase H (Pro Gate Enforcement) — 3 days
- Phase I (Waitlist 48h Function) — 2 days

**Sprint 4 (week 4-5): Pro Features**
- Phase G (Faculty + Team Delegation) — 5 days
- Phase K (LLM Country Assignment) — 4 days

**Sprint 5 (week 5-6): Production Readiness**
- Phase J (Real Stripe) — 6 days
- Phase L (Mobile Responsive QA) — 4 days
- Phase N (Performance + Tests) — 4 days

---

## 5. NON-NEGOTIABLE PROJECT-WIDE RULES

These apply to every phase. Reiterate at the top of every vibe prompt.

1. **PRESERVE EVERYTHING.** No deletion of existing routes, components, services, fields, or rules unless explicitly listed in the prompt.
2. **BACKWARDS-COMPATIBLE SCHEMAS.** New Firestore fields are optional. Old documents must keep reading.
3. **BASE UI PATTERNS.** Use `render` prop pattern, not `asChild`. Add `nativeButton={false}` when wrapping Buttons in Links.
4. **NEXT 15 ASYNC APIs.** Always `await cookies()`, `await headers()`. Use `useParams` only in client components with hydration guards.
5. **READ AGENTS.md FIRST.** Before editing any Next.js-specific code, check `node_modules/next/dist/docs/` for breaking changes.
6. **TYPESCRIPT INTERFACES.** Add new fields to existing interfaces; don't redefine.
7. **MOBILE RESPONSIVE.** Test every new feature at 375px width before declaring it done.
8. **AUDIT EVERY ADMIN ACTION.** Use auditService from Phase D onwards.
9. **GIT HYGIENE.** One phase = one feature branch = one PR with conventional commits.
10. **READ progress-2026-05-16.md.** Many gaps in the older draft-progress.md were closed on May 16. The latest checkpoint is the source of truth.

---

## 6. APPENDIX: QUICK REFERENCE OF "ACTUALLY DONE BUT MARKED INCOMPLETE" ITEMS

Cross-checking source code against `plans/draft-progress.md` shows several items listed as incomplete are actually built. Update your tracking:

- ✅ Food Coupons module — `src/components/features/delegate/modules/FoodCouponsModule.tsx` exists, reads from `optionalModulesService.getFoodSlots`
- ✅ Transport module — `TransportModule.tsx` with register flow
- ✅ Accommodation module — `AccommodationModule.tsx` with request flow
- ✅ Live MUN module — `LiveMUNModule.tsx` subscribes to live sessions
- ✅ Dress Code module — `DressCodeModule.tsx` exists
- ✅ Room notifications for delegates — `RoomNotifications.tsx` with toast + bell + RTDB subscription
- ✅ Announcement viewer for delegates — `AnnouncementViewer.tsx` with unread count
- ✅ Study guide upload for chairs — fully wired in `chair/committee/[id]/page.tsx` with Storage upload, progress bar, delete
- ✅ Study guide viewer for delegates — `StudyGuideViewer.tsx`

**What's still genuinely missing from Phase 4 is:**
- The full complaint escalation chain (Phase C above)
- Faculty Advisor / Team Delegation distinct flows (Phase G above)
- Organizer-side content editors for the optional modules (Phase M above)

This means Phase 4 is closer to **80-85% done**, not 55%.

---

## TEMP / DEV-ONLY — REMOVE BEFORE PROD

- [ ] **Delegate role in Staff Invite dropdown** — Added `Delegate (dev test)` option in `StaffInviteModal.tsx` so organizer can invite a delegate directly (allocation → Invitation tab). Dev/test only. **Delete this SelectItem before production.**
- [ ] **Dev Allocate tab** — `DevAllocatePanel.tsx` + extra "Dev Allocate" tab in `allocation/page.tsx`. Force committee + country onto any applicant/invited-delegate and mark approved (bypasses review flow). Lists real applications AND staff-delegates invited via the Invitation tab (`events/{id}/staff` with a delegate role). Allocating a staff-delegate resolves their uid by email (`getAllUsers`), syncs `staff.committeeId`, and creates/approves a real application via `devUpsertAllocatedApplication` (in `applicationService.ts`). Invited delegates with no account yet are shown but disabled ("no account yet"). Tab only shows when `NODE_ENV !== production` or URL has `?dev=1`. **Delete the panel, `devUpsertAllocatedApplication`, the `DEV_TAB`/`devMode` wiring, and this note before production.**
  - **DEV Firestore rule loosened + DEPLOYED (must revert for production):** allocating an *invited* delegate (no existing application) does a client-side `applications` **create**. Production rule allows create only for `isAdmin()` or `appWindowOpen(eventId, role)` — i.e. a delegate self-applying while the window is open. For dev we added a third condition so an event's organizer/co-org can create an application on a delegate's behalf.
    - **File:** `firestore.rules`, `match /applications/{appId}` → `allow create` (~line 447).
    - **Added line (DEV):** `|| isEventOrganizer(request.resource.data.eventId)` wrapped in a `DEV ONLY — REMOVE BEFORE PRODUCTION` comment block.
    - **Production (target) state — the create rule must go back to exactly:**
      ```
      allow create: if isSignedIn() && (
        isAdmin() ||
        appWindowOpen(request.resource.data.eventId, request.resource.data.role)
      );
      ```
    - **To revert:** delete the `isEventOrganizer(...)` line + its `DEV ONLY` comment block, then redeploy: `npx firebase-tools deploy --only firestore:rules` (project `mun-saas`).
    - This keeps the real production gating intact (paid/window rules unchanged elsewhere) — only this one dev bypass is temporary. Deployed on 2026-07-04.
    - Note: the post-approval hooks (connections / committee group chat) were already organizer-permitted, so no other rule change was needed.

*Document end. Use each phase prompt block as a standalone instruction to your coding assistant. Each is self-contained with context, what-to-build, what-not-to-do, and verify steps.*