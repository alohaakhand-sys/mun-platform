# MUN PRO — native Kotlin app: plan

> **2026-10-28:** the React Native app (`mobile/`) has been removed; this Kotlin app is the only
> mobile app, and it runs against https://munpilot.com (Firebase `mun-platform-saas`). References
> to `mobile/` below are historical (the port's source). Test tooling moved to
> `android-native/.e2e/`.

A full rebuild of the MUN PRO mobile app in **Kotlin + Jetpack Compose**, laid out to the 43-screen
mockup in `mobile/design/placard-screens.html`. The Expo/React Native app in `mobile/` stays as it
is and keeps working; nothing in it changes. Both apps talk to the same Firebase project
(`mun-platform-saas`) under the same Firestore rules, so a delegate can use either one, or the
website, interchangeably.

**Rule for the whole rebuild: nothing the RN app does may be lost.** The checklist at the end of
this file lists every RN screen, component, hook and behaviour, and every mockup screen. Each item
is ticked only when the Kotlin app does it and it has been tried on the emulator against live data.

---

## 1. Decisions

| Question | Decision |
|---|---|
| Language / UI | Kotlin 2.x, Jetpack Compose. Material 3 only as plumbing (ripple-free, no Material look). Every visible component is our own, drawn in the iOS idiom of the mockup. |
| Where | `android-native/` at the repo root, next to `mobile/`. A plain Gradle project, no Expo. |
| Package id | Namespace `com.munpro.app`. During the rebuild the APK installs as `com.munpro.app.kt` so it sits beside the RN app on the same phone/emulator. Switched to `com.munpro.app` at release (§7, K8). |
| Min / target SDK | minSdk 26 (Android 8), targetSdk/compileSdk 36. |
| Backend | Firebase Android SDK (BoM): Auth, Firestore. Started from the web config via `FirebaseOptions` (apiKey, projectId, appId, …) read from `local.properties`/`mobile/.env` at build time, so **no `google-services.json` is needed until push** (K7). |
| Navigation | Navigation Compose with type-safe `@Serializable` routes; tab host with 4 tabs (Today, Discover, Schedule, Profile). |
| State | `ViewModel` + `StateFlow` per screen; Firestore listeners wrapped as `callbackFlow` and collected with lifecycle, so a listener closes when its screen leaves (Spark read budget). No DI framework: one `AppGraph` object holds singletons. |
| Local storage | Firestore's own **disk persistence** (the Android SDK has it; the RN JS SDK did not) + Jetpack DataStore for small device-side state (appearance, chat "seen" stamps, announcement read marks, recent searches, saved-at times). |
| Fonts | Inter (OFL), bundled as `res/font/inter_*.ttf`, weights 400/500/600/700/800. |
| Build | Gradle wrapper, run from the short drive `M:` (`subst M: "D:\SHUVO SOFTWARE\MUN Platform"`), `JAVA_HOME` = Android Studio `jbr`, `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`. `gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk` (debug-signed until K8). |

## 2. The big consequence: the shared logic has to be ported

The RN app imports the website's TypeScript services directly (`../src/lib`), so it can never
drift from the web. Kotlin cannot import TypeScript. Every function the app uses is therefore
**re-written in Kotlin, one Kotlin file per TypeScript file**, same names, same order of
functions, a header comment naming the source file and the git commit it was ported from.

Drift guards:
1. **Ported unit tests.** The web already has vitest suites for the pure floor logic
   (`floorGate`, `motionFloor`, `motionMootness`, `caucusList`, `rollCall`, `sessionChatModel`,
   `yieldClock`, `paymentGate`, `sessionClock`). Each is ported case-for-case to JUnit in
   `app/src/test/`. Same inputs, same expected outputs.
2. **`PORTED_FROM.md`** in `android-native/` lists every ported file with its source commit. When a
   web service changes, `git diff <commit> -- src/lib/services/<file>` shows exactly what to
   carry over.
3. **Live cross-checks.** Each live feature is tested with the phone and the web console on the
   same session (the method used for the RN app: `mobile/.e2e/` tools and test accounts).

### What gets ported (source → Kotlin, package `com.munpro.app.domain` / `.data`)

Pure logic (no Firebase):
- `services/sessionService.ts` — the types (`LiveSession`, `SpeakerSlot`, `Timer`, `Motion`,
  `MotionParams`, `RaisedPoint`, `FloorRequest`, `Ballot`, `AttendanceStatus`, `ActiveVote`,
  `PublishedResult`, `ParticipationIdentity`, `DelegateRosterEntry`, `TimerPath`…), `POINT_META`,
  `FLOOR_REQUEST_META`, `makeSessionId`, `newTimer`, `timerRemainingMs`, `gateEndsAt`,
  `eligibleVoterCount`, `castCount`, `computeVoteResult`, `compareMotionPrecedence`,
  `motionSummary`, `DuplicateMotionError`, constants (`VOTE_DEFAULT_SECS`,
  `SIGNUP_WINDOW_DEFAULT_SECS`, `MOTION_INVITE_DEFAULT_SECS`).
- `services/motionMeta.ts` — `MOTION_META`.
- `services/floorGate.ts` — `INITIAL_GATE`, `ALL_DELEGATE_MOTION_TYPES`, `HOLDS_FLOOR_NO_POINT`,
  `isSeated`, `floorOccupancy`, `floorHolder`, `floorSpeechClock`, `capabilitiesFor`,
  `gateHeadline`, `holdsTheFloor`, `isSittingPhase`.
- `services/motionFloor.ts` — `motionInviteState`, `motionsInOrder`, `isLiveMotion`,
  `myLiveMotion`, `duplicateMotionNote`, `POINTS_STILL_OPEN`.
- `services/motionMootness.ts` — what `executeMotion` needs (`supersededByExecution` and its
  helpers) plus `isAutoResolved`, `motionOutcomeWord`.
- `services/caucusList.ts` — all of it (`caucusListState`, `orderSignups`, `orderGslSignups`,
  `mergeSignupOrder`, `slotOfSignup`, …).
- `services/floorRequests.ts` — `grantFloorRequest`, `REVOTE_GRACE_MS`, `REVOTE_EXTEND_MS`.
- `services/yieldClock.ts`, `services/rollCall.ts`, `services/sessionDate.ts`,
  `services/proposableMotions.ts`, `services/sessionChatModel.ts`.
- `components/session/gate/liveGate.ts` — `resolveLiveGate`, `liveGateCopy`.
- `services/eventService.ts` (pure part) — `getEventStartMs`, `getApplicationTimeline`,
  `isApplicationOpen`, `getEnabledRoleTiers`, `getEffectiveRoleUnitPrice`, `getRolePrice`,
  `getRolePriceInfo`, `getCommitteeChoicesAllowed`, `getCommitteeDifficulties`,
  `getCommitteeAgendas`, the `EventData`/`ScheduleItem`/committee types.
- `services/paymentGate.ts` — `getPaymentGate`, `formatFee`, `formatDueLabel`.
- `services/applicationService.ts` (pure part) — `buildLegacyChoices`, types.
- `services/announcementService.ts` (pure part) — `isUserInAudience`.
- `services/staffService.ts` (pure part) — `isChairTierRole`, `roleLabel`, role helpers.
- `utils/committee.ts` — `belongsToCommittee`, normalise/same-committee.
- `data/countries.ts` — the full country table (`getCountry`, `getCountryName`).

Firestore reads/writes (same document paths, same field names, same batching/transactions):
- `sessionService.ts`, delegate side: `subscribeSession`, `subscribeMyPoints`, `subscribeMyHands`,
  `subscribeMyMotions`, `subscribeRecognizedPoints`, `declareOwnAttendance`, `raiseHand`,
  `cancelHand`, `raisePoint`, `cancelPoint`, `proposeMotion`, `cancelMotion`, `castBallot`,
  `requestVoteChange`, `requestYield`, `declareOwnYield`.
- `sessionService.ts`, chair side: `subscribeRequests`, `subscribePoints`, `subscribeMotionQueue`,
  `ensureSession`, `setPhase`, `reopenSession`, `openGate`, `closeGate`, `startRollCall`,
  `stopRollCall`, `completeRollCall`, `setAttendance` (+ `markingService.mirrorAttendanceToMarkings`,
  which attendance writes carry), `timerStart`, `timerPause`, `nextSpeaker`, `clearActiveSpeaker`,
  `nextCaucusSpeaker`, `endCaucus`, `seatGslList`, `seatCaucusList`, `resolvePoint`, `resolveHand`,
  `declineYieldRequest`, `acceptYieldRequest` (via `grantFloorRequest`), `recognizeMotion`,
  `dismissMotion`, `putMotionToVote`, `executeMotion` (+ `committeeDocService.updateCommitteeDoc`),
  `bumpTally`, `finalizeVote`, `publishVoteResult`, `discardPendingPublish`, and whatever these
  call internally (`openVote`, `closeVoteAtomic`, `resolveMotionAfterVote`, `bumpParticipation`, …).
- `sessionChatService.ts` — `sendDelegateNote`, `sendDaisReply`, `sendDaisBroadcast`,
  `subscribeMyThread` (the exact query shape: the /chat rule depends on it), `subscribeChatInbox`.
- `liveControlService.ts` — `subscribeLiveControl`, types.
- `eventService.ts` — `getPublishedEvents`, `getEventById`.
- `applicationService.ts` — `getUserApplications` (read-only variant: no staff-doc migration),
  `getApplicationsByEvent` (chair roster), `submitApplication` (identical payload).
- `announcementService.ts` — `getAnnouncements`.
- `notificationService.ts` — `subscribeMyNotifications`, `markAllNotificationsRead`.
- `resultService.ts` — `getUserAchievements`.
- `optionalModulesService.ts` — `getRulesGuide`, `getStudyGuide`.
- `committeeDocService.ts` — `listApprovedCommitteeDocs` (Documents screen), `updateCommitteeDoc`.
- `activityService.ts` — `logActivity`.
- Position paper: the fields the web's `PositionPaperUpload.tsx` writes on the application
  (`positionPaperContent`, `positionPaperFormat`, `positionPaperUpdatedAt`).
- The chair-seat query from `mobile/src/lib/chair.ts` (collectionGroup `staff`, `uid ==`,
  `inviteStatus == accepted`).

## 3. Design system (from the mockup)

Tokens, exactly the RN `theme/tokens.ts` values (which the mockup's "System" panel fixes):
- Light: bg `#F2F2F7`, cell `#FFFFFF`, fill `rgba(118,118,128,.12)`, label `#000`, label2
  `rgba(60,60,67,.60)`, label3 `rgba(60,60,67,.30)`, separator `rgba(60,60,67,.20)`, tint `#0A7C57`,
  tintSoft `rgba(10,124,87,.12)`, onTint `#FFF`, red `#FF3B30`, orange `#C76A00`, orangeSoft, pass
  `#0E1D2C`, tabBar `rgba(249,249,249,.86)`.
- Dark: bg `#000`, cell `#1C1C1E`, tint `#34B98A`, red `#FF453A`, pass `#16293A`, … (all RN values).
- Type: largeTitle 32/38 −1.1 bold, title2 22/27 −0.6, headline 17/22 semibold, body 16/21,
  bodyMedium, subhead 14/19, footnote 13/17, caption 11/13.
- Radii: cell 12, button 14, pass 18, field 10. Gutter 16, section gap 24.

Components (`com.munpro.app.ui.kit`), each a Compose port of the RN component or a mockup element:
`MunTheme` (palette via CompositionLocal, follows Automatic/Light/Dark), `Screen` (large title that
collapses into the nav bar on scroll, overline, trailing action, pull-to-refresh), `NavBar` (back
chevron + previous screen's name, centred title, trailing), `Section`/`Cell` (inset grouped,
hairline separators inset past the leading accessory, pressed state, value, chevron, dim,
destructive, tinted), `IconTile`, `MunButton` (filled/tinted/plain, loading), `Capsule` button,
`Field` (label + input row), `Essay` (multiline + counter), `Segmented`, `SearchField`, `Empty`,
`ErrorText`, `Chevron`, SF-style icons (Today/Discover/Schedule/Profile/Search/Back/Bell/Chat/…),
`TabBar` (translucent, hairline top, filled icon when selected), `PageSheet` (slides up, grabber,
Cancel/Done header), `ActionSheet` + `SheetRow`, `PickerSheet` (searchable), `IosAlert` (centred
two-button dialog, replaces RN `Alert.alert`), `Stepper` (− / +), `Pill`, `Badge`, `OfflineBanner`,
`Markdown` reader, `DateTile` (Calendar-style month/day), `Ring`, `StepTracker`, `ChatButton`.

The **Pass** (`ui/pass/Pass.kt`): ink card, country colour band on top, flag, committee,
conference, country name auto-shrunk to fit, delegate name, seat line; sizes full/compact/ghost;
press-and-hold (380 ms) raises it with a spring lift + medium haptic, tap lowers it.

Haptics on: raise placard, button taps (selection), vote cast, sheet open, send success.

## 4. Architecture

```
android-native/
  PLAN.md  PORTED_FROM.md  settings.gradle.kts  build.gradle.kts  gradle/libs.versions.toml
  app/src/main/java/com/munpro/app/
    MunApp.kt            Application: Firebase init, connectivity watcher
    MainActivity.kt      edge-to-edge, theme, NavHost, deep-link intake
    AppGraph.kt          singletons (auth, repos, datastore)
    domain/              PORTED pure logic (one file per TS file) + models
    data/                Firestore mapping helpers, repositories (ported services), cache
    ui/kit/              design system components
    ui/pass/             the delegation pass
    ui/auth/             Welcome, SignIn, SignUp, ForgotPassword, Onboarding
    ui/today/ ui/discover/ ui/schedule/ ui/profile/
    ui/event/ ui/apply/ ui/conference/ ui/reader/ ui/documents/ ui/members/
    ui/live/             delegate floor, raise sheet, vote, result, my floor, chat
    ui/chair/            chair console, chair chat
    nav/                 routes, deep-link mapping (port of +native-intent.tsx)
  app/src/test/          ported vitest suites
```

Firestore mapping: documents are read as `Map<String, Any?>` and mapped by hand into data classes
(fields drift between web versions: a value can be a Timestamp, millis or an ISO string). A small
`Fields` helper reads each type leniently, the way the TS code tolerates it. Writes use maps with
the exact keys the TS code writes, `FieldValue.serverTimestamp()`, `deleteField()`,
`arrayUnion`, `increment`, batches and transactions where the TS uses them.

## 5. Traps already known (carried over from the RN build, see `mobile/PLAN.md`)

- Session id = committee + day **in the event's timezone** (`sessionDateStr`); chair and delegate
  must agree.
- `floorHolder`/`floorSpeechClock` are the only answer to "who is speaking"; never read
  `gsl.activeSpeaker` directly.
- `yieldTo: "none"` is the default on every slot; it never means "yielded back to the chair".
- Attendance entries may lack `delegateId`/`country`: read the uid from the map key.
- The delegate chat query shape IS the /chat rule; widen it and the listener dies.
- Offline answers: never save or route on an offline/empty answer (with disk persistence an
  uncached query still answers empty `fromCache`). The profile doc "missing from cache" is
  "don't know", not "not onboarded".
- Firestore listener freeze after a Wi-Fi↔cellular switch was a long-polling (JS SDK) problem;
  the Android SDK uses gRPC and handles it, but it is **re-tested** (`adb shell svc wifi
  disable/enable`) before the live phase is ticked.
- Spark plan: listeners only where the RN app had them; nothing polls; chair-only listeners only
  mount on the chair console.
- Chair: never auto-close; one dialog/sheet at a time (the RN Modal ANR does not apply to Compose,
  but one-surface-at-a-time is kept as UX).

## 6. What the mockup has that the RN app never built

These are part of "the exact UI", so they are built. Some need something outside the app; those
are built up to that point and marked **BLOCKED (reason)** until it exists.

| Mockup screen / element | Status |
|---|---|
| Sign in: "Forgot password?" | Build (Firebase password reset email). |
| Discover search with matched committee rows + recent searches | Build (recents in DataStore). |
| Event page: Seats, Organiser rows | Build (organiser name from event doc). |
| Committee: "Open" chip | Build (from application timeline). |
| Apply: drag to reorder country choices | Build. |
| Apply: "Draft with AI" | BLOCKED (needs the deployed site URL for `/api/ai/writing-assist` with Bearer). Hidden until `API_URL` is set. |
| Apply: Edit beside each part on Review; Submitted: "View application" | Build. |
| Today tracker with dates and "usually reply within N days" | Build (dates from the application). |
| Pass "Seat N of M" | Build if the seat order is derivable (country index in committee list); otherwise omitted. |
| Today: position paper due row, latest announcement row | Build. |
| Conference home: next session with Join, Documents count, Members, Message the chair | Build. "Message the chair" outside a sitting: the /chat rules only allow it inside a session → the row opens the session chat when a sitting is open, else explains when it opens. |
| Announcements unread blue dot; announcement page with sender avatar | Build (read marks in DataStore). |
| Documents (from the dais / yours / committee) | Build (`listApprovedCommitteeDocs`, study guide, rules, position paper). |
| Position paper: write, import .md, import PDF text, submit, deadline | Build, same fields as the web (`PositionPaperUpload.tsx`); PDF text via PdfBox-Android. |
| Members (dais, then delegations) | Build from the event's committee countries + allocated seats the rules let a delegate read; the dais list depends on staff-read rules → verified in K3, else "Dais" shows only names the session exposes. |
| Schedule → Session detail (time, committee, where, agenda, Join Session) | Build. |
| Notifications: tap opens the screen it is about | Build (route from the notification's link/type). |
| Profile: 3 numbers (Conferences, Awards, Papers), My conferences | Build. |
| Payments: "Pay Fee" | BLOCKED (checkout route needs Bearer + the deployed URL). Button opens the website's payment page in the browser once `API_URL` is set. |
| Settings: notification toggles | Built with K7 (stored on the user doc, used by the push sender). |
| Settings: Delete account | BLOCKED (the web has no account deletion; needs a server route to clean up data). Shown with an explanation until then. |
| Live: point-waiting banner, full-screen "recognised", roll-call card, full-width vote, result with "France voted for", "~2 min" turn estimate, motion form sheet, signup screen | Build. |
| Lock screen: ongoing notification "Algeria 0:42 · You speak 3rd, in about 2 min" | Build in K7 as a local foreground-service notification while the live screen is open (no server needed). |
| Push "You're France in the Security Council…" | BLOCKED (FCM: `google-services.json` + a server route on the deployed site). |
| Offline Today: "You're offline. Showing what was saved at 1:52 PM", Saved badges | Build. |

## 7. Phases

Each phase ends with an APK installed on the emulator and the phase's checklist tried against
live data. Nothing moves to the next phase with an unticked item, except ones marked BLOCKED.

**K0 — Foundation.** Gradle project, version catalog, Firebase init from the web config, Inter,
theme tokens (light/dark/automatic), the whole component kit, Pass, tab bar + navigation shell,
auth gate (signed out → Welcome; signed in, not onboarded → About you; else tabs), Welcome,
Sign in (+ Forgot password), Create account, About you (date picker) writing the exact web
fields + display name, auth error messages, Discover listing real events. **Done when:** the APK
installs, signs in with a test account, and lists real conferences.

**K1 — Find and apply.** Discover (search, recents, Upcoming/Past, date tiles, fees), Event page
(cover under status bar, Apply row, facts, committees, about), Committee, Apply wizard (role with
prices, ranked preferences with full-committee checks, drag reorder, experience/motivation with
counters, review with Edit, submit = `submitApplication` + `logActivity`, Submitted), the
conferences store (applications + events, current conference rule). **Done when:** a new account
finds a conference and applies, and the web organiser sees the identical application.

**K2 — Your conference.** Today (all three states: nothing, tracking, pass + next session + paper +
announcement; Chairing section), Conference home, Announcements (+ unread), Reader (announcement,
rules, study guide; markdown), Schedule (day switcher, now in red) + Session detail,
Notifications (grouped, mark read, tap-through, bell badge), Profile, Achievements, Payments,
Settings (appearance, change password, sign out). **Done when:** an allocated delegate sees their
pass and everything about their committee, same as the RN app and the mockup.

**K3 — Documents and members.** Documents, Position paper (write / .md / PDF text, submit, due
date), Members. **Done when:** a paper submitted on the phone shows on the web chair's paper
viewer.

**K4 — Port the live logic + tests.** All pure ports from §2 with their JUnit suites passing, then
the Firestore session services. No UI yet beyond a debug screen. **Done when:** every ported test
passes and a debug read of a live session matches the web console.

**K5 — Committee floor (delegate).** Entry gate copy, clock, floor headline + window countdown,
floor holder with progress, MyFloor (yield sheet, yield to delegation, waiting card, can't-yield
note, points-against-you cards), recognised point (90 s), point waiting + withdraw, roll call,
signup join/withdraw, vote (confirm, final, change request), published result, speakers list with
"(you)" and turn estimate, Your motions with withdraw/status words, seat status, Raise Placard
sheet (points, signup, motions through the gate with dimmed duplicates and limits, motion form with
steppers, "Motion sent"), chat with the dais (Messages layout, notices, unread badge, send gate,
throttle). **Done when:** the full delegate run used for the RN app passes on the Kotlin app:
declare → motion → vote → result → execute → caucus signup → GSL signup → seated → "You have the
floor" → yield → chat both ways, with the web chair console on the other side.

**K6 — Chair lite.** Chairing entry on Today, start/reopen sitting, gate sheet (kinds + windows),
clock start/pause, next/finish, caucus, seat signups, Queue (points, motions by precedence,
requests via `grantFloorRequest` with "they'd get M:SS"), Roll (start/stop/complete, P/P&V/Late/Abs),
Vote (counts, tally ±, close & record, publish/don't), dais inbox (announcements with confirm,
threads per delegation, unread). **Done when:** the RN chair test run passes with the phone as
chair and two web delegates.

**K7 — Offline, links, notifications.** Offline banner + saved-at time + Saved badges, cached
conferences/profile/reader/announcements (never overwritten by an offline answer), reconnect
reload, Wi-Fi switch test on a live session, deep links (`munpro://…` and site paths, the RN
`+native-intent` table; back falls to Today on a cold link), ongoing session notification,
notification preference toggles; FCM push when unblocked. **Done when:** airplane-mode launch shows
the saved conference; links open the right screens; the lock screen shows the floor during a
sitting.

**K8 — Release.** Real upload key, applicationId `com.munpro.app` (replaces the RN app on the Play
Store listing), R8/minify, app icon/splash from `mobile/assets`, Play listing, privacy policy,
data-safety form, internal → closed → production tracks.

## Progress

- **K0 — done (2026-10-25).** AGP 9.3.3 / Kotlin 2.4.20 / Gradle 9.7.1 / Compose BOM 2026.09 /
  Firebase BoM 34.4, compileSdk 37. `build.cmd` builds from `M:`. Firebase starts from the web
  config in `mobile/.env` (no google-services.json): sign-in, sign-up and Firestore all work.
  Kit, Pass (country band sampled from the emoji flag), tab shell, auth gate, Welcome, Sign in,
  Forgot password, Create account, About you. Tried on the emulator with live data.
- **K1 — done.** Discover (search, committee hits, recents), Event, Committee, Apply (drag
  reorder, Review with Edit, Submitted + View application). A real application sent from the
  phone was read back over Firestore REST: same fields as the web's, legacy `choices` mirror and
  server timestamp included. "Draft with AI" is wired to `/api/ai/writing-assist` and hidden
  until `API_URL` is set.
- **K2 — done.** Today (tracker / pass with seat / offline variant / Chairing), Conference home,
  Announcements with unread dots, Reader, Schedule + Session detail, Notifications, Profile,
  My conferences, Achievements, Payments (Pay Fee opens the site once `API_URL` exists),
  Settings (appearance, password reset, delete-account explanation). Dark mode checked.
- **K3 — done.** Documents (dais / yours / approved committee papers), Position paper (write,
  or the text of a PDF, .docx or .md; saved on the application like the web; chairs' verdict
  from the delegate's own marking), Members (web `/members` route when `API_URL` is set, else
  the committee's public seat list).
- **K4 — done.** The live engine ported to `domain/live/` (Session, FloorGate, Motions, Lists,
  LiveGate) and `data/live/SessionRepo.kt` (every Firestore read/write the phone makes, same
  paths, fields, transactions and batches as sessionService.ts). The web's vitest suites were
  ported to JUnit (`app/src/test/.../domain/live/`, `PaymentGateTest`): 197 tests pass. Porting
  them found 5 edge-case divergences (empty-string ballot, blank documentId, zero timestamps in
  readRollCall, floor division in caucusSlots, JS `trim()` whitespace set), all fixed with a
  `DRIFT -` test each. Known gap: Firestore timestamps are millis on Android, so two signups in
  the same millisecond may order differently than on the web (nanoseconds).
- **K5 — done, tested against the live web chair console:** entry gate copy, roll call
  ("France, are you present?" → seated), motions gate restricted to the chair's types, propose
  form, vote with confirm + tiny raised pass, published result with "France voted for", execute →
  GSL signup → seated → "You have the floor", yield to questions (GSL) and to comments (caucus,
  separate rules branch), moderated caucus signup in the caucus shape, chat note (rules accepted,
  read back), point waiting → Withdraw Point bar → full-screen "recognised". Fixed on the way:
  icon-only controls now expose their label (TalkBack), the RN app's caucus signup wrote a
  `caucus_signup` without `caucusId`/`answer` (the Kotlin app uses the web's `joinSignup`).
  Yield to a delegation and dais replies were tried later, from the K6 run. Still to try with a
  second delegate: points against the speaker.
- **K6 — done, tested from the phone as chair against a live web delegate:** reopen an adjourned
  sitting, floor gate sheet (motions / speakers signup / roll call, with windows), roll register
  (P / P&V / Late / Abs) and roll call start → complete with the record written, motion queue
  (recognise → put to vote → live tally → close → publish → the result on the web → carry out),
  moderated caucus (signup gate opens itself, seat list, call speaker, speaker and caucus clocks,
  next speaker, end caucus), GSL signup → "Seat list and start", a yield-to-delegation request
  granted (the recipient gets base + carried time, `viaYield`), points recognised, and the dais
  inbox (unread counts, private reply, a confirmed broadcast shown as ANNOUNCEMENT on the web).
  Fixed on the way: the inbox crashed on open, because its sort compared an `Int` 0 fallback
  with `Long` timestamps. The same trap was in the chat sorts, and a test now covers it (198
  pass). Sign-in network failures now read "No connection…".
- **K7 — done, except push (BLOCKED).**
  - **Offline:** an airplane-mode cold start shows the saved pass with "You're offline. Showing
    what was saved at 12:42 PM." and the Saved / Not saved badges. Back online, Today reloads by
    itself.
  - **Wi-Fi drop on the live floor:** "Offline. The floor may have moved on." The web chair
    changed the gate meanwhile, and the phone caught up within 4 s of reconnecting.
  - **Deep links:** `DeepLinksTest` covers the RN `+native-intent` table. Tried on the device:
    a cold `munpro://conference/…` link, back to Today, and warm links to the event and to
    notifications.
  - **Lock screen:** `FloorService` is a foreground service of type `specialUse`, started only
    while the live screen is open. It listens to the same session doc as the screen, which
    Firestore shares, so it costs no extra reads.
    - The words come from `domain/live/FloorNotice.kt`, with 10 tests. The turn estimate is
      shared with the live list.
    - Tried against the web chair:
      - "Vote open on …" → "You voted on …";
      - "You speak next, in about 1 minute";
      - "You have the floor 0:45" while paused, then the system countdown once running;
      - an update arriving while the app was in the background;
      - gone when the live screen closes.
    - Notification permission is asked once, on the first sitting.
  - **Settings → Notifications:** "Live session on lock screen" (a device setting, on by
    default) with an iOS switch (`Toggle` in the kit).
  - **Not mirrored:** the web's `notificationPreferences` flags on the user doc. Nothing
    server-side reads them yet. The mockup's push toggles (Allocations, Announcements, Session
    starting, Point recognised) wait for FCM.
  - **Known nit:** back-button captions are fixed per screen, the same as in RN. Notifications
    reached from an event link still reads "Today", although back goes to the event.
- Test tooling: `android-native/.e2e/` (gitignored) — `run.sh` (build + install + launch),
  `drive.py` (tap/type/shot, `login WHO`, `signup WHO`), `fsread.py` (read an account's
  applications over Firestore REST), `creds.json` (adds `kt_delegate`, made through the app).

## 8. Parity checklist

Legend: `[ ]` to do, `[x]` done and tried on the emulator, `[B]` blocked (see §6).

### From the RN app (`mobile/src`)
- [ ] `theme/tokens.ts` palette light/dark, type scale, radii, spacing
- [ ] `components/ui.tsx`: Screen, Section, Chevron, Cell, Button, Field, Segmented, Empty, ErrorText
- [ ] `components/icons.tsx`: Today, Discover, Schedule, Profile, Search, Back
- [ ] `components/NavBar.tsx` (back label truncates, goBack falls back to Today)
- [ ] `components/Pass.tsx` (full/compact/ghost, hold to raise, haptics, spring)
- [ ] `components/PickerSheet.tsx` (search, disabled rows)
- [ ] `components/ActionSheet.tsx` + SheetRow (selected ✓)
- [ ] `components/OfflineBanner.tsx` (normal and live wording)
- [ ] `components/Markdown.tsx` (h1–h3, paragraphs, bullets, numbered, inline stripped)
- [ ] `components/ChatButton.tsx` (unread badge, 9+)
- [ ] `components/ChatSheet.tsx` (bubbles, tails, names, time gaps, notices, inverted list, send gate, throttle, char counter, denied state, Back, confirmSend)
- [ ] `components/ChairChat.tsx` (Announcements first, roster threads sorted, unread)
- [ ] `components/MyFloor.tsx` (yield menu, yield to delegation, pending, can't re-yield, points against you, 90 s window)
- [ ] `lib/auth.tsx` (sign in/up/out, profile listener, cached profile, offline-missing guard, onboarding write + displayName, role rule, authMessage)
- [ ] `lib/appearance.tsx` (Automatic/Light/Dark persisted)
- [ ] `lib/conferences.tsx` (apps + events, current rule, committeeOf, isAllocated, findConference by app or event id, cached, reload on reconnect)
- [ ] `lib/cache.ts` (saved copy first, isOnline guard, clear on sign-out)
- [ ] `lib/connectivity.ts` behaviour (listeners survive network switch — re-tested)
- [ ] `lib/announcements.ts` (visible statuses + audience)
- [ ] `lib/reader.ts` (announcement/rules/guide, cached)
- [ ] `lib/format.ts` (calTile, when, fromPrice, place)
- [ ] `lib/session.ts` (sessions, nextSession, untilLabel, clock, dayKey, dayLabel)
- [ ] `lib/country.ts` (flag emoji, names)
- [ ] `lib/api.ts` (Bearer calls to the site; null when no URL)
- [ ] `lib/live.ts` (useLive: control → session → my points/hands/motions, verdict, caps, 1 s clock, fmtClock)
- [ ] `lib/chat.ts` (useLiveChat, useDaisChat, seen stamps)
- [ ] `lib/chair.ts` (useChairSeats read-only, useChairLive, roster rule, identityFor)
- [ ] `app/_layout.tsx` gate (3 states) and every route registered
- [ ] `app/+native-intent.tsx` link table
- [ ] `(auth)/index` Welcome (three fanned passes)
- [ ] `(auth)/sign-in`, `(auth)/sign-up`
- [ ] `onboarding`
- [ ] `(tabs)` tab bar
- [ ] `(tabs)/index` Today (3 states, bell badge, Chairing, pass, next session ring, committee row, pull to refresh)
- [ ] `(tabs)/discover` (search, segmented, date tiles, read cap 40, failed/empty states, refresh)
- [ ] `(tabs)/schedule` (day segmented, now/done/next)
- [ ] `(tabs)/profile` (avatar initials, stats, Achievements/Payments/Settings, dob, phone, version)
- [ ] `event/[id]` (cover, applied/approved/rejected state, Apply + fee + closes, facts, committees, about)
- [ ] `committee` (difficulty chips, seats, agendas, about, seats list)
- [ ] `apply/[id]` (roles + web-only roles, availability/full, blocks per committeeChoicesAllowed, countries ×3 no duplicates, essays 1500, review, submit payload identical, already applied / closed, Submitted)
- [ ] `conference/[id]` (pass compact, Committee session row, next session, announcements count, study guide/rules "Not yet", schedule, details)
- [ ] `conference/announcements`
- [ ] `reader` (saved copy note, offline empty state)
- [ ] `notifications` (Today/Earlier, mark all read on open, ago)
- [ ] `account/achievements` (award colours, conference history)
- [ ] `account/payments` (due/overdue, receipts)
- [ ] `account/settings` (appearance, password reset, sign out)
- [ ] `live/[id]` (everything listed under K5)
- [ ] `chair/[id]` (everything listed under K6)

### From the mockup only (see §6)
- [ ] Forgot password
- [ ] Discover search results + recents
- [ ] Event Seats/Organiser, Committee "Open" chip
- [ ] Apply drag reorder, Review Edit, View application
- [B] Draft with AI
- [ ] Today tracker dates, position paper row, announcement row, Seat N of M
- [ ] Conference home: Join, Documents, Members, Message the chair
- [ ] Announcements unread dot, sender line
- [ ] Documents, Position paper
- [ ] Members
- [ ] Session detail
- [ ] Notification tap-through
- [ ] Profile numbers + My conferences
- [B] Pay Fee
- [ ] Notification toggles (with K7)
- [B] Delete account
- [ ] Live: point waiting banner, recognised full screen, roll-call card, vote, result line, turn estimate, motion form, signup screen
- [ ] Ongoing session notification (lock screen)
- [B] Allocation push
- [ ] Offline saved-at banner + Saved badges
- [ ] Dark appearance matches the mockup

## 9. Needed from the owner (not blocking K0–K6)

1. The deployed site URL (`API_URL`): seat availability, application emails, AI draft, Pay Fee.
2. Firebase Android app registration (or `google-services.json`) for push, and the push-sender
   route on the site.
3. A decision on account deletion (what happens to applications, marks, messages).
