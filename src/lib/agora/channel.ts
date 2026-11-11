/**
 * Agora channel-name helper. One Agora channel per live session (committee + day),
 * derived deterministically from the sessionService `sessionId` so the client and the
 * token server agree on the channel WITHOUT the client passing one in (which it could
 * otherwise spoof to join another committee's room).
 *
 * Agora channel names allow [A-Za-z0-9], a space, and a set of punctuation, max 64 bytes.
 * Our sessionId is `<committeeName>__<YYYY-MM-DD>` and committee names can contain spaces,
 * "/", "," etc., so we sanitize to a safe subset and, if the result would exceed 64 bytes,
 * fall back to a short deterministic hash suffix. Pure/isomorphic — safe on server + client.
 */
export function agoraChannelFor(sessionId: string): string {
  const safe = (sessionId || "").replace(/[^A-Za-z0-9_-]/g, "_");
  if (safe.length > 0 && safe.length <= 64) return safe;

  // Long (or empty) → append a stable djb2 hash so both sides compute the same channel.
  let h = 5381;
  for (let i = 0; i < sessionId.length; i++) h = ((h << 5) + h + sessionId.charCodeAt(i)) >>> 0;
  const hash = h.toString(36);
  const out = `s_${safe.slice(0, 50)}_${hash}`;
  return out.slice(0, 64) || `s_${hash}`;
}

/**
 * Channel for an event-wide ceremony room (opening / closing).
 *
 * THE eventId IS LOAD-BEARING. A ceremony's session id is a reserved constant
 * (`__ceremony__opening`), identical in every event — feeding that to `agoraChannelFor` alone
 * would drop every conference on the platform into ONE channel, with each other's guests on
 * screen. Committee sessions get away with a bare session id because it carries the committee
 * name and the date; a ceremony carries neither.
 */
export function agoraChannelForCeremony(eventId: string, kind: "opening" | "closing"): string {
  return agoraChannelFor(`${eventId}__ceremony_${kind}`);
}
