import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { backfillMembersPage, syncAdminMirror } from "@/lib/server/membership";

export const dynamic = "force-dynamic";

/**
 * Builds (or reconciles) every event's membership markers — `events/{id}/members/{uid}` and the
 * RTDB `/eventMembers` mirror — that the live read rules require. App Admin only, a few events
 * per call: POST { after?: string }, repeat with `next` until it is null. Safe to run again.
 * Run it BEFORE deploying the rules that read the markers. Work: lib/server/membership.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => ({}));
    const after = typeof body.after === "string" && body.after ? body.after : null;
    // The admin running it can read every room's presence (ghost observer) from here on.
    if (!after) await syncAdminMirror(auth.uid, true);
    const result = await backfillMembersPage(after);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin/backfill-members]", message);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
