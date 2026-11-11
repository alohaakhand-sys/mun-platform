import { auth } from "@/lib/firebase/client";

export interface AgoraTokenResponse {
  token: string;
  channel: string;
  appId: string;
  uid: string;
  role: "publisher" | "subscriber";
  /** True when the server issued this as an App Admin ghost-observer token (always subscriber). */
  observer?: boolean;
  ttl: number;
}

/**
 * Fetch an Agora RTC token for a live session from our server route. The server decides
 * the role (publisher vs subscriber) from platform data — see src/app/api/agora/token.
 * Sends the caller's Firebase id token as a Bearer credential (same pattern as the rest
 * of the app's authenticated routes).
 */
export async function fetchAgoraToken(
  eventId: string,
  committeeId: string,
  dateStr: string,
  /** Event-wide ceremony room — the server ignores committee + date when this is set. */
  ceremony?: "opening" | "closing",
): Promise<AgoraTokenResponse> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in");

  const res = await fetch("/api/agora/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(ceremony ? { eventId, ceremony } : { eventId, committeeId, dateStr }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Token request failed (${res.status})`);
  }
  return res.json();
}
