# General dashboard facts (from code, 2026-10-31)

## Shell
- **Sidebar:** 256px wide, 76px collapsed.
  - Collapsed: labels hidden, badges become dots, section labels become hairlines.
  - Menu: Dashboard, My Conferences, Documents, My Blogs, Achievements, Network, Payments, Settings.
  - Role sections:
    - "Executive Board" › EB Dashboard
    - "Chair Tools" › Chair Dashboard
    - "Read-only Access" › Observer Dashboard
    - "Organizer Tools" (or "Co-organizer") › Manage Events
  - UserCard: bell, plus a pill (avatar, name, email) that opens the profile menu.
- **ProfileMenu:** "My Account", Settings, Support (dead link), Sign out. Admin sees Admin Dashboard and System Settings instead.
- **Mobile header:** hamburger opens a sheet with nav and "Log out"; bell; avatar.
- **Notification bell:**
  - Panel: "Notifications" with "{n} new"; empty state "No new notifications"; error "Action failed. Check your access and try again."
  - Stacked sections:
    - **"Updates (n)":** "Mark all read"; each item is icon, title, body, time.
    - **"Invitations (n)":** "You are invited to join **X** as a {role}." with Reject / Accept. Role change: "Your role in **X** has been updated to {role}. Accept to apply the change." with Decline / Accept.
    - **"Room Alerts (n)":** "{event} — {committee}" with an Info / Warning / Urgent pill, message, time.
- **Floating message button:**
  - 56px bubble with unread badge. Hidden on /messages and for admins.
  - Panel 384×500 with three states:
    - **List:** "Messages", "+" (new chat), "Search chats...". Rows: online dot, name, time, last message or "No messages", unread count. Empty: "No conversations found."
    - **Chat:** back button, name, "Active now" / "Offline". Bubbles with h:mm a times. Ticks: clock, check, blue double-check. Input "Type message...". Empty: "No messages yet. Say hello!"
    - **New chat:** "New Message", "Search users...", rows show name and role, "Connecting...".

## /dashboard
- **Hero:** eyebrow is the role ("Delegate"). "Welcome back, {first}" / "Here's what's happening with your MUN journey today."
- **Buttons:** "Become an Organizer" (or "Organizer Dashboard" / "Co-organizer Events"), plus primary "Explore".
- **Stat cards:**
  - "My Conferences": "{a} Active · {p} Past"
  - "Position Papers": "Submissions Track"
  - "Achievements": "Recognition & Awards"
- **"Recent activity":**
  - Pills: All / Following / Mine.
  - Item: name, role pill, action, **target**, time or "just now".
  - "Load more".
  - Empty: "No recent activity yet. Apply to a conference to get started!"
  - Only "submitted an application for" is written today.
- **"Recommended":** 48px cover, title, when. Empty: "No new recommendations yet." Button: "Browse all conferences".
- **Promo:** "Become an organiser" / "Host your own Model UN conference — create events, manage delegates, and run committees." / "Get started".
- **Error:** "Oops! Something went wrong" + "Retry".

## /conferences
- **Header:** eyebrow "My conferences", title "Conferences", lede "Manage your applications or discover new events.", button "Organizer".
- **Tabs:** My Conferences (n) / Browse (n).
- **Filter:** All Roles / Delegate / Chair / Observer / Head Delegate.
- **Sort:** Newest First / Oldest First / Status. Count: "{n} applications".
- **Sections:** "Active & Pending" and "Past Conferences", each with its own empty state.
- **ConferenceCard:**
  - Status pills: Approved, Pending, Waitlisted/Rejected, Waitlisted, Active, Withdrawn, Completed, Payment Required, Payment Overdue.
  - Tiles: "Role & Committee", "Assigned Country" / "Pending Assignment".
  - Unpaid block: "{tier} fee — registration is not confirmed until this is paid", amount, "Pay by", note, "Portal Locked" + "Pay $X".
  - Tracker: Applied / Under Review / Decision.
  - Buttons: "View Details" + "Go to Portal". Hover "Withdraw" (with confirm).
- **EventBrowseCard:** format stamp, date/location (or "TBA"), "{n} Committees", "View & Apply" / "Already Applied".

## /documents
- One card per approved conference, with a pill sub-tab bar.
- Delegate tabs: Position Paper, Study Guide, Committee Docs, Rules & Regs.
- Chair/EB tabs: Study Guide editor, Committee Docs review, Position Papers link, Rules.
- Observer tabs: viewers only. Organizer tab: "Manage" link.
- **Paper:**
  - Banners: "Under review by the Chairs" / "Position paper approved" / "Revision requested" / "Plagiarism concern flagged".
  - Modes: Write / Upload .md (2MB) / Import PDF (20MB).
  - Buttons: "Submit Paper" / "Update Paper".
