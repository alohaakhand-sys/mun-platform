import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { repairMarkingsPage } from "@/lib/server/repairMarkings";

export const dynamic = "force-dynamic";

/**
 * One-off data repair for marking docs (App Admin only), run a page at a time.
 *
 * Until 2026-10-25 `setCriterionScore` and `setScoreEntries` (markingService) wrote with
 * `setDoc(..., { merge: true })` and dotted keys. In a `set`, a dotted key is a LITERAL field
 * name, so a mark landed in a top-level field called "scores.<criterion>" (and
 * "scoreEntries.<criterion>") that nothing reads. This moves each such value into the real
 * `scores` / `scoreEntries` map and deletes the stray field. A literal value is the newer write
 * of the two (it was the chair's last save), so it wins over a nested one.
 *
 * Paged by document id so each call is bounded (Spark read budget): POST { after?: string },
 * repeat with the returned `next` until it is null. The work is lib/server/repairMarkings.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => ({}));
    const after = typeof body.after === "string" && body.after ? body.after : null;
    const result = await repairMarkingsPage(adminDb, after);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin/repair-markings]", message);
    return NextResponse.json({ error: "Repair failed" }, { status: 500 });
  }
}
