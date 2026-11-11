import nodemailer from "nodemailer";

export function createTransporter() {
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

export const mailFrom = () => process.env.SMTP_FROM || process.env.SMTP_USER;
export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";

/**
 * Wraps inner HTML in the shared branded email shell.
 * `accent` controls the header gradient / button colour.
 */
export function emailShell(opts: {
  emoji: string;
  heading: string;
  subheading?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  accent?: string;
}) {
  const accent = opts.accent || "#2563eb";
  const cta =
    opts.ctaLabel && opts.ctaHref
      ? `<div style="padding:32px;text-align:center;">
          <a href="${opts.ctaHref}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;">${opts.ctaLabel} &rarr;</a>
        </div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="background-color:#f1f5f9;padding:40px 16px;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px -10px rgba(15,23,42,0.15);border:1px solid #e2e8f0;">
      <div style="background:${accent};padding:40px 32px;text-align:center;">
        <div style="display:inline-block;width:60px;height:60px;background:rgba(255,255,255,0.18);border-radius:50%;line-height:60px;font-size:28px;">${opts.emoji}</div>
        <h1 style="margin:20px 0 6px 0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.02em;">${opts.heading}</h1>
        ${opts.subheading ? `<p style="margin:0;color:rgba(255,255,255,0.9);font-size:14px;line-height:1.5;">${opts.subheading}</p>` : ""}
      </div>
      <div style="padding:32px;font-size:15px;line-height:1.65;color:#334155;">
        ${opts.bodyHtml}
      </div>
      ${cta}
      <div style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">&copy; ${new Date().getFullYear()} MUN Platform. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
