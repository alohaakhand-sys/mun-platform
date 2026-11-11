# Organizer facts (2026-11-01)

## Organizer home
- Title "Organizer Dashboard" with a "New Event" button.
- Stat cards: Total Events, Published, Total Applications, Approved.
- "Events at a Glance": Published, Drafts, Approval Rate. Empty: "No events yet." + "Create first event".
- "Applications by Role" table: Role, Total, Approved, Pending. Empty: "No applications across your events yet."
- "Your Events": 4 cards (title, date · location, status badge, "Manage") + "View all {n} events".

## Events list
- "Manage Events" / "Create and manage your Model UN conferences." + "Create Event".
- Chips: Total Events, Published, Drafts. Segmented: All / Published / Drafts. Search: "Search events...".
- Card: cover, "Draft" / "Published" pill, "Co-organizer" pill, format pill, title, date ("Date TBA"), location ("Location TBA"), "{n} Committees", delegates chip, "Manage Conference ›".
- Empty: "No events yet" / "Start by creating your first Model United Nations conference. It only takes a minute." / "Create Your First Event".
- No match: "No events match your filters" + "Clear filters".

## Create / Edit event dialog
- Fields in order:
  1. Cover ("Add").
  2. Host strip ("Host — Your profile").
  3. "Event name".
  4. Start date, Start time, Time zone (Globe icon). "+ End date and time" reveals End date and End time.
  5. Format: "Is it in person or virtual?" — In person / Virtual / Hybrid.
  6. Location:
     - In person: LocationSearch "Search venue or address" (results show name, address, rating, category; "Location pinned with map coordinates") plus a Leaflet map with a draggable pin ("Drag the pin or click the map to fine-tune the exact spot.").
     - Virtual: "Meeting link (optional)".
  7. "Who can see it?": "Public — discoverable on /events" / "Unlisted — link only".
  8. "What are the details?" with AI help.
- Errors: "An event must not have a start time in the past." / "Please fill all required fields."
- Buttons: "Create event" (create) / "Save changes" (edit).
- Create footnote: "Saved as a draft. Add committees, tickets & schedule from the event page to publish."

## Event overview
- **Cover hero:** "Live" / "Draft" badge, "Edited x ago"; buttons Publish (Rocket) / Unpublish, Edit, View; title, date, location.
- **"Ready to publish?":** "Complete the required steps below to make this event public. Schedule is recommended but optional."
  - Basic info — title, date, location, description
  - At least one committee with name and capacity
  - At least one accepted role with pricing
  - Event details — expected delegates, audience, application deadlines
  - Schedule items (optional)
  - Each row shows Edit / Add. Footer: "Publish unlocks once all required items are checked."
