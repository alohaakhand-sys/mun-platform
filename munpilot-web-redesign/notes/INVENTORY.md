# Website redesign: page inventory and board plan (scratch notes)

## Decisions (user, 2026-10-31)
- Design only, no code. Every page and every feature; nothing dropped.
- Live MUN screens are excluded.
- Every page gets a desktop (1440) frame and a phone (390) frame, in light and dark.
- Keep each page's layout and keep the colours (press-sheet tokens).
- Typography: Newsreader serif for display headings only; Inter for the rest of the UI.
- Logo: MUN Pilot wordmark, replacing "MUN PRO".
- Polish rules:
  - Glass sticky header.
  - Grey and white section bands on long pages.
  - Sand promo band; navy only in the hero.
  - Hover: card lifts and its title turns green.
  - Search bar: light fill with a hairline border.

## Excluded (Live MUN)
- conferences/[id]/live
- chair/committee/[id]/live
- ceremony/[eventId]
- admin/live-sessions/observe
- organizer/events/[id]/live (Live Control)
- admin/live-sessions list: optional; ask the user

## Shells
- **Public:** Navbar + Footer.
- **Auth:** split layout (form + graphic). Today it uses the indigo gradient; restyle it to the paper look.
- **DashboardShell:**
  - Sidebar 256px, collapsible to 76px, with a UserCard (bell + profile menu).
  - Mobile: top bar + drawer.
  - FloatingMessageButton opens a chat panel.
- **Sidebar variants:**
  - Standard: Dashboard, My Conferences, Documents, My Blogs, Achievements, Network, Payments, Settings. Role sections add EB, Chair, Observer and Organizer.
  - Admin
  - Organizer: Manage Events, Financials, Pro
  - Event:
    - Setup: Overview, Details, Allocation, Committees, Partners
    - Content: Schedule, Announcements, Rules
    - Live Control
    - Tools: Modules, Complaints, ID Cards, Certificates, Theme, Results
    - Finances: Financials, Plan
- **Portal shell** (conferences/[id] and chair hub): top bar, left rail (conference tabs), centre, right rail (committee chat + members).

## Pages
- **Public:**
  - Home
  - /events
  - /events/[id] detail: hero, About, deflist, committees (dialog), tiers, partners, right rail (organiser, application status, staff apply)
  - /events/[id]/apply: ApplicationWizard
  - /blogs, /blogs/[id] (with comments)
  - /about, /contact, /privacy, /terms (all indigo today)
  - /docs/[eventId]/[docId]
  - /app-return
- **Auth:** login, signup, forgot-password, onboarding (avatar + name, email, DOB, mobile)
- **General dashboard:**
  - /dashboard: stats, activity feed (All/Following/Mine), recommended, organiser promo
  - /conferences: My Conferences / Browse, role filter, sort, Active / Past
  - /documents: card per conference with role-based sub-tabs
  - /articles: list, new, edit (ArticleEditor)
  - /achievements: 5 award stat tiles, filter, award cards
  - /network: Discover / Connections / Blocked
  - /messages: chat sidebar + window (no list on mobile today)
  - /payments: 3 tiles + table with receipt
  - /settings: Profile, Appearance, Notifications, Privacy, Security
  - /profile/[uid]: public profile + right rail
- **Portal:**
  - conferences/[id] tabs: overview (hero, committee/country, waitlist offer, ceremony banner, launch-live card, team panel), documents, announcements, schedule, requests (migration + complaints), food, transport, accommodation, dresscode, certificate, results, session report
  - PaymentRequiredGate
  - Faculty panel
  - /observer
- **Chair / EB:**
  - /chair: committee cards
  - chair/committee/[id] tabs: overview, marking (matrix + detail sheet), motion log, papers (viewer dialog), requests, study guide, rules, awards, room alert
  - /eb
- **Organizer:**
  - /organizer home
  - /events list
  - CreateEventDialog
  - Event overview (readiness, ApplicationDetailSidebar)
  - Details, allocation (applications / countries / migration / capacity / invitation)
  - Staff (permissions), committees, partners, schedule, announcements (composer + viewer sheet), rules, modules
  - Complaints
  - Tools: hub, id-cards, certificates, theme, results
  - Financials (event and account), Pro, Plan
- **Admin:**
  - Overview, users, events (+ test-allocate)
  - Applications (organiser + upgrade requests)
  - Payments (mode, Stripe, ZiniPay, payouts)
  - Complaints L3, audit logs, settings (General / Pricing / Maintenance / Legal + repair cards)

## Board order
P01 Home (done) → P02 Events list → P03 Event detail → P04 Apply wizard → P05 Blogs list + article → P06 About + Contact → P07 Privacy, Terms, docs viewer, app-return → AU01 Login/Signup/Forgot → AU02 Onboarding → D01 Shell + dashboard home …

