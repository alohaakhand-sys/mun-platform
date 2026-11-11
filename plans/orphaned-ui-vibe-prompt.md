# 🚨 ORPHANED BACKEND → UI GAPS — Complete Vibe Code Prompt

> **Date:** May 17, 2026
> **Scope:** MyMUN Platform (Next.js 15 + Firebase + Tailwind v4 + Base UI / Shadcn-style)
> **Type of gap addressed:** Functions, services, and Firestore-backed logic that ARE FULLY BUILT in the codebase but have NO UI surface, a stub "Coming Soon" page, or a button that goes nowhere.
> **NOT in scope:** New backend features. Every item below has existing service functions ready to call.

---

## 🎯 THE PROBLEM (READ FIRST)

After a deep scan, I found **eight (8) discrete gaps** where backend logic exists but the UI is missing or stubbed. The user-facing impact is that real, working features are hidden from the people who should be using them. This prompt fixes ALL of them in one cohesive pass.

The principle for every gap: **DO NOT touch the backend. The services are correct. Only build/wire the missing UI.**

---

## 📋 THE EIGHT GAPS — INVENTORY

| # | Gap | Backend Service That Exists | Current UI State |
|---|-----|------------------------------|------------------|
| 1 | **My Articles** (author dashboard) | `articleService.ts` — `createArticle`, `updateArticle`, `deleteArticle`, `getAllArticles(publishedOnly=false)` | `/dashboard/articles/page.tsx` is a "Coming Soon" stub |
| 2 | **Article Editor** (write/edit) | Same as above + `getArticleById` | No route exists at all (`/dashboard/articles/new`, `/dashboard/articles/[id]/edit`) |
| 3 | **My Achievements** (awards display) | `resultService.getUserAchievements(uid)` — already called in `DashboardClient.tsx` | `/dashboard/achievements/page.tsx` is a "Coming Soon" stub |
| 4 | **Connections / Network page** | `connectionService.ts` — `getConnectionsRealtime`, `connectManually`, `disconnect`, `blockUser`, `unblockUser`, `isBlocked` | No page; service only used internally inside ChatSidebar filtering |
| 5 | **Payment History** (delegate side) | Application docs have payment metadata; `events/{id}/payments` sub-collection writes exist | No page; project.md calls for this under Settings |
| 6 | **Optional Modules Organizer Editor** | `optionalModulesService.ts` — read functions exist (`getFoodSlots`, `getTransportRoutes`, `getAccommodationBlocks`, `subscribeLiveSessions`, `getStudyGuide`) | No `/dashboard/organizer/events/[id]/modules` route; organizer cannot ADD food slots, transport routes, accommodation, dress code |
| 7 | **Position Paper Viewer (Chair side)** | `markingService.ts` — `savePositionPaperGrade`, `addPaperComment`, `subscribeToPaperComments`. `PositionPaperViewer.tsx` component exists | Chair page has a "View All Papers" Sheet that lists papers with a download link only — does NOT open the actual viewer/grader |
| 8 | **Notification Preferences honored at send-time** | `users/{uid}.notificationPreferences` — `{ emailOnApproval, emailOnRejection, emailOnNewEvent, pushNotifications }` saved in `/dashboard/settings` | Saved but never read; announcements and approvals send emails regardless of user opt-out |

---

## 🛠 IMPLEMENTATION INSTRUCTIONS

### GLOBAL RULES (apply to every gap below)

1. **DO NOT delete or rewrite any existing service function.** Use what's there.
2. **DO NOT remove the "Coming Soon" pages — replace their contents in-place.**
3. **Match existing visual style:** `glass-card` class, OKLCH theme tokens, Tailwind v4, Framer Motion for page transitions, Base UI primitives (NOT Radix — use `render` prop pattern, not `asChild`).
4. **Skeletons on every loading state**, empty-state messages on every empty list (icon + label centered).
5. **All buttons that navigate via Next.js Link:** `<Button render={<Link href="..."/>} nativeButton={false}>...</Button>`.
6. **Lucide brand icons removed** — for Facebook/LinkedIn/Instagram use inline SVG (look at `/dashboard/profile/page.tsx` for the existing pattern).
7. **Every new page is wrapped in the existing dashboard layout** (no need to recreate sidebar/header).
8. **Mobile-first responsive** — test at 375px before declaring done.
9. **Use TypeScript** — define types inline if not exported from existing services.
10. **Add Firestore rules ONLY where reading is genuinely new.** Most paths already have rules.

