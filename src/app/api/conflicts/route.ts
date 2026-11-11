import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUid, isEventOrganizer } from "@/lib/server/migrationServer";

export const dynamic = "force-dynamic";

// Country-conflict lookup for the organizer's allocation screens: "has this delegate
// already represented this country at ANOTHER conference?".
//
// This CANNOT run from the client. It reads applications belonging to events the caller
// has nothing to do with, so no Firestore rule can authorise it — the old client-side
// collectionGroup("applications") query was denied on every call and the error was
// swallowed, which silently reported "no conflicts" for everyone. Server-side with the
// Admin SDK, gated on the caller being this event's organizer/co-organizer/admin.
//
// One query per 30-user chunk (Spark plan is 50k reads/day) instead of the old
// applicants x countries sequential fan-out.

interface ConflictRecord {
  eventId: string;
  eventName: string;
  date: string;
  country: string;
}

const CHUNK = 30; // Firestore "in" filter cap

export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, userIds } = await req.json();
  if (!eventId || !Array.isArray(userIds)) {
    return NextResponse.json({ error: "eventId and userIds[] are required." }, { status: 400 });
  }
  if (!(await isEventOrganizer(eventId, uid))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ids = Array.from(new Set(userIds.filter((u: any) => typeof u === "string" && u)));
  if (ids.length === 0) return NextResponse.json({ conflicts: {} });

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const snaps = await Promise.all(
    chunks.map(c =>
      adminDb
        .collection("applications")
        .where("userId", "in", c)
        .where("status", "==", "approved")
        .get()
    )
  );

  // Key: `${userId}_${country}` — the shape the allocation UI already looks up by.
  const conflicts: Record<string, ConflictRecord> = {};
  const titleCache = new Map<string, { name: string; date: string }>();

  for (const snap of snaps) {
    for (const d of snap.docs) {
      const a = d.data() as any;
      if (a.eventId === eventId) continue; // same conference — not a conflict
      const country = a.assignedCountry;
      if (!country) continue;
      const key = `${a.userId}_${country}`;
      if (conflicts[key]) continue;

      let meta = titleCache.get(a.eventId);
      if (!meta) {
        // Applications denormalize the title/date inconsistently — fall back to the event.
        let name = a.eventTitle || "";
        let date = a.eventDate || "";
        if (!name || !date) {
          const ev = await adminDb.collection("events").doc(a.eventId).get();
          const e = (ev.data() as any) || {};
          name = name || e.shortName || e.title || "a past event";
          date = date || e.date || e.dates?.start || "previously";
        }
        meta = { name, date };
        titleCache.set(a.eventId, meta);
      }

      conflicts[key] = { eventId: a.eventId, eventName: meta.name, date: meta.date, country };
    }
  }

  return NextResponse.json({ conflicts });
}
