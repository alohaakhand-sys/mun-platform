import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from "@/lib/server/userContact";
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

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

export async function POST(req: NextRequest) {
  try {
    const { eventId, applicantName, applicantEmail, role } = await req.json();
    if (!eventId) {
      return NextResponse.json({ error: 'eventId required' }, { status: 400 });
    }

    const eventSnap = await adminDb.collection('events').doc(eventId).get();
    const event = eventSnap.data();
    const eventName = event?.name || event?.shortName || 'Conference';
    const organizerId = event?.organizerId as string | undefined;

    let organizerEmail = '';
    if (organizerId) {
      organizerEmail = await getUserEmail(organizerId);
    }

    // In-app notification for the organizer + accepted co-organizers so the bell
    // ("Updates") on the organizer dashboard surfaces new applications, not just email.
    const notifyUids = new Set<string>();
    if (organizerId) notifyUids.add(organizerId);
    try {
      const staffSnap = await adminDb.collection('events').doc(eventId).collection('staff').get();
      staffSnap.forEach((d) => {
        const s = d.data() as any;
        if (s.inviteStatus === 'accepted' && s.role === 'co-organizer' && s.uid) {
          notifyUids.add(s.uid);
        }
      });
    } catch (e) {
      console.error('co-organizer lookup for application notification failed:', e);
    }
    if (notifyUids.size > 0) {
      const href = `/dashboard/organizer/events/${eventId}/applications`;
      const batch = adminDb.batch();
      notifyUids.forEach((uid) => {
        batch.set(adminDb.collection('notifications').doc(), {
          uid,
          type: 'info',
          title: `New application – ${eventName}`,
          body: `${applicantName || 'Someone'} applied as ${role || 'Participant'}.`,
          href,
          eventId,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    const transporter = createTransporter();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const sends: Promise<any>[] = [];

    if (applicantEmail) {
      sends.push(
        transporter.sendMail({
          from,
          to: applicantEmail,
          subject: `Application Received – ${eventName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
              <h2 style="color:#1a1a2e;margin-bottom:16px">Application Received</h2>
              <p style="color:#444">Hi <strong>${applicantName || 'there'}</strong>,</p>
              <p style="color:#444">Your application for <strong>${eventName}</strong> has been received successfully.</p>
              <table style="border-collapse:collapse;margin:20px 0;width:100%;background:#f9f9f9;border-radius:8px">
                <tr>
                  <td style="padding:10px 14px;color:#666;width:120px">Role</td>
                  <td style="padding:10px 14px;font-weight:600;color:#1a1a2e">${role || 'Participant'}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;color:#666">Status</td>
                  <td style="padding:10px 14px;color:#f59e0b;font-weight:600">Pending Review</td>
                </tr>
              </table>
              <p style="color:#444">We'll review your application and notify you of any updates.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
              <p style="color:#999;font-size:12px">This is an automated message. Please do not reply.</p>
            </div>
          `,
        })
      );
    }

    if (organizerEmail) {
      sends.push(
        transporter.sendMail({
          from,
          to: organizerEmail,
          subject: `New Application – ${eventName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
              <h2 style="color:#1a1a2e;margin-bottom:16px">New Application Received</h2>
              <p style="color:#444">A new application has been submitted for <strong>${eventName}</strong>.</p>
              <table style="border-collapse:collapse;margin:20px 0;width:100%;background:#f9f9f9;border-radius:8px">
                <tr>
                  <td style="padding:10px 14px;color:#666;width:120px">Applicant</td>
                  <td style="padding:10px 14px;font-weight:600;color:#1a1a2e">${applicantName || 'Unknown'}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;color:#666">Email</td>
                  <td style="padding:10px 14px;color:#1a1a2e">${applicantEmail || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;color:#666">Role</td>
                  <td style="padding:10px 14px;color:#1a1a2e">${role || 'Participant'}</td>
                </tr>
              </table>
              <p style="color:#444">Review the application in your organizer dashboard.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
              <p style="color:#999;font-size:12px">This is an automated message. Please do not reply.</p>
            </div>
          `,
        })
      );
    }

    await Promise.allSettled(sends);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Application notification error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
