# Section D — Organizer Features: Full Implementation Plan

**Platform:** MyMUN (Next.js + Firebase + Shadcn UI + Tailwind CSS)
**Scope:** All features under the Organizer role
**Status Reference:** Phases 5–7 of project roadmap

---

## Overview of Sub-Features

| ID   | Feature                    | Complexity | Depends On                  |
|------|----------------------------|------------|-----------------------------|
| D1   | Pro Membership             | Medium     | Auth, Firestore user schema |
| D2   | Event Creation             | High       | D1, Firebase Storage        |
| D3   | Financials (Ticketing)     | High       | D2, Stripe                  |
| D4   | Capacity Management        | Medium     | D2, D3                      |
| D5   | Staffing                   | High       | D2, Auth                    |
| D6   | Communication              | Medium     | D2, Email service           |
| D7   | Event Tools                | High       | D2, PDF gen, Firebase       |
| D8   | Country Management         | High       | D2, AI integration          |
| D9   | Partners                   | Low        | D2, Firebase Storage        |

---

## D1 — Pro Membership

### Goal
Allow an organizer to apply for or upgrade to Pro status, which gates advanced features on their conferences.

### Firestore Schema

```
users/{uid}
  - role: "organizer"
  - proStatus: "none" | "pending" | "active" | "rejected"
  - proAppliedAt: Timestamp
  - proActivatedAt: Timestamp
  - proFeatures: string[]   // e.g., ["live_mun", "ai_country_assignment"]
```

### Pages & Components

- `src/app/dashboard/organizer/pro/page.tsx` — Pro upgrade landing with feature comparison table (Free vs Pro)
- `src/app/dashboard/organizer/pro/apply/page.tsx` — Application form (org name, size, motivation, agreement)
- `src/components/features/organizer/ProBadge.tsx` — Badge component shown on dashboard header
- `src/components/features/organizer/ProGate.tsx` — HOC/wrapper that locks Pro-only UI sections

### Logic

- On submit, set `proStatus: "pending"` and create doc in `proApplications/{uid}`.
- App Admin dashboard receives notification and can approve/reject.
- On approval, a Firebase Function updates `proStatus: "active"` and writes `proActivatedAt`.
- `ProGate` component checks `proStatus === "active"` before rendering children; otherwise shows upgrade CTA.

### Pro-Locked Features (enforced via ProGate)
- AI Country Assignment
- Live MUN module
- Advanced certificate templates
- Bulk email announcements (>50 recipients)
- Custom event themes

---

## D2 — Event Creation

### Goal
Multi-step form for organizers to create a Free or Paid conference with all structural settings.

### Firestore Schema

```
events/{eventId}
  - organizerUid: string
  - title: string
  - shortName: string
  - coverPhotoUrl: string
  - type: "free" | "paid"
  - format: "in-person" | "online" | "hybrid"
  - location: { venue, city, country, coordinates }
  - dates: { start: Timestamp, end: Timestamp, applicationDeadline: Timestamp }
  - status: "draft" | "published" | "closed" | "completed"
  - committees: CommitteeConfig[]
  - executiveBoard: StaffMember[]
  - theme: string           // references a theme key
  - createdAt: Timestamp
  - updatedAt: Timestamp
```

```
events/{eventId}/committees/{committeeId}
  - name: string
  - type: string            // e.g., "GA", "SC", "Crisis"
  - topic: string
  - capacity: number
  - filledSeats: number
  - countries: string[]
  - chairs: uid[]
```

### Pages & Components

- `src/app/dashboard/organizer/events/create/page.tsx` — Multi-tab creation wizard (already scaffolded; extend)
  - Tab 1: **Basics** — Title, short name, format, cover photo upload
  - Tab 2: **Details** — Dates, location (Google Maps autocomplete), description
  - Tab 3: **Committees** — Add/edit committees, assign chairs (Executive Board), set capacity
  - Tab 4: **Schedule** — Add schedule items (already built)
  - Tab 5: **Financials** — Ticketing tiers (see D3)
  - Tab 6: **Settings** — Theme selection, optional modules toggle, country assignment mode

- `src/components/features/organizer/CommitteeEditor.tsx` — Dynamic committee builder with capacity input
- `src/components/features/organizer/ExecutiveBoardAssigner.tsx` — Search & assign users to Director/USG/Chair roles
- `src/components/ui/ImageUploader.tsx` — Cover photo upload with preview (Firebase Storage)