- **Committee Docs:**
  - Type: Working Paper / Draft Resolution / Amendment. Title "e.g. Working Paper 1.1".
  - Sponsors and signatories chips: "Each marked delegation gets 90s to accept…".
  - Row pills: Collecting endorsements / Submitted / Approved / Rejected, with countdown.
  - Buttons: Open, Convert to Resolution, Edit, Trash, View.
  - Chair review: note, then Approve / Request revision / Reject.

## /articles (My Blogs)
- **Header:** "My Blogs", "{n} blogs · {n} published", "Write New Blog".
- **Tabs:** Published / Drafts.
- **Card:** cover, category, Draft pill, excerpt, "{n} min · {ago}", Edit / Eye / Trash.
- **Delete:** "Delete Blog".
- **Editor:**
  - Title.
  - Excerpt (n/200, AI).
  - Content (rich text, AI).
  - "Blog Settings" panel: Cover, Category, Tags (#chips), "Publish Blog" / "Save as Draft".

## /achievements
- Tiles: Total, Best Delegate, Outstanding, Honorable, Verbal Mention.
- Filter pills.
- Card: award pill, committee, event, "Score: n/100", "Certificate".
- Empty: "No awards yet".

## /network
- Chips: connections / to discover.
- Tabs: Discover / Connections (n) / Blocked (n).
- Discover: "People You May Know"; Connect / Message / Visit.
- Connections: groups "From Conferences" ("Met via conference") and "Manually Connected"; Message / Visit / Disconnect / Block.
- Blocked: shows the raw uid (bug); Unblock.
- Dialogs: Disconnect / Block / Unblock.

## /messages
- **Sidebar:** "Messages", New message, New group, "Search conversations..."; online dot; unread count. Hidden on mobile (bug).
- **Dialogs:** "New Message"; "Create Group" (name, search, checkboxes, "{n} selected").
- **Chat window:**
  - Header: Online / Active {ago} / Offline; ⋮ menu is dead.
  - Messages: sender names, system pills, ticks; scroll up loads more; text only.
  - Empty: "Select a conversation".

## /payments
- **Header:** "Payment History", "Registration fees across all conferences."
- **Success banner:** "Payment successful. It may take a few seconds to appear below while the payment provider confirms it."
- **Tiles:** Total Spent, Pending, Refunded.
- **"Transactions" table:** Event (with role), Date, Tier, Amount ("Free"), Status (Paid / Pending / Refunded), Receipt ("Pay Now" or printer). Highlighted row.
- **Receipt:** No. #, Status, Applicant, Role, Event Date, Issued, Total Paid.

## /settings
- **Nav:** Profile (n%), Appearance, Notifications, Privacy, Security.
- **Profile:**
  - Own profile view, edited inline.
  - Account card: First, Last, Email (locked).
  - Personal card: DOB, Dietary (None / Vegetarian / Vegan / Halal / Kosher).
  - Professional card: Occupation (Student / Professional / Other), Institution, Field.
  - Billing card: Invoice Type, Street, City, Postal, State, Country.
  - Each card has a filled/total pill. Sticky "Save Profile".
- **Appearance:** Light / Dark cards; "Your preference is saved on this device."
- **Notifications:** email-only note; toggles Application Approved / Rejected / New Events / Push; "Save Preferences".
- **Privacy:** Public Profile, Application History, MUN Stats, "Email & phone: only my connections"; "Save Privacy".
- **Security:** Current / New / Confirm; "Update Password".
- **SaveBar states:** Saving… / Saved! / "Failed. Try again."

## Profile
- **Own:**
  - Profile strength (Beginner → All-Star) with "Next:" hint; Change cover / Change photo.
  - Inline-edit fields: name, headline, city/country, nationality, phone, bio (AI).
  - Open-to switch; MUN Stats "Show publicly".
  - Experience / Awards / Education dialogs.
  - Recent Activity; Contact; socials (Instagram / LinkedIn / TikTok).
- **Others** (main + 312px rail):
  - Hero: "OPEN TO DELEGATE" ring, verified badge.
  - Meta: role, stars, location, nationality, Contact info, connections.
  - Actions: Message, Connect, Rate. Institution.
  - Sections: open-to banner, Stats, About + skills, Experience, Honors ("MUN result · verified"), Education, Skills (Endorse), Recommendations (Received / Given; Recommend), Contact tiles.
  - Rail: People you may know, Suggested conferences.
- **Dialogs:** Rate (5 stars) / Recommend (relationship + text with AI) / Experience / Education / Honors.