## Later decisions
- Organiser band on Home stays NAVY (user comment).
- Mega footer with real brand social logos; other public boards show a "Mega footer — identical to P01" stub.
- NO spinners anywhere: logo preloader (assets/munpilot-preloader.svg; diamond hops) only for whole-app boot (dashboard auth check, app-return, first load); skeleton shimmer (.skl) everywhere else; busy buttons = verb text + disabled.
- Boards: P01 Home, P02 Conferences done. Board layout = desktop 1440 frame left + phone 390 frames right, w 2022, dark tweak.
- PUBLIC DONE (P01–P07): Home, Conferences, Detail, Apply wizard, Articles, About+Contact, Legal+doc reader+app-return. Canvas layout: two columns x=0 / x=2142, 120 gap. Next: AU01 auth boards (new page id "auth"), then D (dashboard shell + general).
- No invented features: removed Share buttons. About page copy (stats 12K+, team, munplatform.app emails, +880 phone) is the site's own placeholder-looking content — kept, flagged to user.
- AUTH DONE: AU01 (login, signup, forgot) + AU02 onboarding on page 'auth'. Google button moved ABOVE email form (flag to user; revert if asked). Next: D page 'dash' — D01 dashboard shell (sidebar variants, top bar, drawer, bell, profile menu, floating messages) + dashboard home.
- D01 shell+home DONE (page 'dash'). Dashboard facts in DASH-FACTS.md. Next D02 conferences+documents, D03 blogs/editor/achievements, D04 network+profile, D05 messages+payments, D06 settings.
- D01–D06 general dashboard DONE. Next section: CP (conference portal: portal shell w/ top bar+left rail+right rail chat/members, overview, tabs, faculty panel, observer dashboard) — needs detail agent for portal tabs.
- BUG TRAP: class 'ph' = phone frame (390x844). NEVER use 'ph' as placeholder modifier (hit P04, D06). Use 'pv'. In new boards name phone frame class 'phone'.
- CP01–CP05 portal DONE (page 'portal'). Next: CH chair/EB (chair dashboard, committee hub tabs: overview, marking matrix+detail sheet, motion log, papers+viewer, requests, study guide editor, rules, awards/final scoring, room alert; EB dashboard) — need detail agent.
- CH01–CH05 chair/EB DONE (page 'chair'; facts CHAIR-FACTS.md). Next: OR organizer (organizer home, events list, create/edit event dialog, event overview+readiness+ApplicationDetailSidebar, details, allocation tabs, countries, capacity, staff, committees, partners, schedule, announcements, rules, modules, complaints, tools hub/id-cards/certs/theme/results, financials event+account, pro, plan) — needs detail agent(s).
- OR07, OR06, OR05 DONE (page 'org'; ORG-FACTS.md has part-1 facts). Remaining: OR01 home/events/create (0,0), OR02 overview+sheet (2142,0)? NOTE OR05 at (2142,3480), OR06 (0,7000), OR07 (2142,7000). Place OR01 (0,0), OR02 (0,3480)?? check overlaps; OR03, OR04. Then ADMIN section (re-inventory: admin panel phases A-D built 2026-10-31).
- ORGANIZER DONE OR01–OR07. Remaining: App Admin (re-inventory; admin panel phases A-D built). Live MUN excluded.

## Admin section (done 2026-11-01)
- AD01 Overview/Users/member detail/Events + Plan dialog; AD02 Applications/Plans & revenue/Payments/Complaints; AD03 Live Sessions/Tools/Audit/Settings/Moderation/Test allocation.
- Built via compose_board.py (head from AD01 + parts/adNN-body.html).
- Unknown copy kept as [brackets]. Settings has NO Legal tab (matches code).

## Gap-list round (2026-11-02)
- Section 1 Public & Auth: P08 system+home states, P09 detail+apply states, P10 terms+doc reader states, AU03 reset+onboarding states.
- Heads: parts/pub-head.html (P03-based), legal-head.html (P07), auth-head.html (AU01+AU02). compose_pub.py; measure via local http.server on 127.0.0.1:8765.
- Section 2 Dashboard: D07 browse+payment states, D08 documents roles, D09 profile owner, D10 messages/shell/network, D11 blog editor. Head parts/dash-head.html; compose_dash.py ({{SIDE:active}}).
- Section 3 Portal: CP06 my pass/food/transport (CP03 QR stubs now stale-by-design), CP07 paper/docs/accommodation, CP08 portal states. Head parts/portal-head.html; compose_portal.py ({{TOP}} {{RAIL:x}} {{STUB}}).
- Section 4 Chair: CH06 passes/read-only/edges, CH07 log/papers/requests states, CH08 guides/standings/scores. Head parts/chair-head.html; compose_chair.py.
- Section 5 Org1: OR08 empty/loading/edit, OR09 allocation states, OR10 staff+forms. Head parts/org-head.html; compose_org.py ({{ESIDE:x}} {{OSIDE:x}}). TRAP: CP03 .dh (day heading, uppercase) clashes with .dlg .dh — override added to portal/chair/org heads.
- Section 6 Org2: OR11 coupons+pass report, OR12 scanner (desktop std shell + phone), OR13 modules/id cards/schedule, OR14 rules+announcements, OR15 plan/financials/complaints/tier. compose_org has {{DSIDE}}.
- Section 7 Admin: AD04 members/plans/approvals, AD05 gateways/complaints/live, AD06 moderation/tools/settings; AD01 plan dialog (no Cancel, 6th feature, real account copy) + AD03 counters removed. Head parts/admin-head.html; compose_admin.py.
- GAP LIST ROUND COMPLETE: 26 new boards, 62 total.
