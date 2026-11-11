# Build progress — website UI redesign

Branch: `ui-redesign` (from `main`). Never push / deploy from here without the owner.

## Rules carried between sessions
- Restyle only through the `.mun-paper` / `.mun-chrome` token scope (globals.css). `src/components/ui/*` is shared
  with Live MUN, so primitive sizes use CSS vars whose fallback = the old value (`h-[var(--mp-btn-h,2rem)]` etc.);
  live routes never get the scope, so they render as before.
- GAP-LIST tick = prefix the row's "UI element" cell with `✅ `.
- Brand text "MUN Pilot" everywhere (header, footer, `<title>` done in Step 0; the rest as each board is built).
- **Board additions are intended (owner, 2026-11-02).** Anything drawn on a board that the code doesn't have yet
  is an intended addition — build it if it uses existing data/routes and needs no new backend. Ask only if an
  addition needs new backend, new data, or changes a permission. Confirmed: P01 footer "Get the app" (friendly
  "No build yet" page when /download/android has no release), Light/Dark toggle, "Back to top", "Next
  conferences" / "From the handbook" lists; AU01 "One account for every role" card. Keep the code's "AI" chip
  label (not the boards' "Help me write").
- **When two boards differ (owner, 2026-11-02):** the main page board wins on layout — P01–P07, D01–D06,
  CP01–CP05, CH01–CH05, OR01–OR07, AD01–AD03. The later "states" boards — P08+, D07+, CP06+, CH06+, OR08+,
  AD04+ — add states, copy and controls on top. Keep today's item counts and Firestore reads unless a board
  says otherwise.
- Footer socials keep placeholder URLs (one `SOCIALS` constant in Footer.tsx).
- Footer live lists + homepage read through `src/lib/publicFeed.ts` (in-tab memo + sessionStorage summary, 10 min).
- **States that real data can't reach:** never create/edit/delete anything in Firebase (live project). Use a
  temporary local-only override (e.g. `?__state=` read in dev), check the UI, then REMOVE it before committing.
  Never commit mock data. If not practical, list it under "Needs a real-data check".
- Phone checks: the Chrome window won't shrink — load the page in a same-origin 390px `<iframe>` (true 390 viewport).
- **Never run `npm run build` while `npm run dev` is running** (they clash on `.next`; stale CSS / Turbopack
  errors). Stop dev first — TaskStop leaves the Next child alive, so also kill the PID listening on :3000
  (check its command line is this project's `next`), build, then restart dev.
- Bash heredocs with `'''` break in this shell — write Python helpers to the scratchpad and run them.

## Foundations available (Step 0) — reuse these, don't re-invent
- Tokens (`--h-*`): page/paper/sunk/sunk2/line/line2/text/text-soft/muted, seal/seal-soft/seal-dark, signal,
  amber(-soft), red(-soft, -ink), blue(-soft), sh1/sh2, glass; radii `--h-r-sm` 8 · `--h-r` 10 · `--h-r-lg` 14.
  Shadcn remap: `--radius: 10px` (Tailwind md 8 / lg 10 / xl 14), `--destructive` = red, `--font-heading` = Inter.
- CSS classes: `.mp-btn` + `-solid|-sec|-ghost|-soft|-danger|-line|-light|-onslab`, `-sm|-lg|-icon|-block`;
  `.mp-pill` + `-ok|-wait|-bad|-info|-mute|-live` (+ `.mp-pill-dot`); `.mp-seg`, `.mp-tabs`, `.mp-kick`,
  `.mp-serif`, `.mp-panel`, `.mp-lift` (+ `.mp-lift-title`), `.mp-table`, `.mp-alert-*`, `.mp-field-error`,
  `.mp-skel` (shimmer), `.mp-empty`.
- Components: `brand/Logo`, `brand/Preloader`, `shared/InlineError` (+ `FieldError`), `shared/ConfirmDialog`
  (+ `PromptDialog` with `belowField` slot for AI help), `ui/table`, Button variants `soft|danger`,
  Badge variants `ok|wait|bad|info|mute|live`.
- In scope: `[data-slot=skeleton]` shimmers; dialogs get paper bg, 14px radius, sh2, navy overlay, and open as
  bottom sheets below 640px (footer buttons full width).

## Steps
| # | Step | Status |
|---|---|---|
| 0 | Foundations (Main) | done |
| 1 | Public P01–P10 | in progress — P01, P02, P03 (+P09 detail), P04 (+P09 wizard) done; **next: P05 Articles** |
| 2 | Auth AU01–AU03 | — |
| 3 | Dashboard D01–D11 | — |
| 4 | Conference portal CP01–CP09 | — |
| 5 | Chair & EB CH01–CH08 | — |
| 6 | Organizer A | — |
| 7 | Organizer B | — |
| 8 | App Admin AD01–AD06 | — |
| 9 | Final pass | — |

## Step 1 decisions (owner, 2026-11-02)
- Order (states folded into their page): P01 (+P08 home states) → P02 → P03 (+P09 detail) → P04 (+P09 wizard)
  → P05 → P06 → P07 (+P10) → P08 system (maintenance + admin banner, 404). One stop each.
- P02: build masthead search + "Host a conference" empty-state button.
- P03 phone: build section jump tabs + sticky bottom apply bar.
- P03 phone apply bar price (owner): ONE enabled role → its live price exactly as the board (price, struck regular,
  phase pill + "until {date}"); SEVERAL → "From ${lowest phase-adjusted price}" with that role's phase line; all
  free → "Free". Button = the rail's action in every case. Free role + paid roles → "Free" with a second line
  "Paid roles from ${lowest paid price}" — never "From $0".
- P03 phone About: 3-line clamp + "Read more" / "Show less", toggle only when the text really overflows.
- P03 phone header: keep the global header (logo + burger) + in-page back link, as on P02.
- P03 Conference panel: keep the code's full labels "Expected delegates" / "Target audience" (not the board's short ones).
- P03 partner tiles + partner dialog logo well stay light (white + hairline) in dark mode so dark logos read.
- P04 phone header: global header + in-page "Back to event" link (no special "× Apply" header).
- P04 Step 1 desktop: ONE column of the phone row cards (radio, name, description, price/pills on the right).
- P04 AI colour: `--h-violet` / `--h-violet-soft` (light + dark) are for AI ONLY — AI chip, AI panel, suggestion
  card (and later CH06's participation-suggestion chip). Seal green stays for primary/success; no violet elsewhere.
- P04 payment-start failure: amber alert ON the success card, server text if any, else "Could not start payment.
  You can pay later from the Payments page." + "Go to Payments" link (/dashboard/payments exists).
- P04 (owner): after restyling AiTextareaAssist, spot-check 2–3 dashboard surfaces at desktop + 390px.

## Boards done
- P04 Apply wizard + P09 wizard states: page in `.mun-paper` (880px column, "Back to event", serif 38 title,
  lede); skeleton (bar 2/3 + 500px card); Not Found / Already Applied / Submitted as centred outcome cards.
  Wizard card (20px radius) with a labelled 4-step stepper (done = seal check, current = ring, connector lines;
  under 760px only the current label shows); phone = 4-segment bar + "Step N of 4 · Title", no card chrome, sticky
  glass bottom bar Back (1) / Next (2). Role row cards (native radios): Early bird green / Late price amber / Free
  grey / "$N / member" / closed grey "Closed {date}"; phase pills are hidden on Free roles (would read "Free ·
  Late price"). Step 2: grey info banner merges "Rank up to N…" + the per-block helper; ranked blocks (block 1 seal
  border + ink rank badge, others grey + "(optional)"); 3-col flag selects; single-committee variant = no badge,
  helper under Committee, countries stacked; Registration-full banner in signal (`.mp-alert-sig`); Team Details card
  (dashed CSV drop zone over the real file input, green loaded line); Faculty card in P04 order (fields stay on
  step 2 — P09 draws them on step 3, moving them would change validation). Step 3: label + helper + `.mp-ta` box
  with the AI bar inside its bottom edge. Step 4: 170px review list (ranked countries inline with flags), seal-soft
  fee box, inline red submit errors above the footer (closed / already applied / failed — no more alert()).
  Busy labels "Submitting..." / "Redirecting to payment…" (no spinners). framer-motion dropped here (CSS fade).
  AiTextareaAssist (shared, NOT Live MUN): violet chip "AI" + Undo chip, violet-soft panel, `mp-btn` sec actions
  with verbs while busy ("Improving…" / "Fixing…" / "Thinking…"), paper suggestion card (Use this / Try another),
  red error line. Root carries `mun-chrome` so tokens travel into unscoped dashboard dialogs. Self-scoped Select /
  popover menus (`.mun-paper` on the portal) paint paper. Spot-checked: ComplaintSystem, RecommendDialog,
  PromptDialog belowField — desktop + 390px, light + dark (dialog chrome itself is still the D01 issue).
- P03 Conference detail + P09 detail states: back link with icon; 400px hero (20px radius, scrim only over a cover;
  no cover = navy or organiser theme field with a faint grid, copy takes `inkOn(theme)`); format pill solid seal,
  or white/ink chip with the theme colour as text when themed; glass "Conference"; amber "Early bird". Main: About
  (serif 24), Conference / Applications as 130px label-value lists (code labels "Expected delegates" / "Target audience", owner), status
  pill; committee cards (sunk2 plate, serif 21, red Full, difficulty Advanced red / Intermediate grey / Beginner
  green, numbered agendas, small "View members →"); committee dialog per P09 (header band, 3-col flags, Full/Open
  dot pill, "Positions to be announced."); registration 2-col tiers, 32px price then struck price, Early bird
  green / Late price red, green ring on the single role; partners with round arrows in the row + sunk2 tiles;
  partner dialog restyled. Rail: uppercase labels, icon link rows, real brand socials (new shared
  `brand/SocialIcons.tsx`, footer uses it too — unique IG gradient ids), every application-status case, Join the
  staff radio rows + outline button, busy "Sending…/Withdrawing…", red `mp-field-error` line. Loading skeleton per
  P09; not-found / unpublished (amber kicker). Phone (≤1000px): key-facts panel, sticky jump tabs (in-view
  highlight), sticky apply bar that rests above the footer; ≤620px full-bleed 260px hero. New token
  `--h-signal-soft` (+ `.mp-pill-sig`). Same 4 reads, no data changes. Lint fixes on the page: applied state keyed
  by uid (no setState in effect), `isAdmin` cast without `any`.
  Step 0 fix found here: the dialog bottom sheet never applied to dialogs that carry `.mun-paper` themselves (they
  portal to <body>), and the compiler drops `translate: none` — selector widened to the self-scoped case,
  Tailwind `--tw-translate-*` zeroed, self-scoped dialog content gets paper bg.
- P02 Conferences: masthead as white band (kick, 52px serif, lede, big tally / "N found" on phone) + on-page
  search synced to `?q=` via replaceState; header search on /events now updates the mounted page
  (`eventsSearch.ts` window event — was stale before); nav "Conferences"/"Articles" current state; seal-soft
  result bar; white pill stamps (clock / red "Happening now"); "View details →" footer; TBA date muted; empty
  states with icon + Clear search / Host a conference. Checked loading + nothing-open via temp override (removed).
- P01/P02 follow-up (owner): "Ended" status for finished events (end date/time, else end of the start day):
  grey stamp on /events, grey chip on home cards (13.8:1 light, 12.4:1 dark); neutral chips share the grey.
  events/page.tsx lint fix: starting `?q=` via useSearchParams inside a Suspense boundary whose fallback is the
  old first paint (no term + skeleton); route still prerendered static. Header hand-off stays a window event
  (re-deriving from the URL raced our own replaceState writes and dropped keystrokes). No behaviour change.
- P01 Home + P08 home states: split hero (P01) with fact chips + close date, P08 slide kinds, dot rail +
  numbered pager, ← →; white "Upcoming" band, sand placards, application-status chip on cards, hover lift;
  article cards with subject pill + coloured avatar; empty panels with icons; organiser band with kicker + 3 tiles;
  phone: stacked hero, row cards. "Recent conferences" only when past events fill the grid (was also shown while
  loading). Checked loading / empty / past via temporary override (removed).
  Follow-up fixes: neutral "Applications closed" chip = ink on paper + hairline (17.1:1 light, 14.0:1 dark);
  hero skeleton while events load (desktop exactly 420px like the hero), then opens on slide 1; no new reads.
- Main (Step 0): tokens, fonts (Archivo dropped → Inter; Newsreader kept), primitives, preloader, glass header
  (+ phone menu), mega footer. GAP rows ticked: public header ×3, footer, dashboard boot loader.

## Decided tasks (not yet built)
- `/download/android` (footer "Get the app"): when no release is published, show a friendly "No build yet" page
  instead of the raw JSON 503. Build it with the P08 system pages (maintenance, 404). UI only — keep the redirect
  when a release exists.

## Step 1 owner decisions (P01)
- Hero: P01 split layout + P08 controls/slide content. Grid: 3 per row, 6 cards.

## Needs a real-data check
(none for P01 — early-bird / late / closed card chips checked with a temporary fake-now + mock schedule, removed)
- P03: early / late / single-role / free / themed / organiser / already-applied / staff busy-error / loading /
  not-found / unpublished checked via a temporary `?__state=` override (removed).
- P03 (owner will test): signed-in "Apply now" click-through to /events/[id]/apply with a real account.
- P03 (owner will test): real "Join the staff" apply + withdraw (writes the staff doc; no Firebase writes from here).
- P04: every step / role variant / banner / busy label / submit error / success + payment warning / loading /
  not-found / already-applied checked via a temporary local event + state override (removed). NOT exercised:
  a real submit (Firestore write), the real checkout redirect, the real availability fetch, and live AI calls.

## Open issues

- Dashboard boot preloader not seen live in the browser (signed-out session; proxy redirects to /login before the
  client loader shows). Build + types OK; check on the first signed-in dashboard board (D01).
- Live MUN regression checked by computed style outside the scope (/login: per-instance sizes and 12px radius
  unchanged), not by opening a live session route (needs a signed-in chair).
- Login/signup/onboarding still old design + "MUN Platform" brand text until AU01–AU02.
- Dashboard Header/Sidebar still use the legacy round "MP" mark (`.mp-brand-mark` kept) until D01.
- Footer "Refunds" → `/terms#refunds` has no matching anchor (pre-existing; fix with P07/P10 Terms board).
- Dashboard dialogs portal to <body> WITHOUT `.mun-paper`, so they get neither the paper look nor the phone bottom
  sheet. Fix at D01 (e.g. pass the scope class on DialogContent / portal container).

## Last commit
`15059b3` feat(ui): P04 apply wizard + P09 wizard states