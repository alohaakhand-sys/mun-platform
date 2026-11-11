/**
 * How much time a yield recipient actually gets.
 *
 * THE RULE: their OWN allotment plus whatever the outgoing speaker had left. A delegate who is
 * handed the floor with ten seconds on the clock is not being handed a ten-second speech — they
 * are being handed a speech, plus ten seconds. The previous behaviour transferred the remainder
 * alone, which made an accepted yield strictly worse for the recipient than being called normally.
 *
 * WHY THIS LIVES IN ITS OWN MODULE. Two callers must agree to the millisecond: the transaction in
 * `yieldFloorToDelegate` that writes the clock, and the chair's yield card, which promises "Japan
 * speaks for 1:00" BEFORE the write happens. If those two ever computed the number separately the
 * card would eventually lie about what accepting does. Same discipline as `floorGate.ts` /
 * `motionFloor.ts`: pure, no `@/lib/firebase/client` import, so it is unit-testable —
 * `sessionService.ts` imports the Firebase client at module scope and cannot be.
 */

/** The fallback every GSL reader uses when a session predates `gsl.defaultSpeakerSecs`. */
export const DEFAULT_SPEAKER_SECS = 90;

/**
 * The recipient's full clock: base allotment + carried remainder.
 *
 * Garbage carry (negative, NaN, Infinity — a stale snapshot or a clock read mid-write) degrades to
 * "no carry", never to a shorter-than-normal speech: the recipient's own allotment is theirs by
 * right and must not depend on the yielder's arithmetic surviving the trip.
 */
export function yieldGrantMs(defaultSpeakerSecs: number | undefined, carriedMs: number): number {
  const secs = Number.isFinite(defaultSpeakerSecs) && (defaultSpeakerSecs as number) > 0
    ? (defaultSpeakerSecs as number)
    : DEFAULT_SPEAKER_SECS;
  const carried = Number.isFinite(carriedMs) && carriedMs > 0 ? Math.round(carriedMs) : 0;
  return secs * 1000 + carried;
}
