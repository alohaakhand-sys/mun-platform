# Live MUN — Motion-First Design

Target design for the live committee session. Written against the observed current state
(see the current-state audit; everything referenced here was verified in code, not assumed).

> **This is a design doc, not a changelog.** It describes what Live MUN *should* be.
> Build order is at the end.

---

## 1. The one idea

**The chair opens a gate. That gate decides exactly what every delegate can do right now.**

Nothing else. Not a suggestion, not a warning, not an "out of order" hint after the fact.
If the chair has opened the floor for agenda motions, then on every delegate's screen the
*only* live control is "Propose an agenda motion". Everything else is visibly locked, with
the reason written on it.

Today the delegate console shows the whole action surface all the time and lets
`motionsInOrder()` explain afterwards why a thing was a bad idea. That is the source of the
"khap chara" feeling — the UI never tells anyone where they are in the sitting.

Motion-first means: **session state changes because a motion passed.** The chair's direct
controls still exist, but they are a labelled override, not the normal path.

---

## 2. The new primitive: `FloorGate`

One explicit field on the session document. Both consoles, the projector, and the Firestore
rules read it. It is **state, not derivation.**

```ts
export type FloorGateKind =
  | "locked"      // chair is thinking; delegates can do nothing
  | "roll_call"   // delegates declare their own attendance
  | "motions"     // delegates may propose motions — from a restricted set
  | "signup"      // delegates may join a speakers list (GSL or caucus)
  | "debate"      // someone holds the floor; points only, no motions
  | "voting";     // ballots only

export interface FloorGate {
  kind: FloorGateKind;
  motionTypes?: MotionType[];       // kind === "motions" — the ONLY types that are clickable
  signupFor?: "gsl" | "caucus";     // kind === "signup"
  signupId?: string;                // fresh per signup round, like caucus.caucusId
  allowsPoints: boolean;            // independent — chair may mute points during a vote
  endsAt: number | null;            // epoch ms; null = no window
  windowSecs?: number;
  label?: string;                   // chair's own wording, shown to delegates
  openedBy: string;
  openedAt?: any;
}
```

### Why this matters architecturally

The current code re-derives "what is happening" in **four independent places**
(`flowModel.ts`, `motionFloor.ts`, `useFloorController`, `SessionProjector`). Under
motion-first that becomes a correctness risk: two derivations disagreeing means a motion is
accepted that should have been blocked.

`FloorGate` **sidesteps the whole problem for the permission path** — permission stops being
derived and becomes explicit chair-written state. The existing derivations can stay exactly
where they are, because they now only drive *display*. This is why the consolidation work can
safely be deferred.

### One pure resolver, used by everything

```ts
// src/lib/services/floorGate.ts — pure, no firebase import (same discipline as motionFloor.ts)

export interface DelegateCapabilities {
  canDeclareAttendance: boolean;
  canProposeMotion: boolean;
  proposableMotionTypes: MotionType[];
  canSecondMotion: boolean;
  canRaisePoint: boolean;
  allowedPointTypes: PointType[];
  canJoinSignup: false | "gsl" | "caucus";
  canCastBallot: boolean;
  canRequestFloor: boolean;
  /** why each locked capability is locked — rendered directly on the disabled control */
  lockReason: Partial<Record<keyof DelegateCapabilities, string>>;
  expiresAt: number | null;
}

export function capabilitiesFor(
  session: LiveSession,
  delegateId: string,
  now: number,
): DelegateCapabilities;
```

- Delegate console renders from it.
- Chair console renders a **preview** of it — "here is what your delegates can do right now".
- Firestore rules mirror the critical subset (below).
- Unit-tested like `motionFloor.test.ts` and `flowModel.test.ts` already are.

### Timer expiry needs no server

Every timed gate carries `endsAt`. Two mechanisms, no Cloud Function, no Blaze:

1. **Client**: `capabilitiesFor()` returns everything locked once `now > endsAt`. The gate
   visually expires on its own, on every screen, simultaneously.
2. **Rules**: writes are rejected past `endsAt + 2000ms` grace — exactly the pattern the
   caucus signup rule already uses (`request.time.toMillis() < caucus.signupEndsAt + 2000`,
   `firestore.rules:421`).

The chair's *next* action performs the actual close. So a chair whose browser is asleep
cannot leave a window illegitimately open — the window is already dead by rule.

This is the answer to the existing "no chair browser = nothing fires" gap
(`useVoteAutoClose.ts:23-26`, `useCaucusAutoAdd.ts:26-28`) **for gates**. Vote auto-close is
a separate question, still open.

