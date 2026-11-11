import { NextResponse } from "next/server";
import { requireUid } from "@/lib/server/migrationServer";
import { passesConfigured, scannerAccess, eventFacts, passCodesFor } from "@/lib/server/passes";
import { resolvePlan, type EventPlan } from "@/lib/data/eventPlan";

/**
 * POST { eventId, uids } → { codes: { uid: code } } for printing passes on ID cards (Pro).
 * Owner / co-organizer / App Admin. Non-members are left out. Up to 1,000 people per call.
 */
export async function POST(req: Request) {
  const caller = await requireUid(req);
  if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!passesConfigured()) return NextResponse.json({ error: "Passes aren't set up on this server yet." }, { status: 503 });
  const { eventId, uids } = (await req.json().catch(() => ({}))) as { eventId?: string; uids?: unknown };
  if (!eventId || !Array.isArray(uids)) return NextResponse.json({ error: "eventId and uids required." }, { status: 400 });
  if (uids.length > 1000) return NextResponse.json({ error: "At most 1,000 people at a time." }, { status: 400 });
  const access = await scannerAccess(eventId, caller);
  if (!access.organizer) return NextResponse.json({ error: "Only the organizer can print passes." }, { status: 403 });
  if (!resolvePlan({ plan: (await eventFacts(eventId))?.plan as EventPlan | undefined }).features.passes) {
    return NextResponse.json({ error: "Passes on ID cards come with a Pro event." }, { status: 403 });
  }
  return NextResponse.json({ codes: await passCodesFor(eventId, [...new Set(uids.map(String))]) });
}