---

### 🅰 GAP 1 + 2 — MY ARTICLES + ARTICLE EDITOR

**Files to create/modify:**
- `src/app/dashboard/articles/page.tsx` (REPLACE the "Coming Soon" stub)
- `src/app/dashboard/articles/new/page.tsx` (NEW)
- `src/app/dashboard/articles/[id]/edit/page.tsx` (NEW)
- `src/components/features/articles/ArticleEditor.tsx` (NEW shared editor)

**Step-by-step:**

**1a. My Articles list page** (`src/app/dashboard/articles/page.tsx`):
- Use `useAuth()` to get current uid
- Fetch via `getAllArticles(false)` — pass `publishedOnly: false` to include drafts; then filter `a.authorId === user.uid`
- Show two tabs: "Published" / "Drafts"
- Each row: cover image (small), title, category badge, created date, view count (if present), Edit button, Delete button (confirm dialog)
- Top-right "Write New Article" button → `/dashboard/articles/new`
- Empty state: pencil icon + "You haven't written any articles yet" + CTA button
- Skeleton: 3 card placeholders while loading

**1b. Article Editor component** (`src/components/features/articles/ArticleEditor.tsx`):
- Props: `{ initialArticle?: ArticleData, onSaved: (id: string) => void }`
- Inputs:
  - Title (Input)
  - Category (Select: Guide / Analysis / Tips / News)
  - Tags (comma-separated Input → split into string[] on save)
  - Cover Image URL (Input; existing imgBB flow — copy pattern from event creation cover photo upload)
  - Excerpt (Textarea, max 200 chars, char counter)
  - Content (large Textarea — `min-h-[400px]`; markdown is fine, no Tiptap required)
- Two buttons in footer:
  - "Save Draft" — calls `createArticle({ ...data, published: false })` or `updateArticle(id, { ...data, published: false })`
  - "Publish" — same but `published: true`
- Show inline error messages and a success toast (use existing pattern)

**1c. New Article page** (`src/app/dashboard/articles/new/page.tsx`):
```tsx
"use client";
import { ArticleEditor } from "@/components/features/articles/ArticleEditor";
import { useRouter } from "next/navigation";
// Wrap ArticleEditor; onSaved → router.push(`/dashboard/articles`)
```

**1d. Edit Article page** (`src/app/dashboard/articles/[id]/edit/page.tsx`):
- `useParams()` to get id
- `getArticleById(id)` to hydrate
- Guard: if `article.authorId !== user.uid && !isAdmin`, redirect to `/dashboard/articles` with toast "Not authorized"
- Pass hydrated article into ArticleEditor

**Do not:**
- Skip the Drafts tab. Drafts must persist (`published: false`).
- Allow editing of articles you don't own.

---

### 🅱 GAP 3 — MY ACHIEVEMENTS PAGE

**File to modify:** `src/app/dashboard/achievements/page.tsx` (REPLACE the "Coming Soon" stub)

**Step-by-step:**
- Use `useAuth()` to get uid
- Call `getUserAchievements(uid)` from `@/lib/services/resultService` — returns `DelegateResult[]` with award type, score, committee, event ID
- For each result, also fetch the event title via `getEventById(result.eventId)` — batch them via `getEventsByIds` if available, otherwise sequential Promise.all
- Display:
  - Hero stat strip at top: total awards, Best Delegate count, Outstanding count, Honorable count, Verbal count
  - Grid of "trophy cards" (3 cols desktop, 1 col mobile) — each card:
    - Award icon (Trophy / Medal / Star — color-coded by award type)
    - Award type label (e.g. "Best Delegate")
    - Committee name + Event name
    - Date
    - Final score (X / 100)
    - "Download Certificate" button → routes to `/dashboard/conferences/${eventId}?tab=certificate`
