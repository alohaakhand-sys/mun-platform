import { NextResponse } from "next/server";
import { resolvePlan } from "@/lib/data/eventPlan";
import { getUserEmail } from "@/lib/server/userContact";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { agoraChannelFor, agoraChannelForCeremony } from "@/lib/agora/channel";

// Tokens are per-user and role-dependent — never cache.
export const dynamic = "force-dynamic";

/**
 * Agora RTC token issuer for the Live MUN video layer.
 *
 * The channel maps 1:1 to a live session (committee + day), or to an event-wide CEREMONY room
 * when the request carries `ceremony: "opening" | "closing"` instead of committee + date. The
 * caller's Agora ROLE is decided HERE, server-side, from the platform's own data — not trusted
 * from the client:
 *   • organizer / co-organizer / exec board in scope / this committee's chair → PUBLISHER (host)
 *   • a delegate whose uid is on `session.live.stage` (chair gave them the floor) → PUBLISHER
 *   • any other committee member (approved delegate / accepted staff)  → SUBSCRIBER (audience)
 *   • an APP ADMIN who is none of the above → SUBSCRIBER, flagged `observer` → the ghost
 *     observer behind /dashboard/admin/live-sessions/observe. Checked LAST, so its extra
 *     users/{uid} read only ever happens on a request that was going to 403 anyway, and the
 *     flag forces publisher=false even if that uid somehow appears on `session.live.stage`.
 *   • everyone else → 403 (cannot even join the channel)
 *
 * IN A CEREMONY the first line narrows to the ORGANIZER alone — a chair or EB member is a
 * participant there like everyone else until the organizer gives them the floor — and the
 * membership test widens to any approved delegate of the event, since a ceremony belongs to
 * no committee.
 *
 * Because the publisher token is only minted when the platform data says so, a delegate
 * cannot self-promote to broadcaster, and an observer cannot promote at all.
 *
 * WHY THE OBSERVER IS INVISIBLE, precisely: the client joins with `mode: "live"`, and per the
 * Agora SDK `user-joined` fires on remote clients only for a HOST — an audience member is not
 * reported at all, so there is no tile, no roster entry, no event. The matching client half is
 * `useAgoraLive`'s `observer` opt, which additionally never calls setClientRole("host"): a role
 * switch AFTER joining DOES fire user-joined on every remote client.
 *
 * ⚠️ IMPORTANT (Agora co-host authentication): by default the RTC service does NOT enforce
 * the publish privilege for SUBSCRIBER tokens — a SUBSCRIBER can still publish unless
 * "co-host authentication" is enabled on the Agora project (Agora Console → project, or via
 * Agora support). The client keeps honest audience members from publishing (audience role
 * cannot publish locally); enabling co-host auth makes the token role fully authoritative
 * against a tampered client. Enable it before treating this endpoint as a hard security gate —
 * that applies to the ghost observer too: without it, "cannot publish" is a client promise.
 *
 * Mirrors the Bearer-token auth + adminDb pattern in src/app/api/events/[eventId]/members.
 */

// Inline role mirrors of staffService — keeps this route free of client-SDK imports.
function isChairTier(role?: string): boolean {
  const r = (role || "").toLowerCase();
  return r !== "co-organizer" && r.includes("chair");
}
function isExecBoard(role?: string): boolean {
  const r = (role || "").toLowerCase();
  return r === "director" || r === "usg" || r === "eb";
}
// A delegate's committee — authoritative assignment first (mirrors utils/committee).
function effectiveCommittee(a: any): string {
  return a?.assignedCommittee || a?.preferredCommittee || a?.choices?.primary?.committee || "";
}
// Deterministic session id — mirrors sessionService.makeSessionId (inlined to avoid pulling
// the client Firestore SDK into this server route).
function makeSessionId(committeeId: string, dateStr: string): string {
  return `${(committeeId || "").replace(/\//g, "_")}__${dateStr}`;
}
// Mirrors liveControlService.ceremonySessionId, inlined for the same reason.
type CeremonyKind = "opening" | "closing";
function ceremonySessionId(kind: CeremonyKind): string {
  return `__ceremony__${kind}`;
}

