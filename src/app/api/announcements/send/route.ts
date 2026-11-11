import { NextRequest, NextResponse } from 'next/server';
import { emailOf } from "@/lib/server/userContact";
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { marked } from 'marked';
import { belongsToCommittee } from '@/lib/utils/committee';
import { buildAnnouncementEmailHtml } from '@/lib/email/announcementTemplate';
import { requireUid } from '@/lib/server/migrationServer';
import { canSendAnnouncements, bulkSendRefusal } from '@/lib/server/committeeAccess';

/** Sends above this many recipients need the sender to be Pro (the composer's rule, enforced here). */

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

const ROLE_KEYWORDS: Record<string, string[]> = {
  'delegate': ['delegate'],
  'chair': ['chair', 'director', 'vice-chair'],
  'observer': ['observer'],
  'faculty-advisor': ['faculty advisor', 'faculty-advisor'],
  'staff': ['staff', 'co-organizer', 'usg'],
};

function roleMatches(appRole: string, filterRoles: string[]): boolean {
  const lc = (appRole || '').toLowerCase();
  return filterRoles.some(rid =>
    ROLE_KEYWORDS[rid]?.some(kw => lc.includes(kw)) ?? false
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function committeeMatches(app: any, filterCommittees: string[]): boolean {
  if (filterCommittees.length === 0) return true;
  // Match by the delegate's EFFECTIVE committee only — OR-ing the stale preference
  // would deliver an announcement for a delegate's old committee after they migrated.
  return filterCommittees.some(c => belongsToCommittee(app, c));
}

// 'paid' = settled; 'unpaid' = anything not settled (unpaid/refunded/none).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function paymentMatches(app: any, status: string): boolean {
  if (!status || status === 'all') return true;
  const isPaid = app.paymentStatus === 'paid';
  return status === 'paid' ? isPaid : !isPaid;
}

export async function POST(req: NextRequest) {
  // Internal callers (the scheduled-announcements cron) prove themselves with a server secret.
  const given = req.headers.get('x-internal-secret');
  const isInternal = !!given && [process.env.INTERNAL_API_SECRET, process.env.CRON_SECRET].some((s) => !!s && s === given);

  const { eventId, subject, body, audience, sentBy: claimedSender, recipientCount, existingId } = await req.json();
  if (!eventId || !subject || !body) {
    return NextResponse.json({ error: 'eventId, subject, body required' }, { status: 400 });
  }

  // Only the event's organizer, a co-organizer, an admin, or staff granted "Send announcements"
  // may mail its participants; the sender is the caller, never a uid from the body.
  let sentBy: string = claimedSender || '';
  if (!isInternal) {
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await canSendAnnouncements(eventId, uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    sentBy = uid;
  }

  // Fetch event and sender details in parallel
  const [eventSnap, senderSnap] = await Promise.all([
    adminDb.collection('events').doc(eventId).get(),
    sentBy ? adminDb.collection('users').doc(sentBy).get() : Promise.resolve(null),
  ]);

  const eventTitle = eventSnap.exists ? (eventSnap.data()?.title || 'MUN Event') : 'MUN Event';
  const senderName = senderSnap && senderSnap.exists
    ? (senderSnap.data()?.displayName || [senderSnap.data()?.firstName, senderSnap.data()?.lastName].filter(Boolean).join(' ') || 'Organizer')
    : 'Organizer';

  // A scheduled announcement is sent in place (internal calls only), so it isn't duplicated.
  const reuse = isInternal && typeof existingId === 'string' && existingId.length > 0;
  const annCol = adminDb.collection('events').doc(eventId).collection('announcements');
  const annRef = reuse ? annCol.doc(existingId) : annCol.doc();

  await annRef.set({
    subject,
    body,
    audience: audience || { roles: [], committees: [], paymentStatus: 'all' },
    status: 'sending',
    sentBy: sentBy || '',
    recipientCount: recipientCount || 0,
    ...(reuse ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  try {
    // Resolve approved applications
    const appsSnap = await adminDb
      .collection('applications')
      .where('eventId', '==', eventId)
      .where('status', '==', 'approved')
      .get();

    const appDocs = appsSnap.docs;
    const roles: string[] = audience?.roles || [];
    const committees: string[] = audience?.committees || [];
    const explicitUserIds: string[] = audience?.userIds || [];
    const paymentStatus: string = audience?.paymentStatus || 'all';

    // Map of userId -> application role (from all approved apps, so explicitly
    // selected users still resolve to their role).
    const userRoleMap = new Map<string, string>();
    appDocs.forEach(d => {
      userRoleMap.set(d.data().userId, d.data().role || 'Participant');
    });

    let userIds: string[];
    if (explicitUserIds.length > 0) {
      // Specific-user targeting overrides role/committee filters — but only this event's own
      // approved participants can be named.
      userIds = [...new Set(explicitUserIds)].filter(u => userRoleMap.has(u));
    } else {
      let filtered = appDocs;
      if (roles.length > 0) {
        filtered = filtered.filter(d => roleMatches(d.data().role || '', roles));
      }
      if (committees.length > 0) {
        filtered = filtered.filter(d => committeeMatches(d.data(), committees));
      }
      if (paymentStatus !== 'all') {
        filtered = filtered.filter(d => paymentMatches(d.data(), paymentStatus));
      }
      userIds = [...new Set(filtered.map(d => d.data().userId as string))];
    }

    const emails = new Set<string>();
    const recipients: { uid: string; name: string; email: string; role: string; }[] = [];

    for (let i = 0; i < userIds.length; i += 30) {
      const chunk = userIds.slice(i, i + 30);
      const usersSnap = await adminDb
        .collection('users')
        .where('__name__', 'in', chunk)
        .get();
      // Emails are private (users/{uid}/private/contact); look each one up.
      const withEmail = await Promise.all(usersSnap.docs.map(async d => ({ d, email: await emailOf(d.id, d.data()) })));
      withEmail.forEach(({ d, email }) => {
        const userData = d.data();
        if (email) {
          emails.add(email);
          recipients.push({
            uid: d.id,
            name: userData.displayName || userData.name || 'User',
            email,
            role: userRoleMap.get(d.id) || 'Participant',
          });
        }
      });
    }

    const emailArray = Array.from(emails);

    // Big sends come with the event's plan (eventPlan.ts), whoever sends them.
    const refusal = await bulkSendRefusal(eventId, emailArray.length);
    if (refusal) {
      if (reuse) await annRef.update({ status: 'failed', errorMessage: refusal });
      else await annRef.delete();
      return NextResponse.json({ error: refusal }, { status: 403 });
    }

    if (emailArray.length === 0) {
      await annRef.update({
        status: 'sent',
        recipientCount: 0,
        sentAt: FieldValue.serverTimestamp(),
        deliveryStats: { sent: 0, failed: 0 },
        recipients: [],
      });
      return NextResponse.json({ success: true, annId: annRef.id, sent: 0, failed: 0 });
    }

    // Body is authored as markdown in the WYSIWYG composer; render it to HTML for the
    // email. Legacy plain-text bodies still render fine (marked passes text through).
    const htmlBody = marked.parse(body, { async: false }) as string;
    const transporter = createTransporter();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const BATCH = 50;
    let sent = 0;
    let failed = 0;

    const emailHtml = buildAnnouncementEmailHtml({ subject, eventTitle, senderName, bodyHtml: htmlBody });

    for (let i = 0; i < emailArray.length; i += BATCH) {
      const batch = emailArray.slice(i, i + BATCH);
      try {
        await transporter.sendMail({
          from,
          to: from,
          bcc: batch.join(', '),
          subject,
          html: emailHtml,
        });
        sent += batch.length;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('SMTP batch error:', errMsg);
        failed += batch.length;
      }
    }

    const finalStatus =
      failed > 0 && sent > 0 ? 'partial' : failed > 0 ? 'failed' : 'sent';

    await annRef.update({
      status: finalStatus,
      recipientCount: emailArray.length,
      sentAt: FieldValue.serverTimestamp(),
      deliveryStats: { sent, failed },
      recipients,
    });

    return NextResponse.json({ success: true, annId: annRef.id, sent, failed });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Announcement send error:', error);
    await annRef.update({ status: 'failed', errorMessage: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
