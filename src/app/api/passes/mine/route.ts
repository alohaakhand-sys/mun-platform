import { NextResponse } from "next/server";
import { requireUid } from "@/lib/server/migrationServer";
import { passesConfigured, currentPassVersion, encodePass, memberOf, displayNameOf } from "@/lib/server/passes";

/**
 * GET ?eventId= → the caller's signed pass for the event, for the "My pass" QR. Any member
 * (approved applicant, accepted staff, the owner) gets one. The app keeps the code, so the QR
 * shows without internet; only scanning needs a connection.
 */
export async function GET(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!passesConfigured()) return NextResponse.json({ error: "Passes aren't set up on this server yet." }, { status: 503 });
  const eventId = new URL(req.url).searchParams.get("eventId") || "";
  if (!eventId) return NextResponse.json({ error: "eventId required." }, { status: 400 });

  const member = await memberOf(eventId, uid);
  if (!member) return NextResponse.json({ error: "You're not part of this event." }, { status: 403 });
  const [version, name] = await Promise.all([currentPassVersion(eventId, uid), displayNameOf(uid)]);
  return NextResponse.json({
    code: encodePass(eventId, uid, version),
    version,
    holder: { uid, name, role: member.role, committee: member.committee, kind: member.kind },
  });
}
