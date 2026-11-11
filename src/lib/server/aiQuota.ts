// The daily AI quota (src/lib/data/eventPlan.ts): every person gets systemSettings
// freeAiDailyQuota AI uses a day; AI used inside an event whose plan has `ai` (Pro) doesn't count
// for that event's members. One counter doc per person per day (aiUsage/{uid}_{YYYY-MM-DD},
// server-only: no client rule matches it), so a call costs one read and one write.

import { adminDb } from "@/lib/firebase/admin";
import { PLAN_DEFAULTS, resolvePlan } from "@/lib/data/eventPlan";

let cachedQuota: { at: number; n: number } | null = null;

async function dailyQuota(): Promise<number> {
  // Cached a minute per instance, like the payment config (Spark read budget).
  if (cachedQuota && Date.now() - cachedQuota.at < 60_000) return cachedQuota.n;
  const s = (await adminDb.collection("systemSettings").doc("global").get()).data() as any;
  const n = Number(s?.freeAiDailyQuota ?? PLAN_DEFAULTS.freeAiDailyQuota);
  cachedQuota = { at: Date.now(), n: Number.isFinite(n) ? n : PLAN_DEFAULTS.freeAiDailyQuota };
  return cachedQuota.n;
}

/** The caller organizes or belongs to (members marker) this event. */
async function inEvent(eventId: string, uid: string, ev: any): Promise<boolean> {
  if (ev?.organizerId === uid) return true;
  return (await adminDb.collection("events").doc(eventId).collection("members").doc(uid).get()).exists;
}

/**
 * null when this AI call may go ahead (and it has been counted); otherwise the refusal to show.
 * `cost` lets long actions (a full draft) count double, as the per-minute throttle does.
 */
export async function aiQuotaRefusal(uid: string, eventId: unknown, cost = 1): Promise<string | null> {
  const id = typeof eventId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(eventId) ? eventId : "";
  if (id) {
    const ev = (await adminDb.collection("events").doc(id).get()).data();
    if (ev && resolvePlan(ev as any).features.ai && (await inEvent(id, uid, ev))) return null;
  }
  // The App Admin can give one member their own number (users.planOverrides.aiDailyQuota).
  const [base, me] = await Promise.all([dailyQuota(), adminDb.collection("users").doc(uid).get()]);
  const own = Number((me.data() as any)?.planOverrides?.aiDailyQuota);
  const quota = Number.isFinite(own) && own >= 0 ? own : base;
  const day = new Date().toISOString().slice(0, 10);
  const ref = adminDb.collection("aiUsage").doc(`${uid}_${day}`);
  const ok = await adminDb.runTransaction(async (tx) => {
    const used = Number((await tx.get(ref)).data()?.n || 0);
    if (used + cost > quota) return false;
    tx.set(ref, { uid, day, n: used + cost }, { merge: true });
    return true;
  });
  return ok ? null : `You've used today's ${quota} AI uses. AI inside a Pro event doesn't count; more tomorrow.`;
}
