# 1. Status per Phase (from plans/project.md)

## ✅ Phase 1 — Initialization & Foundation
- [x] Next.js + Tailwind v4 set up (`globals.css` has full OKLCH theme + dark mode).
- [x] Shadcn-style UI library built on Base UI (`src/components/ui/*`): button, card, input, label, dialog, dropdown, select, tabs, sheet, skeleton, badge, avatar, checkbox, switch, radio-group, tooltip, textarea, carousel, progress.
- [x] Firebase client (`lib/firebase/client.ts`) and admin (`lib/firebase/admin.ts`) wired.
- [x] Firestore collections in active use.
- [x] Global layout (Navbar, Footer, AppWrapper that hides them on `/dashboard` and `/onboarding`).
- ❌ **Auth providers gap:** plan calls for Google + LinkedIn + Facebook + Email/Password. Only **Google + Email/Password** wired. LinkedIn + Facebook providers not implemented anywhere.

## ✅ Phase 2 — Public & Auth Modules
- [x] Home (`/`) with hero, features section, framer motion polish.
- [x] Public Events list (`/events`) and detail page (`/events/[eventId]`) with cover, description, committees grid, partner carousel, sticky apply card.
- [x] Articles list (`/articles`) with category filter, and detail page with comments.
- [x] Login + Signup with form + Google OAuth + session cookie sync to `/api/auth/session`.
- [x] Onboarding form captures personal info, address, occupation, socials.
- ~~❌~~ ✅ **`/forgot-password` route** — Created `src/app/forgot-password/page.tsx` with Firebase Auth reset email, 60s cooldown, success/error states. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Onboarding now captures role.** Added RadioGroup role selector (Delegate/Chair/Organizer). Organizer writes to `organizerApplications` for admin approval. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **`/dashboard/profile` route created.** Hero block, stats, social links, recent activity. Header dropdown split into Profile + Settings. *(fixed 2026-05-16)*

## ✅ Phase 3 — Core Dashboards & Discovery
- [x] Discovery dashboard (`/dashboard`) with welcome, stat cards, activity feed, recommended events.
- [x] `ActivityFeed` reading from `activities` collection.
- [x] My Conferences page with active/past tabs and `ConferenceCard`.
- [x] Conference portal at `/dashboard/conferences/[id]` with Documents / Schedule / Requests / Certificates / Results tabs.
- [x] Real-time messaging:
  - `getUserConversations` and `getConversationMessages` use `onSnapshot` (real-time).
  - 1-1 conversation creation via `createOrGetDirectConversation`.
  - `ChatSidebar`, `ChatWindow`, unread badge logic.
- ~~⚠️~~ ✅ **Group messaging implemented** — `createGroupConversation()` in `messageService.ts`, "New Group" dialog in ChatSidebar, auto-group on approval. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Online/active status indicator** — `presenceService.ts` using Firebase RTDB. Green/amber/grey dots in ChatSidebar and ChatWindow. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Auto-follow system** — `autoFollowParticipants()` in `applicationService.ts`, mutual connections via `connectionService`. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Block/disconnect functionality** — `connectionService.ts` with connect/block/disconnect/unblock. ChatSidebar filters blocked convos. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Read receipts now displayed** — ✓ sent / ✓✓ read ticks in ChatWindow message bubbles. *(fixed 2026-05-16)*

