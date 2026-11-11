import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUid } from "@/lib/server/migrationServer";
import { createTransporter, mailFrom, emailShell, appUrl } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

const norm = (s: any) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const CHAIR_ROLES = /chair|director|usg|vice-?chair|eb/i;

// Email a committee's chairs that a delegate submitted a paper. Runs server-side (admin)
// because a delegate cannot list the staff roster client-side — the staff rules guard
// their emails, so the old client-side lookup always failed with a permissions error.
export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, committee, docType, title, delegateName, eventTitle } = await req.json();
  if (!eventId || !committee) {
    return NextResponse.json({ error: "eventId and committee are required." }, { status: 400 });
  }

  const snap = await adminDb.collection("events").doc(eventId).collection("staff").get();
  const target = norm(committee);
  const emails = Array.from(
    new Set(
      snap.docs
        .map((d) => d.data() as any)
        .filter(
          (s) =>
            norm(s.committeeId) === target &&
            CHAIR_ROLES.test(s.role || "") &&
            s.email &&
            (s.inviteStatus === "accepted" || !s.inviteStatus)
        )
        .map((s) => s.email as string)
    )
  );
  if (emails.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const subject = `New ${docType || "committee document"} — ${eventTitle || committee}`;
  const href = `${appUrl()}/dashboard/documents`;
  const html = emailShell({
    emoji: "📄",
    heading: "New Committee Document",
    bodyHtml: `<p><strong>${delegateName || "A delegate"}</strong> submitted a <strong>${docType || "document"}</strong>${title ? ` — &ldquo;${title}&rdquo;` : ""} in <strong>${committee}</strong>${eventTitle ? ` (${eventTitle})` : ""}.</p><p>Open your Documents hub or the committee console to review and approve it.</p>`,
    ctaLabel: "Review documents",
    ctaHref: href,
    accent: "#6d28d9",
  });

  try {
    const t = createTransporter();
    const from = mailFrom();
    await t.sendMail({ from, to: from, bcc: emails, subject, html });
  } catch (e: any) {
    console.error("committee-doc notify sendMail error:", e?.message);
    return NextResponse.json({ ok: false, error: "send-failed" }, { status: 200 });
  }

  return NextResponse.json({ ok: true, sent: emails.length });
}
