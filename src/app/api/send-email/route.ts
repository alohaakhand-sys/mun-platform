import { NextRequest, NextResponse } from 'next/server';
import { createTransporter, mailFrom } from '@/lib/email/mailer';
import { requireUid } from '@/lib/server/migrationServer';
import { isEventStaffOrManager } from '@/lib/server/committeeAccess';

/**
 * One transactional email for an event (approval, country assigned, certificate, seat offer,
 * staff invite). The caller must be signed in and work on that event (its owner, a co-organizer,
 * an App Admin or accepted staff), and may address only a handful of people: every sender mails
 * one person per action. The route used to send any HTML to any list for anyone.
 */
const MAX_RECIPIENTS = 5;

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { to, subject, html, eventId } = await req.json();
    if (!to || !subject || !html || !eventId) {
      return NextResponse.json({ error: 'to, subject, html, eventId required' }, { status: 400 });
    }
    if (!(await isEventStaffOrManager(String(eventId), uid))) {
      return NextResponse.json({ error: 'Only this event\'s team can send its emails.' }, { status: 403 });
    }

    const recipients = Array.from(new Set((Array.isArray(to) ? to : [to]).map((s: unknown) => String(s || '').trim()).filter(Boolean)));
    if (!recipients.length) return NextResponse.json({ error: 'to required' }, { status: 400 });
    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `At most ${MAX_RECIPIENTS} recipients` }, { status: 400 });
    }

    const from = mailFrom();
    await createTransporter().sendMail({ from, to: from, bcc: recipients.join(', '), subject: String(subject), html: String(html) });
    return NextResponse.json({ success: true, sent: recipients.length, failed: 0 });
  } catch (error: any) {
    console.error('send-email route error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