### Logic

- Cover photo → Firebase Storage at `events/{eventId}/cover.jpg`; URL written to Firestore.
- Draft auto-save every 30 seconds using `debounce` + Firestore `setDoc(..., { merge: true })`.
- Publish button validates all required tabs before flipping `status` to `"published"`.
- Organizer can return to edit any field before application deadline.

---

## D3 — Financials: Ticketing, Dashboard, Wallet

### Goal
Set tiered pricing for conference applications, receive payments via Stripe, track revenue in a dashboard.

### Firestore Schema

```
events/{eventId}/ticketingTiers/{tierId}
  - name: string              // "Early Bird", "Regular", "Late"
  - price: number
  - currency: string          // "USD", "EUR", etc.
  - capacity: number
  - sold: number
  - windowStart: Timestamp
  - windowEnd: Timestamp
  - active: boolean

events/{eventId}/payments/{paymentId}
  - applicantUid: string
  - tierId: string
  - amount: number
  - status: "pending" | "paid" | "refunded"
  - stripePaymentIntentId: string
  - createdAt: Timestamp

organizers/{uid}/wallet
  - balance: number
  - currency: string
  - pendingPayout: number
  - lastPayoutAt: Timestamp
  - stripeAccountId: string   // Stripe Connect Express account
```

### Pages & Components

- `src/app/dashboard/organizer/financials/page.tsx` — Financial hub with tabs:
  - **Overview** — Revenue summary cards, recent payments table, tier performance bar chart
  - **Tiers** — Edit ticketing tiers (already scaffolded in event creation; surfaces here for live editing)
  - **Wallet** — Current balance, payout history, "Request Payout" button

- `src/components/features/organizer/TierStatusCard.tsx` — Shows sold/capacity per tier with progress bar
- `src/components/features/organizer/PaymentTable.tsx` — Sortable table: applicant, tier, amount, status, date
- `src/components/features/organizer/WalletPanel.tsx` — Balance display, payout form (bank/Stripe)

### Logic

- **Stripe Connect**: Organizer onboards via Stripe Express on first payout setup. A Firebase Function handles the OAuth flow and stores `stripeAccountId`.
- **Payment Intent**: On applicant checkout, a Firebase Function creates a `PaymentIntent` with `application_fee_amount` = 7% for platform cut.
- **Webhook**: Stripe webhook → Firebase Function → updates `payments/{id}.status` to `"paid"` and increments `wallet.balance`.
- **Active Tier Resolution**: At application time, query tiers where `windowStart ≤ now ≤ windowEnd && sold < capacity`; auto-apply the correct tier.
- **Manual Payment Registration**: Organizer can mark an applicant as paid manually (free up to a threshold, then flagged to admin).

---

## D4 — Capacity Management

### Goal
Organizer can expand seat limits for committees or open new seats, reactivating the payment gate. Waitlist management for full committees.

### Firestore Schema

```
events/{eventId}/committees/{committeeId}
  - capacity: number            // current max
  - filledSeats: number
  - waitlist: WaitlistEntry[]   // or sub-collection

events/{eventId}/waitlist/{entryId}
  - applicantUid: string
  - committeeId: string
  - position: number
  - notifiedAt: Timestamp | null
  - status: "waiting" | "offered" | "accepted" | "expired"
```

### Pages & Components

- `src/app/dashboard/organizer/events/[eventId]/capacity/page.tsx`
  - Committee capacity cards with "Add Seats" button (input for extra seats)
  - Waitlist table per committee (name, position, applied date, "Offer Seat" action)

- `src/components/features/organizer/CapacityCard.tsx` — Visual capacity meter per committee
- `src/components/features/organizer/WaitlistTable.tsx` — Ranked waitlist with bulk or individual offer actions

### Logic

- "Add Seats": increments `capacity` by N. If `paid` event, Firestore Function re-opens the payment gate for next in waitlist.
- **Offer Seat Flow**: Organizer clicks "Offer Seat" → applicant gets email notification (see D6) with 48h acceptance window. If not accepted → next in waitlist is offered.
- Waitlist position is a `number` field; on removal, a batch write re-sequences remaining entries.
- Payment gate re-activation: if `filledSeats >= capacity`, new applications are auto-added to waitlist instead of payment flow.

---

## D5 — Staffing

### Goal
Organizers can invite or accept applications for co-organizer, USG, Director roles. Granular permission controls per role.