const TOKEN_TTL_SECONDS = 3600; // 1h; client renews on token-privilege-will-expire

// ── Observe-join audit (server-side, so an admin with devtools cannot suppress it) ──────
// This route is the one call an observer cannot skip: no token, no video. De-duped in-process
// because useAgoraLive re-fetches a token on every `token-privilege-will-expire` (~hourly) —
// a row per renewal would drown the log. Serverless runs several instances, so a couple of
// duplicates across a cold start are expected and harmless (same best-effort posture as the
// scan cache in api/admin/live-sessions).
const OBSERVE_LOG_TTL_MS = 10 * 60_000;
const observeLogged = new Map<string, number>();

function logObserveJoin(a: {
  uid: string; email: string;
  eventId: string; sessionId: string; committeeId: string; dateStr: string;
}) {
  const key = `${a.uid}|${a.eventId}|${a.sessionId}`;
  const now = Date.now();
  if (now - (observeLogged.get(key) || 0) < OBSERVE_LOG_TTL_MS) return;
  observeLogged.set(key, now);
  // Shape MUST match AuditLogEntry in src/lib/services/auditService.ts, or the audit-logs
  // page renders blank cells for these rows.
  adminDb.collection("auditLogs").add({
    actorUid: a.uid,
    actorEmail: a.email,
    actorRole: "App Admin",
    action: "session_observed",
    targetType: "session",
    targetId: a.sessionId,
    targetName: `${a.committeeId} · ${a.dateStr}`,
    after: JSON.stringify({ eventId: a.eventId, committeeId: a.committeeId, dateStr: a.dateStr }),
    timestamp: FieldValue.serverTimestamp(),
  }).catch((e) => console.error("[agora/token] observe audit", e));
}

