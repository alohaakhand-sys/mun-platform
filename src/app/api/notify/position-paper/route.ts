import { NextRequest, NextResponse } from "next/server";
import { createTransporter, mailFrom, appUrl, emailShell } from "@/lib/email/mailer";

interface Payload {
  chairEmails: string[];
  delegateName?: string;
  committee?: string;
  eventTitle?: string;
  eventId: string;
}

export async function POST(req: NextRequest) {
  try {
    const p = (await req.json()) as Payload;
    const recipients = (p.chairEmails || []).filter(Boolean);
    if (!recipients.length || !p.eventId) {
      return NextResponse.json({ error: "chairEmails and eventId required" }, { status: 400 });
    }

    const delegate = p.delegateName || "A delegate";
    const committee = p.committee || "your committee";
    const title = p.eventTitle || "your conference";
    const link = `${appUrl()}/dashboard/chair/committee/${p.eventId}`;

    const html = emailShell({
      emoji: "📄",
      heading: "New Position Paper Submitted",
      subheading: title,
      accent: "linear-gradient(135deg,#2563eb,#4f46e5)",
      ctaLabel: "Review in your committee",
      ctaHref: link,
      bodyHtml: `
        <p style="margin:0 0 16px 0;"><strong>${delegate}</strong> just submitted (or updated) a position paper in <strong>${committee}</strong>.</p>
        <p style="margin:0;color:#64748b;">Open your committee dashboard to read, grade, and give feedback.</p>`,
    });

    const transporter = createTransporter();
    await transporter.sendMail({
      from: mailFrom(),
      to: recipients.join(", "),
      subject: `📄 New position paper in ${committee} — ${title}`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("position-paper email error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