### Firestore Schema

```
events/{eventId}/staff/{uid}
  - uid: string
  - role: "co-organizer" | "usg" | "director" | "chair" | "vice-chair" | "observer" | "faculty-advisor"
  - committeeId: string | null   // null for event-level roles
  - permissions: PermissionsMap
  - inviteStatus: "invited" | "applied" | "accepted" | "rejected"
  - addedAt: Timestamp

// PermissionsMap shape
{
  canViewApplications: boolean,
  canMarkDelegates: boolean,
  canSendAnnouncements: boolean,
  canManageSchedule: boolean,
  canViewFinancials: boolean,   // co-organizer only
  canApproveResults: boolean,
}
```

### Pages & Components

- `src/app/dashboard/organizer/events/[eventId]/staff/page.tsx`
  - Tabs: **Current Staff** | **Invitations** | **Applications**
  - Staff list grouped by role with permission toggles and remove action

- `src/components/features/organizer/StaffInviteModal.tsx` — Search by email/username, select role, send invite
- `src/components/features/organizer/StaffApplicationCard.tsx` — Applicant card with accept/reject and role assignment
- `src/components/features/organizer/PermissionsEditor.tsx` — Toggle matrix per staff member (role presets + overrides)

### Invite vs Apply Mode (per event setting)
- **Invite Mode**: Only organizer can add staff. Uses `StaffInviteModal`.
- **Apply Mode**: A public "Join as Staff" CTA appears on event page (role-filtered). Organizer reviews in Applications tab.
- Toggle set during event creation → `events/{eventId}.staffMode: "invite" | "apply"`

### Role Hierarchy & Controls
- **Co-Organizer**: Same permissions as main organizer except cannot delete the event or change financial settings.
- **USG / Director**: Access to assigned committees, can manage chairs within their scope.
- **Chair**: Can be promoted to VC or Director; privileges toggled via `PermissionsEditor`.
- **Observer / Faculty Advisor**: Read-only by default; organizer can grant specific abilities individually.

---

## D6 — Communication: Bulk Email Announcements

### Goal
Organizers send targeted email blasts to all participants or filtered subsets.

### Firestore Schema

```
events/{eventId}/announcements/{announcementId}
  - subject: string
  - body: string             // rich text / HTML
  - audience: AudienceFilter
  - sentAt: Timestamp
  - sentBy: uid
  - recipientCount: number
  - status: "draft" | "sent" | "failed"

// AudienceFilter shape
{
  roles: ("delegate" | "chair" | "observer" | "faculty-advisor" | "staff")[],
  committees: string[],     // empty = all
  paymentStatus: ("paid" | "unpaid" | "all"),
}
```

### Pages & Components

- `src/app/dashboard/organizer/events/[eventId]/announcements/page.tsx`
  - History list of sent announcements
  - "New Announcement" button → slide-over or modal

- `src/components/features/organizer/AnnouncementComposer.tsx`
  - Rich text editor (Tiptap or Quill)
  - Audience filter checkboxes (roles, committees, payment status)
  - Estimated recipient count (live query preview)
  - Send Now / Save Draft buttons

### Logic

- On "Send": Firebase Function queries matching `applications` and `staff`, collects emails, batches sends via **SendGrid** or **Resend** API (max 100/batch to avoid rate limits).
- Pro gate: >50 recipients requires `proStatus === "active"`.
- Recipient count preview: client-side Firestore `count()` query with same filter — no full read needed.
- Email template: branded MyMUN header, conference name/logo, body, unsubscribe footer.

---

## D7 — Event Tools

### Goal
Post-event tooling: bulk ID card generation, certificate templates, theme selection, and result approvals.

### Sub-Feature: Bulk ID Card Generation

- `src/app/dashboard/organizer/events/[eventId]/tools/id-cards/page.tsx`
  - Participant list with checkboxes (select all / by committee)
  - Preview panel showing a single ID card (template-based)
  - "Generate ZIP" button → Firebase Function renders cards server-side → Storage → download link

- `src/components/features/organizer/IdCardPreview.tsx` — Live preview using Canvas or HTML/CSS
- **ID Card fields**: name, role, committee, country flag, conference logo, QR code (links to participant profile)
- **Templates**: 2–3 built-in designs selectable per event

### Sub-Feature: Certificate Template Selection

