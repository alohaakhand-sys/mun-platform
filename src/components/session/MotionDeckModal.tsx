"use client";

/**
 * "The window is up — here is what the committee moved."
 *
 * WHY A DIALOG FOR A PANEL THAT ALREADY EXISTS. The motions queue lives in the right-hand tool rail,
 * two taps away (open Tools → Motions), and the one moment a chair cannot afford two taps is the
 * moment the motion window closes: the room has stopped, every placard is down, and the committee is
 * waiting on a ruling. The gate bar's NEXT button can only ever offer ONE action, and a floor with
 * three competing motions on it is not a one-action problem. So the same deck comes to the chair.
 *
 * IT IS THE SAME PANEL, NOT A SECOND ONE. `MotionQueuePanel` is rendered verbatim — same
 * subscription (multiplexed by the SDK with the rail's copy), same precedence sort, same
 * Recognize / Put to vote / Adopt / Dismiss, same auto-fall handling. A parallel implementation
 * would be a second place for the motion rules to drift, and motions are the one surface where
 * two derivations disagreeing is a correctness bug rather than a cosmetic one.
 *
 * RAISED FROM STATE, NEVER FROM AN EDGE — see `showMotionDeck` in ChairSessionConsole. It is a
 * function of "the motions gate has lapsed and motions are still on the floor", so a chair who
 * reloads mid-ruling gets it back, a co-chair opening the console late gets it too, and dismissing
 * it latches the WINDOW (the gate's `endsAt`) rather than a boolean — the next window must re-raise.
 */
import { Gavel } from "lucide-react";
import type { ApplicationData } from "@/lib/services/applicationService";
import type { LiveSession, ParticipationIdentity } from "@/lib/services/sessionService";
import { MotionQueuePanel } from "./MotionQueuePanel";
import { ConsoleModal } from "./console/shared";

import type { Motion } from "@/lib/services/sessionService";

export function MotionDeckModal({
  eventId, sessionId, session, delegates, canControl, identityFor, userId, agendas, count, onClose, onStartModCaucus,
}: {
  eventId: string;
  sessionId: string;
  session: LiveSession;
  delegates: ApplicationData[];
  canControl: boolean;
  identityFor: (delegateId: string) => ParticipationIdentity;
  userId: string;
  agendas: string[];
  /** Motions still on the floor — the subtitle's number, so it matches the rail's badge exactly. */
  count: number;
  onClose: () => void;
  onStartModCaucus?: (m: Motion) => void;
}) {
  return (
    <ConsoleModal
      wide
      icon={Gavel}
      title="The motion window has closed"
      subtitle={
        count === 1
          ? "One motion is on the floor. Rule on it, or reopen the window."
          : `${count} motions are on the floor, in precedence order. Rule on them, or reopen the window.`
      }
      onClose={onClose}
    >
      {/* The panel carries its own "Open the floor to motions" card at the top, so reopening the
          window — the other thing a chair does at this moment — is already here. */}
      <MotionQueuePanel
        eventId={eventId}
        sessionId={sessionId}
        session={session}
        delegates={delegates}
        canControl={canControl}
        identityFor={identityFor}
        userId={userId}
        agendas={agendas}
        hideFloorCard
        hideHistoryLogs
        onStartModCaucus={onStartModCaucus}
      />

      <div className="flex justify-end mt-4 pt-3 border-t border-border/60">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-[12.5px] font-bold border border-border
                     hover:bg-secondary/60 transition-colors"
        >
          {/* Not "Done": the motions are still on the floor when this closes, and the rail is where
              they carry on living. Saying so stops the dismissal reading as a resolution. */}
          Close — keep them in the Motions tool
        </button>
      </div>
    </ConsoleModal>
  );
}