- Filter chips at top: All / Best Delegate / Outstanding / Honorable / Verbal
- Empty state: trophy icon + "No awards yet. Complete a conference to start your collection."

**Do not:**
- Mock the data. The function already returns real awards.
- Forget to filter out `awardType === "none"` (the service already does, but verify).

---

### 🅲 GAP 4 — CONNECTIONS / NETWORK PAGE

**Files to create:**
- `src/app/dashboard/network/page.tsx` (NEW)
- Add nav item in `src/components/dashboard/Sidebar.tsx` ("Network" with Users icon)

**Step-by-step:**

**4a. Page layout:** Three tabs — "Connections" / "Blocked" / "Discover"

**4b. Connections tab:**
- Subscribe via `getConnectionsRealtime(user.uid, callback)`
- Filter `status === "active"` for this tab
- Group by source: "From Conferences (auto)" vs "Manually Connected"
- Each row: avatar, name, role badge, source event chip (if auto), online presence dot (use existing `subscribeToPresence`), three actions:
  - "Message" → `createOrGetDirectConversation(uid, otherUid, ...)` then `router.push('/dashboard/messages?conv=' + id)`
  - "View Profile" → `/dashboard/users/${otherUid}` (this is also a missing route — create a simple read-only profile page if needed; otherwise route to `/dashboard/profile` with `?uid=` param)
  - "Disconnect" (red, confirm dialog) → `disconnect(user.uid, otherUid)`
  - "Block" (red, confirm dialog) → `blockUser(user.uid, otherUid, reason?)`

**4c. Blocked tab:**
- Read from `users/{uid}/blocks` sub-collection (or filter `getConnectionsRealtime` for `status === "blocked"`)
- Each row: name, blocked date, "Unblock" button → `unblockUser(user.uid, targetUid)`

**4d. Discover tab:**
- Show recent activity actors who you're NOT connected to
- "Connect" button → opens dialog asking for confirmation, then calls `connectManually(...)`
- Show how many shared conferences/committees you have with them

**Do not:**
- Add a way to search arbitrary users yet (out of scope; could be Phase 2).
- Block without a confirm dialog — connectionService.blockUser also flips conversation `blockedBy` so it's destructive.

---

### 🅳 GAP 5 — PAYMENT HISTORY PAGE (DELEGATE SIDE)

**File to create:** `src/app/dashboard/payments/page.tsx` (NEW)

Also add a "Payment History" link in:
- `src/app/dashboard/settings/page.tsx` (link inside the page, near the bottom)
- Header user dropdown menu

**Step-by-step:**
- Get user's applications via `getUserApplications(uid)`
- For each application, look up corresponding payment record(s) via `getDocs(query(collection(db, "events", app.eventId, "payments"), where("applicantUid", "==", uid)))`
- If no Stripe payment exists yet (current state — Stripe is Phase 7), derive from application status:
  - If application.status === "approved" AND event is paid → show derived `${tier.price}` as "Paid (mock)"
  - If "pending" → show "Pending"
- Table columns: Event Name, Date, Tier, Amount, Status (Paid/Pending/Refunded badge), "Receipt" button (downloads a simple HTML receipt — use window.print() for now, leave a TODO comment for real PDF)
- Summary stat cards at top: Total Spent, Pending, Refunded
- Empty state: receipt icon + "No payment history yet"

**Do not:**
- Block the page if Stripe isn't connected — fall back to derived data per organizer financials page pattern.

---

### 🅴 GAP 6 — OPTIONAL MODULES ORGANIZER EDITOR

**Files to create/modify:**
- `src/app/dashboard/organizer/events/[id]/modules/page.tsx` (NEW)
- `src/lib/services/optionalModulesService.ts` (EXTEND with write functions)
- `src/app/dashboard/organizer/events/create/page.tsx` (EXTEND Settings tab)
- `firestore.rules` (add sub-collection write permissions for event organizers)
- Add "Modules" link in `src/components/dashboard/Sidebar.tsx` (Organizer Event scope)