- `src/app/dashboard/organizer/events/[eventId]/tools/certificates/page.tsx`
  - Template gallery (3–5 built-in designs)
  - Preview with sample delegate name and award type
  - "Set as Event Default" confirmation
  - Per-award customization: Best Delegate, Outstanding Delegate, Verbal Mention, etc.

- Templates stored as `certificates/templates/{templateId}` in Firebase Storage (SVG or HTML)
- Dynamic fields: `{{delegate_name}}`, `{{award}}`, `{{committee}}`, `{{conference_name}}`, `{{date}}`

### Sub-Feature: Theme Selection

- Themes affect event's public page and delegate dashboard color scheme
- `src/app/dashboard/organizer/events/[eventId]/tools/theme/page.tsx`
  - Visual theme swatches (5–6 presets: Classic Blue, Dark Diplomat, Emerald, Sand, etc.)
  - Live preview iframe of event public page with selected theme applied
  - Save button writes `events/{eventId}.theme`

- Pro gate: custom color theme (hex picker) requires Pro.

### Sub-Feature: Result Approvals

- `src/app/dashboard/organizer/events/[eventId]/tools/results/page.tsx`
  - Per-committee results submitted by Chairs (from marking system)
  - Organizer reviews: delegate name → award type → approve / request revision
  - "Approve All" bulk action
  - Once approved, delegates' certificate download is unlocked

- Firestore: `events/{eventId}/committees/{committeeId}/results/{delegateUid}`
  - `status: "pending" | "approved" | "revision_requested"`
  - `approvedBy: uid`, `approvedAt: Timestamp`

---

## D8 — Country Management

### Goal
Each applicant is assigned a country within their selected committee. Organizer has 24h to assign manually; if not, AI auto-assigns.

### Firestore Schema

```
events/{eventId}.countryAssignmentMode: "manual" | "ai"
events/{eventId}.assignmentDeadline: Timestamp   // applicationDeadline + 24h

applications/{appId}
  - assignedCountry: string | null
  - assignmentSource: "manual" | "ai" | null
  - assignedAt: Timestamp | null

events/{eventId}/committees/{committeeId}
  - countries: string[]           // available pool
  - assignedCountries: { [country]: uid }  // conflict map
```

### Conflict Avoidance System

- Before any assignment (manual or AI), check: has this `uid` been assigned this `country` in **any** previous event?
- Firestore index: `applications` where `uid == X && assignedCountry == Y` → if count > 0, flag as conflict.
- Conflict shown as yellow warning badge on manual assignment UI; AI automatically skips conflicted pairings.

### Pages & Components — Manual Mode

- `src/app/dashboard/organizer/events/[eventId]/countries/page.tsx`
  - Per-committee accordion: applicant list with country selector dropdown
  - Conflict badge (🟡) shown next to conflicted country options
  - Countdown timer showing time remaining in 24h window
  - "Save Assignments" triggers batch Firestore write

- `src/components/features/organizer/CountryAssignmentRow.tsx` — Applicant row with country dropdown + conflict indicator

### AI Assignment Mode

- **Trigger**: Firebase Scheduled Function (`every 1 hour`) checks events where:
  - `countryAssignmentMode: "ai"` OR deadline has passed with unassigned applicants
- **AI Evaluation Criteria** (Claude API via Firebase Function):
  - Applicant's stated country preferences (1st, 2nd, 3rd choice)
  - Applicant's experience level (delegate history from `applications` collection)
  - Conflict history (countries previously held)
  - Committee balance (ensure diverse delegation)
- **Prompt Structure** (sent to `claude-sonnet-4-20250514`):
  - System: MUN country assignment expert
  - User: JSON payload of `{ applicants: [...], availableCountries: [...], conflicts: [...] }`
  - Response: JSON map `{ applicantUid: assignedCountry }`
- **Post-Assignment**: Function writes results to Firestore and sends email notifications to all assigned delegates.

### Firebase Function: `autoAssignCountries`

```typescript
// Pseudocode
export const autoAssignCountries = onSchedule("every 60 minutes", async () => {
  const overdueEvents = await getEventsPassedDeadlineWithUnassigned();
  for (const event of overdueEvents) {
    const applicants = await getUnassignedApplicants(event.id);
    const conflicts = await getConflictMap(applicants);
    const assignment = await callClaudeForAssignment(applicants, conflicts, event.committees);
    await batchWriteAssignments(event.id, assignment);
    await notifyApplicants(assignment);
  }
});
```