---

## 3. A full sitting, step by step

### Step 1 — Roll call (delegate self-declares, timed)

Today: attendance is chair-only. Chair clicks 24 names. Delegate has no say and — worse —
attendance is the hard prerequisite for *every* delegate write, so a delegate who opens the
console before the chair finishes sees a fully working UI whose every button fails.

**New:**

```
CHAIR                                    DELEGATE
┌────────────────────────────────────┐   ┌──────────────────────────────┐
│ ● ROLL CALL          ⏱ 0:42        │   │  ROLL CALL IS OPEN    ⏱ 0:42 │
│ 18 / 24 answered · quorum 13       │   │                              │
│                                    │   │  Declare your status:        │
│ ✓ Present            11            │   │                              │
│ ✓ Present & voting    7            │   │  [ Present ]                 │
│ ○ No answer           6            │   │  [ Present and voting ]      │
│                                    │   │                              │
│ [ Close roll call ]   [ Override… ]│   │  No answer before the timer  │
└────────────────────────────────────┘   │  ends = marked absent.       │
                                         └──────────────────────────────┘
```

- Chair opens roll call with a default window (90s, editable).
- Every delegate declares **Present** or **Present and voting** from their own panel.
- On close, unanswered delegates are resolved automatically:
  - **online** (present in RTDB `/sessionPresence`, which `useSessionPresence` already
    maintains) → `abstain`
  - **offline** → `absent`
- Quorum is computed and **announced to everyone**.
- Chair can still override any individual — that is the labelled override path.

**Model changes:** `AttendanceStatus` gains `"abstain"`. New `rollCall` window lives inside
`FloorGate` (`kind: "roll_call"`, `endsAt`).

**Rules change (must deploy):** a new branch on the session doc letting a delegate write
**only** `attendance[ownUid].status`, and only while `floorGate.kind == "roll_call"` and
`request.time < floorGate.endsAt + 2000`. This mirrors the existing self-ballot carve-out
(`firestore.rules:297-323`) almost line for line — same shape, same `affectedKeys().hasOnly`
discipline.

---

### Step 2 — Agenda, by motion

Chair opens the gate for **agenda motions only**.

```
CHAIR — gate chooser                     DELEGATE
┌────────────────────────────────────┐   ┌──────────────────────────────┐
│ Open the floor for…                │   │  FLOOR OPEN · Motions        │
│                                    │   │  Agenda motions only  ⏱ 1:20 │
│  ◉ Motions                         │   │                              │
│      ✓ Set the agenda              │   │  [ Propose an agenda motion ]│
│      ☐ Open GSL                    │   │                              │
│      ☐ Moderated caucus            │   │  🔒 Other motions            │
│      ☐ Unmoderated caucus          │   │     Chair has opened the     │
│      ☐ Introduce a document        │   │     floor for agenda only    │
│      ☐ Move to voting              │   │  🔒 Points                   │
│      ☐ Suspend / Adjourn           │   │     Only during debate       │
│  ○ Speakers signup                 │   │                              │
│  ○ Points only                     │   └──────────────────────────────┘
│  ○ Nothing (locked)                │
│                                    │
│  Window [ 90s ]   [ Open floor ]   │
└────────────────────────────────────┘
```

Then the motion runs the pipe that **already exists and is correct**:

```
proposeMotion → second → recognizeMotion → putMotionToVote → openVote
   → finalizeVote → closeVoteAtomic → resolveMotionAfterVote → executeMotion
```

`executeMotion` already calls `adoptAgendaTopic`. On pass:

- **Notification fires to everyone in the committee.**
- The adopted topic auto-mounts top-middle. `SessionHeadline` already renders exactly this —
  it just needs the agenda to actually be populated.

**Gap:** there is no agenda editor UI anywhere. Items can only be seeded from committee config.
Under motion-first the agenda is the first thing the committee decides, so this must exist:
add / edit / reorder / mark-done. It also wires `completeAgendaItem`, which is currently
exported with zero callers.

---

### Step 3 — GSL, by motion

Chair reopens the gate, this time with **Open GSL** ticked. Delegate proposes with a speaking
time in the motion (`params.perSpeakerSecs`). Vote passes.

**On pass, the speaking time applies itself.** `executeMotion` calls `setGslDefaultSecs` —
both functions already exist, they are simply not wired to each other today. The chair does
not re-enter a number that the committee already voted on.

---

### Step 4 — Speakers list signup (timed, opt-in, then sortable)

