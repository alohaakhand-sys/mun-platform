import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

// Always compute fresh counts (no caching).
export const dynamic = "force-dynamic";

const norm = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");

// Public per-committee seat availability for an event. Counts APPROVED delegates per
// committee server-side (applicants can't read the applications collection), so the
// public apply form can disable full committees. Committee capacity (set on the
// Committees page) is the single source of truth; 0/undefined = unlimited.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const event = eventSnap.data() as any;
    const committees: { name: string; capacity?: number }[] = event.committees || [];

    // Single-field query (no composite index needed); filter status in code.
    const appsSnap = await adminDb.collection("applications").where("eventId", "==", eventId).get();
    const counts: Record<string, number> = {};
    appsSnap.forEach((doc) => {
      const a = doc.data() as any;
      if (a.status !== "approved") return;
      const committee = a.assignedCommittee || a.preferredCommittee || a.choices?.primary?.committee || "";
      const key = norm(committee);
      if (key) counts[key] = (counts[key] || 0) + 1;
    });

    const result: Record<string, { capacity: number; approved: number; full: boolean }> = {};
    let anyCapped = false;
    let allFull = true;
    for (const c of committees) {
      const capacity = c.capacity || 0;
      const approved = counts[norm(c.name)] || 0;
      const full = capacity > 0 && approved >= capacity;
      result[c.name] = { capacity, approved, full };
      if (capacity > 0) {
        anyCapped = true;
        if (!full) allFull = false;
      }
    }
    // "All full" only means something when at least one committee has a real cap.
    if (!anyCapped) allFull = false;

    return NextResponse.json({ committees: result, allFull });
  } catch (error: any) {
    console.error("[events/availability] error:", error?.message);
    return NextResponse.json({ error: "Failed to load availability" }, { status: 500 });
  }
}
