import { NextResponse } from "next/server";
import { requireUid } from "@/lib/server/migrationServer";
import { scannerAccess, eventPeople } from "@/lib/server/passes";

/**
 * GET ?eventId= → everyone in the event, for the organizer's Find by name (a dead phone, a
 * forgotten pass). Approved registrations plus accepted staff and the owner. Organizer only.
 */
export async function GET(req: Request) {
  const caller = await requireUid(req);
  if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const eventId = new URL(req.url).searchParams.get("eventId") || "";
  if (!eventId) return NextResponse.json({ error: "eventId required." }, { status: 400 });
  const access = await scannerAccess(eventId, caller);
  if (!access.organizer) return NextResponse.json({ error: "Only the organizer can look people up by name." }, { status: 403 });
  return NextResponse.json({ people: await eventPeople(eventId) });
}
