# QR passes, coupons and scanning: plan

Web + Kotlin app. Written 2026-11-01. Build one phase at a time and stop for the owner's OK after each.

## Owner decisions (2026-11-01)

| Question | Decision |
|---|---|
| Scope | Meal coupon scan, custom coupons / gifts, arrival check-in, transport boarding, QR on ID cards |
| Who gets a coupon | The organizer picks per coupon: delegates, EB / chairs, staff, faculty, observers, everyone, or named people |
| Who scans | The owner and co-organizers always; other staff need a new permission, **Can scan passes** |
| Where scanning runs | Kotlin app (camera) **and** website (browser camera), so iPhone and laptop volunteers can scan |
| QR model | **One personal pass per person per event.** The scanner picks what it is scanning ("Day 1 Lunch", "Check-in Day 2", "Bus A"), then scans passes one after another |
| Forgery | **Signed QR checked by the munpilot server.** Knowing someone's id is not enough to make their code |
| No internet at the venue | **Online only.** A scan needs a connection; without one the scanner says so plainly. Nothing is ever redeemed twice |
| Free vs Pro | **Meal scanning on Free.** Custom coupons, check-in, transport scanning, ID-card QR and the full report are Pro (new plan feature `passes`) |

Defaults I chose (change any before building):
- A coupon can be used **once per person** unless the organizer sets more (for example 2 drinks).
- **Scanning outside the meal time** is not blocked: the scanner gets a warning and can accept anyway, and the override is recorded.
- A scanner can **undo** a scan for 5 minutes (wrong person, wrong meal). The organizer can undo at any time.
- The organizer can **reset someone's pass** (lost phone, shared screenshot). The old QR stops working at once.

## What exists today

- **Meal slots** (`events/{id}/foodSlots`: meal name, day, time window as text, venue): organizers create them on the web and in the app (`Tools.kt` FoodSlotsScreen). Every approved delegate sees every slot as a coupon.
- **App:** shows a real QR (`applicationId:slotId:day`) full screen and brightens the screen (`ui/conference/Modules.kt`). The transport boarding pass (`applicationId:routeId`) works the same way.
- **Web:** the QR is a fake 5x5 picture that no scanner can read (`FoodCouponsModule.tsx` QRCodeDisplay).
- **Missing:**
  - scanning, and any record that a coupon was used;
  - coupons for EB / staff;
  - targeting a coupon at chosen people;
  - check-in;
  - a QR on ID cards;
  - any report.
- **Design boards:** B3.1 "used ones fade" and B3.2 "One scan per meal" assume a used state that does not exist.

## Design

### The pass code

```
MP1.<eventId>.<uid>.<version>.<sig>
sig = base64url(HMAC-SHA256(PASS_SECRET, "MP1|eventId|uid|version")) cut to 22 chars
```

- **`PASS_SECRET`** is a server-only env on Coolify, not `NEXT_PUBLIC`, so it is never in the browser or the app.
- **`version`** lives in `events/{eventId}/passes/{uid}` (server-only doc `{version, issuedAt, resetAt?, resetBy?}`). Resetting a pass bumps it, and old codes then fail with "This pass was replaced".
- **The code carries no name, role or coupon.** Everything is decided on the server at scan time, so a coupon added after the pass was issued works with the same QR.
- **The holder gets their code from `GET /api/passes/mine?eventId=`**, which needs sign-in and an event-member marker. The app saves it, so the QR shows with no internet. Only scanning needs a connection.

### Who a person is in the event

The scan route resolves the holder from `events/{eventId}/members/{uid}` (`{role, committee, kind}`, already written by `membership.ts`), plus the name and photo from `users/{uid}`.

Audience groups map from that marker:

| Group | Rule |
|---|---|
| `delegate` | kind applicant, a delegate role (`isDelegateRole`) |
| `observer` | applicant, `isObserverApp` |
| `faculty` | applicant, `isFacultyRole` or team lead |
| `eb` | staff, `isExecBoardRole` or `isChairTierRole` |
| `staff` | any other accepted staff (co-org included) |
| `everyone` | any member |
| named | an explicit uid list |
| committee | optional narrowing: only these committees (`sameCommittee`) |

**Old meal slots without an audience keep today's behaviour:** approved applicants only.

### Targets: what a scan redeems

| Target id | Source | Eligible | Uses |
|---|---|---|---|
| `meal:<slotId>` | `foodSlots/{slotId}` (+ new `audience`, `usesPerPerson`) | slot audience | per slot, default 1 |
| `coupon:<couponId>` | new `events/{id}/coupons/{couponId}` | coupon audience | per coupon, default 1 |
| `checkin:<day>` | the event's days (same day list the app uses) | everyone | 1 per day |
| `ride:<routeId>:<day>` | `transportRoutes/{routeId}` | holder's application id in `registeredDelegates` | 1 per route per day |

Custom coupon doc:

```
{ title, note?, kind: "gift"|"meal"|"drink"|"kit"|"other", day?, startsAt?, endsAt?, venue?,
  audience: { groups: string[], uids?: string[], committees?: string[] },
  usesPerPerson: number, active: boolean, createdBy, createdAt }
```

**Meal slots** gain optional `audience`, `usesPerPerson`, and `startsAt` / `endsAt` (parsed from the time-window text when the organizer edits, so the old text keeps displaying).

### Redemptions

- **Doc:** `events/{eventId}/redemptions/{targetId}__{uid}`, written only by the server:
  ```
  { holderUid, holderName, target, targetTitle, count, lastAt, lastBy, lastByName,
    history: [{ at, by, byName, override?: "outside_window", undone?: { at, by } }] }
  ```
- **Updates:** each scan updates this doc in a Firestore **transaction**. Two volunteers scanning the same person at the same moment cannot both succeed.
- **Holder reads:** the holder reads their own redemptions (`where holderUid == uid`), so their coupons show "Used at 1:12 PM" and fade, as board B3.1 intended.
- **Report:** reads `where target == X`.

### Scan route

`POST /api/passes/scan {eventId, code, target, override?}` does these steps in order:

1. **Check the code:** the signature, then the version against `passes/{uid}`.
2. **Check the scanner:** owner, co-org, App Admin, or accepted staff with `permissions.canScanPasses`.
3. **Check the plan:** `meal:` works on any plan; the other targets need `resolvePlan(event).features.passes`.
4. **Load the target and the holder**, then check eligibility (audience, route registration).
5. **Check the time window.** Outside it, and with no `override`, the route answers `outside_window` and redeems nothing.
6. **Redeem in a transaction:** if `count >= usesPerPerson` the answer is `already_used`, with when and by whom; otherwise `count+1` and a history entry.

**Answer:** `{ result, holder: {name, photoUrl, role, committee, country}, target: {title}, usedAt?, usedBy?, remaining }`.

**Results:**

| Result | Shown as |
|---|---|
| `ok` | green |
| `already_used` | amber, with time and scanner name |
| `not_eligible` | red |
| `outside_window` | amber, with an "Accept anyway" button |
| `invalid` | red, "Not a MUN Pilot pass" |
| `wrong_event` | red, with the event name |
| `replaced` | red, "This pass was reset" |
| `not_allowed` | red, scanner lacks permission |
| `pro_required` | red, "This needs a Pro event" |

**Other routes:**
- `POST /api/passes/undo {eventId, redemptionId}`: the scanner who made the scan can undo it within 5 minutes; the owner / co-org can undo any time. It marks the history entry and does `count-1`.
- `POST /api/passes/lookup {eventId, code}`: who this is and what they still have, without redeeming anything. Needs the scan permission.
- `POST /api/passes/reset {eventId, uid}`: owner / co-org only. Bumps the version and is audited.
- `POST /api/passes/codes {eventId, uids[]}`: owner / co-org, Pro. Codes for the ID-card PDF, up to 500 per call.