```
CHAIR                                    DELEGATE
┌────────────────────────────────────┐   ┌──────────────────────────────┐
│ ● SPEAKERS SIGNUP    ⏱ 0:35        │   │  SPEAKERS LIST IS OPEN  ⏱0:35│
│ 9 delegations signed up            │   │                              │
│                                    │   │  [ Add me to the list ]      │
│  1  France          ⠿              │   │                              │
│  2  Brazil          ⠿              │   │  You are #4 · 9 signed up    │
│  3  Kenya           ⠿              │   │                              │
│  … drag to reorder                 │   │  Ignore this to stay off.    │
│                                    │   └──────────────────────────────┘
│ [ Close signup & start ]           │
└────────────────────────────────────┘
```

- Signup goes out to everyone. Opting in adds you. Ignoring keeps you off.
- **Delegate sees their position live** — the current console has no confirmation at all after
  a signup, which reads as being ignored.
- Window closes (by timer, by rule). Chair then drag-sorts. `CaucusSpeakersList` already
  implements drag-reorder with `@hello-pangea/dnd` — reuse it for GSL rather than rebuilding.

**Implementation note — deliberately no automation.** Signups land in the existing `requests`
subcollection with `kind: "speak"` plus the gate's `signupId`. The batch add into `gsl.queue`
happens inside the chair's **"Close signup & start"** click, which the chair presses anyway.
This avoids depending on `useCaucusAutoAdd`-style client automation, whose in-source known gap
is "if no chair-tier browser is open, nothing fires."

---

### Step 5 — Debate: points only, motions locked

This is the rule you named explicitly, and it is the one the current UI most obviously misses.

```
DELEGATE — while someone holds the floor
┌──────────────────────────────────────┐
│  🔴 FRANCE IS SPEAKING       1:12    │
│                                      │
│  [ Raise a point ▾ ]                 │
│      Order · Information             │
│      Personal privilege · Inquiry    │
│                                      │
│  🔒 Motions                          │
│     Not in order while a delegate    │
│     holds the floor                  │
└──────────────────────────────────────┘
```

`motionFloor.ts` already computes this correctly (`gsl_speaker` blocks motions). What changes
is that it becomes a **hard, visible lock** driven by `floorGate.kind === "debate"`, rather
than a soft explanation shown after the delegate opens the menu.

Points remain live because `allowsPoints` is true for `debate`. During `voting` the chair can
set it false.

---

### Step 6 — Loop

GSL exhausts → chair reopens the motion gate, wider this time:

```
  ◉ Motions
      ✓ Moderated caucus      ✓ Unmoderated caucus
      ✓ Extend caucus         ✓ Introduce a document
      ✓ Move to voting        ✓ Suspend / Adjourn
```

Delegate proposes → second → recognize → vote → pass → `executeMotion` starts the caucus with
the voted parameters already applied. Caucus signup reuses **the same signup gate** as GSL
(`signupFor: "caucus"`), so there is one signup interaction in the whole product instead of
two different ones.

Then: caucus → speakers → motion gate → mod → unmod → vote → …

Closing: `move_to_voting` → substantive voting on draft resolutions → `adjourn`.

---

## 4. The chair bar — what is wrong and what replaces it

Today `ChairFlowBar` is a **suggestion** bar: up to 4 tone-weighted chips that appear and
disappear, a 6-second idle auto-collapse, an overflow menu past 4, and a step→panel map that
sends the agenda step to the motions panel because no agenda panel exists. It never answers
"where am I in this sitting" or "what have I allowed my delegates to do".

Replace it with a **gate console** — three fixed zones, never collapsing:

```
┌───────────────────────────────────────────────────────────────────────┐
│  STEP        │  GATE (what delegates can do)      │  NEXT             │
├──────────────┼────────────────────────────────────┼───────────────────┤
│ ② AGENDA     │ Motions · agenda only    ⏱ 1:20    │ [ Recognize      ]│
│ of 7         │ 2 proposed · 1 seconded            │ [   France's     ]│
│              │ [ Change gate ▾ ]                  │ [   motion       ]│
└──────────────┴────────────────────────────────────┴───────────────────┘
                                                       [ Chair override ▾ ]
```

1. **STEP** — where the sitting is. Persistent, ordinal, never hidden.
2. **GATE** — what is currently permitted, its countdown, and its live counts. This is the
   part that does not exist today at all, and its absence is why the menu feels confusing.
3. **NEXT** — exactly one primary action. Not four competing chips.

`Chair override` collects the direct-action buttons that motion-first demotes —
`startModCaucus`, `endCaucus`, `setPhase`, `openVote`. They stay reachable, they stop being
first-class, and they are labelled as overrides so the chair knows they are stepping outside
procedure.

