# Design decisions (answered 2026-11-02)

The owner's answers to the open questions from `GAP-LIST.md`. They override "keep as code" wherever they differ. The board named in each row draws the decision.

| # | Topic | Decision | Board |
|---|---|---|---|
| 1 | Maintenance lockout | Add a "Sign out" button. The App Admin sees an amber "Maintenance mode is on" banner across the app, with a link to System Settings. | P08 |
| 2 | 404 page | Add a site-level not-found page with the written copy ("This page has left the chamber") and an animated gavel + 404 placard illustration (CSS/SVG, still under reduced motion). Buttons: "Back to home" and "Browse conferences". | P08 |
| 3 | Chat ⋮ button | Real menu: View profile · Mute · Block. Group chats: View members · Mute · Leave group. | D10 |
| 4 | Achievements filter with no awards | Empty message "No awards in this filter" + "Show all awards". | D10 |
| 5 | Rejected / withdrawn applicants | No portal. Show a "Not accepted" status screen (REJECTED / WITHDRAWN) with "Browse conferences" and "Back to My Conferences". | CP09 |
| 6 | Waitlisted + unpaid on a paid event | The payment gate shows the waitlist seat-offer card on top; the portal still unlocks only after payment. | CP09 |
| 7 | Committee chat + members under 1280px | Move them behind Messages: a pinned "{Committee} · Committee" conversation with Chat / Members tabs. The desktop right rail is unchanged. | CP09 |
| 8 | Position Paper Viewer opened to view | Read-only for viewers without grading rights: status, score and feedback shown as text, a "View only" pill, no "Save Grade". | CH07 |
| 9 | Escalated complaint in the chair's Open list | Amber "Escalated" pill + "With the organizer — no action needed here." | CH07 |
| 10 | Study Guide delete | Confirm popup "Delete the study guide?" with Cancel / Delete. | CH08 |
| 11 | Read-only marking matrix | Show a "View only" pill. | CH06 |
| 12 | CapacityCard "Add More Seats" | Connect it: show the input + "Add" on every committee card in Capacity & Waitlist. | OR09 |
| 13 | Scanner layout | Render `/dashboard/scan/[eventId]` inside the event sidebar (Tools › Scan Passes). Staff who only have the Scan Passes permission keep reaching it from the committee hub. | OR12 |
| 14 | Orphan Tools hub page (`/events/[id]/tools`) | Drop it; each tool already has a sidebar link. | — |
| 15 | Dead "Live MUN" tab on Modules | Remove the unreachable tab code. | — |
| 16 | Results "Revise" | Replace `window.prompt` with a popup: "Revision notes for the chair:" textarea (with AI help), Cancel / Send back. | OR15 |

Also already decided on the boards: every native `alert()` / `confirm()` / `prompt()` becomes an inline error or a real dialog (apply wizard, coupons, refunds, moderation, broadcast, force stop / reset, delete account).
