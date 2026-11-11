import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireUid } from "@/lib/server/migrationServer";
import { scannerAccess } from "@/lib/server/passes";

const UNDO_MS = 5 * 60_000;

/**
 * POST { eventId, redemptionId, at } → take back one scan (wrong person, wrong meal). The
 * scanner who made it may undo for 5 minutes; the organizer at any time. The history entry is
 * kept and marked undone, so the report still shows what happened.
 */
export async function POST(req: Request) {
  const caller = await requireUid(req);
  if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { eventId, redemptionId, at } = (await req.json().catch(() => ({}))) as { eventId?: string; redemptionId?: string; at?: number };
  if (!eventId || !redemptionId || typeof at !== "number") return NextResponse.json({ error: "eventId, redemptionId and at required." }, { status: 400 });
  const access = await scannerAccess(eventId, caller);
  if (!access.ok) return NextResponse.json({ error: "You don't have permission to scan passes for this event." }, { status: 403 });

  const ref = adminDb.collection("events").doc(eventId).collection("redemptions").doc(redemptionId);
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.data() as any;
      const history: any[] = Array.isArray(d?.history) ? d.history : [];
      const i = history.findIndex((h) => h?.at?.toMillis?.() === at && !h.undone);
      if (i < 0) throw new Error("That scan was already undone, or doesn't exist.");
      const mine = history[i].by === caller && Date.now() - at <= UNDO_MS;
      if (!mine && !access.organizer) throw new Error("Only the organizer can undo this scan now.");
      history[i] = { ...history[i], undone: { at: Timestamp.now(), by: caller, byName: access.name } };
      tx.update(ref, { history, count: Math.max(0, (Number(d.count) || 0) - 1) });
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't undo." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