**Step-by-step:**

**6a. Extend `optionalModulesService.ts`** (additive — keep all existing reads):
```typescript
export async function addFoodSlot(eventId, data): Promise<{success, id?}>
export async function updateFoodSlot(eventId, slotId, data)
export async function deleteFoodSlot(eventId, slotId)
export async function addTransportRoute(eventId, data)
export async function updateTransportRoute(eventId, routeId, data)
export async function deleteTransportRoute(eventId, routeId)
export async function addAccommodationBlock(eventId, data)
export async function updateAccommodationBlock(eventId, blockId, data)
export async function approveAccommodationRequest(eventId, reqId, status: "confirmed"|"rejected")
export async function addLiveSession(eventId, data)
export async function updateLiveSession(eventId, sessionId, data) // including status toggle
export async function saveDressCode(eventId, dressCode: { text: string, images: string[] })
```
All follow the pattern of existing functions (try/catch, return `{success, error?}`).

**6b. Settings tab extension** in `events/create/page.tsx`:
- Add new section "Optional Modules" with 5 Switch toggles:
  - Food Coupons → enables "food" in `event.optionalModules` array
  - Transport → "transport"
  - Accommodation → "accommodation"
  - Live MUN (disabled with tooltip "Pro only" if not Pro) → "livemun"
  - Dress Code → "dresscode"
- Save the array; preserve existing settings logic.

**6c. New Modules hub page** `events/[id]/modules/page.tsx`:
- Read `event.optionalModules` array
- Render Tabs — only show tabs for enabled modules
- Per-tab content:
  - **Food tab:** Table of food slots + "Add Slot" dialog (mealName, timeWindow, venue, day). CSV bulk upload button.
  - **Transport tab:** Cards per route showing capacity meter + registered delegates list (read from `route.registeredDelegates`). "Send Route Reminder" button (uses existing Resend announcement infrastructure).
  - **Accommodation tab:** Cards per block + pending requests list with Approve/Reject buttons.
  - **Live MUN tab (Pro-gated):** Live session list with embed URL input, schedule, status toggle "Live / Idle".
  - **Dress Code tab:** Textarea for guidance + ImageURL inputs (use imgBB or Firebase Storage; copy pattern from event cover photo).

**6d. Update Firestore rules** — add write permissions for event organizer:
```
match /events/{eventId}/foodSlots/{slotId} { allow read: if isSignedIn(); allow write: if eventOrganizer(eventId); }
match /events/{eventId}/transportRoutes/{routeId} { ... }
match /events/{eventId}/accommodationBlocks/{blockId} { ... }
match /events/{eventId}/accommodationRequests/{reqId} { ... }
match /events/{eventId}/liveSessions/{sessionId} { ... }
```

**Do not:**
- Remove or modify any delegate-side module component — they already read from these collections.
- Change existing FoodSlot / TransportRoute / AccommodationBlock interfaces (additive only).

---

### 🅵 GAP 7 — POSITION PAPER VIEWER WIRING (CHAIR SIDE)

**Files to modify:**
- `src/app/dashboard/chair/committee/[id]/page.tsx`
- `src/components/features/chair/PositionPaperViewer.tsx` (verify it exists and is complete)

**Step-by-step:**
- The viewer component **already exists** but is not opened from the chair page's "View All Papers" Sheet.
- In the Sheet rows, replace the existing "Download" link with a row click handler that opens a full-screen Dialog containing `<PositionPaperViewer applicationId={...} delegateId={...} eventId={eventId} committeeName={committeeName} paperUrl={delegate.positionPaperUrl} />`
- KEEP the Sheet — it's the entry point. Just add the row click.
- Status badge on each row reflects `paperStatus` from markings doc (review/approved/revision/flagged).

**Do not:**
- Remove the Sheet listing or change the Daily Marking Matrix.
- Modify the delegate-side `PositionPaperUpload.tsx` more than the status display update.

---

