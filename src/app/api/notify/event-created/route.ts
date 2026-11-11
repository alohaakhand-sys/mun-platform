import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { adminDb } from '@/lib/firebase/admin';
import { requireUid } from '@/lib/server/migrationServer';
import { getUserEmail } from '@/lib/server/userContact';
import { escapeHtml } from '@/lib/server/committeeAccess';

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (Number(process.env.SMTP_PORT) || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

interface Payload {
  to: string;
  organizerName?: string;
  eventTitle: string;
  eventId: string;
  eventDate?: string;
  eventLocation?: string;
  status?: 'draft' | 'published';
}

function eventCreatedHtml(p: Payload, appUrl: string) {
  const name = p.organizerName || 'Organizer';
  const title = p.eventTitle || 'Your event';
  const date = p.eventDate || 'TBD';
  const location = p.eventLocation || 'TBD';
  const statusLabel = p.status === 'published' ? 'Published' : 'Draft';
  const statusColor = p.status === 'published' ? '#16a34a' : '#d97706';
  const statusBg = p.status === 'published' ? '#dcfce7' : '#fef3c7';
  const eventLink = `${appUrl}/dashboard/organizer/events/${p.eventId}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event created &mdash; ${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <div style="background-color:#f1f5f9;padding:40px 16px;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px -10px rgba(15,23,42,0.15);border:1px solid #e2e8f0;">

      <div style="background:linear-gradient(135deg,#059669 0%,#0d9488 50%,#0ea5e9 100%);padding:48px 32px;text-align:center;">
        <div style="display:inline-block;width:64px;height:64px;background:rgba(255,255,255,0.18);border-radius:50%;line-height:64px;font-size:32px;">🎉</div>
        <h1 style="margin:24px 0 8px 0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.02em;">Congratulations, ${name}!</h1>
        <p style="margin:0;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.5;">Your conference is officially on the platform.</p>
      </div>

      <div style="padding:36px 32px 8px 32px;">
        <p style="margin:0 0 24px 0;font-size:16px;line-height:1.65;color:#334155;">
          Hi <strong style="color:#0f172a;">${name}</strong>, you've just created a new event on <strong style="color:#0f172a;">MUN Platform</strong>. Here are the details we have on file:
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:28px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6d28d9;margin-bottom:8px;">Event</div>
          <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:14px;line-height:1.3;">${title}</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:6px 0;color:#64748b;width:90px;">Date</td>
              <td style="padding:6px 0;color:#0f172a;font-weight:500;">${date}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;">Location</td>
              <td style="padding:6px 0;color:#0f172a;font-weight:500;">${location}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;">Status</td>
              <td style="padding:6px 0;">
                <span style="display:inline-block;background:${statusBg};color:${statusColor};font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;">${statusLabel}</span>
              </td>
            </tr>
          </table>
        </div>
      </div>

      <div style="padding:0 32px 8px 32px;">
        <h2 style="margin:0 0 16px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#059669;">Next steps to launch successfully</h2>
      </div>

      <div style="padding:0 32px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:top;width:36px;">
                    <div style="width:32px;height:32px;background:#ede9fe;color:#6d28d9;border-radius:10px;line-height:32px;text-align:center;font-weight:700;font-size:14px;">1</div>
                  </td>
                  <td style="vertical-align:top;padding-left:14px;">
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Finalize committees &amp; capacity</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Confirm committee names, country lists and seat capacities before opening applications.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:top;width:36px;">
                    <div style="width:32px;height:32px;background:#dbeafe;color:#2563eb;border-radius:10px;line-height:32px;text-align:center;font-weight:700;font-size:14px;">2</div>
                  </td>
                  <td style="vertical-align:top;padding-left:14px;">
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Invite your Executive Board</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Assign chairs, directors and USGs so they can prepare study guides and manage rooms.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:top;width:36px;">
                    <div style="width:32px;height:32px;background:#dcfce7;color:#16a34a;border-radius:10px;line-height:32px;text-align:center;font-weight:700;font-size:14px;">3</div>
                  </td>
                  <td style="vertical-align:top;padding-left:14px;">
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Build the conference schedule</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Add opening ceremony, committee sessions, breaks and socials so delegates know the flow.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:top;width:36px;">
                    <div style="width:32px;height:32px;background:#fef3c7;color:#d97706;border-radius:10px;line-height:32px;text-align:center;font-weight:700;font-size:14px;">4</div>
                  </td>
                  <td style="vertical-align:top;padding-left:14px;">
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Configure ticketing tiers</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Set Early Bird, Regular and Late tier prices and seat caps to control your revenue.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:top;width:36px;">
                    <div style="width:32px;height:32px;background:#fce7f3;color:#db2777;border-radius:10px;line-height:32px;text-align:center;font-weight:700;font-size:14px;">5</div>
                  </td>
                  <td style="vertical-align:top;padding-left:14px;">
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Publish &amp; promote</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Move from Draft to Published so the event appears publicly &mdash; then share the link with delegates.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:top;width:36px;">
                    <div style="width:32px;height:32px;background:#cffafe;color:#0891b2;border-radius:10px;line-height:32px;text-align:center;font-weight:700;font-size:14px;">6</div>
                  </td>
                  <td style="vertical-align:top;padding-left:14px;">
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Review applications &amp; assign countries</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Approve delegates as they apply and allocate countries manually or via AI assignment.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>

      <div style="padding:32px;text-align:center;">
        <a href="${eventLink}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 8px 20px -8px rgba(5,150,105,0.6);">Manage your event &rarr;</a>
      </div>

      <div style="background-color:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0 0 6px 0;font-size:12px;color:#64748b;line-height:1.6;">
          You created <strong>${title}</strong> on MUN Platform. Need help? Just reply to this email or visit your organizer dashboard.
        </p>
        <p style="margin:0;font-size:12px;color:#94a3b8;">&copy; ${new Date().getFullYear()} MUN Platform. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * "Your event is on the platform" to its organizer, once, right after they create it. The caller
 * must be signed in and own the event; the address, title, date and place come from our records,
 * never the request (the route used to mail any address anything).
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { eventId?: string; organizerName?: string };
    if (!body?.eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });
    const snap = await adminDb.collection('events').doc(String(body.eventId)).get();
    const ev = snap.data() as any;
    if (!snap.exists || ev?.organizerId !== uid) {
      return NextResponse.json({ error: "Only the event's organizer can send this." }, { status: 403 });
    }
    const to = await getUserEmail(uid);
    if (!to) return NextResponse.json({ success: true, sent: 0 });

    const payload: Payload = {
      to,
      organizerName: escapeHtml(body.organizerName || 'Organizer'),
      eventTitle: escapeHtml(ev.title || 'Your event'),
      eventId: encodeURIComponent(snap.id),
      eventDate: escapeHtml(ev.date || 'TBD'),
      eventLocation: escapeHtml(ev.location || 'TBD'),
      status: ev.status === 'published' ? 'published' : 'draft',
    };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const transporter = createTransporter();

    await transporter.sendMail({
      from,
      to,
      subject: `🎉 Your event "${ev.title || 'Your event'}" is live on MUN Platform`,
      html: eventCreatedHtml(payload, appUrl),
    });

    return NextResponse.json({ success: true, sent: 1 });
  } catch (error: any) {
    console.error('event-created email error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
