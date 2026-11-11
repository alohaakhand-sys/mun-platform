import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isAdminUser, isEventManager, syncAdminMirror, syncMembership } from "@/lib/server/membership";
import { sameCommittee } from "@/lib/utils/committee";

// Recompute event membership markers (see lib/server/membership.ts).
//
//   POST { eventId }                → the caller's own marker (the self-heal every member's live
//                                     surface fires on open; idempotent, ~4 reads)
//   POST { eventId, userIds: [...] } → those users' markers; organizer / co-organizer / App Admin
//                                     only (called after approvals, rejections and staff changes),
//                                     or a director / USG for staff of the committees they oversee
//                                     (after reassigning or removing a chair)
//
// A sync never trusts the request: each marker is recomputed from the event's records, so asking
// for one you don't qualify for deletes it.
export const dynamic = "force-dynamic";

const MAX_USERS = 50;

/**
 * An accepted Executive Board member may sync staff in their scope: everyone when they have no
 * committee, else staff of their committee, or someone whose staff doc is gone (just removed).
 */
async function execBoardMaySync(eventId: string, callerUid: string, uids: string[]): Promise<boolean> {
  const staff = adminDb.collection("events").doc(eventId).collection("staff");
  const me = await staff.doc(callerUid).get();
  const m = me.data() as any;
  if (!me.exists || m?.inviteStatus !== "accepted" || !["director", "usg", "eb"].includes(String(m.role || "").toLowerCase())) return false;
  if (!m.committeeId) return true;
  for (const uid of uids) {
    if (uid === callerUid) continue;
    const s = await staff.doc(uid).get();
    if (s.exists && !sameCommittee(String((s.data() as any)?.committeeId || ""), String(m.committeeId))) return false;
  }
  return true;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let callerUid: string;
  try {
    callerUid = (await adminAuth.verifyIdToken(authHeader.slice(7))).uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));
  const eventId = String(body.eventId || "");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });
  const requested: string[] = Array.isArray(body.userIds)
    ? [...new Set(body.userIds.map((u: unknown) => String(u || "")).filter(Boolean))] as string[]
    : [callerUid];
  if (requested.length > MAX_USERS) return NextResponse.json({ error: `At most ${MAX_USERS} users per call` }, { status: 400 });
  const others = requested.some((u) => u !== callerUid);
  if (others && !(await isEventManager(eventId, callerUid)) && !(await execBoardMaySync(eventId, callerUid, requested))) {
    return NextResponse.json({ error: "Only the organizer can sync other members" }, { status: 403 });
  }

  try {
    const results: Record<string, unknown> = {};
    for (const uid of requested) results[uid] = await syncMembership(eventId, uid);
    // An App Admin's own self-heal also arms their presence-read mirror.
    if (!others) {
      const u = await adminDb.collection("users").doc(callerUid).get();
      if (isAdminUser(u.data())) await syncAdminMirror(callerUid, true);
    }
    return NextResponse.json({ members: results });
  } catch (e) {
    console.error("[members/sync]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to sync membership" }, { status: 500 });
  }
}
