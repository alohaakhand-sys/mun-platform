import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/client";
import { getCountryName } from "@/lib/data/countries";

const CHAIR_ROLES = /chair|director|usg|vice-?chair|eb/i;
const norm = (s?: string | null) => (s || "").trim().toLowerCase();

/** Emails of all chair-type staff assigned to a committee in an event. */
export async function getCommitteeChairEmails(eventId: string, committee: string): Promise<string[]> {
  try {
    const snap = await getDocs(collection(db, "events", eventId, "staff"));
    const target = norm(committee);
    return snap.docs
      .map((d) => d.data() as any)
      .filter((s) => norm(s.committeeId) === target && CHAIR_ROLES.test(s.role || "") && s.email)
      .map((s) => s.email as string);
  } catch (err) {
    console.error("getCommitteeChairEmails error:", err);
    return [];
  }
}

/** Signed in: the notify routes check who is asking, so every call carries the ID token. */
async function post(path: string, body: Record<string, unknown>) {
  try {
    const token = await auth.currentUser?.getIdToken();
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`notify ${path} error:`, err);
  }
}

/** Delegate submitted/updated a position paper → email the committee chairs. */
export async function notifyChairsPositionPaper(args: {
  eventId: string;
  committee: string;
  delegateName?: string;
  eventTitle?: string;
}) {
  if (!args.eventId || !args.committee) return;
  const chairEmails = await getCommitteeChairEmails(args.eventId, args.committee);
  if (!chairEmails.length) return;
  await post("/api/notify/position-paper", {
    chairEmails,
    delegateName: args.delegateName,
    committee: args.committee,
    eventTitle: args.eventTitle,
    eventId: args.eventId,
  });
}

/** Delegate submitted an in-session committee document → email the committee chairs.
 *  The staff-roster lookup runs server-side (admin): a delegate cannot list the staff
 *  collection client-side (rules guard chair emails), so this posts to a route that does
 *  the lookup + email with the admin SDK. Best-effort — never blocks the submit. */
export async function notifyChairsCommitteeDoc(args: {
  eventId: string;
  committee: string;
  docType?: string;     // human label, e.g. "Working Paper"
  title?: string;
  delegateName?: string;
  eventTitle?: string;
}) {
  if (!args.eventId || !args.committee) return;
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    await fetch("/api/notify/committee-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
    });
  } catch (err) {
    console.error("notifyChairsCommitteeDoc error:", err);
  }
}

/** Chair published a study guide → email the committee's delegates (the server finds them). */
export async function notifyDelegatesStudyGuide(args: {
  eventId: string;
  committee: string;
  eventTitle?: string;
  chairName?: string;
  isUpdate?: boolean;
}) {
  if (!args.eventId || !args.committee) return;
  await post("/api/notify/study-guide", {
    isUpdate: !!args.isUpdate,
    committee: args.committee,
    eventTitle: args.eventTitle,
    eventId: args.eventId,
    chairName: args.chairName,
  });
}

// ── Transactional emails (delegate/staff-facing) ───────────────────────────
// Sent via the generic /api/send-email route. Each fires per-action (not in bulk
// loops) to avoid spamming. All are best-effort (errors swallowed in `post`).
function emailShell(heading: string, bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background:#fff; color:#1e293b;">
      <h2 style="color:#6d28d9; margin-top:0;">${heading}</h2>
      ${bodyHtml}
      <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:12px; color:#64748b;">
        This is an automated notification from MUN Platform.
      </div>
    </div>`;
}

/** The route only sends for someone on the event's team, so it needs the event. */
function sendEmail(eventId: string, to: string, subject: string, html: string) {
  if (!to || !eventId) return;
  return post("/api/send-email", { to, subject, html, eventId });
}

/**
 * Organizer approved an application.
 *
 * Carries the rulebook link: a code of conduct is only enforceable if every participant
 * was actually told where it is, and acceptance is the one message everyone opens. Pass
 * `eventId` to include it — without one the email degrades to the plain version.
 */
export async function notifyApplicationApproved(
  to: string,
  eventTitle: string,
  role?: string,
  eventId?: string,
  /** The seat they were placed in, when approval assigned one. */
  seat?: { committee?: string; country?: string }
) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const rulesHref = eventId && origin
    ? `${origin}/dashboard/conferences/${eventId}?tab=documents&doc=rules`
    : "";
  const rulesBlock = rulesHref
    ? `<p style="margin-top:16px;">Before anything else, read the conference <strong>Rules &amp; Regulations</strong> — code of conduct, rules of procedure and disciplinary policy. They apply to every participant.</p>
       <p style="margin-top:12px;">
         <a href="${rulesHref}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Read the Rules &amp; Regulations</a>
       </p>`
    : "";
  if (!eventId) return;
  await sendEmail(eventId, to, `You're in! ${eventTitle}`, emailShell(
    "Application Approved 🎉",
    `<p>Great news — your application${role ? ` as a <strong>${role}</strong>` : ""} for <strong>${eventTitle}</strong> has been <strong>approved</strong>.</p>
     ${seat?.committee ? `<p>Your seat: <strong>${seat.committee}</strong>${seat.country ? ` as <strong>${getCountryName(seat.country)}</strong>` : ""}.</p>` : ""}
     <p>Log in to your dashboard to see your committee, complete any payment, and upload your position paper.</p>
     ${rulesBlock}`
  ));
}

/** A delegate's country was assigned. */
export async function notifyCountryAssigned(eventId: string, to: string, eventTitle: string, country: string, committee?: string) {
  await sendEmail(eventId, to, `Country assigned — ${eventTitle}`, emailShell(
    "Your Country Assignment",
    `<p>You've been assigned <strong>${country}</strong>${committee ? ` in <strong>${committee}</strong>` : ""} for <strong>${eventTitle}</strong>.</p>
     <p>Start your research and prepare your position paper from your conference portal.</p>`
  ));
}

/** Results approved → certificate available. */
export async function notifyCertificateReady(eventId: string, to: string, eventTitle: string) {
  await sendEmail(eventId, to, `Your certificate is ready — ${eventTitle}`, emailShell(
    "Certificate Available 🏅",
    `<p>Results for <strong>${eventTitle}</strong> have been approved. Your certificate of participation is now available to download from your conference portal.</p>`
  ));
}

/** A waitlisted applicant has been offered a seat. */
export async function notifyWaitlistOffer(eventId: string, to: string, eventTitle: string, committee?: string, hours = 48) {
  await sendEmail(eventId, to, `A seat opened up — ${eventTitle}`, emailShell(
    "Seat Offer ⏳",
    `<p>A seat${committee ? ` in <strong>${committee}</strong>` : ""} has opened up for <strong>${eventTitle}</strong> and has been offered to you.</p>
     <p>Log in and accept within <strong>${hours} hours</strong> to claim it, or it passes to the next person on the waitlist.</p>`
  ));
}

/**
 * Chair nudges the committee's delegates who have not submitted a paper. The server works out
 * who they are and checks the caller runs the committee; returns how many were emailed.
 */
export async function notifyDelegatesPaperReminder(args: {
  eventId: string;
  committee: string;
  eventTitle?: string;
  deadline?: string;
}): Promise<number> {
  if (!args.eventId || !args.committee) return 0;
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch("/api/notify/paper-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ eventId: args.eventId, committee: args.committee, eventTitle: args.eventTitle, deadline: args.deadline }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? Number(data.sent) || 0 : 0;
  } catch (err) {
    console.error("notify paper-reminder error:", err);
    return 0;
  }
}