export async function POST(req: Request) {
  try {
    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const appCert = process.env.AGORA_APP_CERTIFICATE;
    if (!appId || !appCert) {
      return NextResponse.json({ error: "Agora is not configured" }, { status: 503 });
    }

    // 1. Authenticate the caller.
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let callerUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      callerUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // 2. Resolve the session/channel from committee + date (server recomputes — no spoofing).
    //    A ceremony asks by `ceremony` instead: one event-wide room, no committee, no date.
    const body = await req.json().catch(() => ({}));
    const eventId = String(body.eventId || "");
    const ceremonyRaw = String(body.ceremony || "");
    const ceremony: CeremonyKind | null =
      ceremonyRaw === "opening" || ceremonyRaw === "closing" ? ceremonyRaw : null;
    const committeeId = String(body.committeeId || "");
    const dateStr = String(body.dateStr || "");
    if (!eventId || (!ceremony && (!committeeId || !dateStr))) {
      return NextResponse.json(
        { error: "eventId plus either ceremony, or committeeId + dateStr, required" },
        { status: 400 },
      );
    }
    const sessionId = ceremony ? ceremonySessionId(ceremony) : makeSessionId(committeeId, dateStr);
    const channel = ceremony
      ? agoraChannelForCeremony(eventId, ceremony)
      : agoraChannelFor(sessionId);

    // 3. Read the platform's own view of who this caller is.
    const [eventSnap, staffSnap, sessionSnap] = await Promise.all([
      adminDb.collection("events").doc(eventId).get(),
      adminDb.collection("events").doc(eventId).collection("staff").doc(callerUid).get(),
      adminDb.collection("events").doc(eventId).collection("sessions").doc(sessionId).get(),
    ]);
    const event = eventSnap.data() || {};
    // Live video comes with the event's plan (eventPlan.ts): Free events run Live MUN without it.
    if (!resolvePlan(event as any).features.video) {
      return NextResponse.json({ error: "Live video comes with a Pro event." }, { status: 403 });
    }
    const staff = staffSnap.exists ? staffSnap.data() : null;
    const staffAccepted = staff?.inviteStatus === "accepted";
    const staffRole = staffAccepted ? String(staff?.role || "") : "";
    const staffCommittee = staffAccepted ? String(staff?.committeeId || "") : "";

    const isOrganizer = event.organizerId === callerUid || staffRole === "co-organizer";
    const isChairOfThis = isChairTier(staffRole) && staffCommittee === committeeId;
    // Executive Board broadcasts only where it may run the sitting: its staff doc's committeeId
    // is its scope, empty meaning every committee (isEbOf in firestore.rules).
    const isEbOfThis = isExecBoard(staffRole) && (staffCommittee === "" || staffCommittee === committeeId);
    // A CEREMONY HAS EXACTLY ONE HOST. Chairs and the Executive Board broadcast by role in
    // their own committee, but a ceremony is the organizer's floor: everyone else — chairs
    // included — is an ordinary participant until the organizer puts them on `live.stage`.
    const roleBroadcaster = ceremony
      ? isOrganizer
      : (isOrganizer || isEbOfThis || isChairOfThis);

    const stage: string[] = sessionSnap.exists ? (sessionSnap.data()?.live?.stage || []) : [];
    const onStage = stage.includes(callerUid);

    // 4. Membership gate. Broadcasters and accepted staff always pass. A plain delegate must
    //    have an APPROVED application in THIS committee (keeps outsiders / other committees out).
    //    A ceremony is event-wide, so any approved delegate of the event is in — the committee
    //    comparison is skipped, not loosened for committee sittings.
    let isCommitteeDelegate = false;
    if (!roleBroadcaster && !staffAccepted) {
      const appsSnap = await adminDb
        .collection("applications")
        .where("eventId", "==", eventId)
        .where("userId", "==", callerUid)
        .get();
      isCommitteeDelegate = appsSnap.docs.some((d) => {
        const a = d.data();
        return a.status === "approved" && (ceremony || effectiveCommittee(a) === committeeId);
      });
    }
    // 4b. APP ADMIN GHOST OBSERVER — the last chance saloon, deliberately AFTER every normal
    //     path. A chair, organizer, EB member or delegate of this committee has already passed
    //     above, so this users/{uid} read costs one Firestore read on a request that was
    //     otherwise a 403 — nothing is added to the hot path. Identity is the same users/{uid}
    //     shape requireAdmin uses in api/admin/live-sessions (no custom claims in this project).
    let isObserver = false;
    let observerEmail = "";
    if (!roleBroadcaster && !staffAccepted && !isCommitteeDelegate) {
      const userSnap = await adminDb.collection("users").doc(callerUid).get();
      const u = userSnap.data() || {};
      isObserver = u.role === "App Admin" || u.role === "admin" || u.isAdmin === true;
      if (isObserver) observerEmail = await getUserEmail(callerUid);
    }

    if (!roleBroadcaster && !staffAccepted && !isCommitteeDelegate && !isObserver) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fire-and-forget: an audit failure must never cost the observer their token.
    if (isObserver) {
      logObserveJoin({
        uid: callerUid, email: observerEmail, eventId, sessionId,
        committeeId: ceremony ? `${ceremony} ceremony` : committeeId,
        dateStr: ceremony ? "event-wide" : dateStr,
      });
    }

    // 5. Mint the token. Publisher iff broadcaster-by-role or on the chair-granted stage.
    //    NEVER for an observer. Do not drop the `!isObserver` term: `session.live.stage` is a
    //    plain uid array any chair-tier account can write, so without it an admin uid landing
    //    there would be minted a publisher token, the client would setClientRole("host"), and
    //    per the Agora SDK that fires `user-joined` on EVERY participant — the ghost pops into
    //    the grid mid-session.
    const publisher = !isObserver && (roleBroadcaster || onStage);
    const role = publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      appId, appCert, channel, callerUid, role, TOKEN_TTL_SECONDS, TOKEN_TTL_SECONDS,
    );

    return NextResponse.json({
      token,
      channel,
      appId,
      uid: callerUid,
      role: publisher ? "publisher" : "subscriber",
      observer: isObserver, // lets the observer UI assert what it was actually granted
      ttl: TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[agora/token] error:", message);
    return NextResponse.json({ error: "Failed to issue token" }, { status: 500 });
  }
}
