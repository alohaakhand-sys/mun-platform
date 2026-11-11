# Conference portal facts (2026-11-01)

## Shell
- **TopBar (h64):**
  - Hamburger on mobile.
  - "M" logo linking to /dashboard; event title.
  - "Live MUN" button with ping dot (Radio icon on small screens).
  - Messages toggle, bell, avatar.
- **LeftRail (w240):**
  - "Back to Home"; section "Conference Portal".
  - Items: Overview, Documents, Announcements (badge), Schedule, Requests.
  - Optional modules: Food, Transport, Accommodation, Dress Code.
  - Then: Session Report, Certificates, Results.
  - Faculty sees only "Faculty Panel".
- **RightRail (w320, xl+):**
  - **Committee Chat:**
    - Header shows the committee id.
    - Others' messages carry a flag button that reveals "name · country" and a profile link.
    - Composer placeholder "Message committee…".
    - No committee: "Your committee chat appears here once you're seated in a committee."
    - Empty: "No messages yet. Say hello to your committee 👋"
  - **Members · n:**
    - Grouped by committee: own committee first, chairs on top, "Unassigned" last.
    - Row: avatar, name "(You)", flag + country or role, hover Message button.
    - "View all" opens the "People · n" dialog:
      - Search "Search people by name, role, committee or country…"
      - Sections: Organizers / Executive Board / per committee / Observers & Faculty.
      - Tiles in 4 columns.
      - Empty: "No people match your search."

## Overview
- **Hero:**
  - Pills: status, role, Team.
  - Title, description; date and location.
  - RoomNotifications button "Room Alerts" with a 9+ badge. Dropdown "Room Notifications" (Info/Warning/Urgent, time). Toasts for 5s.
- **Tiles:** Committee; Country (flag, or "Pending Assignment").
- **Waitlist offer:**
  - "A seat has opened up in {c}!"
  - "Accept within ~{h}h to claim it, or it passes to the next person."
  - Buttons: Decline / Accept Seat.
- **CeremonyLiveBanner:**
  - Title with a red "Live" chip.
  - "The organizer is hosting right now. Join to watch."
  - Button "Join ceremony".
- **Live MUN card:**
  - "Follow your committee in session live — speakers list, caucuses and voting, in real time."
  - Button "Launch Live MUN".
- **LiveGateDialog:**
  - **Not started:** "Live MUN hasn't opened yet" / "The organizer hasn't opened Live MUN for {X} yet. This unlocks the moment they do."
  - **Ceremony only:** "Committee sessions aren't open yet" / "{label} is live right now. Committee sessions open after it." Button "Join Opening Ceremony".
  - **Committee not open:**
    - "{c} isn't in session yet" / "Your chair hasn't gavelled in the sitting for {date}. This opens by itself the moment they do."
    - Waiting line "Watching for your chair…"
    - Then: "Your chair just opened the session" / "The sitting is live now — you can go straight in." Button "Enter Live MUN".
  - Optional organizer note. Footer Close + CTA.
- **TeamDelegationPanel:**
  - Name (or "My Team"), "Team Head" badge, "Add Member" (mocked).
  - Stats: "Team Average Score x/100" (head only); "Position Papers s/n" with a bar.
  - Table: Member, Committee, Country (or "Pending"), Payment (mocked), Score (head only; "Not graded").

## Documents tab
- Sub-tabs: Position Paper / Study Guide / Rules & Regs (same components as /documents).

## Announcements
- Unread dot; subject; relative time ("Recently"); markdown body inline. No detail view.
- Empty: "No announcements yet" / "Organizer announcements will appear here."

## Schedule
- "Conference Schedule" / "Timeline and locations for {title}."
- Vertical timeline; no day grouping.
- Type icons: break = coffee (orange), session = users (blue), social = party, default = mic.
- Item: title, "{start} – {end}", location, description.
- Empty: "No schedule published yet." / "The organizer hasn't added schedule items for this conference."

## Requests
- **Migration card:**
  - "Change Committee or Country" / "Request to move your seat. The organizer reviews each request, and an occupied seat can be offered to its current holder as a swap."
  - **Swap offer:** "Seat swap request" / "{name} wants to swap into your seat ({c}/{country}). If you accept, you'll move to {c}/{country}." Countdown "Respond within 3h 12m". Buttons Decline / Accept swap.
  - **Pending:** "Migration request pending review", "To {c}/{country}", Cancel. Alt state: "Approved — awaiting the current delegate's swap" · "expires in".
  - **Resolved:** "Last migration request to … : completed / rejected / failed".
  - **"Request Migration" dialog:**
    - "Request a Migration" / "Ask the organizer to move you to a different committee/country. You're currently in {c}/{country}."
    - Fields: Target committee; Target country (flags), with helper "If the seat is already taken, the organizer can offer a swap to its current holder."; Reason (optional).
    - Buttons: Cancel / Submit request.
