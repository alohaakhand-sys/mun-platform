# MUN Pilot — website UI redesign

Design-only mockups for every website page except Live MUN. No site code was changed.
Layout and colours are kept from the current site; the visual system is new.

Live canvas (private until shared): https://claude.ai/artifact/FoCoXnLQ1PvHr4a5jg3SZf

## Folders

- `boards/` — 63 board files (`.dc.html`) plus `canvas.json` (the canvas index: pages, positions, titles).
  The boards are made for the canvas viewer. Opened straight in a browser they show the
  light theme only; the dark-mode switch needs the canvas.
- `assets/munpilot-preloader.svg` — MUN Pilot logo preloader (replaces spinners).
- `notes/` — `INVENTORY.md` (decisions and progress) and the per-section fact sheets
  the boards were built from (`DASH`, `PORTAL`, `CHAIR`, `ORG`).

## Boards

| Section | Boards |
|---|---|
| Foundations | Main — colour, type, shape, controls, status, loading (preloader + skeletons), page rules |
| Public | P01 Home · P02 Conferences · P03 Conference detail · P04 Apply wizard · P05 Articles · P06 About & contact · P07 Legal docs · P08 System & home states · P09 Detail & apply states · P10 Terms & doc reader states |
| Auth | AU01 Auth · AU02 Onboarding · AU03 Reset & onboarding states |
| Dashboard | D01 Shell & home · D02 Conferences & docs · D03 Blogs & achievements · D04 Network & profile · D05 Messages & payments · D06 Settings · D07 Browse & payment states · D08 Documents hub roles · D09 Profile owner sections · D10 Messages, shell, network · D11 Blog editor states |
| Conference portal | CP01 Overview · CP02 Tabs · CP03 Modules · CP04 Results · CP05 Gate, faculty, observer · CP06 My Pass, food, transport · CP07 Paper, docs, accommodation · CP08 Portal states · CP09 Portal decisions |
| Chair | CH01 Overview · CH02 Marking · CH03 Log, papers, requests · CH04 Awards, guide, alert · CH05 EB dashboard · CH06 Hub passes, read-only, edges · CH07 Log, papers, requests states · CH08 Guides, standings, scores |
| Organizer | OR01 Home, events, create · OR02 Event overview · OR03 Details & committees · OR04 Allocation · OR05 Staff & comms · OR06 Modules & tools · OR07 Financials & plan · OR08 Empty, loading, edit · OR09 Allocation states · OR10 Staff & forms · OR11 Coupons & pass report · OR12 Scanner · OR13 Modules, ID cards, schedule · OR14 Rules & announcements · OR15 Plan, money, complaints |
| App Admin | AD01 Overview, users, events · AD02 Approvals, money, complaints · AD03 Oversight, tools, settings · AD04 Members, plans, approvals · AD05 Gateways, complaints, live · AD06 Moderation, tools, settings |

Boards P08 and later were added from `GAP-LIST.md` (the code-vs-board audit of 2026-11-02); every "Boards to add" item is now drawn.

`DECISIONS.md` records the owner's answers to the open questions (16 items); follow it over "keep as code".

## Design system in short

- Fonts: Newsreader (serif headings) + Inter (UI).
- Colours: ink `#0E1D2C`, seal green `#0B6E4F` (primary), signal `#B03B22` (dates only); navy slab for heroes and the organiser band.
- Light and dark themes; subtle shadows; radii 8 / 10 / 14.
- Glass sticky header, grey/white section bands, card hover lift, mega footer with real social logos.
- Loading: SVG logo preloader for full-page loads, skeleton loaders everywhere else; busy buttons show a verb ("Saving…"), no spinners.
- Text in `[brackets]` = real content not known from the code; fill it in during build.