---

## D9 — Partners

### Goal
Organizer adds sponsor/partner logos and descriptions to display on the event public page and delegate dashboard.

### Firestore Schema

```
events/{eventId}/partners/{partnerId}
  - name: string
  - logoUrl: string         // Firebase Storage
  - description: string
  - websiteUrl: string
  - tier: "gold" | "silver" | "bronze" | "media"
  - order: number           // display sort
```

### Pages & Components

- `src/app/dashboard/organizer/events/[eventId]/partners/page.tsx`
  - Partner card grid with add/edit/delete
  - Drag-to-reorder (react-beautiful-dnd or dnd-kit)
  - "Add Partner" modal with logo upload, name, URL, tier selector

- `src/components/features/organizer/PartnerCard.tsx` — Display card with logo, name, tier badge
- `src/components/features/public/PartnerStrip.tsx` — Read-only strip on event public page (auto-renders from `partners` sub-collection)

### Logic

- Logo upload → Firebase Storage at `events/{eventId}/partners/{partnerId}/logo.png`
- Max 20 partners per event (enforced client + Firestore rules)
- Tier controls display size: Gold logos larger than Silver/Bronze

---

## Development Phases for Section D

---

### Phase D-1: Foundation & Pro Membership
**Estimated Duration: 3–4 days**

- [ ] Extend Firestore `users` schema with `proStatus`, `proFeatures`
- [ ] Build `/dashboard/organizer/pro` upgrade landing page (feature comparison table)
- [ ] Build Pro application form; write to `proApplications` collection
- [ ] Build `ProGate` HOC component; apply to Pro-locked UI areas
- [ ] App Admin: add Pro approval/rejection controls
- [ ] Firebase Function: on approval, flip `proStatus` and notify organizer via email

**Deliverables:** Pro application flow end-to-end; ProGate enforcing locks across the dashboard.

---

### Phase D-2: Event Creation (Extended)
**Estimated Duration: 4–5 days**

- [ ] Extend existing create form with Settings tab (theme picker, assignment mode toggle, optional modules)
- [ ] Build `CommitteeEditor` with dynamic add/remove, capacity inputs, chair assignment
- [ ] Build `ExecutiveBoardAssigner` (user search → assign to Director/USG slot)
- [ ] Implement Firebase Storage cover photo upload with preview
- [ ] Auto-save draft (debounced Firestore merge every 30s)
- [ ] Add country pool input per committee (CSV import or manual country list)
- [ ] Publish validation: check all required fields before status flip

**Deliverables:** Complete, fully-functional event creation wizard.

---

### Phase D-3: Financials & Stripe Integration
**Estimated Duration: 5–6 days**

- [ ] Stripe Connect Express onboarding flow for organizers (Firebase Function + OAuth)
- [ ] Ticketing tier live editor in `/financials` (edit after event creation)
- [ ] Payment Intent creation Firebase Function (with 7% platform fee)
- [ ] Stripe webhook handler → update `payments` collection + `wallet.balance`
- [ ] Build Payment Dashboard (revenue cards, payments table, tier performance chart)
- [ ] Build Wallet panel (balance, payout history, request payout)
- [ ] Manual payment registration UI (admin-visible above threshold)
- [ ] Active tier auto-resolution logic at application time

**Deliverables:** Full payment pipeline from applicant checkout to organizer wallet.

---

### Phase D-4: Capacity Management & Waitlist
**Estimated Duration: 2–3 days**

- [ ] Capacity management page with per-committee seat meters
- [ ] "Add Seats" action with Firestore update + payment gate reactivation
- [ ] Waitlist sub-collection setup and auto-add on full committee
- [ ] Waitlist table with "Offer Seat" action
- [ ] 48h offer acceptance window: scheduled Function to expire and advance queue
- [ ] Applicant email notification on seat offer

**Deliverables:** Full waitlist lifecycle from join to acceptance.

---

### Phase D-5: Staffing System
**Estimated Duration: 4–5 days**

