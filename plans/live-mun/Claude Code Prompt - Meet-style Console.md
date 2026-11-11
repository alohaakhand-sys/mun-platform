# Claude Code prompt — refactor the Live MUN chair console into a Google Meet–style, video-first layout

> Paste everything below the line into Claude Code, with the reference file
> `plans/Committee Console (standalone).html` open in the repo. That HTML is the
> visual + interaction target — match its layout, spacing and behaviour, but wire it
> to the REAL session state, don't hardcode.

---

## Goal

Redesign the chair's live session console (`src/components/session/ChairSessionConsole.tsx`)
from the current **rail + main + right-dock** layout into a **video-first, Google Meet–style**
layout. Nothing is removed — every existing feature stays, it just moves. The reference
mock `plans/Committee Console (standalone).html` shows the exact target.

## The new layout (top → bottom)

1. **Top bar** (keep, slimmed to ~56px, dark theme): Exit, a live dot, committee name +
   event subtitle, the phase pill, the quorum readout (`present / quorum` + Quorum/No-quorum
   chip), the date input, Suspend/Close/Reopen, and **Finalize**. Same handlers as today.

2. **Video stage** (NEW — fills the centre, dark). This is the `LiveVideoRoom` promoted from
   a floating PiP to the primary surface:
   - **Spotlight**: the on-floor delegate (`session.live.stage[0]`, else the active GSL
     speaker) rendered large and centre. Their camera track when live; otherwise a large
     circular country flag (use the existing `CountryFlag`).
   - **Overlays on the video**: top-left pill = flag + country + the **live speaking timer**
     (drive it from the SAME `gsl.timer` / caucus timer logic already in `LiveDock`, via
     `timerRemainingMs`). Top-right = mic-muted chip. Bottom-left = caption chip with the
     speaker's country + org. Everything reads the synced session doc — no local truth.
   - **Participant tiles**: the other broadcasters as a small strip/grid (reuse `VideoTile`).

3. **Bottom-centre control bar** (Meet-style, floats over the video): mic, camera, present/
   share screen, reactions, captions, raise hand, more (⋮), and a red **leave/end** button.
   Wire mic/cam/screen to the existing `useAgoraLive` toggles (`toggleMic`, `toggleCam`,
   `toggleScreenShare`); leave = the current "Leave video" behaviour. Keep the chair
   "give the floor / clear floor" override — move it into the ⋮ menu or a small popover.

4. **Slim live strip** (directly under the video, always visible): the essence of today's
   `LiveDock` header — a live dot, "Speaking · {country}" (or "Floor open — add speakers"),
   the running timer + progress bar, and the single contextual primary action button
   (**Next speaker** / **Start first speaker** / **End caucus** / **Close & record**).
   Reuse the exact `guard()`-wrapped handlers from `LiveDock` (`handleNext`, `handleEndCaucus`,
   `handleCloseVote`, participation bumps). This replaces the big right dock.

5. **Bottom-right corner launchers**: Chat, a **Committee tools** button (grid/apps icon),
   and Host controls (lock). These open the right-side panel.

## Right-side panel = a drill-down stack (the key interaction)

A panel that slides in from the right (like Meet's *Meeting tools* / *Host controls*).
It's a two-level navigator:

- **Level 0 — "Committee tools" list**: one row per procedure, each with icon, title,
  subtitle, a chevron, and a live/badge indicator. Rows come straight from today's
  `NAV_GROUPS` / `PANEL_META`: Roll Call, Voting, Speakers List, Caucus, Points & Motions,
  Marking, Report. Show the green **live** dot on whichever is currently on the floor
  (`liveOn` map) and the **pending-points count** as a red badge on Points & Motions.
  Put the quorum widget + **Open projector view** button at the bottom of this list.
- **Level 1 — a drilled tool**: clicking a row pushes its full panel with a header
  (back arrow + tool icon + title + subtitle + close). The body renders the EXISTING panel
  component unchanged — `RollCallPanel`, `VotingPanel`, `ConsoleSpeakersPanel`/`GslPanel`,
  `CaucusPanel`, `PointsQueuePanel` + `MotionsLog`, `MarkingPanel`, `SessionReport`. Back
  arrow returns to Level 0; close dismisses the panel.

The panel is ~400px and scrolls. The existing panels already work in a narrow column;
keep their `embedded`/wide behaviour but let them reflow (stack grids to 1-col, allow the
Report table / Marking matrix to scroll). The projector still opens as the full-screen
`ProjectorOverlay`.

## State to add to `ChairSessionConsole`

```ts
const [panel, setPanel] = useState<null | "tools" | "chat" | "host">(null);
const [tool, setTool]   = useState<null | SubTab>(null); // reuse the existing SubTab union
```
Opening a launcher sets `panel`; clicking a tool row sets `tool` (with `panel="tools"`);
back sets `tool=null`; close resets both. The old `tab` state and `LeftRail` are removed
(the rail's nav becomes the Level-0 list; the rail's quorum widget + projector button move
into it). The old `LiveDock` aside is removed — its header/timer/action become the slim
strip, and its on-deck queue + pending-point alert move into the live strip / Points badge.

## Theme

Dark, Meet-like: stage `#0f1012`, panels `#1a1b1f`, rows `#25272c`, borders
`rgba(255,255,255,.09)`, text `#e6e8eb`, muted `#9aa0a6`. Keep the brand **indigo** as the
accent (your dark-mode `--primary`, ~`#8287ff`), emerald for live/present, amber for voting,
red for destructive/leave. Add a `dark` scope (or a dedicated dark shell) so the console is
dark even though the rest of the app is light. Font: your existing Geist. Icons: keep
`lucide-react` (the mock used Material Symbols only because it's a static HTML file).

## Hard requirements

- **Do not drop any feature**: roll call, quorum, GSL + yields + per-speech scoring prompt
  (`SpeechScorer`), moderated/unmoderated caucus, voting (all types/thresholds/modes +
  P5 veto + division), points queue + motions log, marking matrix + suggestions + feedback,
  report + PDF/print, projector overlay, idle auto-shutdown guard, finalize, suspend/close/
  reopen, and the live-video give-floor/clear-floor override.
- All reads/writes go through the existing `sessionService` / `markingService` — this is a
  layout refactor, keep the synced-doc single source of truth so chair, co-chair and
  projector stay in lockstep.
- Keep it responsive: below `lg`, collapse the panel to a full-width sheet and the control
  bar stays reachable (mirror how the current code hides the rail/dock under `lg`).
- Preserve accessibility: buttons keep titles/aria-labels; the panel traps focus and closes
  on Escape.

## Suggested file changes

- Rewrite `ChairSessionConsole.tsx`'s render into: `<TopBar/>`, `<VideoStage/>` (wrapping
  `LiveVideoRoom` in a new `variant="stage"`), `<LiveStrip/>` (extracted from `LiveDock`),
  `<ControlBar/>`, and `<ToolPanel/>` (the drill-down). Keep `TopBar`, `SpeechScorer`,
  `ProjectorOverlay`, `IdleGuard` as-is.
- Add `variant="stage"` to `LiveVideoRoom`/`Shell` for the full-bleed spotlight + tiles, and
  expose its mic/cam/screen toggles so the external `ControlBar` can drive them (lift the
  controls out, or pass render props).
- New small components: `ToolPanel`, `ToolList` (Level 0), `LiveStrip`, `ControlBar`.

Build it screen-by-screen and diff against `plans/Committee Console (standalone).html`.
