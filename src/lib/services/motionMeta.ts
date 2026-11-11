/**
 * Motion display + procedure metadata — kept in its own module so PURE consumers can read it.
 *
 * This table used to live in `sessionService.ts`, which imports `@/lib/firebase/client` at module
 * scope (and that file's `getDatabase()` throws without `NEXT_PUBLIC_FIREBASE_DATABASE_URL`). Any
 * module that only needs the metadata — notably `components/session/flow/flowModel.ts`, which must
 * stay loadable outside a browser — would have been dragged into Firebase init just to read a label.
 *
 * The `MotionType` import below is TYPE-ONLY, so TypeScript erases it: there is no runtime cycle
 * with sessionService, which re-exports `MOTION_META` for backwards compatibility. Import it from
 * either place; this is the definition.
 */
import type { MotionType } from "./sessionService";

/**
 * `rank` orders the chair queue by MUN precedence (lower = more disruptive = considered first).
 * `needsVote` marks the ones that normally take a procedural vote; `delegateProposable` gates the
 * delegate proposal form. NOTE: the flag is only a filter — `PROPOSABLE` in ProposeMotionMenu.tsx
 * is the display-order source, so a motion must appear in BOTH to reach delegates.
 */
export const MOTION_META: Record<MotionType, {
  label: string; short: string; rank: number; needsVote: boolean; delegateProposable: boolean;
}> = {
  adjourn:            { label: "Adjourn the session",       short: "Adjourn",   rank: 0, needsVote: true,  delegateProposable: true  },
  suspend:            { label: "Suspend the session",       short: "Suspend",   rank: 1, needsVote: true,  delegateProposable: true  },
  extend_caucus:      { label: "Extend the caucus",         short: "Extend",    rank: 2, needsVote: true,  delegateProposable: true  },
  unmod_caucus:       { label: "Unmoderated caucus",        short: "Unmod",     rank: 3, needsVote: true,  delegateProposable: true  },
  mod_caucus:         { label: "Moderated caucus",          short: "Mod",       rank: 4, needsVote: true,  delegateProposable: true  },
  introduce_document: { label: "Introduce draft resolution / working paper", short: "Introduce", rank: 5, needsVote: false, delegateProposable: true  },
  move_to_voting:     { label: "Move to voting procedure",  short: "Vote",      rank: 6, needsVote: true,  delegateProposable: true  },
  set_agenda:         { label: "Set the agenda",            short: "Agenda",    rank: 7, needsVote: true,  delegateProposable: true  },
  open_gsl:           { label: "Open the Speakers List",    short: "GSL",       rank: 8, needsVote: true,  delegateProposable: true  },
  custom:             { label: "Custom motion",             short: "Custom",    rank: 9, needsVote: false, delegateProposable: true  },
};
