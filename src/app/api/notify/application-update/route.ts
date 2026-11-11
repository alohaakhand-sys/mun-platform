import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import nodemailer from 'nodemailer';
import { requireUid, isEventOrganizer } from '@/lib/server/migrationServer';
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

/**
 * "Your application status changed" to the applicant. The caller must organize the
 * application's event; the address, name and role come from the application itself, never the
 * request (the route used to mail any address anything, signed in or not).
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { applicationId, status } = await req.json();
    if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 });
    const appSnap = await adminDb.collection('applications').doc(String(applicationId)).get();
    const app = appSnap.data() as any;
    if (!appSnap.exists || !app?.eventId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await isEventOrganizer(app.eventId, uid))) {
      return NextResponse.json({ error: "Only the event's organizer can send this." }, { status: 403 });
    }
    const applicantEmail = String(app.applicantEmail || '').trim();
    if (!applicantEmail) return NextResponse.json({ success: true, sent: 0 });
    const applicantName = escapeHtml(app.applicantName || 'there');
    const role = escapeHtml(app.role || 'Participant');

    const eventSnap = await adminDb.collection('events').doc(app.eventId).get();
    const event = eventSnap.data();
    const eventName = escapeHtml(event?.title || event?.name || event?.shortName || 'Conference');

    const transporter = createTransporter();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    
    let statusColor = '#444';
    let statusText = 'Updated';
    
    if (status === 'approved') {
      statusColor = '#10b981'; // Green
      statusText = 'Approved';
    } else if (status === 'rejected') {
      statusColor = '#ef4444'; // Red
      statusText = 'Rejected';
    } else if (status === 'pending') {
      statusColor = '#f59e0b'; // Orange
      statusText = 'Pending Review';
    }

    await transporter.sendMail({
      from,
      to: applicantEmail,
      subject: `Application Update – ${eventName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
          <h2 style="color:#1a1a2e;margin-bottom:16px">Application Status Updated</h2>
          <p style="color:#444">Hi <strong>${applicantName}</strong>,</p>
          <p style="color:#444">The status of your application for <strong>${eventName}</strong> has been updated.</p>
          <table style="border-collapse:collapse;margin:20px 0;width:100%;background:#f9f9f9;border-radius:8px">
            <tr>
              <td style="padding:10px 14px;color:#666;width:120px">Role</td>
              <td style="padding:10px 14px;font-weight:600;color:#1a1a2e">${role}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;color:#666">New Status</td>
              <td style="padding:10px 14px;color:${statusColor};font-weight:600">${statusText}</td>
            </tr>
          </table>
          <p style="color:#444">You can check further details by logging into your dashboard.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#999;font-size:12px">This is an automated message. Please do not reply.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Application update notification error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
