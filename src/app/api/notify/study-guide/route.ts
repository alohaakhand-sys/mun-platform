import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { createTransporter, mailFrom, appUrl, emailShell } from "@/lib/email/mailer";
import { requireUid } from "@/lib/server/migrationServer";
import { canRunCommittee, escapeHtml, isApprovedDelegateOf, bulkSendRefusal } from "@/lib/server/committeeAccess";

/**
 * A study guide was published or updated: email the committee's approved delegates.
 *
 * Only someone who runs the committee may send it (its chair or vice-chair, an Executive Board
 * member over it, the organizer or a co-organizer), the recipients are worked out here from the
 * applications, and the names in the email are escaped. The route used to email whatever
 * addresses any caller sent, signed in or not.
 */
interface Payload {
  eventId: string;
  committee: string;
  eventTitle?: string;
  chairName?: string;
  isUpdate?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const p = (await req.json()) as Payload;
    if (!p.eventId || !p.committee) {
      return NextResponse.json({ error: "eventId and committee required" }, { status: 400 });
    }
    if (!(await canRunCommittee(p.eventId, uid, p.committee))) {
      return NextResponse.json({ error: "Only this committee's dais or the organizer can send this." }, { status: 403 });
    }

    const apps = await adminDb.collection("applications").where("eventId", "==", p.eventId).get();
    const recipients = Array.from(new Set(
      apps.docs
        .map((d) => d.data() as any)
        .filter((a) => isApprovedDelegateOf(a, p.committee))
        .map((a) => String(a.applicantEmail || "").trim())
        .filter(Boolean)
    ));
    if (!recipients.length) return NextResponse.json({ success: true, sent: 0 });
    const refusal = await bulkSendRefusal(p.eventId, recipients.length);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

    const committee = escapeHtml(p.committee);
    const title = escapeHtml(p.eventTitle || "your conference");
    const chair = escapeHtml(p.chairName || "Your chair");
    const verb = p.isUpdate ? "updated" : "published";
    const link = `${appUrl()}/dashboard/conferences/${encodeURIComponent(p.eventId)}`;

    const html = emailShell({
      emoji: "📚",
      heading: p.isUpdate ? "Study Guide Updated" : "Study Guide Published",
      subheading: title,
      accent: "linear-gradient(135deg,#7c3aed,#2563eb)",
      ctaLabel: "Read the study guide",
      ctaHref: link,
      bodyHtml: `
        <p style="margin:0 0 16px 0;"><strong>${chair}</strong> has ${verb} the study guide for <strong>${committee}</strong>.</p>
        <p style="margin:0;color:#64748b;">Open your conference dashboard to read and download it, then start preparing your position.</p>`,
    });

    const transporter = createTransporter();
    // BCC so delegates don't see each other's addresses.
    await transporter.sendMail({
      from: mailFrom(),
      to: mailFrom(),
      bcc: recipients.join(", "),
      subject: `📚 Study guide ${verb} for ${p.committee} — ${p.eventTitle || "your conference"}`,
      html,
    });

    return NextResponse.json({ success: true, sent: recipients.length });
  } catch (error: any) {
    console.error("study-guide email error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
