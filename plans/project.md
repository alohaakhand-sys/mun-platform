# Orchestration Document: MUN Platform (SaaS)

## 1. Project Overview & Architecture
**Stack:** Next.js, Tailwind CSS, Shadcn UI
**Backend & Auth:** Firebase (Authentication, Firestore Database)
**Target:** Fully responsive web application (Mobile & Desktop)

## 2. Global Configurations
- **Authentication:** Google, LinkedIn, Facebook, Email/Password.
- **Roles:** Guest, Delegate, Chair, Organizer, App Admin.
- **UI/UX:** Shadcn UI components for standard, accessible forms, modals, and tables. Tailwind for custom layout.

---

## 3. Page & Feature Architecture

### Public & Discovery
- **Home:** Navbar, Footer. Gateway to Events and Articles.
- **Event Page:** Public view of events. *Condition:* Login required to apply.
- **Article Page:** Publicly readable. *Condition:* Login required to comment (Guest commenting optional/managed).
- **Login / Sign Up:** OAuth providers, Email/Password login, "Forgot Password", and "Create Account" toggle.
- **Discovery Dashboard:**
  - **Header:** Personalized welcome, user profile summary, role badge (Delegate, Chair, etc.), and notifications.
  - **Feed Interface (Facebook-like):** Activity log, last MUN activity, explore articles and events.
  - **Quick Actions (Double Button):** "My Articles" & "My Conferences", "My Achievements".
  - **Next Version Items:** Reels-like conference exploration, detailed list views.
  - **Settings:** Gear icon, Payment history.

### User Dashboards (Role-Based)

#### A. My Conference (Common Base)
- **Status Overview:** All applied MUNs, current status, payment history, assigned country, assigned committee, full committee list.
- **Messaging System:** Online active status, individual messaging, group messaging (tied to conferences). Profiles connected.
- **Social:** Auto-follow system with manual disconnect/block functionality.

#### B. Delegate Features
- **Application:** 3 choices for every committee and country.
- **Roles:** Delegate, Observer, Team Delegation, Faculty Advisor.
- **Articles & Papers:** Submit position papers. View study guides (Read-only during conference, open to public comments post-conference).
- **Results & Marking:** View daily individual results and overall committee scores.
- **Certificates:** Download post-conference Certificates and Awards.
- **Schedules:** Real-time room notifications, today's schedule, special announcements.
- **Complaints:** Hierarchy-based complaint system (to Chair -> Organizer -> Main Organizer -> App Admin).
- **Optional Modules (If enabled by Organizer):** Food Coupons (discounts), Transport, Accommodation, Live MUN (Pro feature), Dress Code.

#### C. Chair Features
- **Study Guides:** Upload and manage study guides for delegates.
- **Markings:** Daily debate marking (scored out of 100), evaluate position papers, custom marking templates.
- **Management:** View conference partners, ID card generation access, full management of committee group chats.

#### D. Organizer Features
- **Pro Membership:** Form to apply/upgrade via MyMUN. Pro unlocks advanced features for their created conferences.
- **Event Creation:** Free/Paid event setup. Includes title, cover photo, location, committees, capacities, judge assignments (Executive Board).
- **Financials:** Ticketing tiers (Early Bird, Regular, Late), Payment Dashboard, Wallet.
- **Capacity Management:** Open extra seats (reactivates payment gate), waitlist management.
- **Staffing:** Invite/Apply mode for adding co-organizers, USG, Directors. Control abilities for observers and faculty advisors. Control Chair privileges (Chair, VC, Director).
- **Communication:** Bulk email announcements.
- **Event Tools:** Bulk ID card generation, certificate template selection, theme selection, result approvals.
- **Country Management:** Conflict avoidance system. 
  - *Manual Mode:* Organizer assigns countries within 24h.
  - *AI Mode:* If not assigned in 24h, AI evaluates applicant data and automatically assigns countries.
- **Partners:** Add partner logos and descriptions.

#### E. App Admin
- Total global control over organizers, events, payments, and system settings.

---

## 4. Development Phases

### Phase 1: Initialization & Foundation
- [x] Initialize Next.js project with Tailwind CSS.
- [x] Configure Shadcn UI and add base components (Buttons, Inputs, Cards, Dialogs, Navbars).
- [x] Setup Firebase Auth (Email/Pass, Google, Facebook, LinkedIn providers).
- [x] Setup Firestore Database structure (Collections: `users`, `events`, `articles`, `applications`).
- [x] Build global layout (Navbar, Footer, Responsive wrappers).

### Phase 2: Public & Auth Modules
- [x] Build Home, Event details, and Article details pages.
- [x] Implement robust Authentication guards and Login/Signup screens.
- [x] Build User Profile onboarding (capturing initial roles).

### Phase 3: Core Dashboards & Discovery
- [x] Build Discovery Dashboard (Feed, Activity logs, Notifications).
- [x] Build "My Conferences" base view and status tracking.
- [x] Implement global Messaging logic (Firestore listeners for 1-1 and group chats).

### Phase 4: Delegate Flow
- [x] Delegate application wizard (Country/Committee selections).
- [x] Implement document uploads (Position Papers).
- [x] Build Schedule viewer and real-time notifications.
- [x] Implement Complaint system and optional feature UI (Food, Transport).

### Phase 5: Organizer & Chair Workflows
- [x] Build complex Event Creation Form for Organizers (Capacities, Tiers, Pricing).
- [x] Build Chair dashboard for marking (0-100 scoring system) and Study Guide management.
- [x] Implement Organizer Country Assignment interface (Manual Drag-and-drop / Select).
- [x] Implement AI Mode for country assignment (Background cron job or Firebase Function).

### Phase 6: Post-Event & Admin
- [x] Certificate generation and download workflows.
- [x] Build App Admin global oversight dashboard.
- [x] Security rules audit (Firestore Rules to lock down data per role).
- [x] Final UI polish, responsiveness testing, and QA.

### Phase 7: Future Refinements
- [ ] Payment Gateway Integration (Stripe/PayPal) for Ticketing. **NOTE: Currently using a dummy/mock Stripe implementation for developer-friendly testing. After completing all other features, this will be made perfect/production-ready.**
- [ ] Upgrade AI Country Assignment from heuristics to full LLM-based logic.

