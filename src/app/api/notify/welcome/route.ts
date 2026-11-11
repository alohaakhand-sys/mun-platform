import { NextRequest, NextResponse } from 'next/server';
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

function welcomeHtml(name: string, appUrl: string) {
  const safeName = name || 'Delegate';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to MUN Platform</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <div style="background-color:#f1f5f9;padding:40px 16px;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px -10px rgba(15,23,42,0.15);border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#6d28d9 0%,#4f46e5 50%,#0ea5e9 100%);padding:48px 32px;text-align:center;">
        <div style="display:inline-block;width:64px;height:64px;background:rgba(255,255,255,0.18);border-radius:16px;line-height:64px;font-size:28px;font-weight:800;color:#ffffff;backdrop-filter:blur(8px);">M</div>
        <h1 style="margin:24px 0 8px 0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.02em;">Welcome aboard, ${safeName}!</h1>
        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.5;">Your MUN journey starts here.</p>
      </div>

      <div style="padding:40px 32px 8px 32px;">
        <p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#334155;">
          We're thrilled to have you join the <strong style="color:#0f172a;">MUN Platform</strong> &mdash; a complete home for delegates, chairs, and organizers running modern Model UN conferences.
        </p>
        <p style="margin:0 0 28px 0;font-size:16px;line-height:1.65;color:#334155;">
          Whether you're here to debate, lead a committee, or host your own event &mdash; everything you need is one click away.
        </p>
      </div>

      <div style="padding:0 32px 8px 32px;">
        <h2 style="margin:0 0 16px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6d28d9;">What you can do next</h2>
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
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Complete your profile</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Add experience, interests &amp; a photo so organizers can find you.</div>
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
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Browse upcoming conferences</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Find events that match your interests and apply as a delegate.</div>
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
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Connect with the community</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Read articles, message delegates &amp; build your MUN network.</div>
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
                    <div style="width:32px;height:32px;background:#fef3c7;color:#d97706;border-radius:10px;line-height:32px;text-align:center;font-weight:700;font-size:14px;">4</div>
                  </td>
                  <td style="vertical-align:top;padding-left:14px;">
                    <div style="font-size:15px;font-weight:600;color:#0f172a;">Host your own event</div>
                    <div style="font-size:13px;color:#64748b;margin-top:2px;line-height:1.5;">Organize a conference with committees, ticketing &amp; live sessions.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>

      <div style="padding:32px;text-align:center;">
        <a href="${appUrl}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4f46e5);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 8px 20px -8px rgba(109,40,217,0.6);">Go to your dashboard &rarr;</a>
      </div>

      <div style="background-color:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0 0 6px 0;font-size:12px;color:#64748b;line-height:1.6;">
          You're receiving this because you created an account on <strong>MUN Platform</strong>.
        </p>
        <p style="margin:0;font-size:12px;color:#94a3b8;">&copy; ${new Date().getFullYear()} MUN Platform. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const { to, name } = await req.json();
    if (!to) {
      return NextResponse.json({ error: 'to required' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const transporter = createTransporter();

    await transporter.sendMail({
      from,
      to,
      subject: 'Welcome to MUN Platform 🎉',
      html: welcomeHtml(name || '', appUrl),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('welcome email error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
