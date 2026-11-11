import { NextResponse } from "next/server";

/**
 * Scheduled jobs (Coolify scheduled tasks; Cloud Functions are off on Spark) call /api/cron/*
 * with `Authorization: Bearer $CRON_SECRET`. null when the caller is the scheduler.
 */
export function cronRefusal(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
