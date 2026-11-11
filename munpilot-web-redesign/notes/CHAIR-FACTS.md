# Chair / EB facts (2026-11-01)

## /chair
- Header: "Chair Dashboard" / "Manage your assigned committees and evaluate delegate performance."
- Card: role badge, title, date, "Assigned Committee", "{n} Delegates", "Study Guide: Uploaded/Pending", "Manage Committee".
- Empty: "No Committees Assigned" + "Browse Conferences".

## Hub rail
- "Back to Committees", section "Committee Hub".
- Tabs: Overview, Marking, Motion Log, Papers, Requests, Study Guide*, Awards & Results*, Room Alert*, Rules & Regs.
- Locked tab: "{label} is restricted" / "You have read-only access to this committee. Ask the organizer to grant permissions if you need to act here."

## Overview
- Hero pill: "Chair Management Hub" / "Executive Board — Oversight" / "Organizer Oversight"; role pill; committee name; event; "{n} Approved Delegates"; date; location.
- Notices:
  - Orange: "No committee assigned to you yet" + Staff-settings copy.
  - Blue: "Read-only view" + copy.
- Ceremony banner.
- Committee Stats: Grading Progress g/n + bar; Top Score; Open Complaints.
- Quick Actions: Launch Live MUN, Message Committee, Review Position Papers, Open Marking Matrix, Send Room Alert, Manage/Upload Study Guide.

## Marking
- Stat tiles:
  - Scored today s/n ("everyone marked" / "{n} left")
  - Committee average % ("of the delegates scored today")
  - Present p/n ("{a} absent" / "no roll call recorded")
  - Criteria filled f/t ("{k} criteria × {n} delegates")
- Card: "Daily Marking Matrix" / "Scoring on {scale} · tap a delegate for their full record".
- Toolbar: Apply suggestions; Previous day / date / Next day; Sort (country / daily % / final % / unscored first); "Unscored only"; "Search...".
- Matrix:
  - Sticky "Delegate / Country" column: flag, country, name, attendance pill, participation chips.
  - Criterion columns with the scale under each.
  - "Daily %" bar. Footer row "Committee mean".
  - Cell: binary −1/0/+1, decimal input (−100…+100, "—"), or multi-mark mean "·n".
- Empty: "No marking templates defined for this event." / "Every delegate has been scored today." / "No delegates match this search."
- Detail sheet:
  - Header: flag, country, name, Final %, "Rank p of n", previous/next.
  - "Day by day": date, attendance, "x/n scored" / "not counted" / "counts as 0%", bar.
  - Selected day "{day} · pct": criterion cards ("mean of n marks", "+sug" chip, mark chips ×, add +1/0/−1 or ±100 Add, "avg", "contributes x% to the day").
  - "On the floor": GSL / Caucus / Minutes / Points / Motions / Votes.
  - "How this final was computed": per-day lines and formula.
  - "Feedback · {day}" textarea: "Private feedback for this delegate (shown in their results)…".

## Motion Log
- Header: "Motion Log" / "The committee's procedural record for {date} — motions, points, votes and yields, in the order they happened. Read-only."
- Day stepper; filter chips All / Motions / Points / Votes / Yields with counts; "{n} carried".
- Row: time, icon, title, flag + country, "by proxy", vote tally, outcome badge (carried / dismissed / out of order / recognized / passed / failed / yielded / logged by chair).
- Expanded: parameters, notes, tally bar, roll-call chips.
- Empty: "Nothing recorded on this day" / "No session ran, or the floor never moved. Pick another date."

## Papers
- "Position Papers — {c}".
- Summary: "s/n submitted", "{k} delegates not submitted yet", "Remind by email" → "Reminder emailed to n delegates."
- Row: initial, country code, name, "Grade" / "View" / "Not submitted".
- Viewer:
  - Left: status badge, markdown body.
  - Right: "Status" (Under Review / Approved / Needs Revision / Plagiarism Concern); "Position Paper Score" ("e.g. 85"); "Feedback to Delegate" with AI; "Save Grade".
  - "Internal Chair Notes": thread, "Add private note...". Before saving: "Save grade first to enable notes."

## Requests
- "Complaint Inbox" with badge; tabs Open / Resolved.
- Card: type, subject, date, description; "Resolution note (optional)"; Resolve / "Escalate to Organizer"; "Resolution: …".
- Empty: "No open complaints".

## Study Guide
- "Study Guide — {c}" / "Write it Word-style with full formatting and AI assistance, or import an .md file or a PDF (text extracted, original not stored)."
- "File name (optional)"; Write / Upload .md / Import PDF; "Publish Guide" / "Update Guide"; Delete.

## Awards & Results
- **Committee Standings:**
  - "Live ranking from the current marks. Publishing shows it to delegates — it is not shared until you say so."
  - Visibility: "Show full board" / "Show rank only"; Publish / Update / Published; Withdraw (with confirm).
  - Leaderboard columns: # / Delegate / Days / Computed / Overall / Final.
- **Final Scoring:**
  - "Final % = average of each delegate's daily % across n days (absent day = 0%; a day they attended but you never scored is left out, not zeroed), blended with your manual overall at w%."
  - "Compute & Save Final Scores"; day chips.
  - Table: Delegate / Days / Computed % / Overall (input) / Final %.
- **Final Awards:**
  - "Submit the final awards for {c}. Each awarded delegate carries their blended final % (compute & save above first)."
  - Selects: Best Delegate / Outstanding Delegate / Honorable Mention ("Select delegate...").
  - "Submit Awards" → "Awards submitted".

## Room Alert
- "Send Room Notification" / "Delegates in {c} will see this immediately."
- Message ("e.g. All delegates please report to committee room 3.").
- Type: Info / Warning / Urgent. Expires in: 15 min / 30 min / 1 hour.
- "Send Alert" → "Notification sent!"
- No history list.

## EB dashboard
- Badge "Executive Board"; "Executive Board Dashboard" / "Oversee your committees, monitor grading progress, and manage chairs within your scope."
- Stat chips: Committees, Delegates, Chairs, Graded %.
- Per event: title, "{role} · All committees / n committees".
- Committee card:
  - Name; chips: delegates, chairs, "Guide" / "No guide".
  - Ring = grading %; "Grading progress m/n".
  - Chairs list (Chair / Vice Chair) with a reassign-committee Select and a Remove button.
  - "Open Committee".
- "Remove chair?" dialog: "{name} will be removed from the committee staff and lose chair access. This cannot be undone — the organizer can re-invite them later."
- Empty: "No Executive Board Assignments" / "You don't have any accepted Director or USG roles yet…"
