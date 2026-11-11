import { NextResponse } from "next/server";
import { expireOverdueSwaps } from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

// Lazy backstop for swap-deadline expiry: flips overdue awaiting_swap requests to
// failed and notifies requesters. Idempotent + safe to call from views on load.
export async function GET(req: Request) {
  try {
    const eventId = new URL(req.url).searchParams.get("eventId") || undefined;
    const expired = await expireOverdueSwaps(eventId);
    return NextResponse.json({ ok: true, expired });
  } catch (e: any) {
    console.error("[migrations/expire] error:", e?.message);
    return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}