- [ ] Staff Firestore sub-collection schema and security rules
- [ ] Staff management page (three tabs: current, invitations, applications)
- [ ] `StaffInviteModal` — user search + role selection + invite send
- [ ] Invite/Apply mode toggle in event settings; public "Join as Staff" CTA
- [ ] `PermissionsEditor` — toggle matrix with role presets and per-user overrides
- [ ] Staff role enforcement in Firestore Rules (`request.auth.uid` in event's staff map)
- [ ] Accept/reject flow for both invite (invitee accepts) and apply (organizer accepts) modes

**Deliverables:** Complete staff invitation, application, and permission system.

---

### Phase D-6: Communication (Bulk Email)
**Estimated Duration: 2–3 days**

- [ ] Integrate SendGrid or Resend API (Firebase Functions environment variable)
- [ ] Announcement composer with Tiptap rich text editor
- [ ] Audience filter UI with live recipient count preview
- [ ] Send action: Firebase Function batches emails (100/batch)
- [ ] Announcement history list with status indicators
- [ ] Pro gate enforcement for >50-recipient sends

**Deliverables:** Working bulk email system with audience filtering.

---

### Phase D-7: Event Tools (ID Cards, Certs, Themes, Results)
**Estimated Duration: 5–6 days**

- [ ] **ID Cards**: Template designs (2–3 HTML/Canvas), bulk generation Firebase Function, ZIP download
- [ ] **Certificates**: Template gallery UI, award-type configuration, delegate unlock on approval
- [ ] **Themes**: Theme swatches, live preview iframe, save to Firestore
- [ ] **Result Approvals**: Per-committee result review UI, approve/revision flow, bulk approve action
- [ ] Certificate download unlock trigger: on `result.status === "approved"`

**Deliverables:** Full post-event tooling suite.

---

### Phase D-8: Country Management
**Estimated Duration: 5–7 days**

- [ ] Country pool editor per committee (manual list + CSV import)
- [ ] Manual assignment UI: drag-and-drop or dropdown assignment per applicant with conflict detection
- [ ] Conflict avoidance system: cross-event history query + badge indicator
- [ ] Countdown timer display in manual assignment view
- [ ] `autoAssignCountries` Firebase Scheduled Function scaffold
- [ ] Claude API integration for AI assignment (prompt + JSON response parsing)
- [ ] AI assignment result write + delegate email notifications
- [ ] Fallback: if AI call fails, flag event for admin manual review

**Deliverables:** Full manual assignment flow + AI auto-assignment fallback.

---

### Phase D-9: Partners
**Estimated Duration: 1–2 days**

- [ ] Partners management page with add/edit/delete modals
- [ ] Logo upload to Firebase Storage
- [ ] Drag-to-reorder with `dnd-kit`
- [ ] `PartnerStrip` component on event public page
- [ ] Tier-based display sizing

**Deliverables:** Full partner management and public display.

---

## Firestore Security Rules Summary for Section D

```
// Only the event organizer (or co-organizer with permission) can write
match /events/{eventId} {
  allow write: if request.auth.uid == resource.data.organizerUid
                || isCoOrganizer(request.auth.uid, eventId);
  allow read: if true;  // public

  match /staff/{uid} {
    allow read: if isEventStaff(request.auth.uid, eventId);
    allow write: if isOrganizerOrCoOrg(request.auth.uid, eventId);
  }

  match /payments/{paymentId} {
    allow read: if request.auth.uid == resource.data.applicantUid
                 || isOrganizerOrCoOrg(request.auth.uid, eventId);
    allow write: if false;  // only Firebase Functions write payments
  }

  match /partners/{partnerId} {
    allow read: if true;
    allow write: if isOrganizerOrCoOrg(request.auth.uid, eventId);
  }
}

match /users/{uid}/wallet {
  allow read: if request.auth.uid == uid;
  allow write: if false;  // only Firebase Functions write wallet
}
```

---

## Total Estimated Timeline

| Phase | Feature Group                        | Days |
|-------|--------------------------------------|------|
| D-1   | Pro Membership                       | 3–4  |
| D-2   | Event Creation (Extended)            | 4–5  |
| D-3   | Financials & Stripe                  | 5–6  |
| D-4   | Capacity Management & Waitlist       | 2–3  |
| D-5   | Staffing System                      | 4–5  |
| D-6   | Communication (Bulk Email)           | 2–3  |
| D-7   | Event Tools                          | 5–6  |
| D-8   | Country Management + AI              | 5–7  |
| D-9   | Partners                             | 1–2  |
| **Total** |                                 | **31–41 days** |

> Assuming one developer. Parallel execution on D-4/D-6/D-9 can compress to ~22–28 days with two developers.

---

*Generated for MyMUN SaaS Platform — Section D: Organizer Features*
