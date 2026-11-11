import { NextResponse } from "next/server";
import { requireUid } from "@/lib/server/migrationServer";
import { assertEligible, HttpError } from "@/lib/server/reputationServer";

export const dynamic = "force-dynamic";

// UX helper: can the caller rate/recommend/endorse this target? Returns 200 with
// { eligible, reason? } so the client branches on JSON. The POST routes re-check —
// this is only for showing/hiding affordances.
export async function GET(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { uid: targetUid } = await params;
  try {
    await assertEligible(uid, targetUid);
    return NextResponse.json({ eligible: true });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ eligible: false, reason: e.message });
    console.error("eligibility error:", e);
    return NextResponse.json({ eligible: false, reason: "Could not check eligibility." });
  }
}
