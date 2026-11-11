# Website UI vs redesign boards: gap list

Audit date: 2026-11-02. Read-only: no site code or board was changed.

- **Compared:** the 36 boards in `boards/*.dc.html` (+ `README.md`, `notes/INVENTORY.md`, the `notes/*-FACTS.md` fact sheets) against every route in `src/app` and the components they render.
- **Out of scope (Live MUN):** live session console, delegate console, projector, live video room, ceremonies — routes `conferences/[id]/live`, `chair/committee/[id]/live`, `ceremony/[eventId]`, `admin/live-sessions/observe`, `organizer/events/[id]/live`. The Admin Live Sessions *list* page is included (AD03 draws it).
- **Status:** COVERED = a board draws it and the labels substantially match · PARTIAL = the screen is drawn but tabs, fields, states or role variants are missing (named in the row) · MISSING = no board draws it.
- **Source refs** are `file:line` at commit `107aae0`. A board mentioning something only in its caption counts as PARTIAL at most.
- **Each item appears once.** Shared UI is listed under the section that owns it: maintenance screen → Public & Auth; scanner page and event sidebar → Organizer; portal rail → Portal; committee-hub rail → Chair; position paper editor spec → Portal (the documents-hub row points to it).

## Summary

| Section | Covered | Partial | Missing | Rows |
|---|---:|---:|---:|---:|
| Public & Auth | 44 | 14 | 7 | 65 |
| General dashboard | 57 | 32 | 26 | 115 |
| Conference portal (delegate / faculty / observer) | 37 | 18 | 10 | 65 |
| Chair & Executive Board | 32 | 10 | 10 | 52 |
| Organizer 1: home, events, create, overview, details, committees, partners, allocation, staff | 29 | 14 | 9 | 52 |
| Organizer 2: schedule, announcements, rules, modules, complaints, tools, money, plan, QR passes | 16 | 17 | 26 | 59 |
| App Admin | 12 | 28 | 7 | 47 |
| **Total** | **227** | **133** | **95** | **455** |

Updated 2026-11-02 after the four bug fixes (faculty "Paper" column, login `?redirect=`, Network "Browse events" link, cancelled-payment banner). Only the cancelled-payment banner is new UI; it is added below as a MISSING row. The other three change no drawn UI.

## QR passes (committed 2026-11-01): no board draws any of it

| Where | What | Section |
|---|---|---|
| Portal `?tab=pass` + rail item "My Pass" | My Pass: signed QR card + "What your pass holds" (meals, coupons, check-in per day, rides; Ready / n of m left / Used / Checked in / Not yet) | Portal |
| Committee hub `?tab=pass` + rail items "My Pass", "Scan Passes" | Staff's own pass + staff entry to the scanner | Chair |
| `/dashboard/scan/[eventId]` | Scanner: Redeem / Check only, target pills, camera states, 9 result cards, Find by name, Claimed so far, no-permission, nothing-to-hand-out | Organizer 2 |
| `/organizer/events/[id]/coupons` | Coupons page (Pro), Free-locked, empty, New/Edit dialog, delete confirm | Organizer 2 |
| `/organizer/events/[id]/passes` | Pass report (Pro + Free variants), who-claimed panel, empty/loading/error | Organizer 2 |
| Event sidebar › Tools | "Coupons", "Scan Passes", "Pass Report" links | Organizer 1 |
| Staff › Custom permissions | 7th switch "Scan Passes" | Organizer 1 |
| Modules › Food slot dialog | "Who gets it", "Uses per person" fields | Organizer 2 |
| Tools › ID cards | QR-on-card option | Organizer 2 |
| Plan page / admin Plan editor | 6th feature row "QR coupons, check-in and transport scans" | Organizer 2 / Admin |
| CP03 Food + Transport (**stale**) | Board still draws a QR per food slot and on the transport card; code now points to My Pass and shows "Used at…" / "n of m left" | Portal |

## Other big gaps (whole screens or dialogs)

- **Global:** maintenance lockout screen ("We'll be right back"); site-wide 404 (none in code — Next default shows); loading screens for conference detail, apply, committee doc reader.
- **Dashboard:** Conferences › Browse tab; Documents › Rules & Regs tab + observer/organizer variants; Settings › Profile owner sections (Honors & Awards, Skills & Interests, pending recommendations, Recent Activity, Contact & Social) + Education / Awards dialogs; New Message dialog; blog AI suggest panel, not-authorized page; profile not-found.
- **Portal:** position paper editor (Write / Upload .md / Import PDF) + approved / revision / flagged banners; faculty left rail; "Conference not found"; rejected / withdrawn applicant view.
- **Chair:** read-only marking matrix; Requests Resolved tab; unpublished standings; Study Guide editor in the Documents hub.
- **Organizer:** Edit event dialog; Staff › Applications tab (public staff applications); Remove staff dialog; Direct Migration body; Add to Schedule dialog; Rules "Published" view; announcement Send Now + email preview; Transport / Food add dialogs; Request Pro form; account Financials desktop; Complaints Resolved tab; Free-plan seat-cap alert on approve.
- **Admin:** App Admin profile-menu variant; delete-account prompt; upgrade-request review dialog; force-stop / reset / broadcast confirms; moderation Comments dialog; test allocation drawn as dialog but is a full page.

---

# Section tables

## 1. Public & Auth

Counts: covered 44 · partial 14 · missing 7

