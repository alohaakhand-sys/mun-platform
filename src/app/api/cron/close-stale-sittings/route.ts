import { NextResponse } from "next/server";
import { closeStaleSittings } from "@/lib/server/staleSittings";

export const dynamic = "force-dynamic";

// Daily sweep (vercel.json "crons"): closes committee sittings left open from an earlier day.
// It writes across every event, so it answers only to the cron: Vercel sends
// `Authorization: Bearer $CRON_SECRET` when that env var is set on the project.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await closeStaleSittings();
    console.log(`[cron/close-stale-sittings] scanned ${result.scanned}, closed ${result.closed.length}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/close-stale-sittings]", message);
    return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}