The existing `flowModel.ts` step model (`roll_call | agenda | gsl | motion | caucus | voting |
closing`) is already correct and unit-tested — it feeds zone 1 unchanged.

---

## 5. The delegate card — one card, one truth

The delegate console currently offers the same action surface at all times across 6 tools,
with the same action reachable from up to 4 places (propose-motion has four triggers, two of
which use *opposite* interaction models for the same fact; `VotingTool` is mounted twice
simultaneously).

Replace with a single **Floor Card**, always in the same position, rendering
`capabilitiesFor()` directly:

```
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│  FLOOR OPEN · Motions            │   │  🔴 FRANCE IS SPEAKING     1:12  │
│  Agenda motions only     ⏱ 1:20  │   │                                  │
│                                  │   │  [ Raise a point ▾ ]             │
│  [ Propose an agenda motion ]    │   │                                  │
│                                  │   │  🔒 Motions — not in order       │
│  🔒 Points — only during debate  │   │     while a delegate holds       │
└──────────────────────────────────┘   │     the floor                    │
                                       └──────────────────────────────────┘
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│  VOTING · Motion to open the GSL │   │  FLOOR LOCKED                    │
│  ⏱ 0:48 · 14 of 18 cast          │   │  The chair has the floor.        │
│                                  │   │                                  │
│  [ Yes ]  [ No ]  [ Abstain ]    │   │  Nothing to do right now.        │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

Rules for this card:
- **Exactly one enabled primary action**, ever.
- **Locked things stay visible** with the reason written on them. Delegates learn the
  procedure from the UI instead of guessing.
- The countdown is on the card, not somewhere else.
- The tools rail stays for reference material (speakers list, docs, status) — it stops being
  a second place to take action.

---

## 6. Notifications — what the committee is told

Today there are **zero** session notifications. Grep of the notification service for
recognized / granted / floor / speaker / vote returns nothing. The most time-critical action
in the product — being recognized to speak — has the least feedback.

Every one of these can be derived **client-side from session-document diffs**. No writes, no
extra reads, free on Spark:

| Event | Trigger (diff on the session doc) |
|---|---|
| Roll call opened / closed | `floorGate.kind` enters / leaves `roll_call` |
| Quorum reached | derived present count crosses `quorumThreshold` |
| Floor opened for motions | `floorGate.kind → "motions"` |
| Motion seconded | `motionQueue` doc gains `secondedBy` |
| Motion recognized | `motionQueue` status → `recognized` |
| **Vote opened** | `activeVote` becomes non-null |
| **Vote passed / failed** | `publishedResult` changes |
| **Agenda adopted** | `agenda.activeIndex` changes |
| Signup opened | `floorGate.kind → "signup"` |
| **You are next / you are up** | `gsl.activeSpeaker.delegateId === me` |
| Point recognized / dismissed | own `points` doc status change |
| Floor request granted / dismissed | own `requests` doc status change — **currently never surfaced at all** |

Bold ones deserve an in-session banner. The rest are toasts.

---

## 7. Data model changes, collected

| Change | Where |
|---|---|
| `FloorGate` interface + `floorGate` field on `LiveSession` | `sessionService.ts` |
| `AttendanceStatus` gains `"abstain"` | `sessionService.ts` |
| `Motion.secondedByCountry` (`secondedBy` already declared, never written) | `sessionService.ts` |
| `openGate()` / `closeGate()` | `sessionService.ts` |
| `declareOwnAttendance()` — delegate-callable | `sessionService.ts` |
| `secondMotion()` — transaction, rejects self-second and duplicates | `sessionService.ts` |
| `closeRollCall()` — resolves no-answers to abstain/absent using RTDB presence | `sessionService.ts` |
| `joinSignup()` / `closeSignupIntoQueue()` | `sessionService.ts` |
| `capabilitiesFor()` + `FloorGateKind` | **new** `src/lib/services/floorGate.ts` (pure) |
| `executeMotion` wires `open_gsl` → `setGslDefaultSecs` | `sessionService.ts` |

### Firestore rules — three new delegate branches (all must be deployed)

Each follows the shape of the existing self-ballot carve-out at `firestore.rules:297-323`
(`affectedKeys().hasOnly`, self-uid only, attendance membership, `endsAt + 2000` grace):

1. **Self attendance** — write only `attendance[ownUid].status`, only while
   `floorGate.kind == "roll_call"` and inside the window.
2. **Second a motion** — a present, *non-author* delegate may write only
   `secondedBy` / `secondedByCountry` on a `motionQueue` doc.
3. **Signup** — create a `requests` doc with `kind == "speak"` and a matching
   `floorGate.signupId`, only while the signup gate is open.

Plus a gate check folded into the existing `motionQueue` create rule: the proposed `type` must
be in `floorGate.motionTypes`. This is what finally makes motion admissibility real —
today `motionsInOrder()` is UI-only and its own source comment says the rules will accept a
motion written from a devtools console.

> Deploy with `npm run deploy:rules`. A missing deploy shows as
> "Missing or insufficient permissions" **in the browser console only** — never in Vercel logs.

---

## 8. Build order

| # | Ships | Why here |
|---|---|---|
| **0** | Delete dead code (`SessionConsole.tsx`, `SessionHeader.tsx`, `LiveMUNModule.tsx`); collapse the 3 divergent `PHASE_LABEL` copies to 1; fix the browser-local-date `sessionId` | Stops work landing in a file nobody mounts |
| **1** | `floorGate.ts` + `capabilitiesFor()` + `openGate()`/`closeGate()`, unit-tested. No UI yet | Everything below depends on it |
| **2** | Delegate **Floor Card** reading `capabilitiesFor()`; chair **gate console** replacing the suggestion bar | The UI fix you asked for; makes phase 1 visible |
| **3** | Self-service roll call + `"abstain"` + RTDB-presence resolution + rules branch 1 | First gate that is genuinely new behaviour |
| **4** | **Second a motion** + shared motion-queue view for delegates + rules branch 2 | Motion-first is meaningless without a second |
| **5** | Gate-restricted motion types, enforced in UI **and** rules | The "only agenda motion is clickable" behaviour |
| **6** | Signup gate — one interaction serving both GSL and caucus + rules branch 3 | Replaces two divergent signup flows with one |
| **7** | `executeMotion` auto-applies voted parameters (GSL time, caucus params) | Chair stops re-entering what was voted |
| **8** | Agenda editor (add / edit / reorder / done); wires dead `completeAgendaItem` + `setQuorum` | The genuinely missing UI |
| **9** | In-session notifications from doc diffs | Closes the feedback loop |
| **10** | Chair-override demotion + entry-point dedupe (end-caucus 3→1, close-vote 4→1, propose 4→2, un-double-mount `VotingTool`) | Cleanup once the motion path is the real path |

Deferred, tracked, not scheduled:

- **Speakers for / against** before procedural votes. `MotionParams.speakersForAgainst` is
  declared but has no backing state — it needs its own timed queue and projector heroes.
- **Vote auto-close** without a chair browser. Gates solve themselves via `endsAt` + rules;
  votes do not. Spark has no scheduled functions — needs Blaze or an external cron hitting an
  API route.
- **Payment gate hole.** Both routes into `/live` bypass `PaymentRequiredGate`, and the route
  never checks `application.status`. Product decision: should payment gate live sessions?
- **Session doc is `read: isSignedIn()`** — any signed-in user of any event can read any
  committee's attendance and staff map.
- **Read amplification** — the hot doc carries 3 concurrent listeners per client on a
  50k-reads/day tier.

---

## 9. Verification

Two browsers, chair and delegate, same committee, same date. Rules deployed.

1. **Roll call** — chair opens with a 30s window; delegate declares Present from their own
   panel; a second delegate stays silent while online; on close they resolve to `abstain`, an
   offline delegate to `absent`; quorum announces to both screens.
2. **Agenda gate** — chair opens motions with agenda only; delegate's motion menu shows
   `set_agenda` enabled and every other type locked *with a reason*; a devtools-written
   `mod_caucus` is **rejected by rules**, not merely warned about.
3. **Second** — delegate A proposes; both screens show "Awaiting second"; A cannot second
   their own; B seconds; chair's Recognize enables.
4. **Pass → auto-apply** — motion passes; notification lands on both screens; the topic mounts
   top-middle; the voted GSL speaking time is already set without the chair typing it.
5. **Signup** — window opens, delegate joins, sees their position live, window expires by
   timer, a late write is rejected by rules; chair drag-sorts and starts.
6. **Debate lock** — while a delegate holds the floor, every other delegate's motion control
   is locked with the reason, and points still work.
7. **Full sitting, zero overrides** — roll call → set agenda → open GSL → speeches → mod
   caucus → extend → move to voting → adjourn, entirely by motion. If any step is impossible
   without pressing "Chair override", that step is not finished.

Existing tests must stay green: `flowModel.test.ts` (401 ln), `motionFloor.test.ts`. Add
`floorGate.test.ts` alongside them.