### Read budget (Spark: 50k reads / day)

- **One scan costs 4 reads before caching:** pass version, member marker, target doc, redemption doc. It also costs 1 write.
- **Caching:** munpilot is one long-running Node container on Coolify, so a 5-minute in-memory cache of event + plan, the scanner's permission, targets, member markers and user names cuts a busy lunch queue to about **1 read + 1 write per scan**.
- **Example:** 300 people × (3 meals + check-in) ≈ 1,200 scans a day ≈ 1.5–5k reads.
- **Holder coupon list:** one query of their own redemptions when the screen opens, no polling.
- **Report:** reads one target's redemptions on demand, no live listener on the whole collection.

### Plan feature

- **New key:** add `passes` to `PlanFeatures`, `ALL_FEATURES`, `NO_FEATURES` and `FEATURE_LABELS` ("QR passes: coupons, check-in, transport"), the admin `PlanEditorDialog` and app `Plan.kt`.
- **Migration needed:** legacy events are stored as `tier: custom, source: legacy` with an explicit `features` map, so a new key would read as **off** for them. `scripts/migrate-event-plans.mjs` gets a `--add-feature passes` step that sets `plan.features.passes = true` on every legacy event. Paid Pro already resolves to `ALL_FEATURES`.

### Firestore rules (deploy to mun-platform-saas)

| Path | Read | Write |
|---|---|---|
| `events/{id}/passes/{uid}` | none | none (server) |
| `events/{id}/redemptions/{rid}` | holder (`resource.data.holderUid == uid`), owner / co-org, staff with `canScanPasses`, admin | none (server) |
| `events/{id}/coupons/{cid}` | event members | owner / co-org; only when `planFeature('passes')` |
| `events/{id}/foodSlots/{sid}` | unchanged | unchanged; new fields allowed |
| `staff/{uid}.permissions` | — | the invite / edit shape accepts the new key `canScanPasses` |

`npm run test:rules` gets cases for each row.

## Screens

### Holder (delegate, EB, staff), web + app

- **My pass:** a large QR with name, role, committee, the event and "Show this to staff". The app brightens the screen.
  - Web: in the conference portal (delegate) and the chair hub / staff portal (EB, staff).
  - App: a Pass tile on the portal and in the chair hub.
- **My coupons:** meals, custom coupons, check-in days and rides, each "Ready" / "Used at …" / "2 of 3 left"; used ones fade (board B3.1). The old per-coupon QR screens are replaced by My pass.
- **Web QR:** a real one, from the `qrcode` package (the fake grid goes).

### Organizer, web + app