### 🅶 GAP 8 — NOTIFICATION PREFERENCES HONORED

**Files to modify:**
- `functions/src/processAnnouncement.ts` (READ user prefs before sending)
- `src/lib/services/applicationService.ts` (any function that triggers approval/rejection notification — check before queuing)
- `src/lib/services/announcementService.ts` (if it filters recipients)

**Step-by-step:**

**8a. In `processAnnouncement.ts`** before sending the email batch:
```typescript
for (const recipient of recipients) {
  const userDoc = await admin.firestore().collection("users").doc(recipient.uid).get();
  const prefs = userDoc.data()?.notificationPreferences;
  // Skip if user has opted out of this category
  if (announcement.category === "new_event" && prefs?.emailOnNewEvent === false) continue;
  // ... existing send logic
}
```

**8b. For approval/rejection emails** (in application approval flow):
- Before sending, fetch user prefs; skip email if `emailOnApproval === false` or `emailOnRejection === false`.
- Always still write the in-app activity log so users see it in their feed.

**8c. Add a small notice in `/dashboard/settings` notifications tab:**
"You'll always see updates in your in-app activity feed. These toggles only control email."

**Do not:**
- Remove notifications entirely if a user opts out — keep in-app feed updates.
- Change the preferences schema.

---

## ✅ FINAL VERIFY CHECKLIST (run all)

- [ ] `/dashboard/articles` shows my drafts + published with edit/delete actions
- [ ] `/dashboard/articles/new` writes a new article (draft or published)
- [ ] `/dashboard/articles/[id]/edit` loads existing content and updates it
- [ ] `/dashboard/achievements` shows real award cards from `getUserAchievements`
- [ ] `/dashboard/network` shows all connections, lets me disconnect, block, unblock
- [ ] `/dashboard/payments` shows my payment history per event
- [ ] `/dashboard/organizer/events/[id]/modules` lets organizer CRUD all 5 module types
- [ ] Settings tab toggles each module on/off and the toggle reflects on delegate side
- [ ] Chair clicks a paper row in the Sheet → full-screen viewer opens with grade + comments
- [ ] Delegate who set `emailOnNewEvent: false` no longer gets new-event announcement emails
- [ ] Every page renders without horizontal scroll at 375px
- [ ] No existing feature is broken (run through the existing E2E flows: login, apply, message, complaint, organizer event create)

---

## 🚫 DO NOT (GLOBAL)

- Do not modify Firestore schemas — extend only with optional fields if absolutely required.
- Do not remove the existing "Coming Soon" pages without replacing the content.
- Do not skip the empty states or skeletons — UX matters.
- Do not change the navigation structure outside of adding the few new entries.
- Do not call `alert()` for success — use the existing toast / inline success pattern.
- Do not introduce new dependencies. Everything needed is already installed.

---

## 📦 NEW NAV ENTRIES TO ADD (in `src/components/dashboard/Sidebar.tsx`)

Under "Standard Sidebar":
- "My Articles" → `/dashboard/articles` (FileText icon)
- "Achievements" → `/dashboard/achievements` (Trophy icon)
- "Network" → `/dashboard/network` (Users icon)
- "Payments" → `/dashboard/payments` (Wallet icon)

Under "Organizer Event Sidebar" (when on an event sub-route):
- "Modules" → `${base}/modules` (Layers icon)

---

## 📊 EFFORT ESTIMATE

| Gap | Days |
|---|---|
| 1 + 2 (My Articles + Editor) | 2 |
| 3 (Achievements) | 0.5 |
| 4 (Network) | 1.5 |
| 5 (Payment History) | 1 |
| 6 (Optional Modules Editor) | 3 |
| 7 (Position Paper Viewer wiring) | 0.5 |
| 8 (Notification prefs honored) | 0.5 |
| **TOTAL** | **~9 days** |

---

*End of prompt. Feed this entire file to your vibe-code tool in a single shot. Every gap is independent — if you want to ship in waves, do Gap 3 + 7 + 8 first (lowest effort, highest user-visible impact), then 1+2, then 4+5, then 6 last (largest).*
