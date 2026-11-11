import { NextResponse } from "next/server";
import { requireUid, isEventOrganizer } from "@/lib/server/migrationServer";
import { logAuditServer } from "@/lib/server/auditServer";
import { passesConfigured, resetPass, displayNameOf } from "@/lib/server/passes";

/**
 * POST { eventId, uid } → replace that person's pass (lost phone, shared screenshot). Their old
 * QR, on a phone or a printed ID card, stops working at once. Owner / co-organizer / App Admin.
 */
export async function POST(req: Request) {
  const caller = await requireUid(req);
  if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!passesConfigured()) return NextResponse.json({ error: "Passes aren't set up on this server yet." }, { status: 503 });
  const { eventId, uid } = (await req.json().catch(() => ({}))) as Record<string, string>;
  if (!eventId || !uid) return NextResponse.json({ error: "eventId and uid required." }, { status: 400 });
  if (!(await isEventOrganizer(eventId, caller))) return NextResponse.json({ error: "Only the organizer can reset a pass." }, { status: 403 });

  const version = await resetPass(eventId, uid, caller);
  await logAuditServer({
    actorUid: caller, action: "pass_reset", targetType: "pass", targetId: `${eventId}/${uid}`,
    targetName: await displayNameOf(uid), after: { version },
  });
  return NextResponse.json({ ok: true, version });
}