- **Free-cap alert:** "You already have {used} published Free event(s) (the limit is {cap}). Make this event Pro, or ask for more room, under Plan."
- **Stat cards:** Applicants, Approved, Capacity %, Days Away.
- **Recent Applications:** "Latest delegates and staff", "View All →"; rows show initial, name, committee, status. Empty: "No applications yet."
- **Country Assignments:** "Pending assignments" n, "Assign Now →".
- **Upcoming Session:** title, time · location ("No upcoming sessions"), "View Full Schedule →".
- **Committees:** name, c/cap with bar, "Manage".
- **Quick Tools:** Complaints, ID Cards, Certificates, Announcements, Partners.
- **Applicant sheet:**
  - "Applicant Profile" / "View submitted data and onboarding profile details."
  - Avatar, name, role, status; payment Paid / Refunded / Unpaid.
  - "User Information": email, phone, institution, Bio.
  - "Ranked Committee Choices" (each with ranked country flags).
  - Faculty: Position / Teaching Experience / Accompanying Students.
  - Team: Team Name / Team Size / Members List.
  - "Previous MUN Experience"; "Motivation for Choices".
  - Approved: "Event Assignment".
  - Unpaid warning: "Registration fee unpaid. This applicant can't be approved until Stripe confirms payment."
  - "Approve Application Settings": "Assign Committee" (★ #n preferred), "Assign Country" (flags, #n, "Taken").
  - Buttons: Approve (or "Unpaid" when awaiting payment), Reject.

## Details page
- "Event Details" / "Extra info, modules, and quick edits for {title}." + "Edit event". Saved banner: "✓ Changes saved successfully".
- **Delegate Information:** Expected Delegates (auto: "Auto-calculated from the sum of all committee capacities"); Target Audience ("e.g., University Students and School Students").
- **Web & Social Media:** Website, Contact Email, Instagram @, Twitter/X @, Facebook, LinkedIn.
- **Optional Modules:** switches Food Coupons / Transport / Accommodation / Dress Code, each with a one-line description.
- **Marking Templates:**
  - "Marking pattern": Decimal (−100…+100) / Binary (−1 / 0 / +1).
  - Rows: Criterion ("e.g. Debate"), Range, "Auto-fill from" (Manual only, GSL speeches, Caucus speeches, All speeches, Speaking minutes, Points raised, Points recognized, Motions proposed, Motions carried, Votes cast), Cap, trash.
  - "Add template"; "Add starter set" (Debate & Speeches, Diplomacy & Lobbying, Documentation, Conduct & Discipline). Counter: "{n} criteria · daily % = average of scored criteria".
- **Final Scoring:** "Chair overall weight" slider ("final = X% computed + Y% chair overall"); "Conference days (optional override)".
- Save: "Save Details".

## Allocation
- "Allocation" / "Review applications, assign countries, and manage committee capacity & staff."
- Tabs: Applications / Country Assignment / Migration / Capacity & Waitlist / Invitation (= Staff).
- **Applications:** search "Search applicants..."; status All / Pending / Approved / Rejected.
  - Columns: Applicant, Role, Pref. Committee (+n), Status ("Awaiting payment"), Actions (Approve opens the sheet, Unpaid, Reject).
  - Empty: "No applications found matching your filters."
- **Countries:**
  - "Country Assignments" / "Assign countries to applicants manually or use AI auto-assignment."
  - "Assignment Deadline" HH:MM:SS (red under 1h; "COMPLETED").
  - Warnings: "1 hour until AI auto-assigns" / "Please lock in any manual assignments before the deadline."; "AI Assignment in progress..." / "Manual edits are temporarily disabled."
  - "Delegation Matrix": "{n} applicants need assignment." / "All applicants assigned!", Save; committee tabs with unassigned badges.
  - Row: name, Conflict / Assigned badge, email, Preferences, Experience, "Assign Country" select (Unassigned, flags, Taken, conflict marker).
  - Info box: "Conflict Detection System Active" + copy ("Held at {event} on {date}").
- **Migration**, sub-tabs Requests / Direct Migration:
  - Requests: "Needs review": from → to, reason, "Swap deadline (hrs)" 48, Reject / Approve. "Awaiting swap": "{h}h left". "History" with statuses.
  - Direct: search "Search delegate, committee, country…"; "Approved delegates (n)" each with Move.
  - Move dialog: "Move {name}"; Currently; Target committee; Target country; occupant swap notice; Reason; Swap / Move.
  - "Admin migrations" history (Swapped / Moved).
- **Capacity:**
  - "Committee Capacity & Waitlist" / "Live fill rates (approved delegates) and waitlists. Capacity is set per committee on the Committees page."
  - Cards: FULL chip, filled/cap, bar, "n seats remaining".
  - Waitlist table "{c} Waitlist" ("n waiting"): #, Applicant, Applied Date, Status (Waiting / Offered (48h) / Accepted / Expired), Action ("Offer Seat").

## Staff
- "Staff & Permissions" / "Manage your Executive Board, Chairs, and their specific access rights."
- Toolbar: "Allow Public Applications" switch + Save; "Invite Staff".
- Tabs: "Current & Invited" / "Applications".
  - Row: initial, name ("Pending User"), "Pending Invite", email; role select; Committee select ("All committees" / "No Committee"); vice-chair "Standard Vice Chair" / "+ Delegate Power"; "Edit Permissions"; trash.
  - Applications: "Applied for: {role}", Reject / Accept.
- Invite dialog: "Invite Staff Member"; Email ("colleague@example.com"); Role (Co-Organizer, Under-Secretary-General, Director, Chair, Vice Chair, Observer, Faculty Advisor); "Send Invitation".
- Permissions:
  - "Custom Permissions" with override note.
  - Switches: View Applications, Mark Delegates, Send Announcements, Manage Schedule, View Financials (co-organizer only), Approve Results — each with a description.
- Dialogs:
  - "Remove staff member?"
  - "Change role?" — re-accept copy: "They will be emailed and notified, and must re-accept before the new role and dashboard take effect. Their access is paused until they accept."
- Empty: "No Staff Yet" / "Invite people to help manage your conference."

## Committees
- "Committees" / "Build from scratch or start with a premade template — UNSC, UNDP, and more."
- Stepper: "Committee choices per applicant" with help copy; − / + buttons.
- Card: name, difficulty, edit / delete, Topic / Agendas, Seats ring f/c, Countries n, Delegation flags "+n more".
- Template chooser: "Pick a Committee Template" — UNSC / UNDP with flags and counts; "Build your own from scratch".
- Form:
  - Committee Name ("e.g., UNSC, DISEC, WHO").
  - Total Capacity (help copy).
  - Difficulty chips: Beginner / Intermediate / Advanced.
  - "Topics / Agendas" rows ("Agenda 1 — e.g., Regulating Antibiotic Resistance") + "Add agenda".
  - Description (AI).
  - "Delegation Roster" CountryPicker (Selected n/max, Clear all, table # Flag Country Code, search grid, "Capacity reached…").
  - Save Changes.
- Plan cap alert.
- Delete: "Delete Committee" + seated-delegates warning.

## Partners
- "Event Partners" / "Showcase your sponsors, university partners, and affiliated organizations." + "Add Partner".
- Form: Partner Name ("e.g. Harvard International Relations Council"), Website URL, Short Description (AI), Partner Logo; "Add to List" / "Save Changes".
- Cards are drag-to-reorder: logo, name, description, "Visit Site", edit / delete.
- Empty: "No partners added yet."
