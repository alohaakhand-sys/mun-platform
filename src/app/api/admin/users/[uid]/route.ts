import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { logAuditServer } from "@/lib/server/auditServer";
import { resolvePlan, planLabel, PLAN_DEFAULTS } from "@/lib/data/eventPlan";

/**
 * One member, for the App Admin: role, the Verified organizer badge, their plan overrides (Free
 * events at once, AI uses a day), AI uses today, the events they own with plans, their payouts.
 *   GET            → that summary
 *   POST { verifiedOrganizer?, freeEvents?, aiDailyQuota? } → set or clear (null) the overrides
 */
export async function GET(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { uid } = await params;
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const u = snap.data() as any;
  const day = new Date().toISOString().slice(0, 10);
  const [authUser, settingsSnap, usage, events, payouts] = await Promise.all([
    adminAuth.getUser(uid).catch(() => null),
    adminDb.collection("systemSettings").doc("global").get(),
    adminDb.collection("aiUsage").doc(`${uid}_${day}`).get(),
    adminDb.collection("events").where("organizerId", "==", uid).limit(50).get(),
    adminDb.collection("payoutRequests").where("organizerId", "==", uid).limit(50).get(),
  ]);
  const settings = settingsSnap.data() as any;
  return NextResponse.json({
    uid,
    name: u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ") || "",
    email: authUser?.email || "",
    disabled: authUser?.disabled === true,
    role: u.role || "user",
    verifiedOrganizer: u.verifiedOrganizer === true,
    freeEvents: u.planOverrides?.freeEvents ?? null,
    aiDailyQuota: u.planOverrides?.aiDailyQuota ?? null,
    defaults: {
      freeEvents: settings?.freeEventCap ?? PLAN_DEFAULTS.freeEventCap,
      aiDailyQuota: settings?.freeAiDailyQuota ?? PLAN_DEFAULTS.freeAiDailyQuota,
    },
    aiUsedToday: Number(usage.data()?.n || 0),
    events: events.docs.map((e) => {
      const ev = e.data() as any;
      return { id: e.id, title: ev.title || "", status: ev.status || "draft", plan: planLabel(resolvePlan(ev, settings)) };
    }),
    payouts: payouts.docs.map((p) => {
      const d = p.data() as any;
      return { id: p.id, amount: Number(d.amount) || 0, status: d.status, requestedAt: d.requestedAt?.toMillis?.() ?? null };
    }).sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0)),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { uid } = await params;
  const body = (await req.json().catch(() => ({}))) as { verifiedOrganizer?: boolean; freeEvents?: number | null; aiDailyQuota?: number | null };
  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const before = snap.data() as any;

  const patch: Record<string, unknown> = {};
  if (typeof body.verifiedOrganizer === "boolean") patch.verifiedOrganizer = body.verifiedOrganizer;
  for (const k of ["freeEvents", "aiDailyQuota"] as const) {
    if (!(k in body)) continue;
    const v = body[k];
    if (v === null) patch[`planOverrides.${k}`] = FieldValue.delete();
    else if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10000) patch[`planOverrides.${k}`] = Math.floor(v);
    else return NextResponse.json({ error: `${k} must be a number from 0 to 10000, or null.` }, { status: 400 });
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  await ref.update(patch);
  await logAuditServer({
    actorUid: auth.uid, action: "user_overrides_set", targetType: "user", targetId: uid,
    targetName: [before.firstName, before.lastName].filter(Boolean).join(" ") || undefined,
    before: { verifiedOrganizer: before.verifiedOrganizer ?? null, planOverrides: before.planOverrides ?? null },
    after: body,
  });
  return NextResponse.json({ ok: true });
}
