import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUid, sendMail } from "@/lib/server/migrationServer";
import { getUserEmail } from "@/lib/server/userContact";

export const dynamic = "force-dynamic";

// A complaint was escalated → email its new handler. The handler's address is looked up here,
// server side: members' emails are private (users/{uid}/private/contact), so the escalating
// client can't always read it.
export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { complaintId } = await req.json();
  if (!complaintId) return NextResponse.json({ error: "complaintId required" }, { status: 400 });

  const snap = await adminDb.collection("complaints").doc(complaintId).get();
  const c = snap.data() as any;
  if (!snap.exists || !c?.assignedTo) return NextResponse.json({ error: "No handler" }, { status: 404 });

  const ev = c.eventId ? await adminDb.collection("events").doc(c.eventId).get() : null;
  const eventTitle = (ev?.data() as any)?.title || "the conference";
  const email = await getUserEmail(c.assignedTo);
  if (email) {
    // Same message the client used to send through /api/send-email.
    const subject = String(c.subject || "a complaint").replace(/</g, "&lt;");
    await sendMail(email, `Complaint escalated — ${eventTitle}`, `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background:#fff; color:#1e293b;">
      <h2 style="color:#6d28d9; margin-top:0;">A Complaint Needs Your Attention</h2>
      <p>A complaint (<strong>${subject}</strong>) for <strong>${eventTitle}</strong> has been escalated to you.</p>
      <p>Please review and respond from your dashboard.</p>
      <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:12px; color:#64748b;">
        This is an automated notification from MUN Platform.
      </div>
    </div>`);
  }
  return NextResponse.json({ ok: true });
}