## ✅ Phase 4 — Delegate Flow
- [x] `ApplicationWizard` with 4 steps (Role → Preferences → Experience → Review), validation, success state.
- [x] Position paper upload via `PositionPaperUpload` (Firebase Storage, progress bar).
- [x] Schedule viewer with type icons (main/session/break/social).
- [x] Complaint submission system in `ComplaintSystem`.
- [x] Certificate preview + print (`CertificateDownload`).
- [x] Delegate sees their marking results in the Results tab when chair has submitted scores.
- ❌ **Optional modules not implemented at all:** Food Coupons, Transport, Accommodation, Live MUN, Dress Code. The `optionalModules` array is stored on events but never read anywhere except a "Live MUN" toggle in event creation.
- ❌ No real-time room notifications.
- ❌ No special-announcement viewer for delegates (announcements sit in `events/{id}/announcements` but delegates can't see them).
- ❌ No "view study guide" for delegates (chair page has an empty "Study Guide" button; there's no upload UI and no viewer).
- ❌ Complaint hierarchy/escalation (Chair → Organizer → Main Organizer → App Admin) NOT implemented. Complaints just sit in a flat collection with a `type`.
- ❌ Faculty Advisor / Team Delegation roles aren't distinct flows — they're just strings in the role field.

## ⚠️ Phase 5 — Organizer & Chair Workflows
- [x] Event creation wizard (5 tabs: Basic / Committees / Schedule / Financials / Settings).
- [x] Cover photo upload via imgBB.
- [x] Executive Board assigner sub-component.
- [x] Ticketing tier editor.
- [x] Schedule item editor.
- [x] **Organizer event hub** at `/dashboard/organizer/events/[id]` with:
  - Overview (recent apps + committee capacity bars)
  - Applications table with approve/reject/pending dropdown
  - Country assignments with manual select + AI button + dialog
  - Inline schedule editor
- [x] **Dedicated organizer sub-pages** (these appear to be the most recently built — see §3):
  - `/committees` (add/edit/delete committees in cards)
  - `/countries` (per-committee assignment matrix with AI button, 24h countdown timer)
  - `/staff` (invite + permissions editor + applications inbox)
  - `/capacity` (CapacityCard + WaitlistTable)
  - `/announcements` (composer + history)
  - `/partners` (drag-and-drop reorder, imgBB logos)
  - `/tools/id-cards` (template selector + preview, generation is mocked)
  - `/tools/certificates` (3 templates)
  - `/tools/theme` (preset themes + Pro hex picker)
  - `/tools/results` (approve / request-revision / bulk approve)
- [x] Organizer dashboard summary at `/dashboard/organizer` with stats, role breakdown table, recent events.
- [x] Financials dashboard at `/dashboard/organizer/financials` (per-event selector, tiers, payments table, wallet section).
- [x] Pro Membership landing + application form.
- [x] Chair dashboard at `/dashboard/chair` (lists approved chair assignments).
- [x] Chair committee management at `/dashboard/chair/committee/[id]` with evaluation dialog (Debate/PositionPaper/Diplomacy out of 40/30/30 → 100).
- [x] **AI country assignment** — heuristic-based (`aiAssignmentService`): tries primary, then secondary, then any free country. Suggestion dialog shows reason per applicant.
- ~~⚠️~~ ✅ **Overlap problem resolved** — created `events/[id]/layout.tsx` with sticky tab nav. `page.tsx` rewritten as thin Overview dashboard. Sub-pages are canonical. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Edit-event flow works.** `events/create/page.tsx` reads `?edit=eventId`, hydrates all 5 tabs, calls `updateEvent()`. Adds `lastEditedAt`/`lastEditedBy` audit fields. *(fixed 2026-05-16)*
- ❌ Chair can't actually upload study guides — button is decorative.
- ~~❌~~ ✅ **Chair "View All Papers"** — Sheet component with submitted papers, download links, status badges. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Chair "Final Awards"** — Dialog for selecting Best/Outstanding/Honorable delegates. Writes awards to Firestore. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Daily marking implemented.** `dateStr` field on `Marking`. Chair UI replaced with Daily Marking Matrix — select date, auto-generate spreadsheet. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Custom marking templates.** `MarkingTemplate` on `EventData`. Organizers configure in Settings tab. Scoring uses `Record<string, number>`. *(fixed 2026-05-16)*
- ❌ Chair can't actually open/view a submitted position paper from the delegate roster (only sees a "Submitted" badge).
- ~~❌~~ ✅ **Real conflict detection.** `conflictService.ts` queries `collectionGroup('applications')` for past assignments. AI service uses it. ⚠️ warnings in CountryAssignmentRow. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Real 24h deadline.** `assignmentDeadline` field on `EventData`. Countries page reads from Firestore. `assignmentDeadlineCheck` Cloud Function (cron every 5 min) flags overdue. *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Announcement emails are real.** `processAnnouncement` Cloud Function sends via Resend API. UI shows real-time status polling (queued → sending → sent/failed). *(fixed 2026-05-16)*
- ~~❌~~ ✅ **Bulk ID card generation.** `generateBulkIdCards` Cloud Function using `@react-pdf/renderer`. PDFs stored in Firebase Storage. *(fixed 2026-05-16)*

## ⚠️ Phase 6 — Post-Event & Admin
- [x] Certificate page renders, prints, allows download UI (but PDF generation isn't real — just window.print()).
- [x] App Admin global dashboard at `/dashboard/admin` with stats, activity feed, events table (publish/delete), users table (role change).
- ~~❌~~ ✅ **Firestore Security Rules** — fully hardened `firestore.rules` with user privacy, conversation participant-only access, block-list filtering, collectionGroup rules for `results`. *(fixed 2026-05-16)*
- ❌ **Firebase Storage Rules** — same problem, position papers and any uploads.
- ❌ Admin "System Settings" button — no page.
- ❌ Admin "Audit Logs" button — no page.
- ~~❌~~ ✅ **Admin can see/approve Organizer applications.** New "Organizer Applications" tab in admin dashboard with approve/reject + role promotion. *(fixed 2026-05-16)*
- ❌ True PDF certificate generation (using `@react-pdf/renderer`, `pdfme`, or server-side puppeteer).
- ❌ Responsive testing & QA pass (parts of organizer event page on mobile will be cramped — long tables, etc.).

## ⏳ Phase 7 — Future
- [ ] Real Stripe / PayPal integration. Currently all payment data is derived from approved-application count × $50 hardcoded constant in admin and in financials.
- [ ] LLM-based country assignment.




## ~~Done: ~55–60%~~ → Updated below
~~Remaining: ~40–45%~~

~~Breakdown by phase:~~
- ~~Phase 1: 95% ✅~~
- ~~Phase 2: 80% (missing forgot-password, LinkedIn/Facebook, role picker)~~
- ~~Phase 3: 70% (no groups, no presence, no follow/block)~~
- ~~Phase 4: 55% (optional modules + study guide + complaint hierarchy missing)~~
- ~~Phase 5: 60% (no email send, no edit-event, chair tools half-done, AI is fake)~~
- ~~Phase 6: 35% (no security rules, no real PDF, no admin Pro inbox)~~
- ~~Phase 7: 0%~~

~~Weighted average lands around **57% done, 43% to go.**~~

---

## 📊 Updated Completion Estimate (as of 2026-05-16)

**Done: ~72%**
**Remaining: ~28%**

Breakdown by phase:
- Phase 1: 95% ✅ (no change — LinkedIn/Facebook auth still missing)
- Phase 2: **95% ✅** ← was 80% (forgot-password ✅, role picker ✅, profile page ✅. Only LinkedIn/Facebook OAuth remain.)
- Phase 3: **95% ✅** ← was 70% (groups ✅, presence ✅, follow/block ✅, read receipts ✅, dashboard hardened ✅)
- Phase 4: 55% (no change — optional modules, study guide, complaint hierarchy still missing)
- Phase 5: **85% ✅** ← was 60% (edit event ✅, real emails ✅, conflict detection ✅, daily marking ✅, chair tools ✅, bulk ID cards ✅. Remaining: study guide upload, position paper viewer.)
- Phase 6: **55% ⚠️** ← was 35% (security rules ✅, admin organizer approvals ✅. Remaining: real PDF certs, storage rules, admin settings, audit logs, responsive QA.)
- Phase 7: 0% (no change — Stripe, LLM assignment)

Weighted average: **~72% done, ~28% to go.**

> **+15 percentage points gained on May 16, 2026.**
> See `plans/progress-2026-05-16.md` for detailed changelog.
