# Live MUN completion plan

Goal: every role can do in a live session what its role allows, on the web and on the native
Kotlin phone app, with video, and with the safety holes found in the 2026-10-25 audit closed.

## Decisions (owner, 2026-10-25)

| Topic | Decision |
|---|---|
| Phone video | **Kotlin app only** (Agora Android SDK). The RN app gets no video and retires at K8. |
| "Reset Logs (DEV)" button + the dev-only "organizer creates applications" rule | **App Admin only.** |
| USG / Director / EB | **Full control, only in the committees in their scope.** A staff doc's `committeeId` is the scope; empty means every committee. The same scope applies to session writes, marking, and the video broadcaster role. |
| Organizer / co-organizer on the phone | **Full.** Live Control, hosting ceremonies with video, and entering any committee's console. |
| Site the phone calls (`API_URL`) | `https://mun-saas-roan.vercel.app`. Step 2.1 checks that it serves the `mun-platform-saas` Firebase project. |

Still open (each has a default, used unless told otherwise):

1. **Does EB read delegates' private dais chat?** Default: **no**. Today it is excluded on
   purpose (privacy), and "full control" covers the floor, not private notes.
2. **Screen share from a phone.** Default: **last**, after everything else (step 3.8).
3. **Agora usage budget.** Agora's free tier is 10,000 minutes a month. Phone video adds
   minutes. Default: no extra cap, but video is off until someone is on stage (audience members
   don't publish).

## Constraints every step respects

- **Spark plan forever.** The budget is 50k Firestore reads a day and 100 concurrent RTDB
  connections.
  - No polling.
  - No unbounded `collectionGroup` scans.
  - Rules `get()`/`exists()` calls are billed reads, so any rule change states its read cost.
  - Phone presence (RTDB) counts toward the 100 connections.
- **No Cloud Functions on Spark.** Scheduled work runs as Vercel cron routes using the admin SDK.
  Vercel Hobby crons run at most daily.
- **Rules deploy separately:** `npx --yes firebase-tools@latest deploy --only firestore:rules
  --project mun-platform-saas`, with `--dry-run` first. RTDB rules: `deploy:dbrules`.
- **`NEXT_PUBLIC_*` changes need a Vercel redeploy.**
- **The phone ports web logic 1:1** (`android-native/PLAN.md` §2). Each ported function keeps the
  web's paths, fields and write order. Pure logic gets JUnit tests.
- **Each step ends with a live test.** Use the web actors (`mobile/.e2e/actor.js`, now with a fake
  camera/mic and `eval:`/`select:`/`key:` steps) and the emulator (`android-native/.e2e`).

Sizes: S = under half a day, M = 1–2 days, L = 3+ days.

---

## Phase 0 — Web safety and correctness (ship first)

**0.1 DEV reset → App Admin only (S).**
- `ChairSessionConsole.tsx:2016` shows the button only when `isAdmin`, from the users doc role
  or `isAdmin`, the same check the observe page uses.
- `resetSessionDev` stays, and its doc comment changes to "App Admin test tool".

**0.2 Dev allocate rule → App Admin (S).**
- `firestore.rules:975`: the line becomes `isAdmin()`.
- Find the "Dev Allocate" panel and show it to App Admin only.
- Done when an organizer gets a permission error and an admin succeeds.

**0.3 EB scoped control (M).**
- Rules: add `isEbInScope(eventId, committee)` = Director/USG/EB staff whose `committeeId` is
  empty or equal to `committee`. OR it into `canWriteMarking`, which also gates session writes
  through `canWriteSessionDoc`. Ceremonies stay organizer-only. Read cost: none new, because
  `ebStaffData` is already read.
- UI: `canControl` (`chair/committee/[id]/live/page.tsx:127`) becomes `isExecBoard && inScope`.
  `canDais` keeps EB out (open question 1).
- Token route (`api/agora/token/route.ts:169`): EB is a broadcaster only when in scope.
- Done when, live-tested with a USG test account made through the real staff invite flow:
  - inside scope, every console action writes and the USG broadcasts;
  - outside scope, the USG gets a read-only console and a subscriber token.

**0.4 Camera controls follow the token (S).**
- Derive `amHost` in `LiveVideoRoom` / `ChairSessionConsole.tsx:1220` from the role the token
  route returned, not from `canControl`.
- A `canMarkDelegates` staffer who is not a broadcaster no longer sees dead camera buttons.

**0.5 Floor message matches the stage (S).**
- When a delegate is on `live.stage` without being the GSL or caucus holder ("Give the floor"
  from a tile), the delegate console says "You're on air: the chair gave you the floor".
- It must not say "The chair has the floor".
- `floorHolder` stays the only answer to "who is speaking". This is copy only.

**0.6 Live Control rows open the committee (S).**
- Each "Sittings running now" row links to
  `/dashboard/chair/committee/{eventId}/live?committee=…` (organizer bypass already exists).

**0.7 Stale sittings close themselves (M).**
- New `api/cron/close-stale-sittings` (admin SDK, `CRON_SECRET`) plus a daily `vercel.json` cron.
  It closes sessions whose `dateStr` is before today in the event's timezone, whose phase is not
  `closed`, and which are not finalized.
  - Each one gets `phase: "closed"`, `live.stage: []` and `live.callEnded: true`.
  - Bounded query: `collectionGroup("sessions")` filtered by `phase` and `dateStr`, `limit(200)`.
    Add the needed `fieldOverrides`/index to `firestore.indexes.json`.
- When a chair opens today's console, close the same committee's older open sittings (≤ 1 read
  each).
- Live Control shows past-day leftovers as "Not closed · Close" instead of "running".
- Done when the 2026-09-29 and 2026-10-07 UNSC sittings show as closed.

**0.8 Non-delegate applicants get watch-only (S).**
- The delegate route (`conferences/[id]/live/page.tsx:47-51`) shows a watch-only console for
  applications whose role isn't a delegate role: board and video, no action bars.
- Today they see buttons that every rule denies.

**0.9 Staff observer / faculty advisor entry (S).**
- The web observer dashboard gets a "Watch live" link into the read-only chair console. That
  console and its subscriber token already exist.

**0.10 RN chair seeds the agenda (S).**
- `mobile/src/app/chair/[id].tsx:110` passes the committee agendas to `ensureSession`, like
  `ChairSessionConsole.tsx:533`.

**0.11 Owner action: Agora co-host authentication.**
- Turn it on in the Agora Console for the project, or ask Agora support. After that, only a
  publisher token can publish.
- Verify: a subscriber-token client that calls `publish` is rejected.

**Deploy:** rules (0.2, 0.3), indexes (0.7), Vercel (all), `CRON_SECRET` env.

## Phase 1 — Read tightening (M–L)

The audit found sessions, committee docs and RTDB presence readable by any signed-in user.

**1.1 Members marker.**
- Add `events/{id}/members/{uid}` = `{ role, committee }`, written by the server on:
  - application approval / committee change;
  - staff accept / role change;
  - organizer setup.
- Backfill with a one-off admin script.

**1.2 Rules.**
- Sessions and their subcollections, and `committeeDocs`: read if member of the event (committee
  match for delegates), or staff, or App Admin.
- Cost: 1 `exists()` per listen or query, not per document.
- Measure on the emulator with a live sitting before deploying.

**1.3 RTDB `sessionPresence`.**
- Write only your own uid, and only into a session of an event you're a member of. Do this with
  a small mirror `/eventMembers/{eventId}/{uid}`, written alongside 1.1, since RTDB rules can't
  read Firestore.

**1.4 Verify.**
- A random signed-in account is denied.
- Every role in the matrix (Phase 9) still works.

## Phase 2 — Phone foundations (M)

**2.1 `API_URL`.**
- Set `EXPO_PUBLIC_API_URL=https://mun-saas-roan.vercel.app` in `mobile/.env`. The Kotlin build
  reads it.
- First confirm that the deployment's `NEXT_PUBLIC_FIREBASE_PROJECT_ID` is `mun-platform-saas`:
  call `/api/agora/token` with a test ID token and expect 200/403, not 401 "Invalid token".
- Unblocks: Agora token, Members, AI assist, Pay Fee, seat availability.

**2.2 Seats for every role (Kotlin `ContentRepo` seats + Today "Chairing" → "Your sessions").**

| Role | Phone entry |
|---|---|
| Chair-tier staff | their committee → chair console |
| EB in scope | committees in scope → chair console (full control, per 0.3) |
| Organizer / co-organizer | Live Control + every committee → chair console |
| Staff observer / faculty advisor | committees → watch-only console |
| Non-delegate applicant | own committee → watch-only console |
| App Admin | Profile → "Observe live sessions" |

**2.3 Capability model.**
- Port `canControl` / `canDais` / `isChairOf` / `can(perm)` from
  `chair/committee/[id]/live/page.tsx` into `domain/live/StaffAccess.kt`, with tests.
- Every chair-console control reads from it, so a watch-only role sees the board without the
  buttons.

## Phase 3 — Video on the phone (L)

**3.1 SDK.**
- Add the Agora RTC Android SDK (pin the newest 4.x at implementation time, Maven Central).
- Permissions: `CAMERA` and `RECORD_AUDIO`, requested only when going on air.

**3.2 Token + channel.**
- Port `lib/agora/channel.ts` and the client half of `useAgoraLive.ts`:
  - POST `/api/agora/token` with the ID token;
  - join in live mode;
  - host if the returned role is publisher, else audience at the ultra-low-latency level;
  - renew on `onTokenPrivilegeWillExpire`;
  - re-token when `live.stage` changes.

**3.3 Stage behaviour.**
- A delegate on `live.stage` becomes host and publishes camera and mic. They get a clear
  "You're on air" bar with mic/cam toggles.
- When cleared, they unpublish and switch to audience.
- Mirrors `useAgoraLive.ts:162-171,274-330`.

**3.4 Tiles.**
- Native `SurfaceView` tiles: the speaker as hero, the dais as a filmstrip, self-preview when on
  air, mute and raised-point badges, like `VideoTile.tsx`.
- Light/dark rules from the live console theme do not apply to the stage, which is always dark.

**3.5 Chair on the phone.**
- Publishes by role.
- "Give / clear the floor" on any tile writes `setStage`; the repo function already exists.
- "End call / restart call" ports `endLiveCall`.

**3.6 Lifecycle.**
- Leaving the screen or backgrounding the app unpublishes the camera. Audio may continue only
  while the live screen is open.
- If audio continues in the background, `FloorService` gains the `microphone` foreground type,
  declared in the manifest.
- The lock-screen notice keeps working.

**3.7 Ghost observer on the phone.**
- Never call the host role, and always join as audience. This keeps the "NEVER drop
  `!isObserver`" invariant of the token route.

**3.8 Screen share (last, optional).**
- `MediaProjection` plus the Agora screen-capture extension, for a presenting delegate.

Done when:
- phone chair ↔ web delegate video works both ways;
- a phone delegate called by the web chair goes on air and comes off it;
- in a phone ceremony audience, the organizer is visible;
- a phone observer is not visible to anyone;
- a token renewal survives a forced 2-minute TTL in dev.

## Phase 4 — Presence on the phone (S–M)

**4.1** Add the Firebase RTDB Android SDK.
- Port `useSessionPresence`: write on join, `onDisconnect` remove, join/leave pills bottom-left.

**4.2** The RTDB connection is opened only on a live screen and closed on leave, to protect the
100 cap.

**4.3** The observer never writes presence (invariant).

## Phase 5 — Phone chair: everything the web chair has (L)

**5.1 Session lifecycle.**
- Suspend, resume and adjourn (close), with confirms.
- Idle guard ported from `ChairSessionConsole.tsx:1833-1860`: warn after 2 minutes idle,
  auto-close after a 15 s grace period.

**5.2 Finalize.**
- Port `finalizeSession` (`sessionService.ts:3520`), which writes the day's markings and the
  final rollup.
- Uses the existing marking ports (`markingScore` rules), with JUnit parity tests against the
  web's vitest cases.

**5.3 Speakers lists.**
- Add a delegate, remove one, drag to reorder, and add from a tile.
- Applies to both GSL and caucus lists: `setGslQueue`, `setCaucusQueue`, `enqueueSpeaker`.
- Port `setCaucusCountry`.

**5.4 Caucus.**
- Start moderated or unmoderated directly (without a motion), extend, set topic.
- `startModCaucus` / `startUnmodCaucus` already exist in the repo.

**5.5 Votes.**
- Open a vote without a motion, extend its timer, reopen a delegate's ballot.
- `openVote` / `extendVoteTimer` / `reopenBallot` already exist in the repo.

**5.6 Documents.**
- Session docs panel: review working papers / draft resolutions / amendments, approve, reject,
  introduce.
- Endorsement status: the `committeeDocs` and `docEndorsements` paths.

**5.7 Marking.**
- Daily rubric (percentage and binary modes), quick score from a tile, the live mark strip, and
  the participation summary/report.
- Writes use single field paths only (marking write discipline).

**5.8 Vice-chair "Represent".**
- When `delegatePower` is granted, the vice-chair acts for a delegation across the whole
  delegate floor: yields, withdraw, vote-change, docs.
- Uses the proxy stamp from `slotOfSignup`. Chat, video and presence stay out, as on the web.

**5.9 AI assist.**
- An `AiAssistBar` equivalent on motion topic, point note, caucus topic and vote label.
- Calls `/api/ai/session-assist` (needs 2.1).

**5.10 Standings.**
- Publish the committee standings (`events/{id}/standings/{committee}`), as the web chair does.

## Phase 6 — Phone delegate: the rest (M–L)

**6.1 Documents.**
- Compose a working paper / draft resolution / amendment in the rich-text equivalent (markdown
  under the hood).
- Submit it, and answer the 90-second endorsement handshake: an accept/reject inbox sheet with
  a countdown.

**6.2 AI assist** on points and motions (needs 2.1).

**6.3 Status tool.**
- Own attendance, the points and motions log, and my documents' states, matching the web
  delegate console's status tool.

**6.4 Ceremony.**
- The "Opening Ceremony · LIVE · Join" card on Today and Conference home.
- The ceremony screen: watch, and get the floor if the organizer promotes you (needs Phase 3).

**6.5 Watch-only mode** for non-delegate applicants and staff observers: the same screen
without action bars (uses 2.3).

## Phase 7 — Phone organizer (M)

**7.1 Live Control screen.**
- The `sessionsOpen` switch, the participant note, and the sittings list (live, closed, and past
  "Not closed") with enter links.
- Writes `events/{id}/liveControl/state` like the web.

**7.2 Ceremony host.**
- Start, rename, enter and end opening/closing ceremonies.
- The organizer publishes, and a floor panel promotes speakers to `live.stage` (ceremony rules
  stay organizer-only).

**7.3 Enter any committee** as organizer → full chair console (2.2 / 2.3).

## Phase 8 — Phone EB, observers, App Admin, projector (M)

**8.1** EB console scoped by 0.3; the out-of-scope view is read-only.

**8.2** Staff observer / faculty advisor: watch-only console, subscriber video.

**8.3 App Admin.**
- List live sessions (bounded, same server route as `admin/live-sessions`, no polling) and
  observe one.
- Video is invisible (3.7), no presence, and the join is audited by the token route.
- Force-stop, the same as the web monitor.

**8.4 Projector / room board on a phone or tablet.**
- A landscape full-screen board using the projector design tokens:
  - phase, clock, speaker, list, published result;
  - keep-awake, no controls.
- The web's `?view=projector` stays the main projector.

## Phase 9 — Verification matrix (M, then on every release)

For each role (organizer, co-organizer, chair, vice-chair, Director, USG, EB, staff observer,
faculty advisor, delegate, non-delegate applicant, App Admin) × each surface (web, Kotlin):

- entry gate;
- every control;
- the rule allows or denies as expected;
- video role (publisher, audience or invisible);
- presence.

Each cell is tried live with test accounts made through real flows: staff invites for
vice-chair, Director, USG, observer and faculty advisor, and an App Admin from the owner.

Also:
- Measure the Firestore reads of a 30-minute sitting with 1 chair and 3 delegates. Keep it under
  the Spark budget.
- Record the results in `android-native/PLAN.md` and in memory.

## Order and checkpoints

1. **Phase 0** → deploy → owner turns on co-host auth.
2. **Phase 2.1–2.3**: phone foundations; unblocks every server route.
3. **Phase 3 + 4**: video and presence on the phone.
4. **Phase 5**: phone chair.
5. **Phase 6**: phone delegate.
6. **Phase 7**: phone organizer.
7. **Phase 8**: EB, observers, admin, board.
8. **Phase 1**: read tightening. It comes after the phone work so the members marker covers every
   role found by then. It can move earlier if exposure worries you more than speed.
9. **Phase 9**: run throughout; full pass before K8 release.

Each phase ends with:
- tests passing (web vitest + Kotlin JUnit);
- the live checks listed in it;
- rules and indexes deployed when touched;
- a note in `android-native/PLAN.md`.

Commits happen only when the owner asks.

## Accounts needed

Made through real flows (staff invite → accept):
- a vice-chair;
- a Director;
- a USG with committee scope;
- a USG with no scope;
- a staff observer;
- a faculty advisor;
- a non-delegate applicant.

**An App Admin account must come from the owner**, because admin can't be self-granted. Kept in
the gitignored `creds.json` files, never printed.

## What remains (as of 2026-10-26)

Phases 0 and 2–8 are done and tested live, except for the items marked untested below. In
order of priority:

**1. Phase 1: read tightening. DONE on both projects (2026-10-26).**
- Production backfill: 3 events, 21 markers, reconciled exactly (missing 0, extra 0).
- Rules deployed to `mun-saas` and `mun-platform-saas`.
- Still open: a live check on production as a real delegate and as a non-member (the
  impersonation check was blocked pending the owner's OK; dev was checked live with real
  accounts).

**2. Phase 9: verification matrix (not run).**
- Test accounts that exist: organizer, chair, vice-chair with delegate power (`kt_delegate`),
  delegates France and US (`delegate`, `delegate2`), approved Observer applicant
  (`kt_observer`).
- Still to create through real staff invites: a Director, a USG with committee scope, a USG
  with no scope, a staff observer, and a faculty advisor.
- An App Admin account must come from the owner.
- Measure the Firestore reads of a 30-minute sitting (1 chair, 3 delegates) against the
  50k/day Spark budget.

**3. Built but not tested live.**
- The App Admin monitor (8.3), because there is no admin account.
- Agora token renewal under a forced short TTL.
- Phone backgrounding while on air.
- Proxy (vice-chair) caucus-signup answer and proxy vote-change request.
- Paper reject with a reason, from the phone chair.
- The room board's speaker, caucus, result and document views. They are unit-tested through
  `Focal.kt`; only roll call was seen live.

**4. Not built.**
- 3.8 screen share from the phone (optional; `MediaProjection` + the Agora screen-capture
  extension).
- 5.7 live mark strip and quick score from a tile. The Marks tab and the speech scorer make
  the same writes; port these only if wanted.

**5. Release work (Kotlin app).**
- The phone's `API_URL` points at the local dev server (`http://10.0.2.2:3100`) and debug
  allows cleartext to it. Point it at the production site before release.
- Switch the package id from `com.munpro.app.kt` to `com.munpro.app` (K8), and sign it
  properly.
- The React Native app in `mobile/` was not updated for Phases 5–8 (Kotlin-only decision).

**6. Known behaviour to decide on.** The idle guard (web and phone) counts only writes to the
session doc. Pending points, motions or requests don't keep a sitting alive. Proxy writes now
bump `keepAlive`; delegate writes don't.

**7. Owner actions.**
- Set `CRON_SECRET` on Vercel (the nightly close-stale-sittings cron).
- Turn on Agora co-host authentication.
- Provide an App Admin test account.
- Run "Repair marking records" on production (old project `mun-saas`).
- Check the Agora free-tier minutes before running a real ceremony (10,000 min/month).
- Eventually move production from `mun-saas` to `mun-platform-saas`. Until then, deploy rules
  to both.

## Progress log

Newest last. Each entry: what changed, how it was checked, what is still to deploy.

- **0.1 done (code):** "Reset Logs (DEV)" removed from the chair console. The reset now lives
  only on the App Admin live-sessions monitor, as **Reset** next to Force stop, with a confirm
  and an audit row (`session_reset`).
  - Why there: `dashboard/layout.tsx` keeps an App Admin off every non-admin page, so an
    admin-only button inside the chair console could never be reached.
  - `resetSessionDev`'s comment now says it's an admin tool.
- **0.2 done (code + rules):**
  - Dev Allocate moved off the organizer Allocation page. It is now the App Admin page
    `dashboard/admin/events/[id]/test-allocate`, linked from the admin Events row menu as
    "Test allocation".
  - The dev rule line `isEventOrganizer(...)` is gone. Only `isAdmin()` may create an
    application on someone's behalf.
  - **New holes found and closed in the same rule block:**
    - Application `create` only checked the deadline, so any signed-in user could create an
      `approved`, placed, `paid` application, for themselves or anyone. That counts as
      committee membership for the live gate and the Agora token. It now needs
      `isFreshApplication()`: status pending, no assigned committee or country, unpaid, and
      for yourself or for a teammate under your own team application.
    - Application `update` let the owner change anything, including self-approving and
      self-marking paid. It now needs `isApplicantSelfEdit()`: no placement or payment field
      changes, and status may only change to `withdrawn`.
  - `isAdmin()` hardened with `.get()`; it used to throw for every normal user.
  - Checked with the new `npm run test:rules` (Firestore emulator + `scripts/rules/rules-check.mjs`):
    19/19 cases pass. Rules dry-run compiles.
  - **To deploy:** Firestore rules.
- **0.3 done (code + rules), live test after the rules deploy:**
  - Rules: new `isEbOf` (director/USG/eb, accepted, `committeeId` empty or equal) and
    `canRunSession = canWriteMarking || isEbOf`. These now gate:
    - the session doc and its subcollections;
    - the live registry, standings, document review and markings.
  - `/chat` keeps `canWriteMarking`, so EB does not read private notes (the default).
  - `staffCommittee` treats `""` as event-wide, as the EB dashboard does.
  - UI: `useEventStaffRole.isExecBoardOf(committee)`. Live console `canControl` and the
    committee hub `canMark` use it.
  - Token route: EB broadcasts only in scope (`isEbOfThis`).
  - `rules-check` grew to 34 cases, all passing: scoped and event-wide USG, Director, an
    unaccepted invite, marking in and out of scope, EB reading chat (denied), chair reading
    chat (allowed).
  - **To deploy:** rules + Vercel.
- **0.4 done (code):**
  - Correction to the audit: the console's mic/cam/present buttons were already *disabled*
    without `publishing`, not live. They just had no explanation.
  - `useAgoraLive` now returns `hostGranted` (the token server's answer) through
    `StageControlApi`. When the server says watch-only, the console hides the three buttons.
- **0.5 done (code):** a delegate on `live.stage` who isn't the floor holder (tile "Give the
  floor") now reads "You're on air: the chair gave you the floor. Your camera and mic are live."
  in `FloorCard`, instead of "The chair has the floor. Nothing to do right now."
- **0.6 done, tested on the dev server:** Live Control rows have **Enter**. As organizer it
  landed on `/dashboard/chair/committee/{id}/live?committee=…` with full controls, and the DEV
  reset button was gone from that console.
- **0.7 done (code), partly tested:**
  - Sweep: `lib/server/staleSittings.ts`. Cron route `api/cron/close-stale-sittings`, requires
    `Authorization: Bearer $CRON_SECRET`. `vercel.json` runs it daily at 21:00 UTC.
  - Index: new collection-group fieldOverride `sessions.phase` in `firestore.indexes.json`.
  - Client:
    - `closeStaleSitting` clears `live.stage` too, not just the phase.
    - `closeEarlierSittings` runs on the chair's Start.
    - The Live Control query is now bounded to `phase != "closed"`.
  - Live Control shows earlier-day leftovers as **Not closed · Close**. Tested: the 2026-09-29
    UNSC sitting closed from the UI. 2026-10-07 is left open on purpose, to test the cron after
    the index is deployed.
  - **To deploy:** indexes, Vercel. **Set `CRON_SECRET` on Vercel.**
- **0.8 done, tested on the dev server:**
  - New shared `components/session/WatchConsole.tsx`: audience video for life plus the projector
    board, with no controls. Mode `ghost` is the admin observe page, which now uses it. Mode
    `watch` is for the room's non-participants.
  - The delegate route now:
    - admits only an **approved** application, preferring it over an older withdrawn one;
    - shows "Your application isn't approved yet" otherwise. Tested with the pending
      `kt_delegate`, which used to reach a delegate console;
    - sends an approved non-delegate role to `WatchConsole`.
- **0.9 done, tested on the dev server:**
  - The chair route renders `WatchConsole` for anyone who can't run the sitting: staff
    observer, faculty advisor, out-of-scope EB. They are gated like a delegate (the sitting must
    exist). The page now waits for the staff role before choosing chair vs watch.
  - Event-wide staff may pass `?committee=`.
  - Observer dashboard committee chips link to the live sitting.
  - Tested with a real flow: the organizer invited `kt_delegate` as Observer, and the invite
    was accepted from the bell. The chip opened "Watching — your role follows the sitting
    without taking part", and the observer received the chair's video (640×480 playing),
    invisibly.
- **0.10 done:** the RN and Kotlin chair Start now seed `session.agenda` from the committee's
  agendas, and call the new close-earlier-sittings, both matching the web. RN tsc clean,
  Kotlin builds, 213 tests pass.
- **Extra dev leftover removed:** "Delegate (dev test)" in the organizer staff-invite role list.
  It created fake delegates through the virtual-application path.
  - Left in place: "Developer Payment Mode" on Financials. The server only honours it with
    `ALLOW_DEV_PAYMENTS=true` and non-live Stripe keys (`lib/payments/config.ts`), so it is
    inert in production.
- **Phase 0 code complete except 0.11 (owner).** Web tsc clean. Waiting on deploy:
  - Firestore rules + indexes (`--project new`);
  - Vercel (needs commit + push to `main`);
  - `CRON_SECRET` on Vercel.
  After deploy: test USG/Director live, and test the cron on the 2026-10-07 leftover.
- **Phase 0 deployed (2026-10-25):**
  - Commit `d96570e` (everything pending, at the owner's choice) pushed to `main`. Vercel
    production deploy succeeded.
  - Firestore rules + indexes released to **both** `mun-platform-saas` and `mun-saas`.
  - **Finding:** the production site still runs on the OLD project `mun-saas`, client and
    server alike. It rejects new-project ID tokens. So the phone's `API_URL` is the local dev
    server (`http://10.0.2.2:3100`) for now, per the owner. Rules changes go to both projects
    until production moves.
  - Live check on `mun-platform-saas` (REST, as the France delegate):
    - self-assigning a country → 403;
    - self-marking paid → 403;
    - stamping announcements read → 200.
  - Cron test (local dev, new project): the 2026-10-07 UNSC sitting and two from another event
    were closed; today's was left open; a request without auth → 401. On production it returns
    503 until `CRON_SECRET` is set.
  - **Owner actions still open:**
    - set `CRON_SECRET` on Vercel;
    - enable Agora co-host authentication (0.11);
    - provide an App Admin test account;
    - move production to `mun-platform-saas` when ready.
- **Phase 2 done (Kotlin), tested on the emulator:**
  - **2.1:** `android-native/local.properties` sets `API_URL=http://10.0.2.2:3100` (per machine,
    gitignored). A debug-only `network_security_config` allows cleartext to `10.0.2.2` and
    `localhost`; release stays HTTPS. Members now shows dais names from `/api/events/{id}/members`.
  - **2.2:** `ContentRepo.sessionSeats` replaces `chairSeats`. Its sources are accepted staff
    docs (any role) plus events the account owns, filtered to conferences that started within
    the last 14 days. Today's "Chairing" section is now "Sessions": run seats are tinted,
    watch seats read "…, watching". Tested:
    - organizer → both committees, run;
    - event-wide Observer (`kt_delegate`) → both committees, watching;
    - chair → own committee.
  - **2.3:** `domain/live/StaffAccess.kt` (port of `useEventStaffRole` + `canControl`/`canDais`,
    with 9 JUnit cases) and `ContentRepo.staffAccess`. `ChairScreen` loads it first.
    - Non-controllers get `ui/chair/WatchBoard.kt`, read-only: floor line, clock, speaker,
      list, vote progress (no tallies), published result, present count.
    - Start/Reopen and the dais inbox appear only for those the rules accept. The chat listener
      mounts only for `canDais`.
    - `domain/live/FloorGate.floorLine` is shared by the console and the board (4 tests). It
      fixed the board showing a lapsed motions window as open.
  - 226 JUnit tests pass.
  - Note: the Director preset includes `canMarkDelegates`, which grants event-wide control even
    when scoped. UI and rules agree; it is a deliberate role default, not a bug.
- **Phase 3 (Kotlin video) done except 3.8 (screen share) and two untested checks. Tested
  live: phone ↔ web on the dev server, new project.**
  - **SDK:** `io.agora.rtc:full-rtc-basic:4.6.4` (core only, no AI/beauty extensions), with ABI
    filters for arm64-v8a and x86_64.
  - **Permissions:** CAMERA, RECORD_AUDIO and MODIFY_AUDIO_SETTINGS. They are asked only when
    the phone is about to broadcast.
  - **Code:**
    - `data/live/VideoToken.kt`: POST `/api/agora/token`. The server mints **user-account**
      tokens (the Firebase uid), so Android joins with `joinChannelWithUserAccount` and maps
      remote int uids back to accounts through `onUserInfoUpdated`.
    - `ui/live/video/LiveVideo.kt` (port of `useAgoraLive`):
      - join live mode; host if the token says publisher, else ultra-low-latency audience;
      - promote/demote on `live.stage` with serialized transitions; it converges only after
        real progress, the same guard as the web;
      - renew on `onTokenPrivilegeWillExpire`;
      - mute on background;
      - one engine per process, guarded by a lock so create and destroy never overlap;
      - an observer never switches role.
    - `ui/live/video/VideoStage.kt`: hero (floor holder, else whoever is on the stage), dais
      filmstrip, self PiP, on-air bar with mic/cam. `domain/live`: `stageFocus`, `stageLabel`,
      `videoEnded`.
    - Delegate `LiveScreen`, chair `ChairScreen` and `WatchBoard` now have the stage.
    - The chair gets an "On air" section: Put on air (roster sheet, `setStage`), Clear, End
      call for everyone (confirm, `endLiveCall`), Restart (`startLiveCall`).
  - **Verified:**
    - phone organizer broadcasts and the web delegate plays it (540×960);
    - phone "Put on air → France": the web France delegate publishes, and the phone shows
      France as hero with self PiP;
    - Clear: France unpublishes;
    - End call: the web side drops to 0 videos and the phone shows "Video call ended ·
      Restart"; Restart rejoins both sides;
    - phone France delegate given the floor by the web chair: goes on air, and the web chair
      plays the phone camera; the web chair clears it and the phone demotes;
    - phone staff Observer watches the chair video and stays invisible to the web chair.
  - **Bugs fixed on the way:**
    - `RtcEngineConfig().apply { context }` resolved to the config's own null getter;
    - unbinding a swapped tile blanked the stream that had just moved, so unbind now checks
      the bound view.
  - **Not yet tested:**
    - token renewal under a forced short TTL;
    - backgrounding while on air (code mutes camera and mic);
    - ceremony video on the phone, which needs the 6.4 / 7.2 screens.
- **Phase 4 (presence) done, tested:**
  - `firebase-database` added. `ui/live/Presence.kt` (port of `useSessionPresence` +
    PresenceToasts) uses the same `/sessionPresence/{eventId_sessionId}/{uid}` node with
    `onDisconnect`. Join/leave pills sit top-left of the video stage, live for 4 s, at most 4.
  - The RTDB socket is ref-counted: `goOnline` when the first live screen opens, `goOffline`
    when the last closes (100-connection cap).
  - Observers read but never write.
  - Write failures are logged, with one retry after 2 s. Right after a fresh sign-in the first
    write was silently refused, presumably because RTDB still had the old auth.
  - Verified:
    - phone Observer saw "France joined" when the web delegate entered;
    - RTDB had France's node but no observer node;
    - phone organizer wrote "Screens Organizer (Organizer)".
- **5.1 done, tested on the phone:**
  - A Session menu (gear): Suspend/Resume, End/Restart video call, Close Session (confirm).
  - A "Session suspended · Resume" banner.
  - Idle guard: `domain/live/idleSince` plus a "Still in session?" sheet with a 15 s
    countdown, "Continue Meeting" (`keepAlive`) and "End Now".
  - Ported `resumeSession`, `keepAlive` and `LiveSession.updatedAt`; 3 JUnit cases.
  - Verified:
    - suspend writes `phase=suspended` with `clock.suspendedAt`;
    - resume banks the break into `accumulatedMs` (20 013 ms);
    - the warning appeared after 2 idle minutes, and Continue stamped `live.keepAliveAt`;
    - an unanswered warning closed the sitting after 15 s, as on the web.
- **5.3–5.5 done, tested on the phone (organizer as chair):**
  - **Speakers list:** "Add a delegation" (roster sheet → `enqueueSpeaker`), and per-row Up and
    Remove (whole-list `setQueue` = `setGslQueue`/`setCaucusQueue`). Verified queue writes:
    [fr, us] → Up → [us, fr] → Remove → [fr].
  - **Caucus:** "Start a caucus" sheet (`ChairForms.StartCaucusSheet`: moderated or
    unmoderated, total time, per speaker, topic), plus +1 / +5 min (`extendCaucus`). Verified:
    `mod_caucus` with topic "Water security" and the signup collecting; +1 min →
    `durationMs` 660000.
  - **Votes:**
    - "Open a Vote" sheet (`ChairForms.OpenVoteSheet`, port of `VotingPanel.OpenVoteForm`):
      motion, substantive/procedural, majority / two-thirds / consensus, roll call / show of
      hands, voting time, division of the question, Security Council veto with a P5 picker.
    - ±30 s on the vote clock (`extendVoteTimer`) and on the speech clock.
    - Verified: an open vote; +30 s moved `endsAt` and `durationMs` together.
  - **New gap found and closed:** the phone chair never auto-closed a vote at its deadline
    (web `useVoteAutoClose`). Ported with the same jitter, using `finalizeVote`. Verified: a
    30 s vote became `pendingPublish` on its own.
  - **Web bug fixed:** the P5 auto-guess in `VotingPanel` compared stored country *codes* ("fr")
    to names, so it never matched. It now matches both (`isP5Country`).
  - "Reopen a ballot" needs no separate UI: it is the vote_change request, which the Queue's
    Grant already handles (`grantFloorRequest` → `reopenBallot`).
- **Web marking bug found and fixed (while preparing 5.2/5.7):**
  - `setCriterionScore` and `setScoreEntries` used `setDoc(…, {merge:true})` with dotted keys.
    In a `set`, `"scores.<id>"` is a **literal top-level field**, so every mark saved from the
    committee hub matrix and the delegate marking detail was invisible to every reader.
  - Each save also wrote `feedback: ""`, which wiped the chair's written feedback.
  - Proven on the emulator: the literal field appeared and `scores` was untouched.
  - **Fix:** both now go through `writeCriterion`, a get-or-create transaction with `update()`
    paths, the same pattern as `appendScoreEntry`. It never touches feedback and stamps
    `markMode` when missing. Verified through the real matrix UI: the doc got the nested
    `scores` map and `markMode`, and no literal field.
  - **Repair for existing data:** `lib/server/repairMarkings.ts` plus App-Admin
    `POST /api/admin/repair-markings` (paged, idempotent), and an Admin → Settings →
    Maintenance "Repair marking records" button. Tested on the emulator: literal values moved
    into the maps, feedback kept, a second run repaired 0.
  - `requireAdmin` moved to `lib/server/requireAdmin.ts`.
  - **Owner action:** after deploy, run the repair on production (old project). Lost feedback
    can't be recovered.
- **5.2 + 5.7 (finalize, daily marking) done on the phone, tested against live data:**
  - `domain/Marking.kt`: port of the daily half of `markingScore.ts` (criterionPct, isScored,
    computeDailyScore, isAttended, scales), with 9 JUnit cases ported from
    `markingScore.test.ts`. `EventData` gains `markingTemplates` and `scoringConfig`.
  - `data/live/MarkingRepo.kt`:
    - `daily` (subscribe);
    - `setCriterion` / `setEntries` through the FIXED write path (get-or-create; field-path
      update; never touches feedback);
    - `appendEntry`, `setFeedback`, and `finalizeSession` (same rows the web console builds).
  - UI:
    - a **Marks** tab: roster with attendance, "n of 4 scored" and the day's %. Tapping a
      delegation opens a sheet with each criterion (signed number field plus
      −100/−50/0/+50/+100 chips, or −1/0/+1 in binary mode) and feedback;
    - the **speech scorer** opens after Next/Finish on a GSL speech and appends only changed
      marks, like the web;
    - **Finalize Day** in the Session menu.
  - Verified on Firestore (France, UNSC, 2026-10-25):
    - the phone read the web's 60;
    - phone saves kept both criteria and the feedback;
    - a second save changed one criterion and kept the other and the feedback (the old web
      bug would have wiped it);
    - a speech mark gave entries [100, −50] and score 25;
    - Finalize gave `finalized: true` and docs for France (present, scores, entries, feedback)
      and the US (present_and_voting); the phone then shows "adjourned · Reopen".
  - Still to do in 5.7: the participation report.
- **5.10 (results + standings) done on the phone, tested:**
  - Ported `computeFinalScore`, `deriveDays`, `splitMarkings` and Leaderboard `rankEntries`,
    with 14 more JUnit cases from `markingScore.test.ts` plus a rank-tie case. 252 tests pass.
  - `MarkingRepo`: `committee` (one read per doc), `saveFinal` (`__final` rollup),
    `standingsVisibility`, and `publishStandings` / `unpublishStandings`.
  - Marks tab → "Results and standings" sheet: rank, country, computed %, days scored, the
    chair's overall field, final %; Save Finals; "Show scores" / "Rank only"; Publish / Update
    / Withdraw.
  - Verified:
    - France's overall 80 gave 50 % (0.7 × 37.5 + 0.3 × 80); the final doc has finalScore 50,
      computed 37.5, excluded 2 (attended-but-unscored days);
    - the standings doc is readable by the France delegate;
    - **the web hub's Awards & Results shows the identical 1/3 · 37.5 % · 80 % · 50 %.**
- **Shipped 2026-10-25:** commit `10a7e41` (marking fix, repair route, P5 guess, Kotlin Phases
  2–5 so far) pushed to `main`. The Vercel production deploy succeeded, and
  `/api/admin/repair-markings` answers 401 without a token.
  - **Owner action:** as App Admin on the live site, open Admin → Settings → Maintenance →
    "Repair marking records".
- **5.6 + 6.1 (papers) done on the phone, tested end to end:**
  - **Delegate** (`data/live/PaperDesk.kt`, `ui/live/Papers.kt`):
    - "Your papers" with status, chair note, Read and Introduce. Introduce appears when the
      floor is open for `introduce_document` and uses `proposeMotion`.
    - "Write a paper" composer: type, title, markdown text, sponsors/signatories from today's
      roll.
    - With endorsers: created as `collecting-endorsements` + `endorsementEndsAt`, fanned out
      via `/api/docs/endorsements`, and finalized via `/finalize` when the window closes or
      all have answered (idempotent).
    - An "Asked to endorse" inbox (collection-group, Accept / Decline with countdown).
    - Best-effort chair email via `/api/notify/committee-doc`.
  - **Chair** (`ui/chair/DocsReview.kt` in the Queue tab; awaiting papers count in the Queue
    badge): Read, Approve, Reject with a reason, On screen / Take off screen
    (`publishDocToProjector` / `unpublishDoc`).
  - **Verified:**
    - phone France submitted "Humanitarian corridors" (doc: submitted, working-paper, fr,
      markdown);
    - phone organizer saw it under "Papers to review · 1" and approved it (moved to Approved);
    - On screen set `session.publishedDoc`; Take off cleared it.
  - **Still to test:** Reject with a reason, and the sponsor/signatory handshake with a second
    delegate.
- **5.9 + 6.2 (AI assist) done, tested:** `ui/kit/AiAssist.kt` calls `/api/ai/session-assist`
  (✦ Suggest, Improve once there is text, More with `exclude`; hidden without API_URL).
  - Wired into: delegate motion topic (`motion_topic`, with committee, country, phase, agenda
    and recent topics), chair caucus topic (`caucus_topic`), open-a-vote label (`vote_label`),
    and paper reject reason (`dismiss_reason`).
  - Verified on the phone: the caucus form returned 3 suggestions ("Maritime security in the
    Red Sea", …), and tapping one filled the topic.
  - **Gap noted:** phone points send no note, though the web lets a delegate add one
    (`point_note`). Will close in Phase 6.
- **6.x point note done:** RaiseSheet has a note step (with AI `point_note`) before Send; the
  note rides `raisePoint`. Verified through the proxy path below ("Proxy test inquiry" landed on
  the point doc).
- **5.8 Vice-chair Represent done, tested** (`ui/chair/Represent.kt`, people button in the chair
  nav bar, shown only for `canActAsDelegate && isChairOf(committee)`):
  - Level 1: the committee roster, attention-sorted like the web (hasn't voted / hasn't answered
    the caucus → holds the floor → N waiting → A–Z).
  - Level 2: acting-as header, attendance, ballot (`castBallotAsProxy` → `ballotProxies`),
    vote-change ask, caucus signup answer (same `signupId`), Ask to speak / Ask for the floor,
    RaiseSheet under the DELEGATION's own capabilities, MyFloor yields, withdraw list, papers
    (compose, consent answers, introduce) — every write stamped `proxyBy`/`proxyByName`.
  - Chat, video and presence deliberately left out (as on the web).
  - Proxy writes bump `live.keepAliveAt`: they land in subcollections the idle guard can't see.
  - Papers: a proxy can't run the delegate's own queries, so it reads the committee listener
    (`reviewDocs`) filtered by `submittedBy`, and consent requests per collecting paper
    (`PaperDesk.endorsementsForDocs`, path reads — the collection-group rule only lists your own
    rows). Represent closes the window for every paper this vice-chair authored, whichever
    delegation is open.
  - Chair Queue + speakers list now show "By proxy · Name" (the web's ProxyChip).
  - **Verified live** (vice-chair = kt_delegate, made vice-chair + committee + delegate power via
    the organizer's real staff page, re-accepted via the bell): point+note, floor ask, speak ask
    (seated with the stamp carried onto the GSL slot), unmod-caucus motion, withdraw, proxy
    ballot, paper for France with the US as sponsor → accepted as the US by proxy → finalized
    (sponsors fr+us), yield to questions (`yieldProxyBy`).
  - **Web bug found + fixed:** accepting a staff invite rebuilt the staff doc and dropped
    `delegatePower` (so every role re-accept silently removed delegate power).
    `NotificationsContext.handleAcceptInvite` now carries it over.
  - **Not tested:** caucus-signup answer and vote-change ask by proxy (same repo calls as the
    delegate's, with the stamp).
  - **Security fix, deployed 2026-10-26 (commit e78a8f4, rules on BOTH projects):** staff
    self-create used to accept ANY role when `inviteStatus=='accepted'` (any user could make
    themselves co-organizer of any event). Now a self-write must name its source — `sourceId`
    (invite / legacy doc addressed to the caller, copied without widening role, permissions,
    committee or delegate power) or `sourceApplicationId` (approved chair application → role
    chair, all-false permissions). Self-update = accept/decline only, or restore the recorded
    previous role. 16 new emulator cases (old rules fail 10). Verified live: a REST self-promote
    gets 403; a real invite → bell accept still works.
- **5.7 participation report done, tested (2026-10-26):** finishes Phase 5's marking item.
  - `domain/live/Report.kt`: port of `buildCommitteeReport` / `toReportRow` /
    `summarizePoints` / `yieldsFor` (+ `withRollAttendance`); 6 JUnit cases. 258 tests pass.
  - `SessionRepo.committeeReport` (dais: session, participation, points, votes, log — one-shot)
    and `myReportRow` (delegate: own participation + own points + log + session roll).
  - `ui/live/SessionReport.kt`: `CommitteeReportSheet` (stat tiles, per-delegation lines with
    O/I/PP/PI points and yields, voting record, Refresh) and `OwnReportSheet`; both have a day
    picker and **Share** (plain text through the Android share sheet; the web has Print/PDF).
  - Entry points: chair Session menu → Session Report; the adjourned screen; "Session Reports"
    on the pre-start screen (earlier days); delegate conference page → Session report.
  - Verified on 2026-10-25 UNSC data: the chair and the France delegate saw the same numbers
    (3 speeches, 1:14, points 1/0/0/1, 2 motions, 5 votes, yielded to the US, 7 votes).
  - **Web + phone bug found and fixed:** the report read attendance from participation docs
    only, but answering roll call yourself (`declareOwnAttendance`) writes only the sitting's
    roll. Self-declared delegates showed "—", quorum undercounted (1/1 with 2 present), and a
    present delegate who never acted had no row. New pure `src/lib/services/reportAttendance.ts`
    (+5 vitest cases) merges the roll; used by `buildCommitteeReport` and the web delegate view.
  - Not ported: the live mark strip and quick score from a tile (the Marks tab and speech
    scorer cover the same writes).
- **Phase 6 finished on the phone (2026-10-26), all tested live:**
  - **6.3 Status tool:** LiveScreen ends with "Your points" (ruled points, the delegate's note
    and the chair's note, Recognised / Not recognised) and a Status section (seat, committee
    phase, delegates present). Verified: a web-recognised point with a note shows up as
    "Recognised".
  - **6.4 Ceremony:** `ui/live/Ceremony.kt`.
    - `CeremonyBanner`: one `liveControlOnce` read per event, shown on Today and the
      conference page.
    - `CeremonyScreen` (`CeremonyRoute(eventId, kind)`): LIVE header, count on the floor,
      video on the `__ceremony__<kind>` channel. The host broadcasts; a speaker broadcasts
      while on `live.stage`. Only staff and the host publish presence.
    - The delegate gate's `ceremony_only` verdict now has a "Join …" button.
    - Verified: web organizer started the opening ceremony; the phone (France) saw the banner,
      joined and watched the host. The organizer gave France the floor and the web host
      received the phone's 540×960 stream. Ending it showed "has ended".
    - Host floor picker / End on the phone are Phase 7.
  - **6.5 Watch-only for approved non-delegate applications:**
    - `isDelegateApp` / `watchesOnly` (domain/Applications.kt).
    - Today shows a "Watching" seat instead of "Application sent", and `pickCurrent` includes
      these conferences (before this, an approved observer had NO conference on Today).
    - The conference page shows a watch-only "Committee session" entry and never the
      delegate pass.
    - LiveScreen renders the WatchBoard: observer video, read-only presence, no chat
      listener, no points/hands/motions listeners.
    - Verified: a new account was created on the phone, applied as Observer (UNSC), was
      approved by the organizer on the web, and watched the chair's video watch-only.
  - Test accounts: `kt_observer` (Olivia Observer, approved Observer, UNSC) added to
    `mobile/.e2e/creds.json`.
- **Phase 7 (phone organizer) done, tested live (2026-10-26):**
  - **7.1 Live Control** (`ui/organizer/LiveControl.kt`, `LiveControlRoute`; a "Live Control"
    row on Today for each event the account runs, and "Open Live Control" on a chair's waiting
    screen when sessions are shut):
    - the sessions switch and the participant note;
    - sittings as a one-shot read with Refresh (`SessionRepo.openSittings`). Each row has
      phase, present count and on air; tap to enter. An earlier day's row says "Not closed"
      and has Close;
    - "Other committees" to enter a committee not sitting yet;
    - the two ceremonies (title, Start / Start again, Enter room, End, Rename).
    - Repo writes mirror `liveControlService.ts` field by field: `setSessionsOpen`,
      `setLiveControlNote`, `setCeremonyTitle`, `startCeremony` (room doc first), and
      `endCeremony` (closes the room doc).
    - Verified on Firestore: switch off/on and note save leave the ceremonies untouched.
  - **7.2 Ceremony host:** the organizer broadcasts in `CeremonyScreen`. The people button opens
    `CeremonyFloorSheet`: accepted staff + approved applicants read once, searchable,
    Give / Take back, max 6, names stamped into `session.staff`. End Ceremony.
    - Verified: phone started "Closing Ceremony 2027". The web France delegate watched the
      phone host (540×960). Phone gave France the floor; the web began publishing and the phone
      featured France. Phone End: web showed "has ended" and the doc read closing: ended.
  - **7.3:** the organizer enters any committee from Live Control and gets the full chair
    console.
  - Test tooling: `mobile/.e2e/signin.py WHO` signs the phone in from creds.json without
    printing anything. On the emulator, swipes over an open keyboard become gesture typing:
    close it with keyevent 4 before scrolling.
- **Phase 8 done on the phone (2026-10-26):**
  - **8.1 EB scope:** `StaffAccess` already ran a scoped EB in its committee only and watched
    the rest (tested). The gap was `ContentRepo.sessionSeats`, which listed only the EB's own
    committee. A scoped EB now gets every committee: theirs to run, the rest as watch seats.
  - **8.2 Staff observer / faculty advisor:** already done in Phase 2 (WatchBoard, subscriber
    video, no presence). Approved non-delegate APPLICANTS were added in 6.5.
  - **8.3 App Admin** (`ui/admin/AdminLive.kt`): "Live Sessions" in Profile for
    `role == "App Admin" | "admin"` (requireAdmin's test).
    - The list reads the same `/api/admin/live-sessions` GET (registry-backed, 60 s server
      cache). It loads on open and on Refresh, with no polling.
    - Observe = ghost: `VideoRoom(observer = true)`, presence read-only (`publishSelf = false`),
      WatchBoard "App Admin, invisible".
    - Force Stop = the same POST.
    - **NOT tested live:** there is no App Admin test account (still an owner action). Built
      against the route's exact JSON shape.
  - **8.4 Room board** (`ui/live/RoomBoard.kt`, `RoomBoardRoute`; chair Session menu → Room
    Board, and a button on the watch-only board):
    - landscape, keep-awake, system bars hidden, light-locked (LightPalette), no controls;
    - masthead (committee, event, phase, present), the focal block, and the speakers/caucus
      list, with the floor line underneath.
    - New `domain/live/Focal.kt` ports `focalState.ts` `resolveFocal` / `focalQueue` (5 JUnit
      cases; 263 tests pass). The caucus speaker comes from `floorHolder`, never
      `gsl.activeSpeaker`.
    - Vote tallies are never shown (blind until published).
    - Verified: the UNSC board showed "Roll call · 1 of 2 delegations present"; leaving it
      restored portrait and the chair console.
- **Phase 1 (read tightening) built, live on DEV (2026-10-26):**
  - Marker `events/{id}/members/{uid}` = `{role, committee, kind}` plus the RTDB mirror
    `/eventMembers/{eventId}/{uid}`. Both are written ONLY by the server
    (`src/lib/server/membership.ts`), recomputed from the owner, accepted staff and approved
    applications; asking for a marker you don't qualify for deletes it. Rules deny all client
    writes.
  - `POST /api/members/sync`: `{eventId}` self-heals your own marker; `{eventId, userIds}` is
    for the organizer, a co-organizer or an admin.
    - Called from `updateApplication` on any status change, the dev-allocate create path,
      staff update/remove, and invite accept.
    - Self-heal (awaited before subscribing, since a denied listener is never retried): web
      NotificationsContext, the delegate live page, the ceremony page, CommitteeDocsDelegate
      and admin observe. Kotlin `data/Membership.kt` gates LiveState, CeremonyScreen,
      AdminObserve and myReportRow.
    - An admin's self-sync arms `/platformAdmins/{uid}`, so the ghost observer can read
      presence.
  - `POST /api/admin/backfill-members` (App Admin, paged) plus an Admin Settings → Maintenance
    "Build membership" card. It rebuilds each event whole and deletes stale markers.
  - Firestore rules:
    - `isEventMember` and `canReadLive` = member || staff || organizer || admin;
    - sessions read = canReadLive || uid on that sitting's roll (free, read off the doc);
    - votes / motions / points / requests / motionQueue = canReadLive || `onSessionRoll`;
    - circulating committeeDocs and nested docEndorsements = canReadLive;
    - `members` is read by self, staff and organizer; write false.
    - Event-scoped, not committee-scoped, on purpose: a committee-name mismatch must never lock
      a delegate out. 16 new emulator cases; 66 pass.
  - RTDB: presence moved to `/sessionPresence/{eventId}/{sessionKey}/{uid}` on web and Kotlin
    (rules can't parse the old `eventId_sessionId` key). Read = member or platform admin;
    write = own uid and member (removal always allowed).
  - Verified on dev:
    - backfill: 2 events, 13 members;
    - a brand-new account is denied the sitting, its points and presence (403/401), and its
      self-sync returns no marker;
    - a member is allowed; a stranger syncing someone else gets 403; the organizer syncing the
      observer writes her marker;
    - the web chair and delegate consoles and the phone delegate screen load with no permission
      errors, and presence shows France (phone) and the chair (web) at the new path.
  - Production rollout pending (see "What remains" item 1).
  - The React Native app (`mobile/`) does not self-heal. It relies on the backfill, the
    approval sync and the roll-call fallback.
- **Phase 1 rolled out to production (2026-10-26):** pushed `25e72e1` (Vercel OK). Backfilled
  `mun-saas` from the parked old-project admin credentials: 3 events, 21 members, a read-only
  reconcile showed 0 missing and 0 extra. Then deployed `firestore:rules,database` to the old
  project.
- **Phase 9 started (2026-10-26):**
  - **Test accounts, all through real flows.** Each was signed up, onboarded on the phone, then
    accepted an organizer's web invite from the bell. Stored in `mobile/.e2e/creds.json`:
    `kt_director` (Director, all committees), `kt_usg_unsc` (USG, scoped to UNSC),
    `kt_usg_all` (USG, all), `kt_staff_observer` (staff Observer), `kt_faculty` (Faculty
    Advisor). Each got its membership marker automatically from the accept sync. Helpers:
    `onboard.sh FIRST LAST`, `matrix.sh WHO`, and `signin.py` (now clears the fields first).
  - **Web fix:** the staff page only let chair, vice-chair and director have a committee, so a
    USG could not be scoped from the UI. USG and EB now get the picker ("All committees" =
    event-wide).
  - **Phone matrix (UNSC sitting live, UNDP not sitting):**
    | Role | Today | UNSC | Dais chat | Video |
    |---|---|---|---|---|
    | Director (all) | both run | full console | **yes** (see finding) | publisher |
    | USG (UNSC) | UNSC run, UNDP watching | full console | no | publisher |
    | USG (all) | both run | full console | no | publisher |
    | staff Observer / Faculty | not run: emulator lost Firebase connectivity (host link slow) | | | |
  - **Finding (owner decision):** the Director role preset grants `canMarkDelegates`, which
    also opens the dais private chat (StaffAccess.canDais, matching the rules). The 2026-10-25
    decision said the EB does not read private dais chat by default. Either drop
    `canMarkDelegates` from the Director preset or accept it.
  - **Bug found + fixed (regression from 6.5):** `ApplicationRepo` turns accepted staff seats
    into virtual approved applications, and `watchesOnly` counted those with a committee as
    observer applicants. So chairs, vice-chairs and scoped USGs got an extra "watching" row
    on Today that opened the watch-only screen. Virtual seats now carry `fromStaffSeat` and are
    excluded (WatchesOnlyTest, 3 cases; 266 pass). The phone re-check is pending connectivity.
  - **Observed:** Firebase Auth "No connection" on the emulator while its Wi-Fi reconnected,
    with 300–500 ms RTT and a slow host link. Not an app bug; recheck on a real device.
  - **Still to run:** staff observer and faculty on the phone; every role on the web; App Admin
    (needs the owner's account); Firestore read measurement of a 30-minute sitting.
- **2026-10-28: Kotlin is the only mobile app; it targets munpilot.com.**
  - The React Native app (`mobile/`, 71 tracked files) was removed at the owner's request.
  - The Kotlin build no longer reads `../mobile/.env`. Its Firebase config (`mun-platform-saas`)
    and `API_URL=https://munpilot.com` live in `android-native/local.properties` (git-ignored).
  - The e2e tooling and test credentials moved to `android-native/.e2e/` (git-ignored): actor.js,
    drive.py, signin.py, onboard.sh, matrix.sh, creds.json (13 accounts, merged).
  - `tsconfig.json` / `.dockerignore` no longer mention `mobile`.
  - References to `mobile/` elsewhere in this plan are historical.
