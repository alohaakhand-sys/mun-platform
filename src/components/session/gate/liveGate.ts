/**
 * The Live MUN entry gate — one pure resolver, two surfaces.
 *
 * Nobody reaches a live console without passing through here. There are exactly two ways in:
 * a button on the portal (delegate card / chair quick action / top-bar pill) and a direct URL
 * (`/dashboard/.../live`). Both call `resolveLiveGate` with the same inputs and get the same
 * verdict, so a link that was pasted into a group chat cannot skip what the button enforces.
 *
 * Two independent things have to be true before a delegate sees a sitting:
 *   1. the ORGANIZER opened committee sessions for the event (liveControl.sessionsOpen), and
 *   2. their CHAIR gavelled in today's session (the session doc exists).
 * They fail differently and the copy has to say which — "nothing is running yet" and "your
 * chair hasn't started" send a delegate to two different people.
 *
 * Kept free of firebase imports so it stays unit-testable and cheap to import.
 */
import type {
  CeremonyKind, EventLiveControl,
} from "@/lib/services/liveControlService";
import { ceremonyLabel, liveCeremony } from "@/lib/services/liveControlService";
import type { LiveSession } from "@/lib/services/sessionService";

export type LiveGateVerdict =
  | { kind: "pass" }
  /** Still loading one of the inputs — render a spinner, never a gate. */
  | { kind: "loading" }
  | { kind: "event_not_started" }
  /** Committee sittings are shut, but a ceremony is on the air right now. */
  | { kind: "ceremony_only"; ceremony: CeremonyKind }
  | { kind: "committee_not_open"; committee: string; dateStr: string };

export interface LiveGateInput {
  /** null = the organizer has never opened Live MUN for this event; undefined = still loading. */
  control: EventLiveControl | null | undefined;
  /**
   * Today's session doc for this committee. undefined = not loaded yet, null = does not exist.
   * Chairs may pass `null` freely — they are the ones who create it.
   */
  session?: LiveSession | null;
  role: "chair" | "delegate";
  committee?: string;
  dateStr?: string;
  /** Organizer / co-organizer / App Admin — always through, so they can verify their own setup. */
  bypass?: boolean;
}

export function resolveLiveGate(input: LiveGateInput): LiveGateVerdict {
  const { control, session, role, bypass } = input;
  if (bypass) return { kind: "pass" };
  if (control === undefined) return { kind: "loading" };

  // Gate 1 — the organizer's master switch. A missing control doc reads as "not started":
  // the organizer has to open Live MUN once per conference, including on events that predate
  // this feature. (firestore.rules deliberately defaults the other way; see its comment.)
  if (!control || !control.sessionsOpen) {
    const live = liveCeremony(control ?? null);
    return live ? { kind: "ceremony_only", ceremony: live } : { kind: "event_not_started" };
  }

  // Gate 2 — the chair. Only a delegate can be blocked by it; a chair arriving at an empty day
  // is shown the console's own "Start session" card, which is the action, not an obstacle.
  if (role === "delegate") {
    if (session === undefined) return { kind: "loading" };
    if (session === null) {
      return {
        kind: "committee_not_open",
        committee: input.committee || "Your committee",
        dateStr: input.dateStr || "",
      };
    }
  }
  return { kind: "pass" };
}

export interface LiveGateCopy {
  title: string;
  body: string;
  /** Organizer's own message, when they left one. */
  note?: string;
  /** Primary action, when there is somewhere useful to send them. */
  cta?: { label: string; href: string };
}

/** Human-readable date for the copy — "6 August" from a YYYY-MM-DD session key. */
function prettyDate(dateStr: string): string {
  if (!dateStr) return "today";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

export function liveGateCopy(
  verdict: LiveGateVerdict,
  ctx: { eventId: string; eventTitle?: string; control?: EventLiveControl | null },
): LiveGateCopy | null {
  const note = ctx.control?.note?.trim() || undefined;
  switch (verdict.kind) {
    case "event_not_started":
      return {
        title: "Live MUN hasn't opened yet",
        body: ctx.eventTitle
          ? `The organizer hasn't opened Live MUN for ${ctx.eventTitle} yet. This unlocks the moment they do.`
          : "The organizer hasn't opened Live MUN for this conference yet. This unlocks the moment they do.",
        note,
      };
    case "ceremony_only": {
      const label = ctx.control?.[verdict.ceremony]?.title || ceremonyLabel(verdict.ceremony);
      return {
        title: "Committee sessions aren't open yet",
        body: `${label} is live right now. Committee sessions open after it.`,
        note,
        cta: {
          label: `Join ${ceremonyLabel(verdict.ceremony)}`,
          href: `/dashboard/ceremony/${ctx.eventId}?kind=${verdict.ceremony}`,
        },
      };
    }
    case "committee_not_open":
      return {
        title: `${verdict.committee} isn't in session yet`,
        body: `Your chair hasn't gavelled in the sitting for ${prettyDate(verdict.dateStr)}. This opens by itself the moment they do.`,
        note,
      };
    default:
      return null;
  }
}
