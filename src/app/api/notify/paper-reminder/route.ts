import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { createTransporter, mailFrom, appUrl, emailShell } from "@/lib/email/mailer";
import { requireUid } from "@/lib/server/migrationServer";
import { canRunCommittee, escapeHtml, isApprovedDelegateOf, bulkSendRefusal } from "@/lib/server/committeeAccess";

/**
 * "Remind by email" on the chair hub's Papers tab: emails every approved delegate of the
 * committee who hasn't handed in a position paper.
 *
 * Only someone who runs the committee may send it (its chair or vice-chair, an Executive Board
 * member over it, the organizer or a co-organizer), and the recipients are worked out here from
 * the applications, never taken from the request: the route used to email whatever addresses a
 * caller sent, signed in or not.
 */
interface Payload {
  eventId: string;
  committee: string;
  eventTitle?: string;
  deadline?: string;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const p = (await req.json()) as Payload;
    if (!p.eventId || !p.committee) {
      return NextResponse.json({ error: "eventId and committee required" }, { status: 400 });
    }
    if (!(await canRunCommittee(p.eventId, uid, p.committee))) return NextResponse.json({ error: "Only this committee's dais or the organizer can send reminders." }, { status: 403 });

    const apps = await adminDb.collection("applications").where("eventId", "==", p.eventId).get();
    const recipients = Array.from(new Set(
      apps.docs
        .map((d) => d.data() as any)
        .filter((a) => isApprovedDelegateOf(a, p.committee))
        .filter((a) => !a.positionPaperContent && !a.positionPaperUrl)
        .map((a) => String(a.applicantEmail || "").trim())
        .filter(Boolean)
    ));
    if (!recipients.length) return NextResponse.json({ success: true, sent: 0 });
    const refusal = await bulkSendRefusal(p.eventId, recipients.length);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

    const committee = escapeHtml(p.committee);
    const title = escapeHtml(p.eventTitle || "your conference");
    const link = `${appUrl()}/dashboard/conferences/${encodeURIComponent(p.eventId)}`;

    const html = emailShell({
      emoji: "⏰",
      heading: "Position Paper Reminder",
      subheading: title,
      accent: "linear-gradient(135deg,#d97706,#dc2626)",
      ctaLabel: "Submit your paper",
      ctaHref: link,
      bodyHtml: `
        <p style="margin:0 0 16px 0;">This is a reminder from your chair: your <strong>position paper for ${committee}</strong> has not been submitted yet.</p>
        ${p.deadline ? `<p style="margin:0 0 16px 0;">Deadline: <strong>${escapeHtml(p.deadline)}</strong>.</p>` : ""}
        <p style="margin:0;color:#64748b;">Open your conference dashboard to write or upload your position paper as soon as possible.</p>`,
    });

    const transporter = createTransporter();
    await transporter.sendMail({
      from: mailFrom(),
      to: mailFrom(),
      bcc: recipients.join(", "),
      subject: `⏰ Reminder: submit your position paper for ${p.committee}`,
      html,
    });

    return NextResponse.json({ success: true, sent: recipients.length });
  } catch (error: any) {
    console.error("paper-reminder email error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