- **Meal slots:** the existing editor plus "Who gets it", "Uses per person" and a start / end time.
- **Coupons (Pro):** create, edit and pause custom coupons; audience picker (groups, committees, people search).
- **Scan screen:**
  - pick the target (today's meals first, then coupons, check-in for today, rides);
  - the camera stays open, and each scan shows a big result card for 2 seconds with vibration and sound, then scans the next;
  - "Undo" on the last card;
  - **Find by name** for the owner / co-org when a phone is dead or broken (recorded as a manual redeem).
- **Report (Pro; Free shows only "redeemed / eligible" per meal):**
  - each target: redeemed / eligible / not yet, with a list, who scanned, when, overrides and undos;
  - check-in by day: who arrived and who didn't;
  - CSV export.
- **Staff editor:** a new **Can scan passes** switch (web + app); on by default for co-organizer.
- **Pass reset** on a person's row (the staff list and the applications list).

### Scanner tech

- **App:** CameraX + ML Kit barcode scanning (bundled model, about +2.5 MB, so it works without Play Services downloading a model at the venue).
  - The app already has the CAMERA permission.
  - The QR encoding (zxing) stays.
- **Web:** `qr-scanner` (nimiq; runs in a worker, works in iOS Safari and Android Chrome) on `/dashboard/organizer/events/[id]/scan`.
  - Staff with the permission reach it from their portal.
  - It needs HTTPS (munpilot.com has it).

### ID cards (Pro)

- The ID-card template gets **Show pass QR**. `IdCardsDocument` draws the QR from `qrcode` data URLs, and the codes come from `/api/passes/codes`.
- Printed cards and phones carry the same code. Resetting a pass invalidates its printed card too, and the reset dialog says so.

## Phases

### Phase P1 · Pass foundation

1. `PASS_SECRET` on Coolify (owner OK needed to set the env) and in `.env.local`.
2. `src/lib/server/passes.ts`: sign / verify, version doc, member + holder resolution, audience groups, in-memory cache.
3. Routes `GET /api/passes/mine` and `POST /api/passes/reset`.
4. Rules: `passes`, `redemptions` (read side). Tests.
5. Holder **My pass** screen on the web (real QR) and in the app; remove the fake web QR.

### Phase P2 · Scanning meals (Free)

1. `canScanPasses` permission: `PermissionsMap`, `ROLE_PRESETS`, rules, web staff editor, app staff editor.
2. Meal slots: audience, uses, start / end (web + app editors).
3. Routes `scan`, `undo` and `lookup`, with the transaction, time-window override and results above.
4. Web scan page (`qr-scanner`) and app scan screen (CameraX + ML Kit), with Find by name.
5. Holder **My coupons** with used state (web + app).
6. Free report: redeemed / eligible per meal.
7. Needs an app release afterwards (new camera code).

### Phase P3 · Custom coupons (Pro)

1. `passes` plan feature + legacy migration (`--add-feature passes`), the admin plan editor and the app `Plan.kt`.
2. `coupons` collection, rules and tests.
3. Organizer coupon editor with the audience picker (web + app).
4. Coupons in My coupons and in the scanner's target list.

### Phase P4 · Check-in and transport (Pro)

1. `checkin:<day>` and `ride:<routeId>:<day>` targets in the scan route.
2. Scanner target list: today's check-in and rides.
3. The old boarding QR is replaced by the pass; My coupons shows each ride.

### Phase P5 · ID cards and reports (Pro)

1. `/api/passes/codes`; **Show pass QR** on the ID-card template and in the PDF.
2. Full report page: per target, check-in by day, CSV export, overrides and undos.
3. App: a report summary for the organizer (counts and the not-yet list).

Each phase ends with: type check, `npm run build`, `npm run test:rules`, rules deployed to mun-platform-saas, emulator test of the app parts, a commit, then STOP. Coolify redeploy and the app release happen only when the owner asks.

## Not in this plan

- **Offline scanning:** the owner chose online only.
- **Roll-call attendance and marks:** check-in is a separate record of who arrived at the venue. It does not feed roll call or the final score.
- **The old project `mun-saas`:** rules and migration stay on mun-platform-saas only, as with the plan rules.

## Status

- **P1 built (2026-11-01).** `src/lib/server/passes.ts`, `GET /api/passes/mine`, `POST /api/passes/reset`, rules for
  `passes` and `redemptions` (live on mun-platform-saas, 9 new rule cases), web My Pass tab (delegate portal and
  chair hub) with a real QR, app My pass sheet (portal tile, committee hub tile, Food and Transport). The fake web
  QRs are gone. Verified locally: codes sign and decode, reset bumps the version, non-members get 403.
- **Before munpilot can issue passes:** `PASS_SECRET` must be set on the Coolify app, then a redeploy. The app's
  My pass needs that deployed server (it calls munpilot.com).
- The e2e event "Screens Model UN 2027" now has the food module on and one slot (Lunch, Day 1) for testing.
- **P2 built (2026-11-01).** Scan engine in `src/lib/server/passes.ts` (2-minute cache, transaction per scan, a new
  meal is found at once), routes `scan`, `undo`, `lookup`, `people`, `report`; `canScanPasses` staff permission
  (web + app editors, on for co-organizers); meal slots get "Who gets it" and "Uses per person" (web + app); the
  time window is read from the slot's existing time text, so no new time fields. Web scanner
  `/dashboard/scan/[eventId]` (qr-scanner) with Check only, Find by name (organizer, recorded manual), Undo,
  "Accept anyway" and Claimed so far; links from the event sidebar and, with the permission, the chair hub. App
  `ScanScreen` (CameraX frames read by zxing, so no ML Kit). Holders see only their meals, used ones faded.
  - Verified locally against the real project: permission, invalid and tampered codes, audience, outside window
    and override, uses per person, three simultaneous scans (one ok), undo, manual redeem, report, and a real
    browser camera reading the pass. Rules: 182 cases.
  - Not run: the app scanner on the emulator (the emulator's System UI hung). It compiles and installs.
  - A pass held in front of the camera is ignored until it has been out of frame for 8 seconds, so a "Claimed"
    card is not replaced by "Already used".

- **P3 built (2026-11-01).** Plan feature `passes` (web, admin plan editor, app `Plan.kt`); legacy events got it with
  `migrate-event-plans.mjs --add-feature passes --apply` (2 events on mun-platform-saas). `coupons` collection with
  rules (organizer / co-org writes only on a `passes` plan; shape checked; 7 new rule cases, 189 total; deployed).
  Organizer Coupons page on the web (groups + named people) and in the app (Tools › Coupons, groups only; named
  people set on the web are kept). Scanners list active coupons next to meals; a coupon is read fresh at each scan,
  so pausing works at once. New scan results `paused` and `pro_required`. My Pass now lists "What your pass holds"
  (meals and coupons, used state) on web and app, so staff see their meals too. My Pass and Scan show when meals or
  transport are on, or the plan has `passes`.
  - Verified locally: web coupon create with a named person, the chair's pass listing it, group / named / neither
    eligibility, lookup and report including coupons, pause and resume taking effect at once, 2-use limit.
- **P4 built (2026-11-01).** Check-in `checkin:d<n>` (everyone, once per day) and rides `ride:<routeId>:d<n>` (only
  applications registered on the route; the route is read fresh at each scan, so a new registration boards at
  once), both Pro. Event days come from one shared rule (`eventDays` in passAudience.ts, app `eventDays` in
  Plan.kt; the app's day labels now use it too). Scanners list today's check-in and rides first; lookup, report
  and "What your pass holds" include them ("Checked in 9:02" / "Not yet"). Free reports show meals only.
  - Verified locally: check-in once per day, everyone eligible, unknown day refused; ride registered / not
    registered / no application / registered a moment ago / day 2 separate; lookup and report counts; check-in
    refused with `pro_required` when the plan loses `passes` (restored). No rule change in P4.
- **P5 built (2026-11-01). All five phases are done.** `POST /api/passes/codes` (organizer, Pro: signed passes for
  many people at once; non-members left out). ID cards print each person's pass QR on the web (react-pdf) and in
  the app (inline SVG from zxing), behind a "Print QR passes" switch on Pro events; long text beside the QR wraps.
  Pass report page (`/dashboard/organizer/events/[id]/passes`, sidebar "Pass Report"): every item with claimed /
  eligible, and on Pro, per item who claimed it (time, scanner, by hand, outside time, undone) and who hasn't, plus
  a CSV of every item × every person. The app's "Claimed so far" opens the same detail for the organizer.
  - Verified locally: codes match My Pass and skip non-members; non-organizers refused; detail and CSV correct,
    scanners get counts but not the detail; every QR on the printed ID-card PDF decodes to a valid pass, and the
    delegate's card carries the same code as their phone. No rule change in P5.