| Route | UI element | Source file:line | Status | Board | What's missing |
|---|---|---|---|---|---|
| all public routes | ✅ Public header: brand, search, Create event, Conferences, Articles, Log in / Sign up (signed out), Dashboard + avatar (signed in) | src/components/layout/Navbar.tsx:39-128 | COVERED | P01, P04 (signed-in header) | Code brand text is "MUN PRO" with "MP" mark; board uses the MUN Pilot logo (rebrand, not a gap) |
| all public routes | ✅ Header search, focused state, Enter goes to /events?q= | src/components/layout/Navbar.tsx:52-75 | COVERED | P01 | — |
| all public routes (phone) | ✅ Burger menu (`Open menu` / `Close menu`) with the nav links | src/components/layout/Navbar.tsx:77-163 | COVERED | P01 | — |
| all public routes | ✅ Footer: 4 link columns, © line, socials | src/components/layout/Footer.tsx:6-87 | COVERED | P01 | Code has 5 socials (Twitter, Instagram, LinkedIn, YouTube, GitHub); board's extra blocks (Get the app, theme toggle, Back to top, Next conferences, From the handbook) are not in code. See Questions |
| /dashboard/* | ✅ Whole-app auth/onboarding check loader (spinner today) | src/app/dashboard/layout.tsx:94-108 | COVERED | Main (preloader spec) | — |
| /dashboard/* | Maintenance-mode lockout screen (everyone except App Admin) | src/app/dashboard/layout.tsx:49-56, 112-120 | MISSING | — | Not drawn anywhere. AD03 draws only the admin toggle |
| any unknown URL | 404 page. No src/app/not-found.tsx, so Next's default unstyled 404 shows | src/app/layout.tsx:64-88 (root layout, no not-found/error sibling) | MISSING | — | No board. The not-found pages P03/P05/P07 cover only entity-level misses |
| / | ✅ Hero deck, "Featured conference" slide (Register now / See committees) | src/app/page.tsx:109-129; src/components/public/HeroDeck.tsx:30-71 | COVERED | P01 | — |
| / | ✅ Hero deck: the other slide kinds + controls | src/app/page.tsx:29-34, 109-141; src/components/public/HeroDeck.tsx:73-103 | PARTIAL | P01 | Only one slide is drawn, with prev/next arrows. Not drawn: "From the handbook" article slide ("Read the guide"), 2nd event slide eyebrow "Registration open", past-event slide "Recently concluded" + "View conference", always-present organiser slide ("For organisers" / "Run your conference without the spreadsheets" / "Start hosting"), and the code's real controls: a dot rail plus numbered pager 1..n (no arrows). Slide with no cover = striped fallback |
| / | ✅ "Upcoming conferences" section: loading, empty and no-upcoming variants | src/app/page.tsx:148-180 | PARTIAL | P01 | Board draws only the populated grid. Not drawn: 3 skeleton cards while loading; the heading swap to "Recent conferences" / "The last conferences to run on MUN PRO." when nothing is upcoming; empty line "No conferences are open right now. Organisers — this is your slot." |
| / | ✅ "Delegate handbook" strip: loading and empty | src/app/page.tsx:183-209; src/components/public/ArticleCard.tsx:12-55 | PARTIAL | P01 | Populated cards drawn. Not drawn: 2 split-card skeletons (ArticleCardSkeleton) and the empty line "The handbook is still being written. Check back soon." on the home page |
| / | ✅ "Create your own MUN" organiser band | src/app/page.tsx:212-225 | COVERED | P01 | — |
| /events | ✅ Masthead + tally + 3-col grid of detailed EventCards (format stamp, countdown, placard/cover, date, title, place · price, "View details →") | src/app/events/page.tsx:49-91; src/components/public/EventCard.tsx:22-64; src/components/public/EventCountdown.tsx:13-35 | COVERED | P02 | — |
| /events?q= | ✅ Result bar "Showing results for …" + "Clear search", no-match empty state | src/app/events/page.tsx:60-85 | COVERED | P02 | — |
| /events | ✅ Loading skeletons + "nothing open" empty state | src/app/events/page.tsx:71-85; EventCard.tsx:67-78 | COVERED | P02 | Board adds a "Host a conference" button to the empty state, which code lacks (Questions) |
| /events/[eventId] | ✅ Loading skeleton (hero block + two main blocks + rail block) | src/app/events/[eventId]/page.tsx:105-120 | MISSING | — | Not drawn |
| /events/[eventId] | ✅ Not found | src/app/events/[eventId]/page.tsx:122-135 | COVERED | P03 | — |
| /events/[eventId] | ✅ Unpublished (non-owner) | src/app/events/[eventId]/page.tsx:146-159 | COVERED | P03 | — |
| /events/[eventId] | ✅ Hero banner: format pill, "Conference", "Early bird", title, when · where | src/app/events/[eventId]/page.tsx:174-205 | PARTIAL | P03 | Organiser theme colour (event.theme via themeColor) isn't drawn. It fills the hero background behind/without a cover, the format pill, and the Apply button (lines 175-176, 186, 195, 719). Cover-less fallback (`mp-hero-fallback`) not drawn either |
| /events/[eventId] | ✅ About + "Conference" deflist + "Applications" schedule rows | src/app/events/[eventId]/page.tsx:210-275 | COVERED | P03 | — |
| /events/[eventId] | ✅ Committee cards (plate, Full pill, difficulty pills, N spots, Description, Topic/Agendas, View members) | src/app/events/[eventId]/page.tsx:278-440 | COVERED | P03 | — |
| /events/[eventId] | ✅ Committee dialog ("View members") | src/app/events/[eventId]/page.tsx:337-432 | PARTIAL | P03 (phone sheet) | Drawn only as the phone sheet in the "Open" state. Not drawn: desktop centered dialog; the "Full" pill variant; single-agenda label "Topic / agenda"; empty countries line "Positions to be announced." |
| /events/[eventId] | ✅ Registration tiers (phase pill, strike price, / member, notes) | src/app/events/[eventId]/page.tsx:443-497 | PARTIAL | P03 | Late phase not drawn: pill "Late price" (signal red) with the regular price struck through |
| /events/[eventId] | ✅ Event partners carousel | src/app/events/[eventId]/page.tsx:500-578 | COVERED | P03 | — |
| /events/[eventId] | ✅ Partner dialog | src/app/events/[eventId]/page.tsx:515-569 | COVERED | P03 | — |
| /events/[eventId] | ✅ Organiser rail (Website, Contact, IG/X/f/in socials) | src/app/events/[eventId]/page.tsx:584-656 | COVERED | P03 | — |
| /events/[eventId] | ✅ Application status rail: signed out / organiser / already applied / open / closed | src/app/events/[eventId]/page.tsx:658-728 | PARTIAL | P03 | Signed-out + early-bird label "Log in — early bird" not drawn. Signed-out + closed shows the disabled button "Applications closed" plus the note "Sign in to submit an application."; that combination isn't drawn |
| /events/[eventId] | ✅ "Join the staff" panel: role picker → applied/withdraw | src/components/public/StaffApplyPanel.tsx:49-89 | COVERED | P03 | — |
| /events/[eventId] | ✅ "Join the staff" busy + error states | src/components/public/StaffApplyPanel.tsx:33, 37, 45, 62-63, 84-85, 90 | MISSING | — | Busy labels and the red error line not drawn |
| /events/[eventId]/apply | ✅ Page loading skeleton | src/app/events/[eventId]/apply/page.tsx:49-56 | MISSING | — | Not drawn |
| /events/[eventId]/apply | ✅ "Event Not Found" | src/app/events/[eventId]/apply/page.tsx:58-68 | COVERED | P04 | — |
| /events/[eventId]/apply | ✅ "Already Applied" card | src/app/events/[eventId]/apply/page.tsx:70-94 | COVERED | P04 | — |
| /events/[eventId]/apply | ✅ Page title/lede + step header (Step X of 4, step title, description) | src/app/events/[eventId]/apply/page.tsx:103-108; src/components/dashboard/wizard/ApplicationWizard.tsx:313-340 | COVERED | P04 | Board turns the progress bar into a labelled stepper (intentional) |
| /events/[eventId]/apply | ✅ Step 1 role cards (price, early bird, closed) | src/components/dashboard/wizard/ApplicationWizard.tsx:352-415 | PARTIAL | P04 | Not drawn: "Late price" amber badge on a role card; empty line "No application roles are open for this event yet." |
| /events/[eventId]/apply | ✅ Step 1 "Applications are currently closed…" banner | ApplicationWizard.tsx:354-358 | COVERED | P04 | — |
| /events/[eventId]/apply | ✅ Step 2 ranked committee + country preferences | ApplicationWizard.tsx:495-593 | PARTIAL | P04 | Multi-choice variant drawn. Not drawn: single-committee variant (committeeChoicesAllowed = 1: no "Rank up to…" line, no numbered block header); disabled select item "No committees available"; the "Any Available Country" option when a committee has no country list |
| /events/[eventId]/apply | ✅ Step 2 "Registration is full…" banner | ApplicationWizard.tsx:420-424 | COVERED | P04 | — |
| /events/[eventId]/apply | ✅ Step 2 Team Details (team lead) + CSV upload + loaded line | ApplicationWizard.tsx:446-494 | COVERED | P04 | — |
| /events/[eventId]/apply | ✅ Step 2 Faculty Advisor fields | ApplicationWizard.tsx:425-443 | COVERED | P04 | — |
| /events/[eventId]/apply | ✅ Step 3 Experience + Motivation (+ AI assist) | ApplicationWizard.tsx:598-643 | PARTIAL | P04 | Faculty Advisor variant not drawn (different labels, helpers and placeholder). AI trigger in code is a small "AI" chip that opens an inline Improve / Fix grammar / Suggest panel (src/components/shared/ai/AiTextareaAssist.tsx:103-221); board labels it "Help me write" and shows no panel here (the panel is drawn on D03) |
| /events/[eventId]/apply | ✅ Step 4 Review + Registration Fee box | ApplicationWizard.tsx:645-714 | COVERED | P04 | Faculty review variant (no "Your Preferences" block) not drawn; minor |
| /events/[eventId]/apply | ✅ Submit button labels/busy ("Submitting...", "Redirecting to payment…", "Submit & Pay $N", "Submit Application") | ApplicationWizard.tsx:720-761 | COVERED | P04 | — |
| /events/[eventId]/apply | ✅ Submit/payment error messages (native `alert()` today) | ApplicationWizard.tsx:184-186, 268, 270, 277, 279 | MISSING | — | No in-page error state is drawn. Needs an inline alert or dialog design |
| /events/[eventId]/apply | ✅ "Application Submitted!" success | ApplicationWizard.tsx:283-304 | COVERED | P04 | — |
| /blogs | Masthead + tally + category chips + PostCard grid | src/app/blogs/page.tsx:27-73; src/components/public/PostCard.tsx:13-49 | COVERED | P05 | — |
| /blogs | Loading skeletons + both empty states | src/app/blogs/page.tsx:52-66; PostCard.tsx:52-68 | COVERED | P05 | — |
| /blogs/[articleId] | Article: back link, category + #tags, title, byline "Author", date · read time, cover/placard, markdown body | src/app/blogs/[articleId]/page.tsx:105-157 | COVERED | P05 | — |
| /blogs/[articleId] | Loading skeleton + "This article isn't here" | src/app/blogs/[articleId]/page.tsx:60-92 | COVERED | P05 | — |
| /blogs/[articleId] | Discussion, signed in: textarea, AI assist, "Post comment" | src/app/blogs/[articleId]/page.tsx:160-193 | COVERED | P05 | Placeholder "Join the discussion…" and busy text "Posting…" not drawn; minor |
| /blogs/[articleId] | Discussion, signed out + "No comments yet. Be the first." + comment rows ("just now") | src/app/blogs/[articleId]/page.tsx:194-229 | COVERED | P05 | — |
| /about | About page (hero, chips, stats, mission, values, journey, crew, careers) | src/app/about/page.tsx:1-417 | COVERED | P06 | — |
| /contact | Contact page (hero, 4 channels, form, sidebar, socials, FAQ accordion) | src/app/contact/page.tsx:24-464 | COVERED | P06 | — |
| /contact | Form sent state "Thanks! We'll reply within one business day." | src/app/contact/page.tsx:294-301 | COVERED | P06 | — |
| /privacy | Privacy (hero, 3 principles, sticky TOC, 10 sections, "Want to exercise your rights?" CTA) | src/app/privacy/page.tsx:20-305 | COVERED | P07 | — |
| /terms | Terms (hero, TOC, 10 sections, closing CTA) | src/app/terms/page.tsx:19-248 | PARTIAL | P07 | Only the phone hero + "On this page" list is drawn. Not drawn: desktop Terms layout with sections, and the closing CTA "Questions remain?" / "Our legal team is happy to clarify anything in plain language." / "Contact Us" |
| /docs/[eventId]/[docId] | Committee doc reader (committee badge, type badge, status badge, Print, title, submitter · date, Sponsors/Signatories, Chair's note, body) | src/app/docs/[eventId]/[docId]/page.tsx:28-33, 139-205 | PARTIAL | P07 | Only status "Collecting endorsements" and type "Draft Resolution" are drawn. Not drawn: status badges "Submitted" (amber), "Approved" (green), "Rejected" (red, usually with Chair's note); types "Working Paper" and "Amendment"; submitter with no country (name only) |
| /docs/[eventId]/[docId] | Loading skeleton (auth check + doc fetch) | src/app/docs/[eventId]/[docId]/page.tsx:79-89, 106-116 | MISSING | — | Not drawn |
| /docs/[eventId]/[docId] | "Sign in to read this document" | src/app/docs/[eventId]/[docId]/page.tsx:91-104 | COVERED | P07 | — |
| /docs/[eventId]/[docId] | "Document not found" | src/app/docs/[eventId]/[docId]/page.tsx:118-128 | COVERED | P07 | — |
| /app-return | Hand-off loader + paid / not-paid outcomes, "Open the app", "Open Payments on the website" | src/app/app-return/page.tsx:32-78 | COVERED | P07 | — |
| /login | Login form + brand panel | src/app/login/page.tsx:83-228 | COVERED | AU01 | Code copy "Welcome Back", "Login", "Logging in...", "Or continue with", "Google", brand "MUN Platform"; board restyles these as "Welcome back", "Log in", "Continue with Google" |
| /login | Error box ("Failed to login", "Failed to login with Google") | src/app/login/page.tsx:51, 77, 100-104 | COVERED | AU01 | Code usually shows Firebase's raw message, not the fallback (Questions) |
| /signup | Sign-up form + mirrored brand panel, "Passwords do not match" | src/app/signup/page.tsx:20-229 | COVERED | AU01 | Fallback errors "Failed to sign up" / "Failed to sign up with Google" not drawn; minor |
| /forgot-password | Reset request form, success "Check your inbox" + resend cooldown, error box | src/app/forgot-password/page.tsx:28-184 | PARTIAL | AU01 | Phone only. Not drawn: desktop split with its own brand panel ("Secure your account" / "Get back to managing your Model UN journey in just a few clicks."); busy label "Sending link..."; post-cooldown button "Resend email"; full success copy "…The link expires in 1 hour."; main button showing "Resend in 0:SS" after a send |
| /onboarding | Profile setup card (photo, names, email locked, DOB, mobile, Complete Setup / Saving…) | src/app/onboarding/page.tsx:131, 182-352 | PARTIAL | AU02 | Board has no required asterisk on "Date of Birth", but code requires it (Complete Setup disabled until first, last and DOB are set, line 131). Not drawn: footer note "Add nationality, socials, and more later from Profile Settings."; upload-in-progress overlay on the avatar; errors "Please select an image file." / "Upload failed" / "Failed to upload image."; save failure `alert("Failed to save profile. Please try again.")`; "?" initials fallback |

## 2. General dashboard

Counts: covered 57 · partial 32 · missing 26

| Route | UI element | Source file:line | Status | Board | What's missing |
|---|---|---|---|---|---|
| /dashboard/* | Auth / onboarding check spinner (full-page) | src/app/dashboard/layout.tsx:95-110 | COVERED | Main | Main replaces the spinner with the logo preloader. |
| /dashboard/* | Standard sidebar (Menu + role sections) | src/components/dashboard/Sidebar.tsx:223-323 | PARTIAL | D01 (+CH05 EB, CP05 Read-only) | Section label "Co-organizer" (used instead of "Organizer Tools" for pure co-organizers, :312) is not drawn. Code brand is "MP" / "MUN PRO" (:746-747); the board says "munpilot". |
| /dashboard/* | Collapsed 76px rail + Collapse/Expand toggles | src/components/dashboard/Sidebar.tsx:736-765, 165-175 | COVERED | D01 | — |
| /dashboard/* | User card (bell + avatar/name/email pill) | src/components/dashboard/Sidebar.tsx:683-734 | COVERED | D01 | — |
| /dashboard/admin/* | Admin sidebar ("System Admin" card + 12 items) | src/components/dashboard/Sidebar.tsx:45-58, 325-334 | COVERED | AD01 | — |
| /dashboard/organizer | Organizer sidebar (Manage Events, Financials, MUN Pilot Pro, Back to Dashboard) | src/components/dashboard/Sidebar.tsx:336-353 | COVERED | OR01 | — |
| /dashboard/* (<1024) | Mobile top bar + slide-in drawer with "Log out" | src/components/dashboard/Header.tsx:14-68 | COVERED | D01 | — |
| /dashboard/* | Profile / account menu | src/components/dashboard/ProfileMenu.tsx:22-58 | PARTIAL | D01 | The App Admin variant ("Admin Dashboard", "System Settings" instead of Settings/Support, :40-44) is not drawn. |
| /dashboard/* | Notification bell panel | src/components/dashboard/NotificationBell.tsx:80-255 | PARTIAL | D01 | Not drawn: the loading spinner, the empty state "No new notifications", the error banner, the role-change invitation variant (Decline / Accept), the Info / Warning pills (only Urgent is drawn) and the Accept busy state. |
| /dashboard/* | Global toast stack (room alerts + committee live-activity toasts) | src/contexts/NotificationsContext.tsx:483-513, 285-375 | PARTIAL | CP01 | CP01 draws only a generic Urgent room-alert toast. Not drawn: the country-flag variant and the messages "… raised a …", "… proposed: …", "Voting opened — …", or the Info/Warning colours. |
| /dashboard/* (not /messages, not admin) | Floating message bubble + panel list | src/components/dashboard/FloatingMessageButton.tsx:265-416, 546-573 | COVERED | D01 | Empty state "No conversations found." is not drawn (minor). |
| /dashboard/* | Floating panel: chat view | src/components/dashboard/FloatingMessageButton.tsx:294-327, 418-499 | PARTIAL | D01 | Not drawn: the "Offline" state, the empty state "No messages yet. Say hello!" and the "sending" clock tick. |
| /dashboard/* | Floating panel: new-chat view | src/components/dashboard/FloatingMessageButton.tsx:329-341, 501-541 | MISSING | — | The whole state. |
| /dashboard/conferences | Native alert when withdrawing a paid application | src/app/dashboard/conferences/page.tsx:99-101 | MISSING | — | Blocking alert. Needs a designed dialog. |
| shared (organizer pages) | ProGate locked / upgrade card | src/components/ProGate.tsx:24-47 | COVERED | OR05 | The dimmed lockedFallback preview is not shown (minor). |
| /dashboard | Hero (role eyebrow, welcome, buttons) | src/app/dashboard/DashboardClient.tsx:139-186 | PARTIAL | D01 | Not drawn: the organizer variant "Organizer Dashboard", the co-organizer variant "Co-organizer Events" (:156-165), and the home without the organiser promo (it is hidden for organizers, :278). |
| /dashboard | Three stat cards | src/app/dashboard/DashboardClient.tsx:189-217 | COVERED | D01 | — |
| /dashboard | Recent activity feed (All / Following / Mine, Load more) | src/components/dashboard/ActivityFeed.tsx:53-141 | COVERED | D01 | Busy label "Loading..." on Load more (:134) is not drawn. |
| /dashboard | Recommended panel | src/app/dashboard/DashboardClient.tsx:232-275 | PARTIAL | D01 | Empty state "No new recommendations yet." (:261-264) is not drawn. |
| /dashboard | Become-an-organiser promo | src/app/dashboard/DashboardClient.tsx:278-295 | COVERED | D01 | — |
| /dashboard | Error state + Retry | src/app/dashboard/DashboardClient.tsx:98-113 | COVERED | D01 | — |
| /dashboard | Loading skeleton | src/app/dashboard/DashboardClient.tsx:115-128 | COVERED | Main | — |
| /dashboard/conferences | Header, My Conferences/Browse tabs, Filter + Sort toolbar | src/app/dashboard/conferences/page.tsx:143-251 | COVERED | D02 | — |
| /dashboard/conferences | Active & Pending / Past sections + empties | src/app/dashboard/conferences/page.tsx:253-328 | PARTIAL | D02 | Active empty state "No active conferences" with CTA "Browse Conferences" (:288-295) is not drawn. The past empty state is drawn. |
| /dashboard/conferences | ConferenceCard status variants | src/components/dashboard/ConferenceCard.tsx:48-75, 155-169 | PARTIAL | D02 | Not drawn: "Payment Overdue" (red pill, red block, red Pay button), "Waitlisted", "Waitlisted/Rejected" (red full tracker), "Active" and "Withdrawn". |
| /dashboard/conferences | Unpaid card (fee block, Portal Locked, Pay $X) | src/components/dashboard/ConferenceCard.tsx:117-196 | COVERED | D02 | The overdue copy is covered by the row above. |
| /dashboard/conferences | Hover Withdraw + confirm | src/app/dashboard/conferences/page.tsx:96-106, 278-285 | COVERED | D02 | — |
| /dashboard/conferences | Browse tab: "Discover Events" grid of EventBrowseCard | src/app/dashboard/conferences/page.tsx:330-367; src/components/dashboard/EventBrowseCard.tsx:15-68 | MISSING | — | Only the tab label "Browse 12" is drawn. Now also a deep-link target: `?tab=browse` opens it, used by Network › Discover empty › "Browse events" (fix 2026-11-02). |
| /dashboard/conferences | Browse empty "No conferences available" | src/app/dashboard/conferences/page.tsx:359-365 | MISSING | — | — |
| /dashboard/conferences | "Payment cancelled" banner (`?payment=cancelled`, where the checkout's Cancel lands) — NEW 2026-11-02 | src/app/dashboard/conferences/page.tsx:47-62, 185-197 | MISSING | — | Whole banner. Added by the cancelled-payment fix; no board draws it. |
| /dashboard/conferences | Loading skeleton | src/app/dashboard/conferences/page.tsx:130-141 | COVERED | Main | — |
| /dashboard/documents | Header + one card per conference + delegate sub-tab bar | src/app/dashboard/documents/page.tsx:45-82, 206-246 | COVERED | D02 | — |
| /dashboard/documents | Empty "No conferences yet" | src/app/dashboard/documents/page.tsx:63-75 | COVERED | D02 | — |
| /dashboard/documents | Card fallback "No documents available." | src/app/dashboard/documents/page.tsx:221-222 | MISSING | — | Small state. |
| /dashboard/documents (delegate) | Position Paper read view (Under review) | src/components/features/delegate/PositionPaperUpload.tsx:254-285 | COVERED | D02 | — |
| /dashboard/documents (delegate) | Position paper review banners: approved / revision / flagged + chair feedback quote | src/components/features/delegate/PositionPaperUpload.tsx:174-233 | MISSING | — | Only "Under review" is drawn. |
| /dashboard/documents (delegate) | Position paper editor (Write / Upload .md / Import PDF, Submit/Update) | src/components/features/delegate/PositionPaperUpload.tsx:286-386 | MISSING | — | The first-submit and edit states. Spec: see Boards to add › Conference portal › "Position paper editor + review banners" (same component). |
| /dashboard/documents (delegate/observer) | Study Guide viewer | src/components/features/delegate/StudyGuideViewer.tsx:40-137 | PARTIAL | D02 | Not drawn: the PDF variant (Save / Open), the empty state "No study guide yet" and the expanded markdown read view. |
| /dashboard/documents (delegate) | Committee Docs list (Your submissions / Approved in your committee) | src/components/features/delegate/CommitteeDocsDelegate.tsx:290-436, 438-531 | COVERED | D02 | Minor gaps: the "Rejected" pill, "Nothing submitted yet.", "Loading…", the View/Hide inline expansion and the trash icon. |
| /dashboard/documents (delegate) | New / edit committee document form | src/components/features/delegate/CommitteeDocsDelegate.tsx:316-398 | PARTIAL | D02 (phone sheet) | Missing: the desktop inline form; Type is a Select in code, not a segmented control; the Write / Upload .md / Import PDF modes (MarkdownDocEditor); the roster picker search; the roster-empty warning; the error banner; the edit mode with the "Update" button. |
| /dashboard/documents (delegate) | No-committee notice | src/components/features/delegate/CommitteeDocsDelegate.tsx:280-288 | MISSING | — | — |
| /dashboard/documents (delegate) | Endorsement requests inbox | src/components/session/docs/EndorsementInbox.tsx:94-129 | PARTIAL | D02 | Labels differ: the code has the heading "Endorsement requests", the line "{Country} wants you to sponsor/sign", the quoted title, and the buttons "Accept" / "Reject" (the board says "Decline"). The red low-time timer is not drawn. |
| /dashboard/documents (all roles) | Rules & Regs tab (RulesGuideViewer) | src/components/features/shared/RulesGuideViewer.tsx:33-110 | MISSING | — | Only the tab label is drawn. |
| /dashboard/documents (chair/EB) | Chair/EB tab set (Study Guide editor / Committee Docs / Position Papers / Rules & Regs) | src/app/dashboard/documents/page.tsx:113-141 | PARTIAL | D02 + CH04 | The chair-variant tab bar is not drawn. The Study Guide editor is drawn in CH04. |
| /dashboard/documents (chair/EB) | Committee Docs review rows (note, Approve / Request revision / Reject) | src/components/features/chair/CommitteeDocsChair.tsx:94-236 | COVERED | D02 | Minor gaps: the card header with the pending count, "No submissions yet", and the AI assist under the note. |
| /dashboard/documents (chair/EB) | "Grade position papers in the committee hub" card | src/app/dashboard/documents/page.tsx:121-136 | COVERED | D02 | — |
| /dashboard/documents (observer/faculty) | Read-only variant (Study Guide / Committee Docs approved-only / Rules & Regs) | src/app/dashboard/documents/page.tsx:144-156 | MISSING | — | — |
| /dashboard/documents (organizer/co-org) | "Manage" tab card | src/app/dashboard/documents/page.tsx:158-177 | MISSING | — | — |
| /dashboard/articles | My Blogs header + Published/Drafts tabs + grid | src/app/dashboard/articles/page.tsx:168-249 | COVERED | D03 | — |
| /dashboard/articles | Blog card (cover, category, Draft pill, Edit / View / Delete) | src/app/dashboard/articles/page.tsx:66-143 | COVERED | D03 | — |
| /dashboard/articles | Empty states | src/app/dashboard/articles/page.tsx:145-164 | PARTIAL | D03 | Only the Drafts empty state is drawn; the Published empty state is not. |
| /dashboard/articles | Delete Blog dialog | src/app/dashboard/articles/page.tsx:251-266 | COVERED | D03 | Busy "Deleting..." (minor). |
| /dashboard/articles/new | New Blog page | src/app/dashboard/articles/new/page.tsx:10-25 | COVERED | D03 | — |
| /dashboard/articles/[id]/edit | Edit Blog page header | src/app/dashboard/articles/[id]/edit/page.tsx:59-76 | PARTIAL | D03 | The "Edit Blog" title with the blog title as subtitle is not drawn (the board shows New Blog only). |
| /dashboard/articles/[id]/edit | Not-authorized state | src/app/dashboard/articles/[id]/edit/page.tsx:48-57 | MISSING | — | Named in the board subtitle but not drawn. |
| /dashboard/articles/[id]/edit | Loading skeleton | src/app/dashboard/articles/[id]/edit/page.tsx:39-46 | COVERED | Main | — |
| /dashboard/articles/new, /edit | ArticleEditor two-column layout + Blog Settings | src/components/features/articles/ArticleEditor.tsx:69-241 | COVERED | D03 | — |
| /dashboard/articles/new, /edit | Validation / save error banner | src/components/features/articles/ArticleEditor.tsx:46-47, 61, 83-93 | MISSING | — | The success banner is drawn; the error banner is not. |
| /dashboard/articles/new, /edit | Cover ImageUploader states | src/components/ui/ImageUploader.tsx:76-134 | PARTIAL | D03 | Not drawn: the uploaded preview with hover "Remove Image", "Uploading... {n}%" and the errors. |
| shared (blog, paper, guide, committee doc) | RichTextEditor toolbar | src/components/features/shared/RichTextEditor.tsx:171-243 | PARTIAL | D03 | The board draws B I U H2 H3 • 1. “ only. Not drawn: Undo, Redo, Strikethrough, H1, the 4 alignments, Code block, Link (window.prompt "Link URL"), image upload (spinner) and the image error strip. |
| shared | AI toolbar menu + selection bubble | src/components/features/shared/RichTextEditorAi.tsx:114-200, 239-275 | COVERED | D03 | The committee-doc item "Auto-Convert to Draft Resolution" and the amber error line are not drawn. |
| shared | "Generate a draft" AI dialog | src/components/features/shared/RichTextEditorAi.tsx:327-382 | PARTIAL | D03 | The board merges the two states. Not drawn: the "Generate" button, the preview state with "Back" and "Regenerate", and the error line. |
| shared (excerpt, bio, recommendation, experience, chair notes) | ✅ AiTextareaAssist panel | src/components/shared/ai/AiTextareaAssist.tsx:101-224 | MISSING | — | Only the "AI" chip is drawn (D03). Not drawn: the panel, the suggestion card and Undo. |
| shared (study guide, committee docs) | MarkdownDocEditor (Write / Upload .md / Import PDF) | src/components/features/shared/MarkdownDocEditor.tsx:80-153 | PARTIAL | CH04 | Drawn for the study guide in CH04; not drawn on the committee-doc form (D02). |
| /dashboard/achievements | Tiles, filter pills, award cards | src/app/dashboard/achievements/page.tsx:63-195 | COVERED | D03 | — |
| /dashboard/achievements | Empty "No awards yet" | src/app/dashboard/achievements/page.tsx:90-102 | COVERED | D03 | — |
| /dashboard/network | Header, chips, Discover / Connections / Blocked tabs | src/app/dashboard/network/page.tsx:286-314 | COVERED | D04 | — |
| /dashboard/network | Discover grid ("People You May Know") | src/app/dashboard/network/page.tsx:317-351 | COVERED | D04 | — |
| /dashboard/network | Discover empty | src/app/dashboard/network/page.tsx:318-328 | MISSING | — | — |
| /dashboard/network | Connections grouped (From Conferences / Manually Connected) | src/app/dashboard/network/page.tsx:355-397 | COVERED | D04 | — |
| /dashboard/network | Connections empty | src/app/dashboard/network/page.tsx:356-361 | COVERED | D04 | — |
| /dashboard/network | Blocked list | src/app/dashboard/network/page.tsx:400-431 | COVERED | D04 | The board shows the name; the code still shows the uid (:416). |
| /dashboard/network | Blocked empty | src/app/dashboard/network/page.tsx:401-403 | MISSING | — | — |
| /dashboard/network | Confirm dialog (Disconnect / Block user / Unblock) | src/app/dashboard/network/page.tsx:172-194, 436-449 | PARTIAL | D04 | Only Block is drawn. Not drawn: the Disconnect and Unblock variants and the busy label "Working...". |
| /dashboard/profile/[uid] | Loading skeleton | src/app/dashboard/profile/[uid]/page.tsx:38-52 | COVERED | Main | — |
| /dashboard/profile/[uid] | Profile not found / private | src/app/dashboard/profile/[uid]/page.tsx:54-67 | MISSING | — | — |
| /dashboard/profile/[uid] | Public hero + actions | src/components/features/profile/PublicProfileView.tsx:218-326 | PARTIAL | D04 | Not drawn: the "Connected" state (disabled), "Update rating" with a filled star, busy spinners, the verified-organizer badge and the cover without a photo. |
| /dashboard/profile/[uid] | Main sections (open-to banner, stats, about, experience, honors, education) | src/components/features/profile/PublicProfileView.tsx:328-460 | PARTIAL | D04 | The Education section (:440-460) and the "No bio yet." state are not drawn. |
| /dashboard/profile/[uid] | Skills & endorsements | src/components/features/profile/SkillsSection.tsx:93-184 | COVERED | D04 | — |
| /dashboard/profile/[uid] | Recommendations (Received / Given, Recommend) | src/components/features/profile/RecommendationsSection.tsx:85-149 | PARTIAL | D04 | Not drawn: the Given tab content, the empty states and "Loading…". |
| /dashboard/profile/[uid] | Contact & Social tiles | src/components/features/profile/PublicProfileView.tsx:484-510 | PARTIAL | D04 | The Phone and TikTok tiles are not drawn. |
| /dashboard/profile/[uid] | Right rail (People you may know, Suggested conferences, footer) | src/components/features/profile/SuggestionsRail.tsx:15-103; PublicProfileView.tsx:514-529 | COVERED | D04 | Suggested empty state not drawn. The footer reads "MUN Platform © 2026" in code vs "MUN Pilot" on the board. |
| /dashboard/profile/[uid] | Rate dialog | src/components/features/profile/RateRecommendDialogs.tsx:43-79 | COVERED | D04 | Error "Pick a star rating first." (minor). |
| /dashboard/profile/[uid] | Recommend dialog | src/components/features/profile/RateRecommendDialogs.tsx:111-141 | COVERED | D04 | The AI assist bar under the textarea is not drawn. |
| /dashboard/messages | Desktop list + chat | src/app/dashboard/messages/page.tsx:77-104; src/components/dashboard/ChatSidebar.tsx:144-237; src/components/dashboard/ChatWindow.tsx:141-273 | COVERED | D05 | — |
| /dashboard/messages | Phone layout | src/app/dashboard/messages/page.tsx:84 | PARTIAL | D05 | The list is drawn. The open-chat phone screen (back to the list) is not drawn. The code currently hides the list below md. |
| /dashboard/messages | Conversation list states | src/components/dashboard/ChatSidebar.tsx:176-189 | MISSING | — | "No conversations yet. Start one!" and "No matches." (the skeleton is covered by Main). |
| /dashboard/messages | Chat window states | src/components/dashboard/ChatWindow.tsx:127-139, 164-178, 186-189, 225-227 | PARTIAL | D05 | "Select a conversation" is drawn. Not drawn: "Active {n} ago" / "Offline", "No messages yet. Say hello!", the group header (no presence) with sender names above bubbles, and the ⋮ menu (it has no handler). The board adds a "Today" separator that the code does not have. |
| /dashboard/messages | New Message dialog | src/components/dashboard/ChatSidebar.tsx:239-281 | MISSING | — | Named in the D05 lede; only the icon button is drawn. |
| /dashboard/messages | Create Group dialog | src/components/dashboard/ChatSidebar.tsx:283-343 | COVERED | D05 | Not drawn: "Loading users...", busy "Creating...". |
| /dashboard/payments | Header, success banner, tiles, Transactions table, phone cards | src/app/dashboard/payments/page.tsx:277-405 | COVERED | D05 | — |
| /dashboard/payments | Row status variants | src/app/dashboard/payments/page.tsx:52-62, 263-275 | PARTIAL | D05 | No Refunded row or pill. The Tier column is the role-tier label in code (:62), not "Early bird / Regular" as on the board. |
| /dashboard/payments | Highlighted row from ?app= | src/app/dashboard/payments/page.tsx:366-373 | COVERED | D05 | — |
| /dashboard/payments | Pay Now busy + checkout errors | src/app/dashboard/payments/page.tsx:116-137, 384-393 | PARTIAL | Main | Busy label is "…" in code (Main suggests "Redirecting to payment…"). The errors are native alerts and are not designed. |
| /dashboard/payments | Printable receipt (new window) | src/app/dashboard/payments/page.tsx:139-261 | COVERED | D05 | The Refunded receipt variant (blue badge) is not drawn. Brand reads "MUN Platform" in code vs "MUN Pilot" on the board. |
| /dashboard/payments | Empty "No payment history yet" | src/app/dashboard/payments/page.tsx:307-314 | COVERED | D05 | — |
| /dashboard/settings | Header + left nav with Profile % | src/app/dashboard/settings/page.tsx:417-460 | COVERED | D06 | — |
| /dashboard/settings (Profile) | Profile strength, cover/photo, inline name/headline/location/nationality, open-to switch | src/components/features/profile/ProfileView.tsx:252-429 | COVERED | D06 | Minor gaps: the upload spinner on the camera buttons and the inline error text. |
| /dashboard/settings (Profile) | MUN Stats card + "Show publicly" switch | src/components/features/profile/ProfileView.tsx:432-463 | COVERED | D06 | The "Private to you" subtitle variant is not drawn. |
| /dashboard/settings (Profile) | About / bio inline edit with AI | src/components/features/profile/ProfileView.tsx:466-490; InlineEdit.tsx:83-145 | PARTIAL | D06 | The editing state (textarea, AiTextareaAssist, "Click away to save · Esc to cancel", "Saving…") is not drawn. |
| /dashboard/settings (Profile) | MUN Experience section + dialog | src/components/features/profile/ProfileView.tsx:493-524; ProfileEditDialogs.tsx:98-164 | PARTIAL | D06 | The dialog is missing the Location field, the Description textarea with AI, the remove-entry trash icon, the "Entry" header, the description line and the empty text. The filled section list is not drawn. |
| /dashboard/settings (Profile) | Honors & Awards section + dialog | src/components/features/profile/ProfileView.tsx:527-548; ProfileEditDialogs.tsx:218-260 | MISSING | — | — |
| /dashboard/settings (Profile) | Education section | src/components/features/profile/ProfileView.tsx:551-579 | PARTIAL | D06 | Only the empty state is drawn; the filled list is not. |
| /dashboard/settings (Profile) | Education dialog | src/components/features/profile/ProfileEditDialogs.tsx:168-214 | MISSING | — | — |
| /dashboard/settings (Profile) | Skills & Interests (owner edit) | src/components/features/profile/SkillsSection.tsx:93-184 | MISSING | — | — |
| /dashboard/settings (Profile) | Recommendations (owner: pending approval) | src/components/features/profile/RecommendationsSection.tsx:94-140 | MISSING | — | — |
| /dashboard/settings (Profile) | Recent Activity | src/components/features/profile/ProfileView.tsx:603-623 | MISSING | — | — |
| /dashboard/settings (Profile) | Contact & Social (owner inline edit) | src/components/features/profile/ProfileView.tsx:626-661 | MISSING | — | The board shows only "+ Add phone" in the hero. |
| /dashboard/settings (Profile) | Account / Personal / Professional / Billing cards | src/app/dashboard/settings/page.tsx:481-568 | COVERED | D06 | The Billing pill counts 5 fields in code (:310) vs "0/6" on the board. |
| /dashboard/settings (Profile) | Sticky Save Profile bar | src/app/dashboard/settings/page.tsx:174-215, 570 | COVERED | D06 | — |
| /dashboard/settings (Appearance) | Light / Dark cards | src/app/dashboard/settings/page.tsx:575-609 | COVERED | D06 | — |
| /dashboard/settings (Notifications) | Email toggles + Save Preferences | src/app/dashboard/settings/page.tsx:612-630 | COVERED | D06 | — |
| /dashboard/settings (Privacy) | Toggles + Save Privacy | src/app/dashboard/settings/page.tsx:633-650 | COVERED | D06 | — |
| /dashboard/settings (Security) | Change Password | src/app/dashboard/settings/page.tsx:369-400, 653-671 | PARTIAL | D06 | Only "New passwords do not match." and "Failed. Try again." are drawn. The other error strings and the "Saved!" state are not. |
| /dashboard/settings | Loading skeleton | src/app/dashboard/settings/page.tsx:402-412 | COVERED | Main | — |

## 3. Conference portal (delegate / faculty / observer)

Counts: covered 37 · partial 18 · missing 10

| Route | UI element | Source file:line | Status | Board | What's missing |
|---|---|---|---|---|---|
| P (all tabs) | Portal top bar: "M" logo → /dashboard, event title, "Live MUN" pill (ping dot / Radio icon on phone), Messages toggle, bell, avatar | src/components/dashboard/delegate-portal/PortalTopBar.tsx:136 | COVERED | CP01 | Title skeleton while event loads (PortalTopBar.tsx:168) not drawn (trivial). |
| P (phone) | Hamburger → left Sheet "Conference menu" holding the same nav | src/components/dashboard/delegate-portal/PortalTopBar.tsx:139 | COVERED | CP01 | Board replaces the drawer with scrolling chips (design change). Phone chip row also has no "My Pass" chip. |
| P (all tabs) | Left rail, delegate nav: Back to Home / "Conference Portal" / Overview, Documents, Announcements (badge), Schedule, Requests, [My Pass], [Food], [Transport], [Accommodation], [Dress Code], Session Report, Certificates, Results | src/components/dashboard/Sidebar.tsx:512 | PARTIAL | CP01 | **"My Pass" item (QrCode icon) is not drawn.** It shows when food or transport is on, or on a Pro event (Sidebar.tsx:527, `passesInUse`). The rail's loading skeleton (Sidebar.tsx:473) is not drawn either. |
| P (faculty) | Left rail, faculty variant: "Back to Home", section "Faculty Advisor", single item "Faculty Panel" | src/components/dashboard/Sidebar.tsx:488 | MISSING | — | CP05 draws the faculty panel with no portal rail. |
| P (xl+) | Right rail: Committee Chat (header + committee id, flag reveal "name · country", profile link, composer "Message committee…") | src/components/dashboard/delegate-portal/PortalChatPanel.tsx:135 | PARTIAL | CP01 | Not drawn: no-committee empty "Your committee chat appears here once you're seated in a committee.", empty "No messages yet. Say hello to your committee 👋", loading bubble skeleton, collapsed flag button (title "Show sender"). |
| P (xl+) | Right rail: "Members · n", grouped by committee, member rows, "View all" | src/components/dashboard/delegate-portal/PortalRightRail.tsx:24 | PARTIAL | CP01 | Not drawn: empty "No members allocated yet." (:48), loading skeleton rows, disabled "View all" when the count is 0. |
| P | "People · n" dialog (search + sections) | src/components/dashboard/delegate-portal/PortalMembersDialog.tsx:72 | PARTIAL | CP01 | Only the Organizers and one committee section are drawn. Missing sections: "Executive Board", "Observers & Faculty", "Unassigned". Missing empty state "No people match your search." (:171). |
| P | Member card hover "Message {name}" opens the floating messenger; top-bar Messages toggles it | src/components/dashboard/delegate-portal/PortalMemberCard.tsx:59; DelegatePortalShell.tsx:49 | PARTIAL | CP01 | The open messenger popover (FloatingMessageButton) is not drawn on any CP board. It may be on D05; not checked. |
| P | Portal loading skeleton (title bar, line, 400px block) | src/app/dashboard/conferences/[id]/page.tsx:206 | MISSING | — | Not drawn. |
| P | "Conference not found" state | src/app/dashboard/conferences/[id]/page.tsx:216 | MISSING | — | Not drawn. |
| P ?tab=overview | Hero: status pill, role pill, "Team" pill, title, description, date, location | src/app/dashboard/conferences/[id]/page.tsx:258 | PARTIAL | CP01 | Only "Approved" is drawn. The pill prints raw `application.status` uppercased, so PENDING / WAITLISTED / REJECTED / WITHDRAWN variants exist and none is drawn. The hero shows on Overview only. |
| P ?tab=overview | Room Alerts button (9+ badge, bouncing BellRing when unread) + "Room Notifications" dropdown + 5s toasts | src/components/features/delegate/RoomNotifications.tsx:107 | PARTIAL | CP01 | Not drawn: dropdown empty state "No active notifications" (:145) and the dropdown close (X) button. |
| P ?tab=overview | Committee / Country tiles | src/app/dashboard/conferences/[id]/page.tsx:311 | PARTIAL | CP01 | Country "Pending Assignment" variant (:335) is not drawn on CP01; it appears only on a D02 card. The Committee tile renders blank when there is no committee. |
| P ?tab=overview | Waitlist seat offer (Decline / Accept Seat) | src/app/dashboard/conferences/[id]/page.tsx:355 | COVERED | CP01 | — |
| P ?tab=overview | CeremonyLiveBanner ("Live" chip, "Join ceremony") | src/components/session/ceremony/CeremonyLiveBanner.tsx:41 | COVERED | CP01 | — |
| P ?tab=overview | Live MUN launch card | src/app/dashboard/conferences/[id]/page.tsx:393 | COVERED | CP01 | — |
| P ?tab=overview | LiveGateDialog (not opened / ceremony only / committee not open / chair just opened) | src/components/session/gate/LiveGateDialog.tsx:96; liveGate.ts:96 | COVERED | CP01 | Footer mismatch: in the "Watching for your chair…" state the code shows only "Close" until the chair opens. The board draws "Enter Live MUN" beside it. |
| P ?tab=overview | TeamDelegationPanel, head variant | src/components/features/delegate/TeamDelegationPanel.tsx:90 | COVERED | CP01 | — |
| P ?tab=overview | TeamDelegationPanel, member (non-head) variant + loading | src/components/features/delegate/TeamDelegationPanel.tsx:76 | PARTIAL | CP01 | The non-head view (no "Add Member", no "Team Average Score", no Score column) is not drawn. Loading "Loading team..." is not drawn. |
| P (unpaid) | PaymentRequiredGate, due | src/components/features/delegate/PaymentRequiredGate.tsx:60 | COVERED | CP05 | No-deadline variant (chip hidden when `formatDueDate` is null) is not drawn (minor). |
| P (unpaid) | PaymentRequiredGate, overdue (red) | src/components/features/delegate/PaymentRequiredGate.tsx:48 | COVERED | CP05 | — |
| P ?tab=documents | Documents tab segmented switcher | src/components/features/delegate/DocumentsTab.tsx:33 | PARTIAL | D02 | The portal has 3 sub-tabs: "Position Paper", "Study Guide", "Rules & Regs". D02 draws the /dashboard/documents hub with 4 (adds "Committee Docs"). No board draws the Documents tab inside portal chrome, and the `?doc=paper\|guide\|rules` deep link is not shown. |
| P ?tab=documents | Position paper: submitted read view ("Your submission", .md, Edit) | src/components/features/delegate/PositionPaperUpload.tsx:256 | COVERED | D02 | — |
| P ?tab=documents | Position paper: editor (Write / Upload .md / Import PDF, dropzones, extraction progress, counters, Submit/Update/Cancel, errors) | src/components/features/delegate/PositionPaperUpload.tsx:287 | MISSING | — | No board draws the first-time submit or edit state. |
| P ?tab=documents | Position paper review banners (approved / revision / flagged + chair feedback quote) | src/components/features/delegate/PositionPaperUpload.tsx:175 | PARTIAL | D02 | Only "Under review by the Chairs" is drawn. |
| P ?tab=documents | Study Guide viewer | src/components/features/delegate/StudyGuideViewer.tsx:81 | PARTIAL | D02 | Only the markdown card (collapsed) is drawn. Missing: PDF variant ("PDF", buttons "Save" / "Open"), expanded reader ("Hide"), loading "Loading study guide…", empty "No study guide yet". |
| P ?tab=documents | Rules & Regs viewer | src/components/features/shared/RulesGuideViewer.tsx:66 | MISSING | — | Only the sub-tab label is drawn. The card, loading and empty states are not drawn. |
| /dashboard/documents | Committee Docs (delegate) + EndorsementInbox | src/components/features/delegate/CommitteeDocsDelegate.tsx:290 | PARTIAL | D02 | Not rendered in the portal Documents tab, only in the hub. Not drawn: empty "Nothing submitted yet." (:408), desktop inline form, "Update" (edit) label, form errors. |
| P ?tab=announcements | Announcement list (unread dot, relative time / "Recently", inline markdown) | src/components/features/delegate/AnnouncementViewer.tsx:99 | COVERED | CP02 | — |
| P ?tab=announcements | Empty "No announcements yet" | src/components/features/delegate/AnnouncementViewer.tsx:89 | COVERED | CP02 | — |
| P ?tab=schedule | Conference Schedule timeline | src/components/features/delegate/ScheduleViewer.tsx:30 | COVERED | CP02 | — |
| P ?tab=schedule | Empty "No schedule published yet." | src/components/features/delegate/ScheduleViewer.tsx:46 | COVERED | CP02 | — |
| P ?tab=complaints | "Change Committee or Country" card + seat swap offer | src/app/dashboard/conferences/[id]/page.tsx:472; MigrationPanel.tsx:122 | COVERED | CP02 | — |
| P ?tab=complaints | Migration pending / awaiting swap / resolved | src/components/features/delegate/MigrationPanel.tsx:151 | COVERED | CP02 | — |
| P ?tab=complaints | "Request a Migration" dialog | src/components/features/delegate/MigrationPanel.tsx:180 | COVERED | CP02 | Error strip ("Pick a committee and country.", "Failed to submit.", "Failed.") is not drawn (minor). |
| P ?tab=complaints | ComplaintSystem "New Request" form | src/components/features/delegate/ComplaintSystem.tsx:155 | COVERED | CP02 | — |
| P ?tab=complaints | "Your Requests" list (status, escalation path, resolution, activity log) | src/components/features/delegate/ComplaintSystem.tsx:205 | COVERED | CP02 | — |
| P ?tab=complaints | Empty "No requests submitted" | src/components/features/delegate/ComplaintSystem.tsx:216 | COVERED | CP02 | — |
| P ?tab=pass | **My Pass** card (signed QR, holder name, role · committee, caption) | src/components/features/passes/PassCard.tsx:45; page.tsx:493 | MISSING | — | QR passes shipped 2026-11-01; no board draws them. |
| P ?tab=pass | "What your pass holds" list: meals, coupons (Pro), check-in per day (Pro), rides per route × day (Pro), each Ready / left / Used / Checked in / Not yet | src/components/features/passes/PassCard.tsx:82 | MISSING | — | This is the only place a delegate sees check-in status, transport boarding and custom coupons. |
| P ?tab=pass | Pass loading spinner + error with "Try again" | src/components/features/passes/PassCard.tsx:51 | MISSING | — | — |
| P ?tab=food | Food Coupons | src/components/features/delegate/modules/FoodCouponsModule.tsx:58 | PARTIAL | CP03 | **Board is stale.** It draws a per-slot QR stub with codes and the subtitle "show QR to staff". The code no longer has per-slot QR. The new subtitle links to My Pass, and each card shows used ("Used at {time}", faded) or remaining ("{left} of {uses} left"). Slots are filtered to the pass audience. |
| P ?tab=food | Empty "No food slots configured yet" | src/components/features/delegate/modules/FoodCouponsModule.tsx:46 | COVERED | CP03 | — |
| P ?tab=transport | Transport: registered card + route cards | src/components/features/delegate/modules/TransportModule.tsx:198 | PARTIAL | CP03 | **Board is stale.** The registered card no longer shows a QR; the line now reads "Show your pass to the transport coordinator" with a link. Not drawn: error strip (:225; "Route is full", "Already registered", "Route not found", "Registration failed") and busy "Registering...". |
| P ?tab=transport | Empty "No transport routes available" | src/components/features/delegate/modules/TransportModule.tsx:176 | COVERED | CP03 | — |
| P ?tab=accommodation | Accommodation status card + block cards | src/components/features/delegate/modules/AccommodationModule.tsx:96 | PARTIAL | CP03 | Only "Pending Review" is drawn. Missing "Confirmed" (green) and "Rejected" (red). Once a request exists the block grid is hidden (:117), but the board shows both together. Not drawn: busy "Requesting...", error "Failed to submit request. Please try again." |
| P ?tab=accommodation | Empty "No accommodation options available" | src/components/features/delegate/modules/AccommodationModule.tsx:74 | COVERED | CP03 | — |
| P ?tab=dresscode | Dress Code (hero image, Attire Requirement, Reference Gallery, 3 static cards) | src/components/features/delegate/modules/DressCodeModule.tsx:205 | COVERED | CP03 | — |
| P ?tab=dresscode | Empty "No dress code specified" | src/components/features/delegate/modules/DressCodeModule.tsx:193 | COVERED | CP03 | — |
| P ?tab=certificate | Certificate locked | src/app/dashboard/conferences/[id]/page.tsx:535 | COVERED | CP04 | — |
| P ?tab=certificate | Certificate unlocked (preview, Print Certificate, Download PDF) | src/components/features/delegate/CertificateDownload.tsx:63 | PARTIAL | CP04 | One look is drawn; the organizer picks one of 3 (`event.certificateTemplate`): "Classic Diploma" (double slate border), "Modern Minimal" (violet left bar), "Ornate Gold" (gold border, Pro) (src/lib/data/eventLook.ts:33). Not drawn: busy "Building PDF...", error alert. |
| P ?tab=results | Results loading skeleton | src/app/dashboard/conferences/[id]/page.tsx:548 | MISSING | — | Minor. |
| P ?tab=results | Final score card, criteria grid ("show marks"), Chair Feedback, Daily breakdown (pct / "not counted" / "absent"), Published vs Provisional | src/app/dashboard/conferences/[id]/page.tsx:611 | COVERED | CP04 | — |
| P ?tab=results | Committee Standing, full board (CommitteeLeaderboard, "you" highlight, trophy/medals for ranks 1–3, showOverall=false) | src/app/dashboard/conferences/[id]/page.tsx:694; src/components/marking/Leaderboard.tsx:76 | COVERED | CP04 | — |
| P ?tab=results | Committee Standing, rank_only note | src/app/dashboard/conferences/[id]/page.tsx:710 | COVERED | CP04 | — |
| P ?tab=results | Empty "Results Not Yet Published" | src/app/dashboard/conferences/[id]/page.tsx:553 | COVERED | CP04 | — |
| P ?tab=session-report | Session day date input + SessionReport (own mode: flag/country, attendance, 9 stat cells, "Yielded to:", Print / Download) | src/app/dashboard/conferences/[id]/page.tsx:731; src/components/session/SessionReport.tsx:254 | COVERED | CP04 | Phone only. Download busy spinner and alert "Could not generate the PDF. Try Print instead." are not drawn (minor). |
| P ?tab=session-report | Empty "No participation recorded yet." | src/components/session/SessionReport.tsx:255 | COVERED | CP04 | — |
| P (faculty) | FacultyAdvisorPanel (header, "Message Delegation", "My Delegates" table) | src/components/features/delegate/FacultyAdvisorPanel.tsx:131 | COVERED | CP05 | — |
| P (faculty) | Empty "No delegates found from your institution" | src/components/features/delegate/FacultyAdvisorPanel.tsx:158 | COVERED | CP05 | — |
| /dashboard/observer | Observer Dashboard (badge, title, per-event card: Committees chips, Recent Announcements, Delegates) | src/app/dashboard/observer/page.tsx:97 | COVERED | CP05 | — |
| /dashboard/observer | Empty "No observer access yet" + "Browse Conferences" | src/app/dashboard/observer/page.tsx:107 | COVERED | CP05 | — |
| /dashboard/observer | Roster hidden note | src/app/dashboard/observer/page.tsx:189 | COVERED | CP05 | — |
| /dashboard/observer | Inline empties + loading | src/app/dashboard/observer/page.tsx:88 | PARTIAL | CP05 | Not drawn: "No committees yet.", "No announcements yet.", "No approved delegates yet.", loading skeleton, "Date TBA" / "Location TBA" fallbacks. |
| P (rejected / withdrawn) | Full portal for a rejected or withdrawn applicant | src/lib/services/paymentGate.ts:92; page.tsx:229 | MISSING | — | The payment gate returns `refunded` for dead apps, and the page has no status gate, so a rejected or withdrawn applicant gets the full portal with a "REJECTED" pill. No board draws it, and it is probably unintended (see Questions). |

## 4. Chair & Executive Board

Counts: covered 32 · partial 10 · missing 10

| Route | UI element | Source file:line | Status | Board | What's missing |
|---|---|---|---|---|---|
| /dashboard/chair | Chair Dashboard header + committee cards (role badge, title, date, Assigned Committee, "{n} Delegates", "Study Guide: Uploaded/Pending", Manage Committee) | src/app/dashboard/chair/page.tsx:147-225 | COVERED | CH01 | — (note: the "{n} Delegates" figure is the committee's *capacity*, falling back to "N/A" when unset, not the approved count) |
| /dashboard/chair | Empty: "No Committees Assigned" + Browse Conferences | src/app/dashboard/chair/page.tsx:155-166 | COVERED | CH01 | — |
| /dashboard/chair | Loading skeleton (title bar + 2 card skeletons) | src/app/dashboard/chair/page.tsx:131-140 | MISSING | — | Loading state not drawn |
| /dashboard/chair/committee/[id] | Committee Hub left rail (Back to Committees, "Committee Hub", tabs) | src/components/dashboard/Sidebar.tsx:577-647 | PARTIAL | CH01 | Missing rail items **My Pass** (when the event uses passes) and **Scan Passes** (with the `canScanPasses` permission; links to /dashboard/scan/[eventId]). The board shows gated tabs with a lock, but the code *hides* Study Guide, Awards & Results and Room Alert from viewers who can't act. The lock notice appears only when the tab is reached by a direct link. |
| /dashboard/chair/committee/[id] | Hub page loading skeleton | HUB:817-827 | MISSING | — | Not drawn |
| …?tab=overview | Hero: hub-type pill, role pill, committee, event, "{n} Approved Delegates", date, location | HUB:884-937 | COVERED | CH01 | — |
| …?tab=overview | Role variants: "Executive Board — Oversight" / "Organizer Oversight" / "Chair Management Hub"; raw role pill (e.g. vice-chair, director, co-organizer, organizer) | HUB:832-836, 899-903 | COVERED | CH01 | Drawn as a label strip only |
| …?tab=overview | Orange notice "No committee assigned to you yet" | HUB:940-953 | COVERED | CH01 | — |
| …?tab=overview | Blue notice "Read-only view" | HUB:955-968 | COVERED | CH01 | — |
| …?tab=overview | Ceremony live banner ("Live", "Join ceremony") | src/components/session/ceremony/CeremonyLiveBanner.tsx:41-70 | COVERED | CH01 | — |
| …?tab=overview | Committee Stats (Grading Progress g / n + bar, Top Score, Open Complaints) | HUB:984-1024 | COVERED | CH01 | "N/A" Top Score when nothing is scored isn't drawn (minor) |
| …?tab=overview | Quick Actions | HUB:1026-1087 | PARTIAL | CH01 | Not drawn: the read-only variant without "Send Room Alert" and "Manage/Upload Study Guide"; the label "Upload Study Guide" when no guide exists; Message Committee's busy spinner, and the button disabled when there are 0 delegates; Launch Live MUN disabled while checking or when there's no committee |
| …?tab=overview | Live MUN gate dialog (opened by Launch Live MUN) | src/components/session/gate/LiveGateDialog.tsx:122-165; src/components/session/gate/liveGate.ts:92-130 | COVERED | CP01 | Drawn on CP01 in the delegate context. A chair only ever gets the "Live MUN hasn't opened yet" and "Committee sessions aren't open yet" variants. Organizer-level viewers skip the gate. |
| …?tab=marking | Four stat tiles (Scored today / Committee average / Present / Criteria filled) | HUB:1094-1103 | COVERED | CH02 | Hint variants "everyone marked" and "no roll call recorded" (with value "—") aren't drawn |
| …?tab=marking | Matrix header + toolbar (Apply suggestions, day stepper, Sort select, Unscored only, Search...) | HUB:1105-1158 | COVERED | CH02 | Sort options list (Sort: country / daily % / final % / unscored first) not drawn open; saving spinner beside the title |
| …?tab=marking | Matrix table, binary mode (sticky delegate column, attendance pill, participation chips, criterion columns, Daily %, Committee mean footer, multi-mark "·n" cell) | HUB:1168-1273; src/components/session/BinaryScoreSelect.tsx:36-76; src/components/marking/markingUi.tsx:45-115 | COVERED | CH02 | — |
| …?tab=marking | Decimal cell (−100…+100 input, "—" placeholder) | HUB:1234-1243 | COVERED | CH02 | Drawn in the state strip |
| …?tab=marking | Matrix empty states (no templates / every delegate scored / no match) | HUB:1161-1165, 1182-1187 | COVERED | CH02 | — |
| …?tab=marking | Matrix read-only variant (viewer without canMark) | HUB:1118, 1229, 1239 | MISSING | — | Cells disabled (binary control at 50% opacity, inputs not-allowed), and "Apply suggestions" hidden |
| …?tab=marking (sheet) | Delegate marking detail sheet (header Final % / Rank, prev/next, Day by day, selected-day criteria, On the floor, How this final was computed, Feedback) | src/components/marking/DelegateMarkingDetail.tsx:152-366 | COVERED | CH02 | — |
| …?tab=marking (sheet) | Detail sheet edge states | src/components/marking/DelegateMarkingDetail.tsx:194-197, 203-205, 238-240, 305-307, 337-339, 341-346, 181 | MISSING | — | Loading spinner; "No conference days recorded yet."; "No marking criteria configured for this event."; "No live-session record for this day."; "no chair overall entered — final = computed %"; excluded-days note; read-only (disabled) variant; saving spinner |
| …?tab=marking (sheet) | Score entries editor (mark chips with ×, −1/0/+1 add buttons or "±100" + Add, avg) | src/components/session/ScoreEntriesEditor.tsx:50-110 | COVERED | CH02 | Empty "No marks yet" not drawn |
| …?tab=motionlog | Motion Log card (header, day stepper, filter chips with counts, "{n} carried", rows with time / icon / title / country / "by proxy · {name}" / tally / outcome badge) | src/components/session/DailyMotionLog.tsx:226-338 | COVERED | CH03 | Loading spinner, plus the outcome values "dismissed", "pending", "tied", "logged by chair" (only some are drawn) |
| …?tab=motionlog | Expanded vote (threshold / eligible / cast, tally bar, For/Against/Abstain, Roll call chips) | src/components/session/DailyMotionLog.tsx:425-485 | COVERED | CH03 | "Vetoed by", "second round", "Security Council", "division of the question", "{n} ballots were reopened by the chair." not drawn |
| …?tab=motionlog | Expanded motion / point / yield detail | src/components/session/DailyMotionLog.tsx:318-330, 349-380 | MISSING | — | No expanded motion, point or yield is drawn (fields listed below) |
| …?tab=motionlog | Empty states ("Nothing recorded on this day" / "Nothing of that kind on this day") | src/components/session/DailyMotionLog.tsx:250-260 | COVERED | CH03 | — |
| …?tab=papers | Position Papers list + submitted summary + "Remind by email" + reminder confirmation | HUB:1294-1362 | COVERED | CH03 | Drawn on phone only (no desktop list frame) |
| …?tab=papers | Papers empty + read-only variant | HUB:1311, 1331-1336, 1352 | MISSING | — | "No approved delegates in this committee yet."; "View" button instead of "Grade" for viewers without canMark; Remind button hidden for non-managers; "Remind by email" busy spinner and disabled state |
| …?tab=papers (dialog) | Position Paper Viewer (paper left; Status, Score, Feedback + AI, Save Grade, Internal Chair Notes) | src/components/features/chair/PositionPaperViewer.tsx:104-219 | COVERED | CH03 | — |
| …?tab=papers (dialog) | Viewer alternate states | src/components/features/chair/PositionPaperViewer.tsx:110, 121-125, 131-134, 172-175, 187-188, 209-211 | PARTIAL | CH03 | Only "Save grade first to enable notes." is drawn. Missing: grading-pane loading spinner; legacy PDF iframe ("Position Paper (legacy)"); "No paper submitted"; "No notes yet"; Save Grade spinner. The status badge renders `status.toUpperCase()`, i.e. REVIEW / APPROVED / REVISION / FLAGGED, not "UNDER REVIEW" |
| …?tab=requests | Complaint Inbox, Open tab (type, subject, date, description, Resolution note, Resolve, Escalate to Organizer) | HUB:1366-1452 | COVERED | CH03 | Drawn on phone only |
| …?tab=requests | Resolved tab / loading / escalated card | HUB:1388-1394, 1414, 1441-1445 | PARTIAL | CH03 | Not drawn: the Resolved list with the green "Resolution: {text}" line; loading spinner; "No resolved complaints". The board's escalated card has an "escalated" pill and "With the organizer — no action needed here." Neither exists in code: an escalated complaint just renders with no actions and no status text. |
| …?tab=studyguide | Study Guide editor (file name, Write / Upload .md / Import PDF, WYSIWYG + AI, Update Guide, Delete) | HUB:1455-1507; src/components/features/shared/MarkdownDocEditor.tsx:80-145 | PARTIAL | CH04 | Not drawn: the first-publish variant ("Publish Guide", no Delete); the busy spinner. Delete has no confirmation. |
| …?tab=studyguide | Upload .md / Import PDF panes + error states | src/components/features/shared/MarkdownDocEditor.tsx:104-135; HUB:633-636, 661, 1488-1492 | MISSING | — | Drop zones, PDF extraction progress, and red error box not drawn |
| …?tab=studyguide/awards/roomalert | Locked notice "{label} is restricted" | HUB:852-864 | COVERED | CH04 | — |
| …?tab=rules | Rules & Regs viewer (Published by the conference organizers, .md download, Read) | src/components/features/shared/RulesGuideViewer.tsx:66-108 | PARTIAL | CH04 | Not drawn: the expanded reading state (rendered markdown body, button flips to "Hide"); the empty state; the loading state |
| …?tab=pass | My Pass tab (staff QR pass) | HUB:1518-1521; src/components/features/passes/PassCard.tsx:45-118 | MISSING | — | No CH board (and no CP board) draws PassCard |
| …?tab=awards | Committee Standings (visibility select, Publish/Update/Withdraw, leaderboard) | HUB:1528-1572; src/components/marking/Leaderboard.tsx:75-163 | PARTIAL | CH04 | Not drawn: the never-published state ("Publish" button, no "Published (…)." suffix); the 2s "Published" success; the leaderboard empty hint "No daily marks yet — the board fills in from the Marking matrix."; controls hidden when there are 0 days; Trophy/Medal icons on ranks 1-3 with medal-toned rank badges. The board's Overall column shows "+1", but code shows a % (criterionPct) or "—". |
| …?tab=awards | Withdraw confirm "Withdraw the published standings? Delegates will stop seeing their rank." | HUB:603 | COVERED | CH04 | Native `confirm()` in code |
| …?tab=awards | Final Scoring table | HUB:1575-1669 | PARTIAL | CH04 | Not drawn: decimal-mode Overall column ("Overall (−100…+100)" number input, "—" placeholder); "Saved" success state; spinner beside the title |
| …?tab=awards | Final Scoring empty "No daily marks yet." | HUB:1606-1610 | COVERED | CH04 | — |
| …?tab=awards | Final Awards (3 selects, Submit Awards, "Awards submitted") | HUB:1671-1722 | COVERED | CH04 | Disabled state when nothing is picked; busy spinner |
| …?tab=roomalert | Room Alert form (Message, Type, Expires in, Send Alert) | HUB:1728-1790 | COVERED | CH04 | Busy text "Sending..." not drawn. The board adds a live **Preview** block that does **not** exist in code. Type and Expires in are Select dropdowns in code; the board draws chips. |
| …?tab=roomalert | Sent state "Notification sent!" | HUB:1738-1742 | COVERED | CH04 | — |
| /dashboard/eb | EB Dashboard (badge, header, 4 stat chips, per-event header, committee cards with ring, bar, chairs roster, reassign select, remove, Open Committee) | src/app/dashboard/eb/page.tsx:206-390 | COVERED | CH05 | — |
| /dashboard/eb | Remove chair? dialog | src/app/dashboard/eb/page.tsx:392-416 | COVERED | CH05 | Busy text "Removing..." not drawn |
| /dashboard/eb | Empty "No Executive Board Assignments" | src/app/dashboard/eb/page.tsx:235-245 | COVERED | CH05 | — |
| /dashboard/eb | Loading skeleton | src/app/dashboard/eb/page.tsx:180-198 | MISSING | — | Not drawn |
| /dashboard/documents (chair/EB card, Study Guide sub-tab) | StudyGuideEditor (chair authoring in the Documents hub) | src/components/features/chair/StudyGuideEditor.tsx:78-163; src/app/dashboard/documents/page.tsx:115-117 | MISSING | — | D02 draws only the delegate's read-only study guide. The chair's Published card + Edit, edit mode with Cancel, the no-committee notice and loading are not drawn. |
| /dashboard/documents (chair/EB card, Committee Docs sub-tab) | CommitteeDocsChair review list | src/components/features/chair/CommitteeDocsChair.tsx:82-236 | PARTIAL | D02 | D02 draws one expanded review row (note + Approve / Request revision / Reject). Not drawn: the card header "Committee Documents" + pending-count badge + description; collapsed rows (title, status pill, meta line, Open / Review); empty; loading; no-committee; the read-only variant (faculty/observer, no actions) |
| /dashboard/documents (chair/EB card, Position Papers sub-tab) | Pointer card "Grade position papers in the committee hub" + Open | src/app/dashboard/documents/page.tsx:121-136 | COVERED | D02 | — |
| /dashboard/organizer/events/[id]/rules | RulesGuideEditor (organizer authoring) | src/components/features/shared/RulesGuideEditor.tsx:60-128 | PARTIAL | OR05 | OR05 draws edit mode only. Not drawn: Published summary card + Edit; first-publish "Publish Rules"; loading; error box |

## 5. Organizer 1: home, events, create, overview, details, committees, partners, allocation, staff

Counts: covered 29 · partial 14 · missing 9

| Route | UI element | Source file:line | Status | Board | What's missing |
|---|---|---|---|---|---|
| /dashboard/organizer | Organizer Dashboard page: 4 stat cards, Events at a Glance, Applications by Role table, Your Events (4 cards + "View all {n} events") | src/app/dashboard/organizer/page.tsx:73-218 | COVERED | OR01 | Approval Rate shows "—" when there are no applications (not drawn). |
| /dashboard/organizer | Empty state when there are no events: side card "No events yet." + "Create first event" | src/app/dashboard/organizer/page.tsx:135-147 | MISSING | — | OR01 draws only the empty table row ("No applications across your events yet."), not this card. Also "Your Events" is hidden when there are none. |
| /dashboard/organizer, /events, /events/[id], allocation tabs, staff | Loading skeletons (stat tiles, card grid, table, applicant-sheet skeleton) | src/app/dashboard/organizer/page.tsx:58-68; src/app/dashboard/organizer/events/page.tsx:126-139,246-249; src/app/dashboard/organizer/events/[id]/page.tsx:63-73; src/components/features/organizer/ApplicationsTable.tsx:65-72; src/app/dashboard/organizer/events/[id]/countries/page.tsx:152-159; src/app/dashboard/organizer/events/[id]/capacity/page.tsx:85-94; src/app/dashboard/organizer/events/[id]/staff/page.tsx:251-258; src/components/features/organizer/ApplicationDetailSidebar.tsx:157-168 | MISSING | — | No board draws a loading state for any organizer page. |
| /dashboard/organizer/* (no event) | Organizer sidebar, owner: "Organizer" › Manage Events, Financials, MUN Pilot Pro, "Back to Dashboard" | src/components/dashboard/Sidebar.tsx:336-353 | COVERED | OR01 | — |
| /dashboard/organizer/* (no event) | Organizer sidebar, co-organizer variant (Financials and MUN Pilot Pro hidden) | src/components/dashboard/Sidebar.tsx:339,344-349 | MISSING | — | Only the owner sidebar is drawn. A co-organizer sees just "Manage Events" + "Back to Dashboard". |
| /dashboard/organizer/events | Manage Events: header, 3 stat chips, All/Published/Drafts segmented tabs with counts, "Search events...", event cards (cover, Draft/Published, Co-organizer, format pill, date/"Date TBA", location/"Location TBA", "{n} Committees", delegates chip, "Manage Conference ›") | src/app/dashboard/organizer/events/page.tsx:40-124,193-283 | COVERED | OR01 | Segmented tabs show counts (All 3 / Published 2 / Drafts 1). Phone frame draws them without counts. |
| /dashboard/organizer/events | Empty: "No events yet" / "Create Your First Event" | src/app/dashboard/organizer/events/page.tsx:250-264 | COVERED | OR01 | — |
| /dashboard/organizer/events | No match: "No events match your filters" / "Clear filters" | src/app/dashboard/organizer/events/page.tsx:265-272 | COVERED | OR01 | — |
| (dialog from home/events) | Create event dialog: cover "Add", host strip, "Event name", Start date/Start time/Time zone, "+ End date and time", format select, venue search + map, "Who can see it?", description + AI, "Create event", draft footnote | src/components/features/organizer/CreateEventDialog.tsx:288-534 | COVERED | OR01 | Format is a Select dropdown in code (board draws 3 chips; labels match). |
| /dashboard/organizer/events/[id], /details | Edit event dialog (mode="edit") | src/components/features/organizer/CreateEventDialog.tsx:247-253,293-295,515-530; triggered at src/app/dashboard/organizer/events/[id]/page.tsx:189-198 and details/page.tsx:193-202 | MISSING | — | Not drawn: title "Edit event", button "Save changes", busy "Saving...", no draft footnote, fields prefilled (incl. pinned place), End date/time shown when set. |
| (dialog) | Create/Edit dialog states: busy and errors | src/components/features/organizer/CreateEventDialog.tsx:191-198,282,515-519 | PARTIAL | OR01 | Only the past-start error is drawn. Missing: busy "Creating...", "Please fill all required fields.", "You must be signed in.", "Failed to save event. Please try again.". The submit button is disabled until the form is valid (no disabled look drawn). |
| (dialog) | LocationSearch venue combobox: results list (name, address, ★ rating (count), category), "Location pinned with map coordinates" | src/components/features/organizer/LocationSearch.tsx:57-80,124-198 | PARTIAL | OR01 | Searching/no-results/press-Enter are drawn. Missing error texts: "Type at least 2 characters to search.", "Search failed.", "Could not reach the search service.". Dropdown header label toggles "Searching…" / "Results". |
| (dialog) | LocationMap with draggable pin + hint | src/components/features/organizer/LocationMap.tsx:129-133 | COVERED | OR01 | Pinning without a search fills location as "Pinned location" (not drawn, minor). |
| (dialog) | Virtual format: "Meeting link (optional)" | src/components/features/organizer/CreateEventDialog.tsx:420-429 | COVERED | OR01 | — |
| /dashboard/organizer/events/[id]/* | Event sidebar: Setup / Content / Live MUN / Tools / Finances, "Back to Events" | src/components/dashboard/Sidebar.tsx:355-405 | PARTIAL | OR02, OR07 | Tools section has 3 links (QR passes, 2026-11-01) that no board draws: "Coupons" (391), "Scan Passes" → /dashboard/scan/{id} (392), "Pass Report" (393). OR02 draws only Setup/Content/Finances. OR07 draws Live MUN + Tools without these 3. Co-organizer label "Roles & Schedule" (401) is drawn only in an OR07 state strip. |
| /dashboard/organizer/events/[id] | Overview, draft: cover hero (Draft, "Edited x ago", Publish/Edit/View), "Ready to publish?" checklist with Edit/Add rows, footnote | src/app/dashboard/organizer/events/[id]/page.tsx:143-260,454-492 | COVERED | OR02 | — |
| /dashboard/organizer/events/[id] | Overview, live: stat cards, Recent Applications, Country Assignments, Upcoming Session, Committees fill, Quick Tools | src/app/dashboard/organizer/events/[id]/page.tsx:262-440 | PARTIAL | OR02 | Missing states: "No applications yet." (327-329). "No upcoming sessions" + "Within 7 days" (368-371). Busy "Publishing..." / "Updating..." (181,186). Alerts "Failed to publish event." / "Failed to unpublish event." (119,134). Assign Now turns secondary when 0 pending (347). |
| /dashboard/organizer/events/[id] | Free-plan publish cap alert | src/app/dashboard/organizer/events/[id]/page.tsx:107-113 | COVERED | OR02 | — |
| /dashboard/organizer/events/[id] | Unpublish confirm | src/app/dashboard/organizer/events/[id]/page.tsx:127 | COVERED | OR02 | — |
| /events/[id], /allocation | Applicant Profile sheet: header, status/payment badges, User Information + Bio, Ranked Committee Choices, Experience, Motivation, Approve Application Settings (committee ★#n, country #n/Taken + tooltip), Approve/Reject | src/components/features/organizer/ApplicationDetailSidebar.tsx:144-532 | COVERED | OR02 | — |
| /events/[id], /allocation | Applicant sheet variants: Unpaid warning + "Unpaid" button, Faculty Advisor Information, Team Details, Event Assignment | src/components/features/organizer/ApplicationDetailSidebar.tsx:271-317,347-377,489-505 | COVERED | OR02 | — |
| /events/[id], /allocation | Applicant sheet: single-choice + faculty label variants, approved/rejected button sets | src/components/features/organizer/ApplicationDetailSidebar.tsx:234-236,326,337,358-364,405-408,487-526 | PARTIAL | OR02 | Single committee: heading "Preferred Choice" + star badge "Preferred" (not "#1"). Faculty: "Supervisor Experience", "Motivation for Participating". Approved: only Reject shows. Rejected: only Approve shows. Assigned "None" fallbacks. Placeholders "Select committee" / "Select country". |
| /events/[id], /allocation | Applicant sheet: approval refused alerts (Free-plan seat cap, unpaid, failure) | src/components/features/organizer/ApplicationDetailSidebar.tsx:84,105,109; src/lib/services/applicationService.ts:405,423-424 | MISSING | — | Plan participant cap (late Oct) is not drawn: "This event is full for its plan. Upgrade the event or ask for more room under Plan.". Also: "This applicant hasn't paid the registration fee yet. They can't be approved until payment is confirmed.", "Failed to update application status.", "Error updating application.". |
| /events/[id]/details | Event Details: header + "Edit event", saved banner, Delegate Information, Web & Social Media, Optional Modules, Marking Templates (pattern, rows, auto-fill, cap), Final Scoring, "Save Details" | src/app/dashboard/organizer/events/[id]/details/page.tsx:186-534 | COVERED | OR03 | Minor: busy "Saving...", alert "Failed to save event details.", Decimal-mode copy ("Chairs score each criterion on a −100…+100 numeric scale."). |
| /events/[id]/details | Marking templates empty + "Add starter set" | src/app/dashboard/organizer/events/[id]/details/page.tsx:450-461 | COVERED | OR03 | — |
| /events/[id]/allocation | Allocation shell: title, lede, 5 tabs (Applications / Country Assignment / Migration / Capacity & Waitlist / Invitation), ?tab= deep link | src/app/dashboard/organizer/events/[id]/allocation/page.tsx:11-72 | COVERED | OR04 | — |
| /events/[id]/allocation?tab=applications | Applications table: search, status filter, columns, Awaiting payment badge, Approve (opens sheet) / Unpaid / Reject | src/components/features/organizer/ApplicationsTable.tsx:84-240 | COVERED | OR04 | Filter first option label is lowercase "all". Trigger placeholder is "All Status". |
| /events/[id]/allocation?tab=applications | Empty: "No applications found matching your filters." | src/components/features/organizer/ApplicationsTable.tsx:217-222 | COVERED | OR04 | — |
| /events/[id]/allocation?tab=countries | Country Assignments: deadline timer, warnings, Delegation Matrix with committee tabs, rows, conflict info box | src/app/dashboard/organizer/events/[id]/countries/page.tsx:161-309; src/components/features/organizer/CountryAssignmentRow.tsx:30-119 | PARTIAL | OR04 | Button label is "Save" (board says "Save Assignments"). Missing states: timer "COMPLETED" (green), "All applicants assigned!", non-AI warning "1 hour until deadline", empties "No committees configured for this event." and "No approved applicants for this committee yet.", Conflict badge tooltip "Held at {event} on {date}", 🟡 conflict marker in the select. |
| /events/[id]/allocation?tab=countries | AI assignment in progress banner | src/app/dashboard/organizer/events/[id]/countries/page.tsx:198-206 | COVERED | OR04 | — |
| /events/[id]/allocation?tab=migration&sub=requests | Migration Requests: Needs review / Awaiting swap / History | src/components/features/organizer/MigrationHub.tsx:26-50; src/components/features/organizer/MigrationRequests.tsx:92-186 | PARTIAL | OR04 | Phone frame only. Missing: empty "No migration requests yet.", error banner ("Action failed." / API error), approve spinner, Seat "/ no country" fallback. |
| /events/[id]/allocation?tab=migration&sub=direct | Direct Migration sub-tab body: header, lede, search, "Approved delegates (n)" list with Move, empties, "Admin migrations (n)" history | src/components/features/organizer/DirectMigration.tsx:175-247 | MISSING | — | Only the sub-tab label, Move dialog and success flash are drawn. The list, search, empties and history are not. |
| (dialog) | Move {name} dialog: Currently, Target committee, Target country, occupant notice, Reason, Swap/Move | src/components/features/organizer/DirectMigration.tsx:249-325 | PARTIAL | OR04 | Swap variant drawn. Missing: plain "Move" variant (free seat). Red blocked notice "Seat held by {occupant} and {name} has no country to swap back. Assign {name} a country first, or pick a free seat.". Errors "Pick a target committee and country.", "That seat is taken. Assign this delegate a country first, or pick a free seat.", "Migration failed.". Placeholders "Pick a committee first", fallback input "Country code (e.g. US)". |
| /events/[id]/allocation?tab=migration&sub=direct | Success flash "{name} moved to {committee} / {country} (swapped)." | src/components/features/organizer/DirectMigration.tsx:150,187-191 | COVERED | OR04 | — |
| /events/[id]/allocation?tab=capacity | Committee Capacity & Waitlist: capacity cards (FULL, filled/cap, bar, seats remaining), per-committee waitlist tables | src/app/dashboard/organizer/events/[id]/capacity/page.tsx:96-157; src/components/features/organizer/CapacityCard.tsx:31-83; src/components/features/organizer/WaitlistTable.tsx:22-81 | PARTIAL | OR04 | Phone frame only. Missing: section headings "Committee Overview" / "Waitlist Queues", empty "No committees configured for this event.", "No limit set", Accepted / Expired badges, disabled "Offered" button, alert "Couldn't offer the seat. Please try again.". |
| /events/[id]/allocation?tab=staff (also /events/[id]/staff) | Staff & Permissions, Current & Invited: header, Allow Public Applications switch + Save, Invite Staff, rows (role select, Committee select, vice-chair power, Edit/Hide Permissions, trash) | src/app/dashboard/organizer/events/[id]/staff/page.tsx:260-415 | PARTIAL | OR05 | Missing: Save busy "Saving..." and "Saved!" feedback. Committee select first option is "All committees" for director/USG/EB and "No Committee" for chair/vice-chair. Committee select only shows for chair, vice-chair, director, usg, eb. |
| /events/[id]/allocation?tab=staff | Applications tab: public staff applications review | src/app/dashboard/organizer/events/[id]/staff/page.tsx:289-294,417-452 | MISSING | OR05 (tab label only) | No board draws the tab body (card, ENABLED/DISABLED note, rows, Accept/Reject, empty) or the unread dot on the tab. |
| /events/[id]/allocation?tab=staff | Empty: "No Staff Yet" | src/app/dashboard/organizer/events/[id]/staff/page.tsx:298-304 | MISSING | — | Not drawn. |
| /events/[id]/allocation?tab=staff | Custom Permissions editor | src/components/features/organizer/PermissionsEditor.tsx:23-63 | PARTIAL | OR05 | 7th switch (QR P2) not drawn: "Scan Passes", "Scan QR passes for meals, coupons and check-in.". "View Financials" is disabled for every role except co-organizer (no disabled look drawn). |
| (dialog) | Invite Staff Member dialog | src/components/features/organizer/StaffInviteModal.tsx:36-93 | COVERED | OR05 | Minor: spinner in Send button while busy, alert "Failed to send invite.". The send button is disabled with an empty email. |
| (dialog) | Change role? dialog | src/app/dashboard/organizer/events/[id]/staff/page.tsx:489-520 | PARTIAL | OR05 | Only the accepted-member copy is drawn. Pending-invite variant: "Their pending invitation will be updated to the new role.". Busy "Updating...". |
| (dialog) | Remove staff member? dialog | src/app/dashboard/organizer/events/[id]/staff/page.tsx:455-487 | MISSING | — | Not drawn (OR05 only has the trash button's sr-only label). |
| /events/[id]/committees | Committees page: header, "Create Committee", committee cards (difficulty, Topic/Agendas, seats ring, countries, Delegation flags, edit/delete) | src/app/dashboard/organizer/events/[id]/committees/page.tsx:258-407 | COVERED | OR03 | — |
| /events/[id]/committees | "Committee choices per applicant" stepper | src/app/dashboard/organizer/events/[id]/committees/page.tsx:274-305 | COVERED | OR03 | Saving spinner beside the title (minor). |
| /events/[id]/committees | Empty: "No Committees Yet" | src/app/dashboard/organizer/events/[id]/committees/page.tsx:307-321 | COVERED | OR03 | — |
| (dialog) | Pick a Committee Template dialog | src/app/dashboard/organizer/events/[id]/committees/page.tsx:410-500 | COVERED | OR03 | Minor: section label "Start from a template", divider "Or", scratch subtitle "Set the name, capacity, and pick the country roster yourself.", footer "Cancel", "+{n}" flag overflow badge. |
| (dialog) | Committee form dialog (create / customize template / edit) | src/app/dashboard/organizer/events/[id]/committees/page.tsx:503-650 | PARTIAL | OR03 | Phone draws only the "Customize Template" form. Missing: "Description" textarea + AI assist. Title variants "Create Committee" / "Edit Committee" and both descriptions. Capacity help "Capacity is the maximum number of delegates. Add countries up to this number.". Placeholder "e.g., 50". "Cancel" button. |
| /events/[id]/committees | Plan committee cap alert | src/app/dashboard/organizer/events/[id]/committees/page.tsx:209-212 | COVERED | OR03 | — |
| (dialog) | Delete Committee confirm | src/app/dashboard/organizer/events/[id]/committees/page.tsx:652-683 | COVERED | OR03 | — |
| /events/[id]/partners | Event Partners: header, "Add Partner", drag-to-reorder cards (logo, name, description, Visit Site, edit, delete) | src/app/dashboard/organizer/events/[id]/partners/page.tsx:112-241 | COVERED | OR03 | Phone only. Delete happens at once with no confirm (matches code). |
| /events/[id]/partners | Add / Edit partner form card | src/app/dashboard/organizer/events/[id]/partners/page.tsx:128-165 | PARTIAL | OR03 | Missing: "Partner Logo" image uploader. Edit variant: title "Edit Partner", button "Save Changes". |
| /events/[id]/partners | Empty: "No partners added yet." | src/app/dashboard/organizer/events/[id]/partners/page.tsx:232 | COVERED | OR03 | — |

## 6. Organizer 2: schedule, announcements, rules, modules, complaints, tools, money, plan, QR passes

Counts: covered 16 · partial 17 · missing 26

| Route | UI element | Source file:line | Status | Board | What's missing |
|---|---|---|---|---|---|
| /organizer/events/[id]/schedule | Schedule Builder page (header + session rows) | EV/schedule/page.tsx:92-300 | PARTIAL | OR05 | Board has a phone frame only. Missing: the desktop layout; the "Add Session" header button (beside "Save Schedule"); the busy text "Saving..."; the numbered index chip and grip icon on each row; the trash button on each row. Start Time and End Time are `datetime-local` inputs, but the board shows "13:00". Missing the Type options "Main Event / Committee Session / Break / Lunch / Social Event". Missing the native alerts "Schedule updated successfully" and "Failed to update schedule". |
| /organizer/events/[id]/schedule | Empty state | EV/schedule/page.tsx:209-219 | MISSING | — | "No sessions yet" / "Build your conference itinerary session by session." / "Add first session" |
| /organizer/events/[id]/schedule | "Add to Schedule" dialog | EV/schedule/page.tsx:117-207 | PARTIAL | OR05 | Board draws only the three template names. Missing: the dialog description (two variants); the template cards with the "N days · N sessions" pill, description, "Starts {start} · ends {end} on day N" and colored session chips; the "Or" divider; the "Add a custom session" card; Cancel. |
| /organizer/events/[id]/announcements | Announcement History list (desktop) | EV/announcements/page.tsx:178-340 | PARTIAL | OR05 | Board has phone history only. Missing: CardDescription "View previously sent emails and saved drafts."; the status badges Sent, Sending..., Queued, Failed, Partial Delivery, Draft and "Scheduled · {date}"; the specific-people line "To: N specific user(s)"; the eye icon button (title "View details"); the trash icon on drafts; the "N sent, N failed" line under sentAt. |
| /organizer/events/[id]/announcements | History empty state | EV/announcements/page.tsx:222-226 | MISSING | — | Mail icon + "No announcements sent yet." |
| /organizer/events/[id]/announcements | Composer card | src/components/features/organizer/AnnouncementComposer.tsx:241-533 | PARTIAL | OR05 | Missing: the **"Send Now"** footer button, in normal, disabled and Pro-locked fallback states; the email preview pane (iframe titled "Email preview"; the toggle reads "Preview email" / "Edit"); the error "Pick a date & time in the future."; "No committees configured for this event."; the specific-user results list, "No matching users found" and selected-user chips with ×; the "(specific users)" tag next to Estimated Recipients; the page-level "Sending emails…" line (announcements/page.tsx:208-210). |
| /organizer/events/[id]/announcements | Pro gate on sends over 50 recipients | AnnouncementComposer.tsx:505-519, src/components/ProGate.tsx:24-46 | COVERED | OR05 | — |
| /organizer/events/[id]/announcements | Announcement detail sheet | EV/announcements/page.tsx:344-513 | PARTIAL | OR05 | Missing: the "Recipients (N)" heading; the role-colored badges on recipient rows; the empty texts "No matching recipients found" / "The recipient list wasn't recorded for this announcement."; the "Message" section with the rendered body or "No content"; the draft variant (description "Draft", no recipients list); "Target: N specifically selected user(s)". |
| /organizer/events/[id]/rules | Rules page in edit mode | EV/rules/page.tsx:16-27; src/components/features/shared/RulesGuideEditor.tsx:67-126; src/components/features/shared/MarkdownDocEditor.tsx:85-141 | PARTIAL | OR05 | Board draws the editor card only. Missing: the page H1 "Rules & Regulations" and its lede; the first-time button "Publish Rules" (vs "Update Rules"); the Upload .md and Import PDF tab panes; the errors "Rules & Regulations guide is empty." and "Save failed: …"; the file errors (see below). |
| /organizer/events/[id]/rules | Rules "Published" read state | RulesGuideEditor.tsx:80-98 | MISSING | — | Read state after saving: "Published" with a check icon, "Rules & Regulations guide · updated {x ago}", and an "Edit" button in the header. Loading state: "Loading rules & regulations…". |
| /organizer/events/[id]/modules | Module tabs + Accommodation tab | EV/modules/page.tsx:350-610 | COVERED | OR06 | — |
| /organizer/events/[id]/modules | "Add Accommodation Block" dialog | EV/modules/page.tsx:528-550 | COVERED | OR06 | Template is labelled "Suite" in code (board: "Executive Suite"). The submit button reads "Add". |
| /organizer/events/[id]/modules | Accommodation Pending Requests | EV/modules/page.tsx:585-608 | COVERED | OR06 | Approve is disabled when the block is full. |
| /organizer/events/[id]/modules | No modules enabled | EV/modules/page.tsx:325-343 | COVERED | OR06 | Header subtitle in this state: "Enable modules in Event Settings to manage them here." |
| /organizer/events/[id]/modules | Food tab (slot list) | EV/modules/page.tsx:371-454 | PARTIAL | OR06 | Board draws one row in "Other modules". Missing: the "Food Slots" card header with an "Add Slot" button; per-row trash; and the **new audience line** under each slot (e.g. "Delegates, Observers, Faculty & team leads", "Everyone", "· 2 each"). |
| /organizer/events/[id]/modules | **"Add Food Slot" dialog (QR audience + uses)** | EV/modules/page.tsx:380-417 | MISSING | — | Added 2026-11-01 (P2): the "Who gets it" group toggles and "Uses per person". Strings below. |
| /organizer/events/[id]/modules | Transport tab (route list) | EV/modules/page.tsx:456-520 | PARTIAL | OR06 | Board draws one row. Missing: the "Add Route" button, per-route trash, and the capacity progress bar. |
| /organizer/events/[id]/modules | "Add Transport Route" dialog | EV/modules/page.tsx:460-490 | MISSING | — | Strings below. |
| /organizer/events/[id]/modules | Dress Code tab + Set/Edit dialog | EV/modules/page.tsx:678-756 | PARTIAL | OR06 | Board has a one-line prose summary of the dialog. Missing: the drawn dialog (title "Set Dress Code" / "Edit Dress Code", template grid, "Guidance" textarea + AI assist, "Image URLs (one per line)"); the populated view (guidance text card plus a grid of attire images); the header button switching between "Set Dress Code" and "Edit". |
| /organizer/events/[id]/modules | Per-module empty state | EV/modules/page.tsx:135-141 | MISSING | — | "No food slots yet. Add one above." / "No transport routes yet. Add one above." / "No accommodation blocks yet. Add one above." / "No dress code yet. Add one above." |
| /organizer/events/[id]/complaints | Complaint escalations | EV/complaints/page.tsx:98-210 | PARTIAL | OR06 | Board has a phone frame with an active item. Missing: the desktop card header "Escalated Complaints" with a red count badge; the status badge (open / escalated / under_review / resolved / rejected); the "Escalate to Admin" label used when assignedRole = mainOrganizer (vs "Escalate to Main Org"); the **Resolved tab** view (no textarea, green "Resolution: {text}" banner); the empty texts "No active complaints found." / "No resolved complaints found."; the AI assist under the textarea; the "Organizer Hub" eyebrow badge. |
| /organizer/events/[id]/tools | Tools hub | EV/tools/page.tsx:46-82 | COVERED | OR06 | See Questions: no nav link points here. |
| /organizer/events/[id]/tools/id-cards | ID Cards settings | EV/tools/id-cards/page.tsx:120-180 | PARTIAL | OR06 | Missing the **new QR checkbox** "Print each person's QR pass on their card", in Pro and Free (disabled, 60% opacity) variants (strings below). Also missing: the template options Modern/Classic/Bold; the "Print for" options; the busy label "Building PDF…"; the error line; the skeleton while counts load. |
| (PDF download) | ID card PDF faces (with QR) | src/lib/pdf/IdCardsDocument.tsx:57-86 | MISSING | — | No board shows the printed card. Three faces: Modern (accent band), Classic (underline band, centered, serif name), Bold (full accent card). Each has the event title in caps, an initials avatar, name, role ("Delegate of {Country}"), committee and the footer "OFFICIAL CREDENTIAL". With QR: a 64pt white tile on the right; on Classic it is absolutely positioned bottom-right. Ten cards per A4 page. |
| /organizer/events/[id]/tools/certificates | Certificate templates | EV/tools/certificates/page.tsx:52-123 | COVERED | OR06 | Minor: lede "Select the base template for delegate certificates. Awards (Best Delegate, etc.) will be dynamically rendered."; Award Types description "These awards will be available for Chairs to assign during marking."; busy text "Saving…". |
| /organizer/events/[id]/tools/theme | Event Theme | EV/tools/theme/page.tsx:71-168 | PARTIAL | OR06 | Board draws the lock as an inline "Custom Color — a Pro event feature Upgrade". The code renders the full ProGate card ("Unlock Custom Event Themes" / "This comes with a Pro event. Upgrade this event, or ask for it, under Plan." / "Upgrade to Pro") above a greyed color swatch. The **unlocked** state (color input + hex in mono caps) is not drawn. Also missing: the lede "Customize the color scheme of your public event page and delegate dashboard." and "Saving…". |
| /organizer/events/[id]/tools/results | Result Approvals | EV/tools/results/page.tsx:97-214 | PARTIAL | OR06 | Missing: the "Revise" prompt "Revision notes for the chair:" (a native `window.prompt`, see Questions); the empty texts "No results submitted yet.", "No chair has published a committee board yet." and the leaderboard empty hint "Nothing published yet — chairs publish standings from their Awards & Results tab."; the disabled "Approve All Pending (0)" state. |
| /organizer/events/[id]/financials | Event Financials (owner) | EV/financials/page.tsx:139-313 | COVERED | OR07 | — |
| /organizer/events/[id]/financials | Roles, Tickets & Schedule section | src/components/features/organizer/RolesTiersSection.tsx | COVERED | OR07 | — |
| /organizer/events/[id]/financials, /organizer/financials | Role tier card (TierStatusCard) | src/components/features/organizer/TierStatusCard.tsx:14-49 | PARTIAL | OR07 | Board draws the tier grid without capacity. Missing: sold-out variant (amber card + "SOLD OUT" corner ribbon, when sold ≥ capacity); "Tickets Sold" as "{sold} / {capacity}" with a progress bar when a cap is set; the "Revenue" footer row is on every card in code (board shows it on Delegate only). |
| /organizer/events/[id]/financials | Developer Payment Mode card | EV/financials/page.tsx:151-180 | COVERED | OR07 | — |
| /organizer/events/[id]/financials | Co-organizer "Roles & Schedule" variant | EV/financials/page.tsx:105-119 | COVERED | OR07 | — |
| /organizer/events/[id]/financials | Empty states | EV/financials/page.tsx:237-242, 264-268 | MISSING | — | "No accepted roles configured. Set them under Allocation → Roles & Tiers." · "No payments yet." |
| /organizer/events/[id]/plan | Plan page (This event card + Upgrade) | EV/plan/page.tsx:103-182 | PARTIAL | OR07 | The feature list has **six** rows, not five. Missing row: "QR coupons, check-in and transport scans" (`src/lib/data/eventPlan.ts:73`). Also missing: the title badge variants "Pro", "Pro (early event)" and "Pro (approved)" (eventPlan.ts:117); the Pro/custom state, where every row is checked and the Upgrade card is hidden; the non-owner (co-organizer) view, which also has no Upgrade card; "Ask for more room" is hidden on custom tier; the payment-start error "Couldn't start the payment." |
| /organizer/events/[id]/plan | "Request Pro" form | EV/plan/page.tsx:153-177 | MISSING | — | Board draws only the more-room form. Strings below. |
| /organizer/events/[id]/plan | "Ask for more room" form | EV/plan/page.tsx:160-177 | COVERED | OR07 | — |
| /organizer/events/[id]/plan | Notices + under-review card | EV/plan/page.tsx:56-58, 109, 127-137 | PARTIAL | OR07 | Board draws "This event is Pro. Everything is unlocked." and "Pro request under review". Missing: "The payment didn't go through. Nothing was charged.", "Still confirming the payment. Refresh in a minute." and the variant title "Request for more room under review". |
| /organizer/events/[id]/plan | Past requests | EV/plan/page.tsx:184-196 | COVERED | OR07 | Missing the "Declined" badge and the "More room" label variants (minor). |
| /organizer/financials | Financials & Ticketing (account), desktop | src/app/dashboard/organizer/financials/page.tsx:164-410 | PARTIAL | OR07 | Board has a phone frame of the Wallet tab only. Missing: the header lede "Track revenue, tickets, and payouts per event."; the event Select (placeholder "Select event"); the empty state "Select an event above."; the summary cards; the tabs, which code labels "Overview & Tiers / Payments / Wallet & Payouts" (board: "Overview Payments Wallet"); the Overview and Payments tab contents (same as the event page, plus "No accepted roles configured for this event. Set them under the event's Allocation → Roles & Tiers."); "Balance across all your events."; "Your payout requests and their status."; the empty state "No payouts yet."; the longer wallet explainer (:340-344). |
| /organizer/financials | Wallet tab | financials/page.tsx:345-410 | COVERED | OR07 | — |
| /organizer/financials | Request Payout dialog | financials/page.tsx:420-449 | COVERED | OR07 | Minor: "Enter an amount greater than 0.", "Could not submit payout request.", busy text "Submitting…". |
| /organizer/pro | MUN Pilot Pro landing | src/app/dashboard/organizer/pro/page.tsx:46-89 | COVERED | OR07 | Minor: "Your events" description "Open one to upgrade it or ask for more room."; "Loading…"; empty "You don't own an event yet."; row badge uses planLabel. |
| /organizer/events/[id]/coupons | **Coupons page (Pro)** | EV/coupons/page.tsx:51-96 | MISSING | — | NEW 2026-11-01 (P3) |
| /organizer/events/[id]/coupons | Coupons, Free plan locked | EV/coupons/page.tsx:58, 66 | MISSING | — | The ProGate card "Unlock Custom coupons" replaces the list. The Scan and New coupon buttons are hidden. |
| /organizer/events/[id]/coupons | Coupons empty / loading | EV/coupons/page.tsx:50, 69-70 | MISSING | — | — |
| /organizer/events/[id]/coupons | New / Edit coupon dialog | EV/coupons/page.tsx:127-176 | MISSING | — | — |
| /organizer/events/[id]/coupons | Delete coupon confirm | EV/coupons/page.tsx:45-48 | MISSING | — | A native `confirm()` today (see Questions). |
| /organizer/events/[id]/passes | **Pass report (Pro)** | EV/passes/page.tsx:69-159 | MISSING | — | NEW 2026-11-01 (P5) |
| /organizer/events/[id]/passes | Pass report, Free variant | EV/passes/page.tsx:41, 79, 82-84, 101 | MISSING | — | Shows meal counts only. Rows are not clickable, there is no CSV button, and a crown notice appears. |
| /organizer/events/[id]/passes | Pass report detail panel (who claimed) | EV/passes/page.tsx:117-157 | MISSING | — | — |
| /organizer/events/[id]/passes | Pass report empty / loading / error | EV/passes/page.tsx:85, 89-90 | MISSING | — | — |
| /dashboard/scan/[eventId] | **Scanner: "What are you handing out?" picker** (Redeem / Check only) | src/app/dashboard/scan/[eventId]/page.tsx:164-197 | MISSING | — | NEW 2026-11-01 (P2/P4) |
| /dashboard/scan/[eventId] | Scanner: camera panel states | scan/[eventId]/page.tsx:199-215 | MISSING | — | — |
| /dashboard/scan/[eventId] | Scanner: result cards (9 outcomes) | scan/[eventId]/page.tsx:241-271 | MISSING | — | — |
| /dashboard/scan/[eventId] | Scanner: Check only lookup card | scan/[eventId]/page.tsx:273-291 | MISSING | — | — |
| /dashboard/scan/[eventId] | Scanner: Find by name (organizer only) | scan/[eventId]/page.tsx:293-325 | MISSING | — | — |
| /dashboard/scan/[eventId] | Scanner: "Claimed so far" card | scan/[eventId]/page.tsx:327-352 | MISSING | — | — |
| /dashboard/scan/[eventId] | Scanner: no permission | scan/[eventId]/page.tsx:161-162 | MISSING | — | — |
| /dashboard/scan/[eventId] | Scanner: nothing to hand out | scan/[eventId]/page.tsx:183-184 | MISSING | — | — |

## 7. App Admin

Counts: covered 12 · partial 28 · missing 7

| Route | UI element | Source file:line | Status | Board | What's missing |
|---|---|---|---|---|---|
| /dashboard/admin/* | Admin sidebar variant ("System Admin / Platform control" card + 12 nav items). The phone drawer shows the same content (Header Sheet → SidebarContent) | src/components/dashboard/Sidebar.tsx:45, :325, :668 | COVERED | AD01 | — (phone drawer admin variant not drawn, but D01 drawer pattern + AD01 item list cover it) |
| /dashboard/admin/* | Profile menu, App Admin variant ("Admin Dashboard", "System Settings" instead of Settings/Support) | src/components/dashboard/ProfileMenu.tsx:40-44 | MISSING | — | D01 draws only the member variant (Settings / Support / Sign out) |
| /dashboard/admin | Overview: badge, 4 stat cards, Recent Activity, Needs Attention | src/app/dashboard/admin/page.tsx:87 | COVERED | AD01 | Loading skeleton (title bar + 4 tiles + big block) not drawn (minor) |
| /dashboard/admin/users | Users list (filter, find by email, table, Load more) | src/app/dashboard/admin/users/page.tsx:82 | PARTIAL | AD01 (phone only) | Card title "All Users"; desktop table columns User / Email / Role / Actions; "Load more" button; "Loading…" count text; Find busy label "…"; alert "No member with that email." |
| /dashboard/admin/users | Change Role dialog | src/app/dashboard/admin/users/page.tsx:163 | PARTIAL | AD01 | Server error line (e.g. "You can't remove your own App Admin role.", "This is the last App Admin. Make someone else an App Admin first.", fallback "Couldn't change the role."); busy spinner on Save |
| /dashboard/admin/users/[uid] | Member detail (plan settings, account, events, payouts) | src/app/dashboard/admin/users/[uid]/page.tsx:264 | PARTIAL | AD01 (phone) | Account card description is a placeholder (real copy below); verified tick icon next to name; "Disabled" badge; "Enable account" variant; status messages "Saved." / "Account disabled." / "Account enabled."; "Saving…" busy label; empty "None." for events and payouts; load-error state |
| /dashboard/admin/users/[uid] | Disable account prompt (native prompt) | src/app/dashboard/admin/users/[uid]/page.tsx:250 | COVERED | AD01 | — |
| /dashboard/admin/users/[uid] | Delete account prompt (native prompt, a reason is required) | src/app/dashboard/admin/users/[uid]/page.tsx:248-252 | MISSING | — | Not drawn: "Delete {name}'s account for good? Type a reason to confirm." |
| /dashboard/admin/events | Events table + row menu (Publish/Move to Draft, Plan & limits…, Test allocation, Delete) | src/app/dashboard/admin/events/page.tsx:87, :137 | COVERED | AD01 | Draft rows show "Publish" in the menu (minor); plan pill can also read "Pro (approved)" |
| /dashboard/admin/events | Delete Event dialog | src/app/dashboard/admin/events/page.tsx:175 | COVERED | AD01 | Error alert "Couldn't delete the event." (minor) |
| /dashboard/admin/events, /plans | Plan editor dialog (direct override) | src/components/features/admin/PlanEditorDialog.tsx:137 | PARTIAL | AD01 | **6th feature toggle missing: "QR coupons, check-in and transport scans" (QR passes, eventPlan.ts:73)**; Pro tier state (limit + feature blocks hidden); placeholders "Free default" / "Unlimited"; loading spinner; error line; busy "Saving…". Board draws a "Cancel" button the code does not have (footer has only "Save plan") |
| /dashboard/admin/applications | Plan editor, **upgrade-request variant** (Review) | src/components/features/admin/PlanEditorDialog.tsx:141-151, :198-212 | MISSING | — | Not drawn: title "Pro request" / "More room request", request summary box, "Note to the organizer (optional)", "Decline" / "Approve with this plan". Pro requests open on Custom with everything on |
| /dashboard/admin/events/[id]/test-allocate | Test allocation **page** (DevAllocatePanel) | src/app/dashboard/admin/events/[id]/test-allocate/page.tsx:212; src/components/features/organizer/DevAllocatePanel.tsx:231 | PARTIAL | AD03 | Board draws it as a dialog; it is a full page with "← Events" back link. Missing: verbatim description; per-row status + role badges; "no account yet" badge; Committee / Country placeholders (Country disabled until Committee is set); "No delegates found."; loading skeleton rows; busy spinner on Allocate |
| /dashboard/admin/applications | Page header + Organizer Applications table | src/app/dashboard/admin/applications/page.tsx:82-128 | PARTIAL | AD02 | Page h1 "Applications" + lede not drawn; loading skeleton |
| /dashboard/admin/applications | Upgrade requests table | src/app/dashboard/admin/applications/page.tsx:130 | PARTIAL | AD02 | Card description; "Asks for" shows the actual numbers wanted (e.g. "200 participants, 5 committees"), falling back to "More room" only when there are none; sub-line is "{organizer} · {orgName}" (board adds a date the code doesn't show) |
| /dashboard/admin/applications | Recent decisions | src/app/dashboard/admin/applications/page.tsx:174 | PARTIAL | AD02 | Description; real row formats (below); the board shows dates the code doesn't render; organizer rows show "Approved"/"Rejected", not "Declined" |
| /dashboard/admin/plans | Plans & revenue: totals, tier filter, events table | src/app/dashboard/admin/plans/page.tsx:83 | COVERED | AD02 | Search placeholder is "Search title" (board "Search events"); status under title; fee % under Fee; empty "No events."; error line (minor) |
| /dashboard/admin/plans | Event Payments dialog (record refunds) | src/app/dashboard/admin/plans/page.tsx:163 | PARTIAL | AD02 | Title is "Payments" + description (below); placeholder text; "· developer mode" / role on the meta line; refund note line under a refunded row; "No paid registrations."; loading |
| /dashboard/admin/payments | Payment Mode card | src/app/dashboard/admin/payments/page.tsx:187 | PARTIAL | AD02 | Card description (env-var explainer); ZiniPay fields appear ONLY when ZiniPay is selected (board shows them with Stripe selected); field hints; **Developer-mode warning callout**; "Checking gateways…" loading; fallback banner body text (board draws headline only) |
| /dashboard/admin/payments | Stripe / ZiniPay credential cards | src/app/dashboard/admin/payments/page.tsx:293 | PARTIAL | AD02 | Card descriptions; "Key mode: {mode}." / "Set the missing environment variables, then redeploy."; "Publishable key: …"; ZiniPay not-ready headline is "API key missing" (board "Not fully configured"); chip "API Key (ZINIPAY_API_KEY)"; sandbox note text; NEXT_PUBLIC_APP_URL note |
| /dashboard/admin/payments | Organizer Payout Requests | src/app/dashboard/admin/payments/page.tsx:360 | PARTIAL | AD02 | Description; processed rows (Paid / Rejected badge + "Ref {ref} · {note}"); error line; busy spinner on Mark Paid |
| /dashboard/admin/complaints | Level 3 queue, Active tab | src/app/dashboard/admin/complaints/page.tsx:100 | PARTIAL | AD02 (phone) | Subtitle; inner card title "Admin Escalation Queue" + count; "Description:" label; Active/Resolved counts on tabs; full-page loading |
| /dashboard/admin/complaints | "All complaints" scope variant | src/app/dashboard/admin/complaints/page.tsx:104-108, :145 | PARTIAL | AD02 | Board draws the toggle only; variant title/subtitle and "Level N" badge per card not drawn |
| /dashboard/admin/complaints | Resolved tab + empty state | src/app/dashboard/admin/complaints/page.tsx:133-137, :195, :223 | PARTIAL | AD02 | Resolved card (no action area, green "Final Resolution:" box) is drawn only as a loose box; empty state "No {tab} level-3 complaints found." not drawn |
| /dashboard/admin/complaints | Full Escalation Trail dialog | src/app/dashboard/admin/complaints/page.tsx:168 | PARTIAL | AD02 | Board invents "Level N · handler / Waiting" rows. The code shows, per history entry: actorRole (bold), action chip, message, timestamp |
| /dashboard/admin/complaints | Reassign to member email | src/app/dashboard/admin/complaints/page.tsx:208 | COVERED | AD02 | Alert "No member with that email." (minor) |
| /dashboard/admin/audit-logs | Audit Logs page (live switch, export, table, expand before/after, Load More) | src/app/dashboard/admin/audit-logs/page.tsx:105 | COVERED | AD03 | The expand control is an icon-only chevron (no "Show/Hide" text); Actor = email + role line; Target = TYPE caps line + name (minor) |
| /dashboard/admin/audit-logs | Action filter select options | src/app/dashboard/admin/audit-logs/page.tsx:127-154 | PARTIAL | AD03 | Only the trigger is drawn; the 24 options aren't drawn (list below) |
| /dashboard/admin/live-sessions | Live Sessions list (Observe / Force stop / Reset) | src/app/dashboard/admin/live-sessions/page.tsx:170 | COVERED | AD03 | Note is a placeholder; real: "Observing is silent — participants see no indicator. Each join is written to the audit log."; disabled Observe variant (minor) |
| /dashboard/admin/live-sessions | Error / quota banner | src/app/dashboard/admin/live-sessions/page.tsx:185 | PARTIAL | AD03 | Board has "[Quota error message]"; exact strings below |
| /dashboard/admin/live-sessions | Force-stop confirm (native) | src/app/dashboard/admin/live-sessions/page.tsx:112 | MISSING | — | See below |
| /dashboard/admin/live-sessions | Reset confirm (native) | src/app/dashboard/admin/live-sessions/page.tsx:140 | MISSING | — | See below |
| /dashboard/admin/live-sessions | Empty state | src/app/dashboard/admin/live-sessions/page.tsx:199 | COVERED | AD03 | Sub-line "Live committee sessions show up here as chairs start them." (minor) |
| /dashboard/admin/tools | Send a notification (broadcast) | src/app/dashboard/admin/tools/page.tsx:81 | PARTIAL | AD03 | Event ID placeholder is "From Admin → Events"; board invents 0/120 and 0/600 counters (code only caps length, no counter); Send disabled rules; busy spinner; server error strings |
| /dashboard/admin/tools | Broadcast confirm (native) | src/app/dashboard/admin/tools/page.tsx:41-42 | MISSING | — | See below |
| /dashboard/admin/tools | Export CSV | src/app/dashboard/admin/tools/page.tsx:109 | COVERED | AD03 | Busy spinner on the clicked button + others disabled; alert "Export failed." (minor) |
| /dashboard/admin/tools | Android app card | src/app/dashboard/admin/tools/page.tsx:123 | PARTIAL | AD03 | Description; "Loading…" state; notes are a bullet list |
| /dashboard/admin/tools | Scheduled jobs | src/app/dashboard/admin/tools/page.tsx:138 | PARTIAL | AD03 | The code shows the full path + a sentence for each job, not name + pill (below) |
| /dashboard/admin/moderation | Moderation list (4 tabs, uid filter, rows) | src/app/dashboard/admin/moderation/page.tsx:71 | PARTIAL | AD03 (phone) | **Ratings row is wrong** (code: "{from} gave {n}★ to {to} · date", Delete only, no Hide); recommendations row (Hide + Delete) and endorsements row not drawn; article badges Hidden / Published / Draft; non-article placeholder "Member uid (optional)"; "This member's, newest first."; error line; loading |
| /dashboard/admin/moderation | Comments dialog | src/app/dashboard/admin/moderation/page.tsx:119 | MISSING | — | See below |
| /dashboard/admin/moderation | Confirms (native) | src/app/dashboard/admin/moderation/page.tsx:55-56 | PARTIAL | AD03 | Only "Unpublish this article?" drawn; Delete/Hide variants not drawn |
| /dashboard/admin/settings | Header + Saved/Saving indicator + 3 tabs | src/app/dashboard/admin/settings/page.tsx:86-103 | COVERED | AD03 | "Saving..." indicator (minor) |
| /dashboard/admin/settings | General tab | src/app/dashboard/admin/settings/page.tsx:105 | PARTIAL | AD03 (phone) | Card title/description; hint is a placeholder; real placeholder "support@example.com" |
| /dashboard/admin/settings | Pricing tab | src/app/dashboard/admin/settings/page.tsx:126 | PARTIAL | AD03 | Card description; fee note under slider; per-field hints (5) |
| /dashboard/admin/settings | Maintenance tab: Maintenance Mode card | src/app/dashboard/admin/settings/page.tsx:174 | PARTIAL | AD03 (phone) | Red title + description; switch row label + helper; "Maintenance Message" label; Save turns destructive (red) when mode is on |
| /dashboard/admin/settings | Repair marking records card | src/app/dashboard/admin/settings/page.tsx:244 | PARTIAL | AD03 | Description; busy "Repairing…"; done text "… repaired. Done."; error "Repair failed ({status})" |
| /dashboard/admin/settings | Build event membership card | src/app/dashboard/admin/settings/page.tsx:300 | PARTIAL | AD03 | Description; busy "Building…"; done ". Done."; error "Backfill failed ({status})" |

---

# Boards to add

Grouped by section. Strings in quotes are verbatim from the code. Covers every MISSING row and the substantial PARTIAL gaps.

## 1. Public & Auth

#### Maintenance lockout screen
- Route: any `/dashboard/*` while `systemSettings/global.maintenanceMode === true` (src/app/dashboard/layout.tsx:112-120). Public pages stay reachable.
- Who: every signed-in user except the App Admin. The App Admin sees the normal app with no banner.
- Layout today: full viewport, centered, max-width ~md, no sidebar or header.
- Title: "We'll be right back"
- Body: the admin's `maintenanceMessage`. Fallback when empty: "MUN Pilot is under maintenance. Please check back soon." Default stored message: "System is under maintenance. Please check back later." (src/lib/services/systemSettingsService.ts:37)
- No buttons, no sign-out, no status link. The designer may want a "Sign out" or status link; it doesn't exist yet.
- Optional: an "App Admin: maintenance is ON" banner (not in code; Questions).

#### 404 / page not found (global)
- Route: any unmatched URL. Today it's Next's built-in default ("404 | This page could not be found."). There's no `src/app/not-found.tsx` and no `error.tsx`.
- Who: anyone.
- To draw: a site-level not-found in the paper look, matching the entity not-found pattern already used (eyebrow "Not found", serif H1, one line, one button). Code has no strings, so copy is open.

#### Home hero, every slide kind (P01 addition)
- Route `/`, everyone. Not auto-advancing. Controls: dot rail (`aria-label="Slide N"`) plus numbered pager buttons "1", "2", "3", "4" (`aria-label="Go to slide N"`). Left/Right arrow keys switch slides. No prev/next arrow buttons in code.
- Slide order: event #1 (featured), first article, event #2, organiser slide.
- Upcoming event slide: eyebrow "Featured conference" (1st) or "Registration open" (2nd); title = event title; copy = description trimmed to 150 chars + "…", or a facts line "N committees · <place> · <Friday, 12 September 2026>"; buttons "Register now" plus, on the featured slide only, "See committees" (outlined on slab).
- Past event slide: eyebrow "Recently concluded"; single button "View conference".
- Article slide: eyebrow "From the handbook"; title = article title; copy = excerpt or content trimmed; button "Read the guide".
- Organiser slide (always present): eyebrow "For organisers"; title "Run your conference without the spreadsheets"; copy "Applications, allocations, payments, marking and certificates in one dashboard — plus a live committee floor your chairs actually want to use."; button "Start hosting".
- No-cover state: striped photo fallback.

#### Home section states
- Conferences section, no upcoming events: H2 "Recent conferences", sub "The last conferences to run on MUN PRO.", link "All conferences" (grid shows past events).
- Conferences loading: 3 EventCard skeletons (placard block + 3 bars).
- Conferences empty: "No conferences are open right now. Organisers — this is your slot."
- Handbook loading: 2 split ArticleCard skeletons (2 title bars + avatar circle + byline bar).
- Handbook empty: "The handbook is still being written. Check back soon."

#### Conference detail: loading, theme colour, variants
- Loading (`/events/[id]`, everyone): full-width hero block (~320px), then main column with two blocks (~170px, ~240px) beside a rail block (~300px).
- Organiser theme colour (set in organiser Tools › Theme): the hero background takes the colour (visible when there's no cover photo), the format pill is filled with it, and the rail "Apply now" button uses it with contrasting ink. Draw one themed example (e.g. a non-green brand colour).
- Registration tier, late phase: pill "Late price" (signal), struck regular price "$15", current "$18", "/ member" for the team role.
- Regular phase with late window ahead: note "Price rises to $X on <Mon D, h:mm AM>" (already drawn).
- Committee dialog, desktop centered (max ~620px): eyebrow "Committee", serif title, pills [difficulty…] "N positions" "N spots" + "Full" (signal, with pip) or "Open" (seal, with pip). Sections "Agendas" (numbered) or "Topic / agenda" (single), "Description", "Countries / positions" (flag grid). Empty: "Positions to be announced."
- Rail, signed out + early bird: pills "Accepting applications" + "Early bird"; note "Sign in to submit an application."; button "Log in — early bird".
- Rail, signed out + closed: pill "Applications closed"; note "Sign in to submit an application."; disabled button "Applications closed".

#### Join the staff: busy and error
- Route `/events/[id]` rail, shown only when the organiser enabled public staff applications. Who: signed-in users who aren't the organiser and aren't already accepted staff.
- Role radio options: "Chair", "Vice Chair", "Director" (selected one shows "Selected").
- Busy: apply button "Sending…"; withdraw button "Withdrawing…" (both disabled).
- Errors (red line under the panel): "Your account needs an email address to apply.", "Couldn't send your application. Please try again.", "Couldn't withdraw. Please try again."

#### Apply wizard: loading, errors and variants
- Loading (`/events/[id]/apply`, signed in): heading bar (~2/3 width) above a ~500px rounded card skeleton. Signed-out visitors are redirected to `/login?redirect=/events/<id>/apply` (no UI).
- Step 1 extra states: amber badge "Late price" under the price on a role card. Empty line when there are no roles: "No application roles are open for this event yet." Closed role pill text is "Closed <Mon D, h:mm AM>" or "Closed".
- Step 2 single-committee variant: one block with no number badge; label "Committee *"; helper "Pick a committee, then rank up to 3 countries within it. The same country can't be chosen twice."; country selects "1st choice *" (placeholder "Select a country"), "2nd choice", "3rd choice" (placeholder "Optional"). Disabled select item "No committees available". When a committee has no country list, the only option is "Any Available Country".
- Step 3, Faculty Advisor variant:
  - Label "Supervisor Experience *"; helper "Briefly list your experience accompanying or supervising student groups."; placeholder "e.g., Supervised Harvard MUN delegations in 2022 and 2023..."
  - Label "Motivation for Participating *"; helper "Why is your institution participating in this conference?"; placeholder "I am deeply interested in global health policies..."
  - Delegate placeholders: experience "e.g., Harvard MUN 2024 (Delegate of France, WHO) - Honorable Mention...", motivation "I am deeply interested in global health policies..."
- Faculty field placeholders: Institution "e.g., Harvard University"; Faculty Position "e.g., History Teacher, Professor of Law"; Years Teaching MUN "e.g., 5 years"; Students Accompanying = number input (min 1). Team: Institution "e.g., Harvard University", Team Name "e.g., Harvard A", Team Size number 3–15, CSV file input accept ".csv".
- Step 4, Faculty: "Applying As" + Experience + Motivation only (no "Your Preferences").
- AI assist under each textarea (code): chip "AI" → inline panel with buttons "Improve", "Fix grammar", "Suggest"; suggestion block "Suggestion" + "Use this" / "Try another"; "Undo" chip after a rewrite; tooltip "Write something first" when empty; error "Could not reach the AI."
- Submit errors (today `window.alert`, needs a designed inline error):
  - "Applications are closed. Please refresh and check the application window."
  - "Could not start payment. You can pay later from the Payments page." (or the server's error text)
  - "Could not reach payment service. You can pay later from the Payments page."
  - "You have already applied to this event. You can't apply twice."
  - "Failed to submit application. Please try again."
  - Note: after a payment-start failure the application is saved as unpaid, and the success card still shows.

#### Terms of Service: desktop + closing CTA
- Route `/terms`, everyone. Same layout as Privacy minus the three principle cards.
- Hero: eyebrow "Legal · Terms of Service"; H1 "Terms of Service"; lede "The rules of engagement for delegates, chairs, and organizers using MUN Platform. Read carefully — using the Service means you agree." (code brand; board says MUN Pilot); "Last updated: May 24, 2026" (already on the phone board).
- Sticky TOC + sections: 01 Acceptance of Terms, 02 Accounts & Eligibility, 03 Acceptable Use, 04 User Content, 05 Payments & Refunds, 06 Intellectual Property, 07 Disclaimers & Liability, 08 Termination, 09 Changes to Terms, 10 Contact. Contact section text: "Questions about these Terms? Reach our legal team at legal@munplatform.app or via the Contact page."
- Closing CTA: "Questions remain?" / "Our legal team is happy to clarify anything in plain language." / button "Contact Us".

#### Committee doc reader: status/type variants + loading
- Route `/docs/[eventId]/[docId]` (popup from the consoles; also a plain URL). Who: signed-in participants allowed by rules.
- Status badges: "Collecting endorsements" (violet, drawn), "Submitted" (amber), "Approved" (green), "Rejected" (red).
- Type badge: "Working Paper", "Draft Resolution", "Amendment".
- Submitter line, no country: name only (no flag), then calendar + "MMMM d, yyyy".
- Chair's note box: "Chair's note: <text>" (amber), typically on Rejected.
- Loading: title bar (3/4), meta bar (1/3), 5 body lines. Shown during the auth check and the doc fetch.
- Print hides the badge row.

#### Forgot password: desktop + remaining states
- Route `/forgot-password`, signed out.
- Desktop: form left, brand panel right. Panel copy: "Secure your account" / "Get back to managing your Model UN journey in just a few clicks." (code brand text "MUN Platform").
- Form: H1 "Reset your password"; lede "Enter the email associated with your account and we'll send you a reset link."; label "Email address", placeholder "m@example.com", type email, autofocus; button "Reset password" / busy "Sending link..." / cooldown "Resend in 0:SS"; link "Back to login".
- Success card: "Check your inbox" / "We sent a password reset link to <email>. The link expires in 1 hour."; ghost button "Resend in 0:SS" (60s), then "Resend email"; link "Back to login".
- Errors: "Please enter a valid email address.", "Too many attempts. Please try again in a few minutes.", "Something went wrong. Please try again." (drawn). Unknown emails show success on purpose.

#### Onboarding: corrections + states
- Route `/onboarding`, signed-in users without `onboardingComplete`. No site header or footer.
- Header: H1 "Welcome to MUN Platform" (board: MUN Pilot); sub "A few basics to get you started — everything else is optional."
- Fields: "First Name *" (placeholder "John"), "Last Name *" (placeholder "Doe"), "Email" (disabled, locked), "Date of Birth *" (date picker, placeholder "Select date", max = today; REQUIRED), "Mobile (Optional)" (placeholder "+1 234 567 8900").
- Photo: camera button (`aria-label="Upload profile picture"`); X remove button, only for a custom upload (`aria-label="Remove uploaded picture"`), which reverts to the Google photo; a spinner overlay on the avatar while uploading; initials fallback, or "?" when there are no names.
- Upload errors (small red text under "Add a photo or skip to use your Google account photo."): "Please select an image file.", "Image must be less than 5MB." (drawn), "Upload failed" / server error / "Failed to upload image."
- Footer row: note "Add nationality, socials, and more later from Profile Settings." + button "Complete Setup →" (disabled until first, last and DOB are filled) / "Saving…".
- Save failure (today `alert`): "Failed to save profile. Please try again."

## 2. General dashboard

#### Conferences › Browse tab — `/dashboard/conferences` (tab "Browse")
Who sees it: all signed-in users.
- Section head "Discover Events" + count pill. Sub "Find and apply to Model UN conferences around the world."
- EventBrowseCard (3-column grid):
  - 128px placard with the format stamp ({format} or "In-person") and the cover image or the title on navy.
  - Title.
  - Meta rows: date or "Date TBA"; location or "Location TBA"; "{n} Committees".
  - Footer button "View & Apply ›", or the disabled secondary "Already Applied".
- Empty: icon telescope, "No conferences available" / "Check back later for new events to apply to."
- Also add, on the My Conferences tab:
  - Active empty: "No active conferences" / "You haven't applied to any upcoming events yet." + button "Browse Conferences".
  - Card pills: "Payment Overdue" (red, AlertTriangle), "Waitlisted" (blue), "Waitlisted/Rejected" (red, full red tracker), "Active" (green), "Withdrawn" (grey).
  - Overdue fee block: "{tier} fee — registration is not confirmed until this is paid". Due label "Overdue" or "{n} days overdue". Note "The deadline has passed — pay now or contact the organizer before your seat is released." Red "Pay $X ›".
  - Upcoming due labels: "Due today" / "1 day left" / "{n} days left".
  - Paid-withdraw blocker (currently a native alert): "You've already paid for this event. Contact the organizer for a refund or cancellation."
- Deep link: `/dashboard/conferences?tab=browse` opens this tab directly (Network › "Browse events" uses it).

#### Payment cancelled banner — `/dashboard/conferences?payment=cancelled` (NEW 2026-11-02)
Who sees it: an applicant who pressed Cancel / Back on the Stripe or ZiniPay checkout.
- Placement: full-width strip between the page header and the My Conferences / Browse tabs.
- Look today: amber tint (amber border + light amber fill, amber text), XCircle icon on the left.
- Text: "Payment cancelled. Nothing was charged. You can try again whenever you're ready."
- Right: icon button ✕ (aria-label "Dismiss") closes it.
- Shows once: the `payment` param is removed from the address bar, so a refresh doesn't bring it back.
- Pair it with the existing green "Payment successful…" banner on `/dashboard/payments` so both read as one family.

#### Documents › Rules & Regs tab + other role variants — `/dashboard/documents`
- Rules & Regs (every role):
  - Card "Rules & Regulations" / "Published by the conference organizers."
  - File row: "Rules & Regulations", "Markdown · updated {ago}", buttons ".md" (download) and "Read"/"Hide" (expands the rendered markdown).
  - Empty: "Rules & Regulations" / "The conference rulebook." / "No rules published yet" / "The organizer will publish the rulebook here — check back later."
- Study Guide extras:
  - Empty: "Study Guide" / "Background reading for your committee." / "No study guide yet" / "Your chair will upload it here — check back later."
  - PDF variant: "PDF · uploaded {ago}", buttons "Save" and "Open".
- Committee Docs extras:
  - No committee: "You don't have a committee assigned yet — committee documents unlock once you're allocated."
  - Empty list: "Nothing submitted yet." Loading: "Loading…".
  - "Rejected" pill (red). The "View"/"Hide" toggle expands the rendered markdown inline. "Open" opens the popup reader.
  - Form errors: "Give the document a title.", "Document body is empty.", "Submit failed.", "Save failed.".
  - Roster warning (amber): "No countries are listed for this committee yet — you can still submit, and the chair can add sponsors on review."
  - Picker: search "Search countries…", empty "No countries match.", disabled-chip tooltip "Already on the other list".
  - Edit mode button "Update".
  - Title placeholder "e.g. Working Paper 1.1". Body placeholder "# Draft Resolution\n\nThe General Assembly,\n\n*Recalling* …\n\n1. **Calls upon** …".
- Endorsement inbox (exact labels):
  - Heading "Endorsement requests".
  - Card: flag, "{Country} wants you to **sponsor**" or "… to **sign**", “{doc title}”, timer m:ss (red when ≤15s).
  - Buttons "Accept" (busy spinner) and "Reject".
- Chair/EB tab bar: "Study Guide" | "Committee Docs" | "Position Papers" | "Rules & Regs".
  - Committee Docs header: "Committee Documents" + count badge. Sub "Working papers, draft resolutions & amendments submitted by your delegates."
  - Empty: "No submissions yet" / "Delegate documents will land here for review."
  - Row: "{type} · {author (country)} · {ago} · {n} sponsors · {n} signatories", buttons "Open" and "Review"/"Hide".
  - Expanded: "Sponsors: …", "Signatories: …", then the note textarea "Optional note to the delegate (shown with the decision)…" with the AI bar.
  - No committee: "No committee in scope — committee documents appear once you're assigned a committee."
- Observer / faculty (read-only): tabs "Study Guide" | "Committee Docs" (approved papers only, no review controls) | "Rules & Regs".
- Organizer / co-organizer: a single tab "Manage". Card "Manage this event's documents from the event dashboard" / "Study guides, certificates and committee tools live under Manage Events." Button "Open ›".
- Fallback: "No documents available."

#### Profile owner sections — `/dashboard/settings` › Profile
Who sees it: the owner (their own profile, edited inline).
- Honors & Awards card:
  - Edit/Add link. Rows: award icon + "{Best Delegate|Outstanding Delegate|Honorable Mention|Verbal Mention|Participant} — {committee}" / "MUN result · verified"; manual rows "{title}" / "{issuer} · {date}".
  - Empty: "Awards you win in events appear here automatically. Add others manually."
- Dialog "Honors & awards" / "Add awards earned outside this platform. Awards from events you competed in appear automatically."
  - Per entry "Award" + trash ("Remove award").
  - Fields: Title (placeholder "Best Delegate — UNSC"), Issuer ("BUP MUN"), Date ("Jan 2026").
  - Empty: "No manual awards yet." Button "+ Add award". Footer "Cancel" / "Save" (spinner). Error "Could not save. Try again."
- Dialog "Education" (wide):
  - Entries "Entry" + trash. Fields: School ("University name"), Degree ("BSc"), Field ("Civil Engineering"), Start year ("2019"), End year ("2023"), Activities ("MUN Society (President), Debate Club").
  - Empty: "No education yet. Add your first entry." Button "+ Add education". Footer "Cancel" / "Save".
  - Filled section rows: school, "{degree}, {field}", "{start} – {end}", "Activities: …".
- MUN experience dialog (complete it): description "Conferences chaired, society roles, delegations led."
  - Fields per "Entry": Role / title ("Head Delegate"), Organization ("IUBAT MUN Society"), Start ("Oct 2024"), End ("Present", disabled when current), Location ("Dhaka"), switch "I currently hold this role", Description textarea ("What you did in this role…") + AI bar, trash ("Remove entry").
  - Empty: "No experience yet. Add your first entry." Button "+ Add experience".
  - Filled section: org initials tile, role, org, "{start} – {end|Present} · {location}", description.
- Skills & Interests card (owner):
  - Edit link "Edit" / "Add" / "Close".
  - Edit mode: "Skills" TagInput ("Diplomacy, Public Speaking…"), "Interests" TagInput ("Foreign Policy, Crisis…"), "Cancel" / "Save".
  - Display: skill rows "Endorsed by {n}" / "No endorsements yet"; interest badges with a sparkle.
  - Empty: "Add skills so peers can endorse them."
- Recommendations (owner):
  - Amber box "Pending approval ({n})". Each card: author avatar, name link, "{relationship} · {headline}", body, buttons "Approve" (spinner) and "Hide".
  - Then tabs "Received ({n})" | "Given ({n})". Empty: "No recommendations yet." / "No recommendations given yet." Loading "Loading…".
- Recent Activity card (up to 6): calendar icon, "{action} **{target}**", "{ago}" or "recently".
- Contact & Social (owner):
  - Email (read-only, "—" if none).
  - Phone inline edit ("Add phone" / "Not shared").
  - Inline fields "Instagram" ("@handle"), "LinkedIn" ("in/username"), "TikTok" ("@handle"); empty "Not linked".
- Inline-edit states:
  - Hover pencil; empty "+ {placeholder}"; saved check.
  - Editing hint "Enter to save · Esc to cancel" or "Click away to save · Esc to cancel". Busy "Saving…". Error "Could not save. Try again.".
  - Bio uses a 5-row textarea + AI bar.
- MUN Stats subtitle when off: "Private to you".
- Security errors: "Password must be at least 6 characters.", "Current password is incorrect.", "New password is too weak.", "Failed to update password. Try again."; success "Saved!".

#### Messages states + New Message dialog — `/dashboard/messages` and the floating panel
- New Message dialog: title "New Message", search "Search users...", rows avatar + name + role, busy "Starting...".
- Floating panel new-chat view: header back arrow + "New Message" + close; search "Search users..."; rows name + role; busy "Connecting...".
- Conversation list: empty "No conversations yet. Start one!"; filtered "No matches.". Floating panel: "No conversations found."
- Chat:
  - Empty "No messages yet. Say hello!".
  - Presence "Online" (green) / "Active {n} ago" / "Offline" (panel: "Active now" / "Offline").
  - Group chats: no presence dot, the sender name above each incoming bubble.
  - Ticks: clock (sending) → check → blue double-check.
  - Placeholder "Type your message..." (page) / "Type message..." (panel).
- Phone: the open-chat screen with a back arrow to the list.
- Create Group busy states: "Loading users...", "Creating...".

#### Shell variants
- Notification bell:
  - Loading spinner; empty "No new notifications".
  - Error strip "Action failed. Check your access and try again."
  - Role-change invite: "Your role in **{event}** has been updated to **{role}**. Accept to apply the change." [Decline] [Accept].
  - Room alert pills "Info" (blue) / "Warning" (yellow) / "Urgent" (red).
- Toasts (bottom-right, 5s, click opens the live console):
  - Header "{Info|Warning|Urgent} — {event} ({committee})" with an icon or the delegate's country flag.
  - Messages: "{country} raised a {point label}", "{country} proposed: {motion}", "{country} — {request label}", "Voting opened — {motion}" / "Voting opened — cast your vote".
- Event sidebar Tools: add "Coupons", "Scan Passes", "Pass Report" (before Complaints).
- Delegate portal rail: add "My Pass" after Requests. Faculty variant: "Back to Home", section "Faculty Advisor", single item "Faculty Panel".
- Committee Hub rail: add "My Pass" and "Scan Passes" after Rules & Regs.
- Standard sidebar co-organizer-only label "Co-organizer" › "Manage Events".
- App Admin account menu: "My Account", "Admin Dashboard", "System Settings", "Sign out".
- Home organizer variants:
  - Outline button "Organizer Dashboard" (own organizer) or "Co-organizer Events" (co-org); the promo is hidden.
  - Recommended empty: "No new recommendations yet." + "Browse all conferences".

#### Network / profile states
- Network:
  - Discover empty: "No suggestions yet" / "Participate in more conferences to discover delegates you may know." + button "Browse events".
  - Blocked empty: "No blocked users" / "People you block will appear here. You can unblock them anytime."
  - Confirm dialogs: "Disconnect" / "Remove {name} from your connections?"; "Unblock" / "Unblock {name}?". Buttons "Cancel" / "Confirm"; busy "Working...".
- Profile not found:
  - User icon tile, H1 "Profile not found", "This user doesn't exist, or their profile is private.", button "Go Back".
- Public profile:
  - "Connected" (disabled, UserCheck icon) and "Update rating" (filled amber star).
  - Education section.
  - About empty "No bio yet." Recommendations empty states.
  - Phone and TikTok contact tiles.
  - Suggested conferences empty: "Find events open for applications." + "Browse conferences →".

#### Blog editor states — `/dashboard/articles/new`, `/dashboard/articles/[id]/edit`
- Edit header: "Back to My Blogs", H1 "Edit Blog", sub = the blog title.
- Not authorized: "Not authorized to edit this blog." + button "Back to My Blogs".
- Error banner (red): "Title is required." / "Content cannot be empty." / "Failed to save. Please try again."
- Published empty: "No published blogs yet" / "Share your Model UN expertise with the community." + "Write your first blog".
- Title placeholder "Enter a compelling title...". Excerpt placeholder "Provide a short summary that will catch readers' attention on listing pages..." (the counter turns amber above 180). Tags placeholder "e.g. UNSC, diplomacy, guide". Category options Guide / Analysis / Tips / News.
- Cover uploader:
  - Empty "Click to upload cover photo" / "JPG, PNG or WEBP (Max 5MB)".
  - Busy "Uploading... {n}%" / "Please wait".
  - Filled: 16:9 preview with hover "Remove Image".
  - Errors "Please select an image file (JPEG, PNG, etc.)", "Image must be less than 5MB".
- Full RichTextEditor toolbar:
  - Undo, Redo | Bold, Italic, Underline, Strikethrough | H1, H2, H3 | Align left / center / right / Justify | Bullet list, Numbered list, Quote, Code block | Link (prompt "Link URL"), Insert image | AI.
  - Image errors: "Only image files are allowed (JPEG, PNG, GIF, WebP…).", "Image must be under 5MB.", "Upload failed."
- AiTextareaAssist (under every textarea):
  - "AI" chip, plus "Undo" ("Restore what you wrote") after a rewrite.
  - Panel buttons "Improve" | "Fix grammar" | "Suggest" (Suggest is hidden on academic surfaces; disabled tooltip "Write something first").
  - Suggestion card "SUGGESTION" with ✕, the text, "Use this" and "Try another". Error (amber) e.g. "Could not reach the AI."
- Generate-a-draft dialog:
  - Input state: textarea "Topic, key points, anything the draft should cover…" + "Generate".
  - Preview state: rendered draft + "Back", "Regenerate", "Insert at cursor", "Replace document".
  - Error "No usable result — try again."
- Committee-doc AI menu item: "Auto-Convert to Draft Resolution".

#### Payments extras — `/dashboard/payments`
- Refunded row: blue "Refunded" pill (RefreshCw icon) with the printer icon. The refunded receipt uses the blue "Refunded" badge.
- Pay Now busy and errors (currently alert()):
  - "Could not start payment." / "Could not reach payment service."
  - Server: "This registration is already paid.", "This role has no registration fee — no payment needed.", "Event not found", "Application not found".
- Receipt table head: "Description" | "Amount". Line "{tier} Registration" with the event title as a sub-line. Footer "Generated by MUN Platform" + issued date.

## 3. Conference portal (delegate / faculty / observer)

#### My Pass tab — `/dashboard/conferences/[id]?tab=pass` — delegates, observers, faculty (any applicant) when food or transport is on, or the event is Pro
- Left-rail item: **"My Pass"** (QrCode icon), placed after "Requests" and before "Food" (Sidebar.tsx:528). The phone chips need it too.
- Card (centered, max-w-sm):
  - Header line: QrCode icon + `{eventTitle}` (fallback "Event pass").
  - QR image on a white plate, 256px, alt "Your pass QR code".
  - Name (bold), then `{role} · {committee}`. Applicants show their raw role; staff show `roleLabel(role)`.
  - Caption: "Show this to staff for meals, coupons and check-in. One pass for everything."
- Section **"What your pass holds"** (uppercase label). Each row is title on the left and a state on the right; used rows are struck through at 50% opacity.
  - Row titles:
    - Meals: `{mealName} · {day}`, filtered by meal audience.
    - Coupons (Pro only): `{title} · {day}`.
    - Check-in (Pro only): `Check-in · Day 1` … `Day N` (max 7; defaults to 2 days).
    - Rides (Pro only, routes you registered for): `{routeName or "Ride"} · Day N`.
  - States: "Ready" · "{left} of {uses} left" · "Used {h:mm AM}" · "Checked in {h:mm AM}" · "Not yet" (check-in not done).
  - The section is hidden when there are no rows.
- Loading: 256px box with a spinner.
- Error: message text + outline button "Try again" (RefreshCw icon). Possible messages: "Sign in first." · "Passes aren't set up on this server yet." · "You're not part of this event." · "Couldn't load your pass." (src/app/api/passes/mine/route.ts:12-18).
- Desirable states to draw: a QR plus a mix of Ready / Used / Checked in rows; a Free event (meals only); the error state.

#### Food Coupons (redraw) — `?tab=food` — delegates
- Title "Food Coupons".
- Subtitle: "Show " + link **"your pass"** (→ `?tab=pass`) + " at the counter: one QR for every meal."
- Remove the per-slot QR stubs and codes.
- Grouped by `{day}` (uppercase heading). Card: `{mealName}`, Clock + `{timeWindow}`, MapPin + `{venue}`.
- Card states:
  - Available, single use: no footer.
  - Multi-use: "{left} of {uses} left".
  - Used: card at 50% opacity + CheckCircle "Used at {h:mm AM}" (or "Used").

#### Transport (redraw registered card) — `?tab=transport` — delegates
- Registered card: "You're registered", `{routeName}`, `{pickup} → {dropoff}`, "Departs {t} · Returns {t}".
- Footer: QrCode icon + "Show " + link **"your pass"** + " to the transport coordinator" (no QR on the card).
- Busy button: "Registering...".
- Error strip (red): "Route is full" / "Already registered" / "Route not found" / "Registration failed".
- Note: once registered, the route cards lose their buttons (`!myRoute`).

#### Accommodation states — `?tab=accommodation`
- Status card labels:
  - "Pending Review" (yellow, Clock).
  - "Confirmed" (green, CheckCircle2).
  - "Rejected" (red, XCircle).
- Status body: "Your request for **{blockName}** is {pending|confirmed|rejected}." Pending adds " The organizer will review shortly."
- After a request exists, only the status card shows (no block grid).
- Busy: "Requesting...". Error: "Failed to submit request. Please try again."

#### Position paper editor + review banners — `?tab=documents` (and the /dashboard/documents hub)
- Card title "Position Paper". Description varies:
  - Writing first time: "Write in markdown, upload a .md file, or import a PDF (text is extracted; the file isn't stored)."
  - Editing: "Editing your submission — save to update what the Chairs see."
  - Submitted: "Submitted. Only your committee Chairs can read this paper."
- Segmented input: "Write" · "Upload .md" · "Import PDF".
- Write: rich-text editor (B/I/U toolbar + AI), placeholder "Write your position paper… use the toolbar or Ctrl+B / Ctrl+I / Ctrl+U".
- Upload .md dropzone: "Click to upload a .md file" / "Markdown or plain text · max 2MB".
- Import PDF dropzone: "Click to import a PDF" / "Text is extracted to markdown. The PDF itself is discarded · max 20MB". While working: progress bar + "Extracting text…".
- Footer: "{n} chars · {n} words", ghost "Cancel" (only when editing a submission), primary "Submit Paper" / "Update Paper" (spinner while saving).
- Errors (red strip):
  - "Only .md or plain text files accepted."
  - "File must be under 2MB."
  - "Only PDF files accepted."
  - "PDF must be under 20MB."
  - "Failed to extract PDF text: {msg}"
  - "Position paper is empty."
  - "Save failed: {msg}"
- Review banners:
  - "Position paper approved" / "The Chairs approved your paper." (emerald)
  - "Revision requested" / "The Chairs asked for changes. Edit and resubmit." (amber)
  - "Plagiarism concern flagged" / "The Chairs flagged a concern. Review the feedback and resubmit." (red)
  - Optional italic chair quote “{feedback}”.

#### Rules & Regs sub-tab + Study Guide variants — `?tab=documents&doc=rules|guide`
- Rules card: "Rules & Regulations" / "Published by the conference organizers."
  - Row "Rules & Regulations", "Markdown · updated {relative}".
  - Buttons ".md" (download) and "Read" / "Hide". Expanded markdown reader.
  - Loading "Loading rules & regulations…". Empty: "Rules & Regulations" / "The conference rulebook." / "No rules published yet" / "The organizer will publish the rulebook here — check back later."
- Study Guide PDF variant: row "{fileName or '{committee} Study Guide'}", "PDF · uploaded {relative}", buttons "Save" and "Open".
- Study Guide expanded reader ("Hide").
- Study Guide loading: "Loading study guide…".
- Study Guide empty: "Study Guide" / "Background reading for your committee." / "No study guide yet" / "Your chair will upload it here — check back later."
- Portal sub-tab bar: "Position Paper" · "Study Guide" · "Rules & Regs" (no Committee Docs in the portal).

#### Faculty left rail — `P` (role Faculty Advisor)
- "Back to Home", section label "Faculty Advisor", single item "Faculty Panel" (Users icon).
- The faculty page also keeps the Overview hero (pills, title, date, location) but has no Committee/Country tiles and no Room Alerts.

#### Right-rail and people-directory empties
- Chat, no committee: "Your committee chat appears here once you're seated in a committee."
- Chat, empty: "No messages yet. Say hello to your committee 👋"
- Members, empty: "No members allocated yet."
- People dialog sections: "Organizers" · "Executive Board" · {each committee} · "Unassigned" · "Observers & Faculty". Empty: "No people match your search."

#### Room Alerts empty
- Dropdown "Room Notifications" + X close. Empty: "No active notifications".

#### Certificate looks
- Three looks: "Classic Diploma" (double slate border), "Modern Minimal" (violet left bar), "Ornate Gold" (gold frame, Pro).
- Download button busy: "Building PDF...".
- Error alert: "Couldn't build the PDF. Please try again, or use Print Certificate."

#### Team panel, member view
- Card title `{delegationName or "My Team"}`, no "Team Head" badge, no "Add Member".
- Only the "Position Papers {s} / {n}" stat.
- Table columns: Member · Committee · Country · Payment (no Score).
- Loading: "Loading team...".

#### Portal-level states
- Loading: skeleton (title bar, subtitle line, 400px block).
- Not found: "Conference not found" / "We couldn't find the details for this conference."
- Hero status pill variants: PENDING · WAITLISTED · REJECTED · WITHDRAWN (raw status). Pair with Country "Pending Assignment".

#### Observer inline empties
- "No committees yet." · "No announcements yet." · "No approved delegates yet." · "Date TBA" · "Location TBA".

## 4. Chair & Executive Board

#### Hub rail — My Pass + Scan Passes entries
- Route: /dashboard/chair/committee/[id] (rail). Who sees it: any staff viewer of the hub when the event uses passes. Scan Passes needs the `canScanPasses` permission.
- Rail order (code): Overview, Marking, Motion Log, Papers, Requests, Study Guide*, Awards & Results*, Room Alert*, Rules & Regs, **My Pass** (QrCode icon, `?tab=pass`), **Scan Passes** (ScanLine icon, links out to `/dashboard/scan/{eventId}`).
- Gated tabs (*) are **omitted** from the rail, not locked. The "{label} is restricted" card shows only for a direct link.

#### My Pass tab (staff QR pass)
- Route: /dashboard/chair/committee/[id]?tab=pass. Who: chair / vice-chair / EB / co-org staff when passes are on.
- Card header: QrCode icon + `{eventTitle}` (fallback "Event pass").
- Loading: spinner in a 256×256 box.
- Error: `{error}` (default "Couldn't load your pass.") + outline button "Try again" (RefreshCw icon).
- Success: QR on a white plate (alt "Your pass QR code"); holder name (bold); line `{role} · {committee}` (e.g. "Chair · UNSC"); caption "Show this to staff for meals, coupons and check-in. One pass for everything."
- Holdings list (hidden when empty): heading "What your pass holds". Rows: meal "{mealName} · {day}", coupon "{title} · {day}" (Pro events only), "Check-in · {day label}", ride "{routeName or Ride} · {day label}".
- Right-side status on each holding row: "Ready" / "Not yet" (check-in) / "{left} of {uses} left" / "Used {time}" / "Checked in {time}". A used row is struck through at 50% opacity.

#### Marking matrix — read-only variant
- Who: hub viewers without canMark (e.g. a staff member without "canMarkDelegates" who opened a committee).
- Same tiles and table. "Apply suggestions" is hidden. Binary cells are at 50% opacity and not clickable; decimal inputs are disabled (not-allowed cursor).

#### Delegate detail sheet — edge states
- Loading: centered spinner in the body.
- Day by day empty: "No conference days recorded yet."
- Criteria empty: "No marking criteria configured for this event."
- Selected-day title when no score: "{day} · unscored", followed by the attendance label ("No roll call" when none).
- On the floor empty: "No live-session record for this day."
- Final formula without an overall: "no chair overall entered — final = computed %".
- Excluded days note: "{n} day was excluded: the delegate was marked present but never scored. Score them, or set them absent, to bring the day back into the average." (plural: "{n} days were excluded…").
- Criterion card: suggestion chip (Star icon) "+1" (binary) or "+{sug}" (decimal), with title "Append the live-participation suggestion as another mark".
- Score entries editor empty: "No marks yet".
- Read-only: feedback textarea and entry controls disabled.

#### Motion Log — expanded motion / point / yield rows
- Motion expansion fields: "Parameters" (e.g. `“{topic}” · {n} min total · {n}s per speaker · → {phase}`), "Mover's note", "Chair's note" (or "Ruled out of order" when auto-resolved), "Seconded by". Footer: "status {status}", "takes a vote", "vote linked".
- Point expansion: "Delegate's point", "Directed at" (country), "Chair's ruling", "This point may interrupt a speaker."
- Chair-logged entry or yield: "Yielded to" (yield) or "Note".
- Vote extras: "Vetoed by" {countries}; meta chips "second round", "Security Council", "division of the question"; "{n} ballot was reopened by the chair." / "{n} ballots were reopened by the chair."; tally line suffix " · show of hands" (vs " · roll call").
- Outcome badge values: carried, dismissed, out of order, {raw status}, recognized, pending, passed, failed, tied, yielded, logged by chair. Tones are pass (green), fail (red), open (amber), neutral.

#### Papers — empty and read-only
- Empty: FileText icon + "No approved delegates in this committee yet."
- Read-only viewer: the row button reads "View" (ExternalLink icon) instead of "Grade". The "Remind by email" button is absent. The summary still shows "{s}/{n} submitted" / "{k} delegates not submitted yet".
- Remind busy: spinner replaces the Bell icon. Disabled when 0 are missing.

#### Position Paper Viewer — alternate states
- Left header badge text: REVIEW / APPROVED / REVISION / FLAGGED (blue / green / yellow / red).
- Legacy paper: full-height iframe (title "Position Paper (legacy)").
- No content: "No paper submitted".
- Right pane loading: large spinner.
- Notes thread empty: "No notes yet". Each note shows author, relative time (or "just now") and text. The Send icon button spins while sending.

#### Requests — Resolved tab, escalated card, loading
- Tabs: "Open" (count) / "Resolved" (count). Resolved also includes rejected.
- Resolved card: type chip, subject, date, description, plus a green line "Resolution: {text}". No action buttons.
- An escalated complaint sits in the **Open** list with no actions and no status text. (A designer may want to add a status pill, but the code has none today.)
- Empty: "No open complaints" / "No resolved complaints". Loading: centered spinner.

#### Study Guide — import panes, first publish, errors
- First publish: primary button "Publish Guide" (UploadCloud icon). No Delete button. Busy shows a spinner. Disabled when empty.
- Upload .md pane: dashed drop zone "Click to upload a .md file" / "Markdown or plain text · max 2MB".
- Import PDF pane: "Click to import a PDF" / "Text is extracted to markdown. The PDF itself is discarded · max 20MB". While extracting: progress bar + "Extracting text…".
- Error box (red): "Study guide is empty." / "No committee assigned to you. Ask the organizer to assign your committee in the event's Staff settings, then reload." / "Save failed: {message}".
- Editor placeholder: "# Study Guide / ## Topic Background / ## Past International Action / ## Key Questions to Consider / ## Questions a Resolution Must Answer / ## Further Reading".

#### Rules & Regs tab — reading, empty, loading
- Loading: spinner + "Loading rules & regulations…".
- Empty: title "Rules & Regulations", description "The conference rulebook.", then "No rules published yet" / "The organizer will publish the rulebook here — check back later."
- Reading: the "Read" button flips to "Hide" (chevron rotated). The rendered markdown appears below in a bordered panel (max height 640px, scrolls).

#### Committee Standings — unpublished and success states
- Before publishing: description without the "Published (…)." suffix. Buttons: visibility select ("Show full board" / "Show rank only") + "Publish" (Award icon). No Withdraw.
- After a click: the button reads "Published" (CheckCircle) for 2s, then "Update".
- No days yet: the controls are hidden, and the board reads "No daily marks yet — the board fills in from the Marking matrix."
- Board rows: rank badge (1-3 medal-toned), flag + country + name, Days "p/n", Computed "x%", Overall "y%" or "—", Final with a PctBar and Trophy (#1) or Medal (#2, #3) icon.

#### Final Scoring — decimal mode + saved
- Column header "Overall (−100…+100)" with a number input (placeholder "—").
- The button cycles "Compute & Save Final Scores" (Trophy) → spinner → "Saved" (CheckCircle, 2s).

#### Executive Board / Chair dashboards — loading
- /dashboard/eb: skeleton icon + two text bars, 4 stat skeletons, 2 card skeletons.
- /dashboard/chair: title bar + 2 card skeletons.
- Hub page: title bar + a 2/3 + 1/3 skeleton grid.

#### Documents hub — chair Study Guide editor (StudyGuideEditor)
- Route: /dashboard/documents → chair/EB conference card → "Study Guide" sub-tab. Who: chair / vice-chair / EB.
- Sub-tabs for managers: Study Guide, Committee Docs, Position Papers, Rules & Regs.
- Card title "Study Guide" (BookOpen); description "Publish the background guide for your committee."; header button "Edit" (Pencil) when not editing.
- Published summary: "Published" (green check), then "{fileName or {committee} Study Guide} · updated {n ago}".
- Edit mode: "File name (optional)" (placeholder "{committee}-study-guide.md"); MarkdownDocEditor (placeholder "# Study Guide / ## Topic / ## Background / ## Questions a Resolution Must Answer"); "Cancel" (ghost, X) when a guide exists; "Publish Guide" / "Update Guide".
- Errors: "Study guide is empty." / "Save failed: {message}".
- No committee: "No committee in scope — assign yourself a committee to publish a study guide."
- Loading: "Loading study guide…".

#### Documents hub — Committee Docs review list (CommitteeDocsChair), remaining states
- Card title "Committee Documents" + pending-count pill; description "Working papers, draft resolutions & amendments submitted by your delegates."
- Collapsed row: title + status pill (Collecting endorsements / Submitted / Approved / Rejected); meta "{type} · {name} ({country}) · {n ago} · {n} sponsors · {n} signatories"; buttons "Open" (BookOpen, title "Open in reader window") and "Review" / "Hide".
- Expanded: "Sponsors: …", "Signatories: …", rendered body, then the review block (already drawn on D02).
- Read-only variant (faculty/observer): no note box and no action buttons.
- Empty: "No submissions yet" / "Delegate documents will land here for review." Loading: "Loading…". No committee: "No committee in scope — committee documents appear once you're assigned a committee."

## 5. Organizer 1: home, events, create, overview, details, committees, partners, allocation, staff

#### Organizer home: empty state
- Route: /dashboard/organizer. Role: organizer with no events.
- Left column under "Events at a Glance": a dashed card with a calendar icon, the text "No events yet.", and an outline small button "Create first event" (opens the Create event dialog).
- Glance values: Published 0, Drafts 0, Approval Rate "—".
- Applications by Role table body: "No applications across your events yet." (already drawn).
- The "Your Events" section is not rendered.

#### Organizer sidebar: co-organizer variant
- Route: /dashboard/organizer/* outside an event. Role: co-organizer only (no organizer profile).
- Section label "Organizer" › "Manage Events" only, then "Back to Dashboard". No "Financials", no "MUN Pilot Pro".

#### Loading states (organizer)
- Home: title bar skeleton, 4 stat tile skeletons, 1 large block.
- Manage Events: 6 card skeletons (cover block + 3 text lines + button bar). Chips, tabs and search are hidden while loading.
- Event overview: title skeleton, 4 stat skeletons, one 400px block.
- Allocation › Applications: a short bar + one 400px table block. Country Assignment: title bar + 1 block. Capacity: title + 4 card blocks. Staff: title + 3 row blocks.
- Applicant sheet: avatar circle + 2 lines, then 2 rounded blocks.

#### Edit event dialog
- Opened from Overview "Edit" (hero button) and Details "Edit event". Role: owner or co-organizer.
- Same fields as Create, prefilled. Title "Edit event". Button "Save changes", busy "Saving..." (spinner). No footnote under the button.
- The "+ End date and time" link is replaced by "End date" / "End time" fields when the event already has them.
- In person with a stored place: the search box shows "{name}, {address}", the line "Location pinned with map coordinates" and the map pin.
- Errors as in Create: "An event must not have a start time in the past.", "Please fill all required fields.", "Failed to save event. Please try again." (or the server message).
- Create busy text: "Creating...". Signed-out guard: "You must be signed in.".

#### Venue search errors
- Inside the results dropdown (header "Searching…" while loading, else "Results", × "Close results").
- Errors in red: "Type at least 2 characters to search.", "Search failed." (or the API message), "Could not reach the search service.".

#### Event sidebar: QR pass links (Tools section)
- Full order: Setup (Overview, Details, Allocation, Committees, Partners) · Content (Schedule, Announcements, Rules & Regs) · Live MUN (Live Control) · Tools (Modules, **Coupons**, **Scan Passes**, **Pass Report**, Complaints, ID Cards, Certificates, Theme, Results) · Finances ("Financials" for the owner / "Roles & Schedule" for a co-organizer, "Plan") · "Back to Events".
- "Scan Passes" links out to /dashboard/scan/{eventId} (leaves the event sidebar).

#### Overview: empty and busy states
- Recent Applications with none: "No applications yet.".
- Upcoming Session with none: bold "No upcoming sessions", muted "Within 7 days", button "View Full Schedule →".
- Country Assignments with 0 pending: "0" / "Pending assignments", button "Assign Now →" in secondary style.
- Hero buttons busy: "Publishing..." / "Updating...". Alerts: "Failed to publish event." / "Failed to unpublish event.".

#### Applicant sheet: approval refused alerts and label variants
- Free-plan participant cap (browser alert after Approve): "This event is full for its plan. Upgrade the event or ask for more room under Plan."
- Unpaid guard alert: "This applicant hasn't paid the registration fee yet. They can't be approved until payment is confirmed."
- Failures: "Failed to update application status." / "Error updating application.".
- Single-choice applicant: heading "Preferred Choice". Committee option badge "★ Preferred" (multi-choice uses "★ #n").
- Faculty Advisor: experience heading "Supervisor Experience", motivation heading "Motivation for Participating".
- Approved applicant: footer has only "Reject". Rejected: only "Approve". Event Assignment shows "Assigned Committee" / "Assigned Country" with "None" fallback.
- Approve button tooltip while unpaid: "Applicant must pay before approval".

#### Country Assignment: completed and empty states
- Deadline card label "Assignment Deadline". Value "COMPLETED" (green) after auto-assign. Turns red under 1h.
- Warning (non-AI mode) title: "1 hour until deadline" + "Please lock in any manual assignments before the deadline.".
- Matrix description when done: "All applicants assigned!" (green). Otherwise "{n} applicants need assignment." (amber).
- Primary button label: "Save" (disabled while AI is assigning).
- Empty event: card "No committees configured for this event.". Empty committee tab: "No approved applicants for this committee yet.".
- Row: "Conflict" badge has a tooltip "Held at {eventName} on {date}". In the select, a conflicting country shows a 🟡 marker. Taken shows "Taken". First option "Unassigned". Placeholder "Assign Country".

#### Migration › Requests: empty and error
- Header "Migration Requests". Lede "Delegates asking to move committee/country. Approving a move into a taken seat offers a swap to its current holder."
- Empty: dashed card "No migration requests yet.".
- Error banner (red): "Action failed." or the server message.
- History badges: Completed / Rejected / Failed / Cancelled (also Pending / Awaiting swap labels exist).

#### Migration › Direct Migration (sub-tab body)
- Route: /events/[id]/allocation?tab=migration&sub=direct. Role: owner/co-organizer.
- Sub-tab switcher: "Requests" | "Direct Migration".
- Title "Direct Migration". Lede "Move any approved delegate to another committee/country instantly. The delegate is emailed and notified. If the target seat is taken, you can swap the two delegates."
- Success flash (green): "{name} moved to {committee} / {country} (swapped)." (without " (swapped)" for a plain move).
- Search input placeholder "Search delegate, committee, country…".
- List heading "Approved delegates ({n})". Each row: name, seat "{committee} / {flag} {country}" (or "{committee} / no country"), outline button "Move".
- Empty: dashed card "No approved delegates to migrate yet.". No match: "No delegates match “{search}”.".
- History heading "Admin migrations ({n})". Row: "{requester} ↔ {occupant} · by {decidedByName}", "{from} → {to}", badge "Swapped" or "Moved".

#### Move dialog: other variants
- Free target seat: button "Move" (arrow icon), no notice.
- Swap blocked (red notice): "Seat held by {occupant} and {name} has no country to swap back. Assign {name} a country first, or pick a free seat."
- Placeholders: committee "Select committee". Country "Select country" or "Pick a committee first". Fallback text input "Country code (e.g. US)" when the committee has no roster.
- Errors: "Pick a target committee and country.", "That seat is taken. Assign this delegate a country first, or pick a free seat.", "Migration failed.".
- Buttons "Cancel" / "Swap" | "Move" (spinner when busy).

#### Capacity & Waitlist: full desktop/states
- Section heading 1: "Committee Overview". Empty: "No committees configured for this event.".
- Card footer: "{n} seats remaining" or "No limit set" (capacity 0).
- Section heading 2: "Waitlist Queues". A table shows only for committees with entries (or full ones).
- Table "{Committee} Waitlist" + badge "{n} waiting". Columns: "#", "Applicant", "Applied Date", "Status", "Action".
- Status badges: "Waiting", "Offered (48h)", "Accepted", "Expired". Action button: "Offer Seat" (waiting) or disabled "Offered".
- Failure alert: "Couldn't offer the seat. Please try again.".

#### Staff › Applications tab (public staff applications)
- Route: /events/[id]/allocation?tab=staff (tab "Applications"). Role: owner/co-organizer.
- The tab trigger shows a small primary dot when applications are pending.
- Card title "Staff Applications". Description: "Review people who have applied to join your staff team. Public applications are currently ENABLED." ("ENABLED" in green, or "DISABLED" in red).
- Empty: "No pending applications.".
- Row: "{name} ({email})", outline badge "Applied for: {role}" (roles people can apply for: chair, vice-chair, director). Buttons "Reject" (red outline, removes the row) / "Accept" (green).
- Accept emails the applicant: subject "You're on the team: {event}", heading "Application accepted".

#### Staff: header feedback and empty
- Public apps toolbar: label "Allow Public Applications", switch, button "Save" → busy "Saving..." → green "Saved!" for 3s.
- Empty Current & Invited: shield icon, "No Staff Yet", "Invite people to help manage your conference.", button "Invite Staff".
- Committee select (chair, vice-chair, director, USG, EB only): tiny label "Committee". First option "All committees" (director/USG/EB) or "No Committee" (chair/vice-chair). Trigger tooltip "No committee assigned".
- Vice-chair mode select: "Standard Vice Chair" / "+ Delegate Power".

#### Remove staff member? dialog
- Title (red alert icon) "Remove staff member?".
- Body: "**{name or email}** will lose all access to this event[, including co-organizer privileges]. This cannot be undone — you can re-invite them later."
- Buttons "Cancel" / "Remove" (red, trash icon), busy "Removing...".

#### Change role? dialog: pending-invite variant
- "Change **{name}** from {Old Role} to **{New Role}**. Their pending invitation will be updated to the new role."
- Busy "Updating...".

#### Permissions editor: Scan Passes switch
- 7th row, after "Approve Results": label "Scan Passes", description "Scan QR passes for meals, coupons and check-in.".
- "View Financials" switch is disabled unless the role is co-organizer.
- Description: "Overrides the default permissions for the {role} role. Changes take effect after the staff member re-accepts; chair/vice-chair marking is always scoped to their committee."

#### Committee form: missing fields and title variants
- Titles: "Create Committee" — description "Configure the details, capacity, and available countries for this committee.". "Customize Template" (sparkle) — description "Tweak the template's name, capacity, and country roster before saving.". "Edit Committee" — same description as Create.
- Total Capacity placeholder "e.g., 50". Help under the name/capacity row: "Capacity is the maximum number of delegates. Add countries up to this number.".
- "Description" textarea, placeholder "Short summary of the committee's mandate and agenda...", with the AI assist row underneath.
- Footer "Cancel" / "Save Changes" (disabled with an empty name; spinner while saving).

#### Partner form: logo + edit variant
- Card title "Add New Partner" / "Edit Partner".
- Right column: "Partner Logo" with the image uploader (drop/upload area).
- Buttons "Cancel" / "Add to List" (create) or "Save Changes" (edit). Disabled with an empty name.

## 6. Organizer 2: schedule, announcements, rules, modules, complaints, tools, money, plan, QR passes

**Who can reach the scanner** (`/dashboard/scan/[eventId]`):
- **Organizer.** The event sidebar has a "Scan Passes" item (Sidebar.tsx:392), always shown, Free events included. There are also "Scan" buttons on Coupons (Pro only, coupons/page.tsx:60) and on Pass report (always, passes/page.tsx:77).
- **Co-organizer and App Admin.** Same as the organizer, because they count as organizer-level (`staff.isOrganizerLevel`).
- **Staff.** Only those whose organizer turned on the "Scan Passes" permission (PermissionsEditor.tsx:31, "Scan QR passes for meals, coupons and check-in."), and only when passes are in use: the food or transport module is on, or the event is Pro (useEventStaffRole.ts:41-44). They reach it from the chair committee-hub sidebar (Sidebar.tsx:620-622).
- **Everyone else** gets the no-permission message.
- **Layout.** The page renders inside the standard dashboard shell with the *standard* sidebar; there is no event sidebar on this route.

#### Coupons: `/dashboard/organizer/events/[id]/coupons` (organizer and co-organizer; Pro feature)
- **Header.** Title "Coupons" (Ticket icon). Lede: "Kits, gifts, drinks and extra meals, claimed with each person's QR pass."
- **Header buttons (Pro only).** "Scan" (outline, ScanLine icon) and "New coupon" (PlusCircle icon).
- **Loading.** A centered spinner while the plan loads, and a spinner inside the card while coupons load.
- **Free (locked).** The ProGate card replaces the list:
  - Crown icon, "Unlock Custom coupons".
  - "This comes with a Pro event. Upgrade this event, or ask for it, under Plan."
  - Button "Upgrade to Pro" (links to /dashboard/organizer/pro).
  - No header buttons.
- **Empty.** "No coupons yet. Make one for a welcome kit, a T-shirt or a gala drink."
- **List row:**
  - Title, plus a "Paused" secondary badge when paused (the row drops to 60% opacity).
  - Line 2: "{Kind} · {day} · {time} · {where}". Kinds: Kit / Gift / Drink / Extra meal / Other.
  - Line 3: the audience label (e.g. "Delegates", "Delegates, Observers", "Everyone", "2 named"), plus " · N each" when uses are more than 1.
  - Buttons: "Edit" (ghost), Pause or Play icon (title "Pause" / "Resume"), trash (title "Delete", destructive).
- **Delete confirm.** `Delete "{title}"? Uses already recorded stay in the report.`
- **Inline error.** The error message in red under the card.

**New / Edit coupon dialog.** Title "New coupon" / "Edit coupon".
- **Title.** Text input, max 80 characters, placeholder "e.g. Welcome kit".
- **Kind.** A row of toggle buttons: Kit · Gift · Drink · Extra meal · Other.
- **Day / Time / Where.** Three columns, with placeholders "Any day", "Any time" and "Help desk".
- **"Who gets it".** Group toggle buttons: "Delegates" · "Observers" · "Faculty & team leads" · "EB & chairs" · "Other staff & organizers". The default is Delegates.
- **"And these people".** Chips of the people picked, each with an × (aria "Remove"). Then a search input with placeholder "Search a name to add" ("Loading people…" while loading, and disabled). Results appear after 2 characters, up to 6 rows, each "Name" plus muted "role · committee".
- **"Uses per person".** Number input, 1-20, narrow.
- **Inline error.** "Couldn't save." (or the server message).
- **Footer.** "Cancel" and "Save". Save shows a spinner while busy, and is disabled with no title or when there are no groups and no people.

#### Pass report: `/dashboard/organizer/events/[id]/passes` (organizer and co-organizer)
- **Header.** Title "Pass report" (ClipboardCheck icon). Lede: "What was handed out with the QR passes, and to whom."
- **Header buttons.** "Scan" (outline), "Refresh" (outline, RefreshCw icon), and "CSV" (Download icon, Pro only).
- **Free notice.** Crown icon with: "Free events count meals. Who claimed what, coupons, check-in, transport and the CSV come with Pro (Plan)."
- **Error.** A red line, e.g. "Couldn't load the report."
- **Loading.** Spinner.
- **Empty.** "Nothing to hand out yet: add meals (Modules → Food) or coupons."
- **Left column.** One card per group: "Meals", "Coupons", "Check-in", "Transport".
  - Each row: title, plus a mono "{claimed} / {eligible}" on the right and a thin progress bar.
  - Clickable on Pro (the selected row gets a primary/10 highlight). Disabled on Free.
- **Right panel (Pro, sticky, 420px).**
  - Title: the target's title ("…" while loading).
  - Description: "{n} claimed · {n} not yet", plus " · N uses each" when uses are more than 1.
  - Section "Claimed" (eyebrow), empty text "Nobody yet.". Each row:
    - Name on the left, time on the right (e.g. "Sat 1:05 PM") plus " · count/uses".
    - A second line: "{Role · Committee} · by {scanner name}".
    - Badges: "by hand", "outside time", "{n} undone".
  - Section "Not yet", empty text "Everyone has it.". Each row is the name plus "Role · Committee" (and " · undone").
- **Target titles you will see.** Meal and coupon titles. Check-in rows are "Check-in · Day 1". Ride rows are "{route} · Day 1".

#### Scanner: `/dashboard/scan/[eventId]` (organizer, co-organizer, App Admin, staff with Scan Passes)
- **Loading.** A spinner while the role resolves.
- **No permission.** Centered text: "You don't have permission to scan passes for this event. Ask the organizer to turn on "Scan Passes" for you."
- **Header.** Title "Scan passes" (ScanLine icon). The event title is the subtitle.
- **Layout.** Two columns (left content, right column 360px).

**Card "What are you handing out?"**
- Description: "Pick it once, then scan everyone's pass."
- Mode toggle: "Redeem" / "Check only".
- **Redeem mode** shows a grid of target pills. Each pill has a bold title and a muted subtitle. Pills that are running now sort first and get a "Now" badge. The pill types:

| Pill type | Title | Subtitle | When it shows |
|---|---|---|---|
| Meal | "{mealName} · {day}" | "{time window} · {venue}" | Always |
| Coupon | "{coupon title} · {day}" | "{time window} · {venue}" | Active coupons only |
| Check-in | "Check-in · Day N" | YYYY-MM-DD | Pro only. One per event day, max 7 days; 2 days if dates are unknown. |
| Ride | "{routeName or pickup → dropoff} · Day N" | "departs 08:00 · 12 registered" | Pro only |

- Selected pill: primary border and a primary/10 fill.
- While loading: a spinner.
- Empty: "Nothing to hand out yet. Add meals in Modules → Food, or coupons under Coupons."

**Camera card.** A black 16:9 video area.
- **Off.** A centered button "Start camera" (Camera icon).
- **Pick first.** In Redeem mode with no target, the button is disabled and reads "Pick what you hand out first".
- **Starting.** A spinner in the button.
- **Denied.** The text "Camera blocked or not found. Allow camera access in the browser and try again." appears above the button.
- **On.** The live video with the scan region highlighted. No overlay.
- **Busy.** A white spinner in the top-right corner.
- **Below the card.** "Scanning for **{target}**" and any red error, e.g. "Couldn't reach the server. Check your connection.", "You don't have permission to scan passes for this event.", "That meal, coupon, check-in or ride no longer exists.", "Passes aren't set up on this server yet.", "Only the organizer can redeem by name."

**Result card.** A 2px border tinted by tone, an icon, a large bold title, the holder line (48px photo or initial, bold name, then "Role · Committee"), and a muted detail line.

| Outcome | Tone | Title | Detail line | Action |
|---|---|---|---|---|
| ok | green | "Claimed" | "{n} of {uses} left", or the target title | "Undo" (Undo2 icon, outline) |
| already_used | amber | "Already used" | "At 1:05 PM by {name}" or "Earlier" | — |
| outside_window | amber | "Outside meal time" | "{target} runs 12:30 PM – 2:00 PM" | "Accept anyway" |
| not_eligible | red | "Not for them" | "This isn't for their role." / "Not registered on this route." / "Not part of this event any more." | — |
| invalid | red | "Not a MUN Pilot pass" | — | — |
| wrong_event | red | "Pass for another event" | "It's for {other event}." | — |
| replaced | red | "This pass was reset" | "Ask them to open My Pass again for the new code." | — |
| pro_required | red | "Coupons need a Pro event" | — | — |
| paused | amber | "This coupon is paused" | — | — |

The phone also vibrates: one short pulse on success, three on anything else.

**Lookup card (Check only mode).**
- The holder line, then the list of their items.
- Each item shows one of three states: struck-through with "Used 1:05 PM", "{n} of {uses} left", or "Ready".
- Empty: "Nothing for their role."
- A failed lookup shows the same result cards as above.

**Card "Find by name" (organizer-level only).**
- Search icon in the title.
- Description: "No phone or pass? Redeem by hand. It's recorded as manual."
- Input placeholder "Type a name". People load when the field gets focus.
- Results appear after 2 characters, up to 8 rows. Each row: name, "role · committee", and a "Redeem" button.
- The button reads "Pick one first" and is disabled when no target is picked, and shows a spinner while busy.
- A small red error line below.

**Card "Claimed so far".**
- An icon button (RefreshCw) in the header.
- Before the first refresh: "Tap refresh to count."
- Rows: title plus a mono "{claimed} / {eligible}".

#### Food slot dialog, updated: Modules → Food → "Add Slot" (organizer)
- **Title.** "Add Food Slot".
- **"Quick start — pick a template"** (Sparkles icon). A 3-column grid: Breakfast · Lunch · Dinner · Tea & Snacks · Gala Dinner · Custom.
- **"Meal Name".** Placeholder "e.g. Lunch Day 1".
- **"Day" and "Time Window".** Placeholders "e.g. Day 1" and "12:00 – 14:00".
- **"Venue".** Placeholder "Cafeteria A".
- **NEW "Who gets it".** Toggle buttons: Delegates · Observers · Faculty & team leads · EB & chairs · Other staff & organizers. The default is the first three.
- **NEW "Uses per person".** Number input, 1-20.
- **Footer.** Button "Add" (spinner while busy). Disabled with no name or no groups.
- **List row.** "{meal}", then "{day} · {window} · {venue}", then the audience label, e.g. "Delegates, Observers, Faculty & team leads", plus " · 2 each".

#### Transport route dialog: Modules → Transport → "Add Route"
- **Title.** "Add Transport Route".
- **Templates.** Airport Shuttle · Hotel → Venue · Venue → Hotel · Social Night · City Tour · Custom.
- **Fields:**
  - "Route Name" (placeholder "e.g. Hotel A → Venue")
  - "Pickup" / "Dropoff"
  - "Departure" (placeholder "08:00") / "Return" (placeholder "18:00")
  - "Capacity" (number)
- **Footer.** "Add".
- **Route card.** Name, a trash icon, "{pickup} → {dropoff} · {departure}", then "Capacity  {registered}/{capacity}" with a blue progress bar.
- **Note.** Ride boarding is scanned per route per day on Pro (see Scanner).

#### Dress code: Modules → Dress Code
- **Header button.** "Set Dress Code" (PlusCircle icon) when empty, otherwise "Edit" (SquarePen icon).
- **Dialog.** Title "Set Dress Code" or "Edit Dress Code".
  - Templates: Business Formal · Western Formal · National Dress · Smart Casual · Thematic Gala · Custom.
  - "Guidance": a textarea (placeholder "Describe the expected attire for delegates, chairs, and staff..."), with AI assist under it.
  - "Image URLs (one per line)": a textarea (placeholder "https://example.com/attire1.jpg").
  - Footer: "Save Dress Code" (check icon; spinner while saving).
- **View.** A green Shirt icon card holding the guidance text, then a 2/3/4-column grid of square images.
- **Empty.** "No dress code yet. Add one above."

#### ID Cards, QR option: `/tools/id-cards` (organizer)
- **New checkbox.** "Print each person's QR pass on their card".
  - Pro helper text: "The same code as My Pass on their phone. Resetting a pass makes its printed card stop working."
  - Free: the checkbox is disabled, the row is at 60% opacity, and the helper reads "Comes with a Pro event."
- **Template.** Modern / Classic / Bold.
- **Print for.** "Everyone (N)" / "Delegates (N)" / "Staff (N)". A skeleton shows while counts load.
- **Button.** "Download ID Cards (N)". Busy text "Building PDF…". Disabled when the count is 0.
- **Errors.** "Couldn't get the passes." / "Couldn't build the PDF. Please try again."
- **PDF faces.** See the table row.

#### Schedule empty state + Add dialog: `/schedule` (organizer and co-organizer)
- **Empty.** Clock icon, "No sessions yet", "Build your conference itinerary session by session.", and the button "Add first session".
- **Dialog title.** "Add to Schedule" (Sparkles icon).
- **Dialog description.** Two variants:
  - With an event date: "Start from a ready-made template (times auto-filled from your event date) or add a blank session to fill in yourself."
  - Without one: "Start from a ready-made template or add a blank session. Set your event date to have template times auto-filled."
- **Eyebrow.** "Start from a template".
- **Template cards:**
  - "Standard 2-Day MUN": "Opening, four committee sessions across two days, a social night, and closing."
  - "1-Day Conference": "A compact single-day itinerary: opening, two sessions, lunch, and awards."
  - "Opening Day": "Just the day-one arrival block — registration, opening, keynote, and intros."
  - Each card has a pill "{N} day(s) · {N} sessions", the line "Starts {HH:MM} · ends {HH:MM} on day {N}", and chips "{start} {title}" colored by type: Main Event = primary, Committee Session = blue, Break / Lunch = amber, Social Event = primary.
- **Then** an "Or" divider, then the dashed card "Add a custom session" ("Start with a blank row and set the title, type, location, and times yourself.").
- **Footer.** "Cancel".
- **Row fields.** "Session Title" (placeholder "e.g. Opening Ceremony"), "Type", "Location" (placeholder "e.g. Main Hall"), "Start Time" and "End Time" (datetime-local).

#### Rules: published state + import panes: `/rules` (organizer and co-organizer)
- **Page H1.** "Rules & Regulations".
- **Lede.** "Publish the conference rulebook — code of conduct, rules of procedure, awards and disciplinary policy. It's visible to every role: chairs, delegates and staff."
- **Loading.** "Loading rules & regulations…".
- **Published state.** A CheckCircle2 icon with "Published", then "Rules & Regulations guide · updated 3 hours ago", with an "Edit" button (Pencil icon) in the card header.
- **Editor tabs.** "Write" / "Upload .md" / "Import PDF".
  - Upload .md pane: "Click to upload a .md file" / "Markdown or plain text · max 2MB".
  - Import PDF pane: "Click to import a PDF", then "Extracting text…".
  - Pane errors: "Only .md or plain text files accepted.", "File must be under 2MB.", "Only PDF files accepted.", "PDF must be under 20MB.", "Failed to extract PDF text: …".
- **Buttons.** First time: "Publish Rules" (UploadCloud icon) only. When editing: "Cancel" (X icon) and "Update Rules".
- **Editor placeholder.** "# Rules & Regulations / ## Code of Conduct / ## Rules of Procedure / ## Awards & Recognition / ## Disciplinary Policy".

#### Announcements: Send Now, preview, empty: `/announcements`
- **Footer.** "Save Draft" (left) and "Send Now" (right, Send icon).
  - Over 50 recipients on a Free event: the ProGate card shows plus a disabled "Send Now".
  - Send Now is disabled without a subject and body. Save Draft is disabled without a subject.
- **Body label row.** "Email Body", with a toggle on the right reading "Preview email" (Eye icon) or "Edit" (Pencil icon). Preview replaces the editor with the rendered email (subject, event title, sender name, body).
- **Editor placeholder.** "Write your announcement… use the toolbar or Ctrl+B / Ctrl+I / Ctrl+U".
- **Schedule validation.** "Pick a date & time in the future." (amber).
- **Specific users.**
  - The label "Search Specific Users (overrides filters above)" over a search field.
  - A results list, empty text "No matching users found".
  - Selected chips, each with × (aria "Remove {name}").
  - Next to the count: "Estimated Recipients: N (specific users)".
- **Page busy.** "Sending emails…".
- **History empty.** "No announcements sent yet.".
- **History badges.** "Sent" (green), "Sending..." (blue, spinning clock), "Queued" (blue), "Failed" (red), "Partial Delivery" (amber), "Draft" (slate), "Scheduled · {date}" (primary).
- **Sheet:**
  - "Audience" block with "Roles:", "Committees:", "Payment:", "Recipients:", then "✓ N delivered" / "✗ N failed".
  - "Recipients (N)": a search box and rows (initial avatar, name, email, role badge). Empty texts: "No matching recipients found" / "The recipient list wasn't recorded for this announcement."
  - "Message": the rendered body, or "No content" in italic.

#### Plan: Request Pro form + extra states: `/plan` (owner)
- **Title badge.** "Free", "Pro", "Pro (early event)" or "Pro (approved)".
- **Feature rows.** Lock or Check icon for each of the six: "Live video", "AI without the daily limit", "Emails to more than 50 people", "Ornate Gold certificate", "Custom theme colour", "QR coupons, check-in and transport scans".
- **Request Pro form.** Opened by "Request Pro".
  - "Organization" (text, required) and "Website" (placeholder "https://…").
  - "Why": a textarea (placeholder "Your conference, its size and what you need…") with AI assist.
  - Buttons "Submit" (busy "Sending…") and "Cancel".
  - Error: "Couldn't send the request."
- **Notices:**
  - "The payment didn't go through. Nothing was charged."
  - "Still confirming the payment. Refresh in a minute."
  - Under-review title variant: "Request for more room under review".
- **Pro event.** No Upgrade card; every feature row checked.
- **Co-organizer view.** No Upgrade card.

#### Account Financials, desktop: `/dashboard/organizer/financials` (event owner)
- **Header.** "Financials & Ticketing" / "Track revenue, tickets, and payouts per event." The event Select sits on the right (placeholder "Select event").
- **No event.** "Select an event above."
- **Summary.** Three cards, same as the event page.
- **Tabs.** "Overview & Tiers" · "Payments" · "Wallet & Payouts".
- **Overview & Tiers tab.** "Role Tiers" grid. Empty: "No accepted roles configured for this event. Set them under the event's Allocation → Roles & Tiers."
- **Payments tab.** Columns Applicant / Tier / Amount / Date / Status. Empty: "No payments yet."
- **Wallet & Payouts tab:**
  - Explainer: "Registration fees are collected by the platform. Your balance below is every paid registration across your events, less each event's platform fee. Request a payout and an admin will transfer the funds to your account."
  - "Organizer Wallet" / "Balance across all your events."
  - "Payout History" / "Your payout requests and their status." Empty: "No payouts yet." (ArrowUpRight icon).
  - Badges Paid / Pending / Rejected.
  - "Request Payout" is disabled when the balance is 0.

#### Complaints, desktop + resolved: `/complaints` (organizer and co-organizer)
- **Eyebrow and header.** Eyebrow badge "Organizer Hub". Title "Complaint Escalations" / "Review and manage complaints escalated to your level."
- **Card title.** "Escalated Complaints" (AlertTriangle icon) with a red count badge. SegmentedTabs on the right: "Active" (count) and "Resolved" (count).
- **Item:**
  - A type badge in uppercase and a status badge (yellow, green or red), then the subject and the date.
  - "Description:" box.
  - "History" timeline: "{actorRole} ({action})", then the message.
- **Active actions:**
  - Textarea (placeholder "Enter resolution or reason for escalation/rejection...") with AI assist.
  - "Resolve" (green), "Escalate to Main Org" (or "Escalate to Admin" when the organizer is the assignee), "Reject".
- **Resolved tab.** No actions. A green banner "Resolution: {text}".
- **Empty.** "No active complaints found." / "No resolved complaints found."

#### Role tier card, sold-out + capacity states: Financials › Role Tiers (event and account pages)
- Card: title = tier name; price top-right ("Free" when 0, else "{price} {currency}").
- Row "Tickets Sold" → "{sold} / {capacity}" + progress bar when the tier has a cap; just "{sold}" without one.
- Footer row "Revenue" → "{sold × price} {currency}".
- Sold-out variant (sold ≥ capacity): amber border + light amber fill, amber progress bar, corner ribbon "SOLD OUT".

## 7. App Admin

#### Profile menu, App Admin variant
- Opens from: the avatar / user card. Seen by: App Admin.
- Label: "My Account"
- Items: "Admin Dashboard" (→ /dashboard/admin), "System Settings" (→ /dashboard/admin/settings), separator, "Sign out" (destructive red)
- No "Settings" or "Support" in this variant.

#### Delete account prompt (member detail)
- Route: /dashboard/admin/users/[uid]. Seen by: App Admin. A native `prompt()` with a text field.
- Text: "Delete {name or email}'s account for good? Type a reason to confirm."
- Cancelling or leaving it empty does nothing. On success the page goes to /dashboard/admin/users.
- Server errors shown in the page message line: "You can't do this to your own account.", "This is an App Admin. Change their role first.", "User not found."
- Account card copy (the board has a placeholder): title "Account", description "Disabling signs them out within the hour and blocks sign-in. Deleting removes the login and profile; their applications stay as history."
- Buttons: "Disable account" (outline) ↔ "Enable account" (outline, when disabled), "Delete account" (destructive)
- Header badges: role (outline) and "Disabled" (destructive) when disabled; a verified tick icon after the name when the member has the Verified organizer badge
- Messages: "Saved.", "Account disabled.", "Account enabled."; Save busy "Saving…"; empty lists "None."

#### Upgrade request review dialog (PlanEditorDialog, request mode)
- Route: /dashboard/admin/applications → "Review". Seen by: App Admin.
- Title: "Pro request" (kind pro) or "More room request" (kind quota). Description: event title (or id)
- Request summary box (secondary bg): "Organization: {orgName}", "Website: {website}", "Wants: {n} participants, {n} committees, {n} events", then the organizer's message (pre-wrap)
- Body is the same as the plan editor: tier segmented "Free" / "Custom" / "Pro"; "Participants" + "Committees" number inputs (placeholder "Free default" on Free, else "Unlimited") each with an "Unlimited" switch; "Features" switches: "Live video", "AI without the daily limit", "Emails to more than 50 people", "Ornate Gold certificate", "Custom theme colour", "QR coupons, check-in and transport scans"; "Platform fee (%)" (placeholder "Tier default"); "Owner's Free events at once" (placeholder "Default")
- Pro request opens preselected on Custom with all features on and unlimited participants and committees. A quota request pre-fills the wanted numbers.
- Extra field: "Note to the organizer (optional)" (textarea, 2 rows)
- Footer: "Decline" (outline), "Approve with this plan" (busy "Saving…")
- Notification sent to the organizer (bell): titles "Your event is Pro" / "More room approved" / "Upgrade request declined"; default bodies "New limits are live on {event}." / "The MUN Pilot team declined this request."
- Loading: centred spinner; error line (e.g. "Couldn't load the event.", "Couldn't save.")

#### Plan editor additions (direct mode, AD01)
- Add the 6th feature switch: "QR coupons, check-in and transport scans"
- Pro tier state: when "Pro" is selected, the Participants/Committees and Features blocks are hidden; only "Platform fee (%)" and "Owner's Free events at once" remain
- Footer: only "Save plan" (busy "Saving…"); there is no Cancel button (close via the dialog X)

#### Test allocation page (redraw as a page, not a dialog)
- Route: /dashboard/admin/events/[id]/test-allocate. Seen by: App Admin (from Events row menu "Test allocation").
- Back link "Events" (arrow-left); h1 "Test allocation"; lede "Place a user straight into a committee and country for testing. Event {eventId}."
- Card (amber): title "Dev Allocate — Delegates", badge "dev test only"; description "Force a committee + country onto any applicant or registered user and mark them approved. Bypasses the normal review flow AND the registration fee (stamped devPaid), so the delegate lands straight in the portal. This panel is temporary and will be removed before production."
- Search input placeholder "Search by name or email"
- Row: name, status badge (outline, e.g. approved/pending), role badge (secondary), "no account yet" (red outline, staff with no account → Allocate disabled), email line
- Selects: "Committee" placeholder; "Country" placeholder (flag + name; disabled until a committee is picked)
- Button "Allocate" (amber) → spinner → "Allocated" with a check
- Empty: "No delegates found." Loading: 3 skeleton rows. Failure: alert "Failed to allocate. See console."

#### Applications page header + table details
- h1 "Applications"; lede "Review organizer applications and event upgrade requests."
- Upgrade requests card description: "Pro for an event, or more Free room. Approve sets that event's plan: its limits, features and fee."
- Upgrade row sub-line: "{organizerName} · {orgName}"; Asks-for pill (amber): "Pro" or e.g. "200 participants, 5 committees" (falls back to "More room")
- Recent decisions description: "The last decided upgrade requests and organizer applications."
- Upgrade decision row: "{event} · Pro" or "{event} · More room"; sub "{organizer} · {adminNote}"; badge "Approved" / "Declined"
- Organizer decision row: "Organizer · {name}"; sub "{organization}"; badge "Approved" / "Rejected"
- Organizer buttons: "Approve" (green outline, check icon), "Reject" (red outline, x icon). In code, Approve comes before Reject.

#### Event Payments dialog (Plans & revenue)
- Title "Payments"; description "{event}. A refund here only records it: send the money back in Stripe or ZiniPay first."
- Input placeholder "Refund note to the delegate (optional)"
- Row: "{name} · ${amount}"; meta "{role} · {provider} · developer mode · {date}"; refund note line under refunded rows
- Action: "Refund" (outline, spinner while busy) or badge "Refunded"
- Confirm (native): "Record a refund of ${amount} for {name}? Send the money back in the gateway first."
- Empty: "No paid registrations."

#### Payments page: missing copy and states
- Payment Mode description: "Picks which gateway every registration fee is collected through, platform-wide. API keys are never editable here — they live in server environment variables (STRIPE_SECRET_KEY, ZINIPAY_API_KEY). A mode with missing keys can't be used; checkout falls back to whichever gateway is configured."
- Loading: "Checking gateways…"
- Fallback banner: "Selected mode isn't usable" + "{requested} has no credentials, so checkout is running on {active}."
- ZiniPay-only block (shows only when ZiniPay is the selected card): "Amount multiplier" (number, min 0.0001, step 0.01) hint "Role-tier price × this = the amount charged. Leave at 1 if tier prices are already in {BDT}; set it to the conversion rate if they aren't."; "Charge currency" (placeholder "BDT") hint "Label recorded on paid registrations. ZiniPay settles in BDT."
- Developer-mode callout (amber, shows when Developer is selected): "Developer mode collects no money — every registration is marked paid on click. It is ignored unless ALLOW_DEV_PAYMENTS=true and the Stripe key is not a live key."
- Save button busy: spinner only; success "Saved — live within a minute"
- Stripe card description "Single platform account. Keys are server-only."; ready → "Ready end to end" + "Key mode: {mode}."; not ready → "Not fully configured" + "Set the missing environment variables, then redeploy."; chips "Secret Key" / "Webhook Secret" / "Publishable Key" each "Set" or "Missing"; "Publishable key: {pk_…}"
- ZiniPay card description "Hosted invoice; every payment is re-verified server-side."; ready → "Ready end to end" + "Key mode: {mode}."; not ready → "API key missing" + "Set ZINIPAY_API_KEY in .env.local, then redeploy."; chip "API Key (ZINIPAY_API_KEY)"; sandbox "Sandbox key detected — no real money moves."; footnote "ZiniPay rejects a redirect URL whose domain doesn't match the brand's registered website, so NEXT_PUBLIC_APP_URL must be the deployed origin."
- Payouts description: "Review and fulfill payout requests, then mark them paid."
- Processed payout row: badge "Paid" (green, check) or "Rejected" (slate, clock); line "Ref {reference} · {adminNote}"
- Pending-row inputs: placeholders "Transaction reference", "Note to the organizer"; Mark Paid busy = spinner

#### Complaints: variants
- Level-3 subtitle: "Review critical complaints that require App Admin intervention."
- Scope buttons: "Level 3 queue", "All complaints"
- All-complaints title "All Complaints"; subtitle "The newest 100 complaints on the platform, at any level."; each card gets a "Level {n}" badge
- Inner card header: "Admin Escalation Queue" (alert icon) + red count badge; tabs "Active" / "Resolved" with counts
- Card: type badge (uppercase), status badge (open/escalated/under_review/pending/resolved/rejected), subject, date, "Description:" block, "View Full Trail"
- Active-only: textarea "Enter final resolution or rejection reason...", AI "Writing help", "Reassign to (member email)" + "Reassign", "Final Resolve" (green), "Final Reject" (red outline)
- Resolved card: no action area; green box "Final Resolution: {text}"
- Empty: "No active level-3 complaints found." / "No resolved complaints found." (pattern "No {tab} {level-3 }complaints found.")
- Full Escalation Trail rows: bold actorRole (e.g. "appAdmin"), grey action chip (e.g. "reassigned", "escalated"), message (e.g. "Assigned to {name} by App Admin."), timestamp (locale date-time)

#### Audit log action filter (select options)
- "All Actions", "Role Changed", "Event Deleted", "Organizer Approved", "Organizer Rejected", "Settings Updated", "Complaint Resolved", "Complaint Escalated", "Session Observed", "Session Force-Stopped", "Session Reset", "Payment Mode Changed", "Payout Paid", "Payout Rejected", "Event Plan Set", "Upgrade Request Decided", "Event Published / Drafted", "Payment Refunded", "Member Plan Settings", "Member Disabled", "Member Enabled", "Member Deleted", "Complaint Reassigned", "Complaint Rejected"
- Timestamp format "MMM d, HH:mm:ss"; Refresh shows only when Live Monitoring is off; Load More busy spinner

#### Live Sessions: error banner + confirms
- Banner (amber): one of "Firestore read quota exhausted — showing the last snapshot." / "Firestore daily read quota exhausted. Resets at midnight US/Pacific." / "{server error}" / "Failed to load sessions"; sub-line "Auto-refresh paused. Use Refresh to retry."
- Count line: "{n} running · auto-refreshes every 60s while this tab is open"
- Force-stop confirm: "Force-stop “{committee}” in {event}?" + "Controls lock and everyone's live video ends immediately." Failure alert "Failed to stop the session."
- Reset confirm: "Reset “{committee}” ({date}) in {event}?" + "Test tool: every motion, point, request, vote, roll call, speakers list and the day's markings for this sitting are permanently deleted." Failure alert "Failed to reset the session."
- Observe disabled variant tooltip: "This session has no committee/date on record"

#### Tools: broadcast confirm + details
- Confirm (native): "Send this notification to {who}?" where who = "EVERY member" / "every event owner" / "the members of event {id}"
- Event ID placeholder: "From Admin → Events"
- Title (max 120) and Message (textarea, 3 rows, max 600): no counters in code
- Send disabled until Title + Message (+ Event ID for One event) are filled; busy spinner
- Result line: "Sent to {n} person/people."; errors "Title and message are required.", "audience must be all, organizers, or event (with eventId).", "Couldn't send."
- Android app description: "The version phones update to. Releases are published with android-native/tools/release.mjs."; loading "Loading…"; row "{versionName}" badge + "build {code} · {date}"; notes as bullets
- Scheduled jobs (code lines):
  - "/api/cron/close-stale-sittings · daily: closes sittings left open."
  - "/api/cron/scheduled-announcements · every 15 min: sends announcements whose time has come."
  - "/api/cron/waitlist-offers · hourly: expires 48-hour seat offers and offers the next in line."
  - "/api/cron/complaint-sla · every 6 hours: escalates complaints with no action for 48 hours."

#### Moderation: rows per tab + Comments dialog
- Tabs: "articles", "ratings", "recommendations", "endorsements" (capitalised buttons)
- Filter placeholder: "Author uid (optional)" (articles) / "Member uid (optional)" (others); button "Show"; caption "Newest 50." or "This member's, newest first."
- Articles row: "{title}" + badge "Hidden" (red) / "Published" / "Draft"; meta "{author} · {date}"; buttons "Comments", "Unpublish" (not when hidden), "Delete" (destructive)
- Ratings row: "{from} gave {n}★ to {uid} · {date}"; only "Delete"
- Recommendations row: "{from} → {uid}" + status badge (e.g. visible/hidden); text below; "Hide" (unless hidden) + "Delete"
- Endorsements row: "{from} endorsed {uid} for {skill} · {date}"; only "Delete"
- Confirms (native): "Unpublish this article?", "Delete this article?", "Delete this rating?", "Hide this recommendation?", "Delete this recommendation?", "Delete this endorsement?", "Delete this comment?"
- Comments dialog: title "Comments"; description = article title; rows author (bold) + text + "Delete" (destructive); empty "No comments."; loading skeleton
- Empty list "Nothing here."; error line

#### Settings: tab copy
- General card: title "General Configuration", description "Basic settings for the platform."; "Support Email" placeholder "support@example.com"; hint "Where "Support" in everyone's profile menu sends them."; "Save Changes"
- Pricing card description "Configure platform fees and hard limits."; under slider: "The fee above is the Free events' cut of ticket revenue, taken off the organizer's wallet."; hints: Pro price "Paid upfront to make one event Pro."; Pro fee "Taken off Pro events' ticket revenue."; Free participants "Approved delegates, observers and advisors (staff don't count)."; Free published events "Upcoming or running Free events per organizer."; AI uses "AI inside a Pro event doesn't count." (committees has no hint)
- Maintenance card: red title "Maintenance Mode" (shield icon), description "Affects all non-admin users immediately."; red-tinted switch row "Enable Maintenance Mode" + "Locks out regular users and displays the maintenance message."; textarea label "Maintenance Message" (3 rows); button "Save Maintenance Settings" (red when mode is on)
- Repair card description: "Moves chair marks that an earlier version stored under the wrong field back into the scores delegates and results read. Feedback overwritten by that version cannot be recovered. Safe to run more than once."; button "Run repair" / "Repairing…"; progress "{n} records checked, {m} repaired…" → "… repaired. Done."; error "Repair failed ({status})"
- Membership card description: "Writes the membership record each conference's live sessions and papers are checked against (organizer, accepted staff, approved applicants). Run it before the live read rules are deployed, and any time to reconcile. Safe to run more than once."; button "Build membership" / "Building…"; progress "{n} events, {m} members…" → ". Done."; error "Backfill failed ({status})"
- Header indicators: "Saved" (green check), "Saving..." (spinner)

---

# Questions and code issues found during the audit

Not design gaps; listed so they are not lost. Nothing here was changed.

## 1. Public & Auth

- **FIXED 2026-11-02** (login now honours same-site `?redirect=`; the proxy also adds it when bouncing signed-out users). Original note: Login ignores `?redirect=`: the detail rail and the apply page send `/login?redirect=/events/<id>[/apply]` (src/app/events/[eventId]/page.tsx:689, src/app/events/[eventId]/apply/page.tsx:27), but login always goes to /dashboard or /onboarding (src/app/login/page.tsx:45-48, 74). Should the board show a "Log in to continue applying to <event>" context line?
- Login/signup show Firebase's raw `err.message` (e.g. "Firebase: Error (auth/invalid-credential).") and fall back to "Failed to login" only when that message is empty. Board AU01 implies friendly copy; only forgot-password maps codes today.
- The footer "Refunds" link goes to `/terms#refunds`, but no element has that id (the Terms section id is `payments`, src/app/terms/page.tsx:60).
- The contact form has no backend. Submit just flips `sent` for 4.5s (src/app/contact/page.tsx:103-109), so the board's "Send message" flow is cosmetic.
- The wizard fee note always says "secure Stripe checkout" (ApplicationWizard.tsx:706-707), even when the App Admin selected ZiniPay.
- Things the board has that code doesn't (design additions, not gaps; confirm intended): P02 on-page masthead search and the "Host a conference" empty-state button; P01 footer "Get the app", Light/Dark toggle, "Back to top", "Next conferences" / "From the handbook" lists; P03 phone section tabs + sticky apply bar; AU01 "One account for every role" card; "Help me write" label (code: "AI" chip).
- No public QR-pass page exists (no verify/lookup route under src/app outside /api/passes/* and the organizer `/dashboard/organizer/events/[id]/passes`). Nothing to board in this section.
- `/download/android` (src/app/download/android/route.ts) is a redirect with no UI; on failure it returns raw JSON `{"error":"No release published"}` (503). If the footer's "Get the app" links there, a friendly "no build yet" page may be needed.
- No global toast system, cookie/consent banner, or `error.tsx` exists; errors go through `window.alert`. The board's Main should define a toast/inline-error pattern if alerts are to be replaced.
- Owner/admin can open their own unpublished event page with no "Draft / not published" indicator (src/app/events/[eventId]/page.tsx:145-146). Add a preview banner?
- Brand strings in code are mixed: "MUN PRO" (header, footer, /events lede, home sub) and "MUN Platform" (auth brand panels, onboarding H1, `<title>` in src/app/layout.tsx:58). The boards use "MUN Pilot" throughout. Treated as rebrand, not gaps.

## 2. General dashboard

- **FIXED 2026-11-02** (banner added; see the new MISSING row and "Payment cancelled banner" spec). Original note: The payment cancel URL is `/dashboard/conferences?payment=cancelled` (src/app/api/payments/checkout/route.ts:57). The conferences page never reads it, so a cancelled checkout shows nothing. Should a "Payment cancelled" banner be designed?
- **FIXED 2026-11-02** (now goes to `/dashboard/conferences?tab=browse`). Original note: The network Discover empty CTA goes to `/dashboard/events` (src/app/dashboard/network/page.tsx:324). That route does not exist, so the link is dead.
- The ChatWindow ⋮ button has no handler (src/components/dashboard/ChatWindow.tsx:176-178). Should it be drawn with real items (block, mute, view profile) or dropped?
- ProfileView's non-owner branches (Rate / Message, src/components/features/profile/ProfileView.tsx:322-338) are unreachable. The only consumer passes `editable` (src/app/dashboard/settings/page.tsx:478); other people use PublicProfileView.
- Achievements: a filter pill with no matching awards renders an empty grid with no message (src/app/dashboard/achievements/page.tsx:144-192). Does this need an empty state?

## 3. Conference portal (delegate / faculty / observer)

1. **Rejected/withdrawn applicants get the full portal** (paymentGate.ts:92 marks dead apps `refunded`, so the gate never blocks, and page.tsx has no status gate). Is that intended, or should a "not accepted" state be designed?
2. **Waitlisted applicant on a paid event:** `status: waitlisted` and unpaid means the payment gate blocks the portal, so the Overview waitlist seat-offer card is unreachable. Should the gate show the offer?
3. **Phone access to committee chat and members:** CP01 says chat and members move behind Messages on phones. In code the right rail is `hidden xl:block` (PortalRightRail.tsx:24), and Messages opens the general DM messenger. So under 1280px, committee chat and members are unreachable. Is this a build gap or a board proposal?
4. **Dead code:** `FacultyAdvisorPortal.tsx` and `TeamDelegationSection.tsx` are never imported, and `ProGate` is imported but unused in page.tsx:29. I excluded them from the table.
5. **Bug, not a board gap:** DelegateConferenceSidebar defaults `activeTab` to "documents" (Sidebar.tsx:412) while the page defaults to "overview". With no `?tab`, the rail highlights Documents.
6. **Paper part FIXED 2026-11-02** (checks `positionPaperContent` too; CP05 already draws Submitted / Missing, so no board change). Score "x/100" format still open. Original note: FacultyAdvisorPanel "Paper" checks `positionPaperUrl` (FacultyAdvisorPanel.tsx:206), but papers are stored as `positionPaperContent`, so it always shows "Missing". Score shows `finalScore/100`, not %. CP05 copies that "x/100" format.
7. **Out of scope here:** `DelegateMarkingDetail.tsx` is not shown to delegates (chair page + live MarkingPanel only). PassCard is also rendered on the chair committee page (`src/app/dashboard/chair/committee/[id]/page.tsx:59`); that belongs to the chair section.
8. **Not delegate-facing:** delegates have no self-redeem, scan or ID-card QR. Meals, coupons, check-in and boarding are scanned by staff. A delegate sees them only as row states inside My Pass, plus "Used at…" on Food cards.

## 4. Chair & Executive Board

- In HUB, the state `awardsDialogOpen`, `notifDialogOpen` and `studyGuideDialogOpen` (HUB:127, 144, 147) is set but never rendered. It's dead code from the old dialog-based hub, so there's nothing to draw.
- Position Paper Viewer has no read-only mode. A viewer who opens it via "View" still sees an editable Status/Score/Feedback form and "Save Grade" (PositionPaperViewer.tsx:142-176). Firestore rules decide the outcome. Should the board draw a read-only viewer, or is this a bug?
- Some board copy isn't in code: CH04 Room Alert "Preview" block, CH04 "Publishing emails your delegates and sends them a room alert.", and CH03 escalated card "With the organizer — no action needed here.". Treat these as proposed additions or drop them?
- The brief mentions "committee docs" in the hub, but the hub has no Committee Docs tab. Chairs review committee docs only in /dashboard/documents (CommitteeDocsChair). Intended?
- The Study Guide "Delete" button (HUB:1500) has no confirmation dialog.

## 5. Organizer 1: home, events, create, overview, details, committees, partners, allocation, staff

- `ExecutiveBoardAssigner.tsx` is imported nowhere. Dead code, so it has no row.
- `CapacityCard` has an "Add More Seats" input + "Add" button, but capacity/page.tsx never passes `onAddSeats`, so it can't be reached. Should it be drawn?
- /events/[id]/staff, /countries and /capacity are standalone routes with no sidebar link (reachable only as Allocation tabs). /applications just redirects to /allocation. Treated as the same UI.
- No co-organizer-specific UI exists on these pages beyond the events-list "Co-organizer" pill and the sidebars. Delete/financial limits are enforced elsewhere (rules / Financials).
- Free-plan locks on these pages: the publish cap (drawn), the committee cap (drawn), and the participant seat cap. The seat cap shows only as an alert when an approval fails. No seat counter is shown on Overview/Allocation; the "{approved} of {cap} participants" counter is on the Plan page, which is the other section.

## 6. Organizer 2: schedule, announcements, rules, modules, complaints, tools, money, plan, QR passes

- **Tools hub has no link.** `EV/tools/page.tsx` is drawn on OR06, but no sidebar or nav links to `/tools`; the sidebar links each tool directly. Keep it as a page, or drop it from the redesign?
- **Dead "Live MUN" tab.** The modules page has a "Live MUN" tab (`EV/modules/page.tsx:612-674`: "Live Sessions", "Add Live Session", "Go Live"/"Stop"), but `tabKeys` (:346) filters it out, so it can never render. It is out of scope (Live MUN) and should be removed, not drawn.
- **Native browser dialogs.** Results "Revise" uses `window.prompt('Revision notes for the chair:')`, coupon delete uses `confirm()`, and Schedule save uses `alert()`. Should the redesign draw real dialogs and toasts for these?
- **Scanner sidebar.** The scanner route renders with the *standard* sidebar. Should the redesign give it the event sidebar, or a chrome-less, phone-first scanner layout? The page is clearly used on phones at a counter.
- **Pro page list is out of date.** The Pro page "Pro" list (`pro/page.tsx:35-44`) does not mention QR coupons, check-in or transport, though the plan feature does. This is code drift, not a board gap. Should the board add it?
- **`/organizer/pro/apply`.** It is a server redirect to `/organizer/pro` and has no UI, so I left it out of the table.

## 7. App Admin

- Test allocation: the board treats it as a dialog, but the code is a full page. The panel also calls itself "temporary and will be removed before production". Should it still get a board?
- Member detail (AD01) and Users are drawn only as phone frames. Is that enough, or do they need desktop frames too?
- Should native `confirm()` / `prompt()` / `alert()` calls (delete account, force stop, reset, broadcast, refund, moderation) be redesigned as real dialogs? The other boards draw them as dialogs.
- Live Sessions list: INVENTORY marked it "optional; ask the user", and AD03 draws it anyway. Treated as in scope.
- QR passes: the only admin UI is the "QR coupons, check-in and transport scans" switch in the plan editor. There is no admin pass report or pass management screen.