- **ComplaintSystem:**
  - "New Request" / "Submit an official request, complaint, or query."
    - Type: General Inquiry / Academic / Chair / Logistics (Food, Transport) / Code of Conduct Complaint.
    - Subject; Description (with AI); "Submit Request".
  - "Your Requests" / "Track status and escalation of your submitted requests."
    - Item: type chip, status (Open / Under Review / Escalated / Resolved / Rejected / Pending), subject, date, description.
    - "Escalation Path" stepper: Chair → Organizer → Main Org → App Admin.
    - "Resolution" box; "Activity Log".
  - Empty: "No requests submitted" / "You haven't filed any requests or complaints yet."

## Modules
- **Food:**
  - "Food Coupons" / "Your digital meal tickets — show QR to staff".
  - Grouped by day; card shows meal, time window, venue, a pseudo-QR (placeholder) and "Show to staff at the venue".
  - No used state.
- **Transport:**
  - "Transport" / "Register for a shuttle route".
  - Registered card: "You're registered", route, pickup → dropoff, "Departs · Returns", QR, "Show QR code to the transport coordinator".
  - Route card: Full / Registered badges, "Dep · Ret", "n/cap seats" with bar, "Register for This Route" / "Route Full".
- **Accommodation:**
  - "Accommodation" / "Request a room for the conference duration".
  - Status card (Pending Review / Confirmed / Rejected): "Your request for {block} is …"
  - Block cards: Room Type, Price / Night, Available Rooms, "Request Room" / "No Rooms Available".
- **Dress Code:**
  - "Dress Code" / "Conference attire requirements"; hero image; chip "Attire Requirement" + text; "Reference Gallery".
  - Static cards: Expected / Opening Ceremony / Non-compliance.
- **Empty states:** each module has its own "No … yet" message.

## Certificates
- **Locked:** "Certificate Not Yet Available" / "Your certificate unlocks once the organizer approves the committee results. Check back after the conference wraps up."
- **Unlocked:**
  - "Recognition & Awards" / "Download your official certificate of participation."
  - Preview text: "Certificate of Participation", "This is to certify that", name, "has successfully participated as a {role} representing {country} in the {committee} committee during the" {conference}.
  - Signatures: Secretary General / Dated / Organizing Chair.
  - Buttons: "Print Certificate" / "Download PDF".

## Results
- **Final score card:**
  - "Your Final Score" with a Published / Provisional chip; subline.
  - "Final x%" with a bar.
  - "Computed n% · Chair overall n · blended w% · present p/d days".
- **Criteria grid:** signed ±avg, "avg / day · k marks", "show marks".
- "Chair Feedback".
- "Daily breakdown": date, bar, pct / "not counted" / "absent".
- **"Committee Standing":** "#rank of N"; rank_only note or the full leaderboard (# / Delegate / Days / Computed / Final).
- **Empty:** "Results Not Yet Published" / "Your chair hasn't submitted scores yet. Check back after the conference."

## Session Report
- "Session day" date input.
- "Session Report · {committee} · {date}"; buttons Print / Download.
- Header: flag + country; Attendance P&V / Present / Late / Absent.
- Stats: Speeches, Speaking time, Caucus speeches, PoO, PoI, PoPP, PoPI, Motions raised, Votes cast. Plus "Yielded to:".
- Empty: "No participation recorded yet."

## Payment gate
- **Title:** "Complete your registration payment" (overdue: "Your registration payment is overdue").
- **Fee:** "{tier} fee $X"; chip "Pay by date · n days left" / "Due today" / "n days overdue".
- **Body copy:**
  - Normal: "Your seat is held but not confirmed…"
  - Overdue: "The payment window has closed…"
- **"Unlocks the moment payment clears"** list (5 items).
- **Buttons:** "Pay {fee}" / "Already paid? Refresh".
- **Footer:** contact the organizer.

## Faculty panel
- "Faculty Advisor View" / "Monitoring n delegates from your institution"; button "Message Delegation".
- "My Delegates" table: Delegate (+ uid), Committee, Country, Status, Score, Paper (Submitted / Missing), Requests.

## Observer dashboard
- Badge "Read-only Access"; title "Observer Dashboard"; subline.
- Per event card:
  - "Committees" chips that open the live watch.
  - "Recent Announcements" (5).
  - "Delegates" table (or "Roster hidden — ask the organizer to grant "View Applications".").
