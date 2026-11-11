// Single source of truth for the announcement email HTML. Used by the send API route
// (server) and the composer's live preview (client), so what the organizer previews is
// exactly what recipients receive. `bodyHtml` is already-rendered HTML (markdown → HTML
// via marked); everything else is plain text that gets interpolated into the shell.

export interface AnnouncementEmailParams {
  subject: string;
  eventTitle: string;
  senderName: string;
  bodyHtml: string;
  year?: number;
}

export function buildAnnouncementEmailHtml({
  subject,
  eventTitle,
  senderName,
  bodyHtml,
  year,
}: AnnouncementEmailParams): string {
  const y = year ?? new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      background-color: #f8fafc;
      padding: 40px 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .accent-bar {
      height: 6px;
      background: linear-gradient(90deg, #6d28d9, #8b5cf6);
    }
    .header {
      padding: 32px 32px 20px 32px;
      border-bottom: 1px solid #f1f5f9;
    }
    .header-tag {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6d28d9;
      background-color: #f5f3ff;
      padding: 4px 8px;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .event-title {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
      line-height: 1.25;
    }
    .sender-info {
      font-size: 13px;
      color: #64748b;
      margin-top: 8px;
    }
    .content {
      padding: 32px;
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
    }
    .content p { margin-top: 0; margin-bottom: 16px; }
    .content p:last-child { margin-bottom: 0; }
    .content h1, .content h2, .content h3 { color: #0f172a; line-height: 1.3; margin: 0 0 12px; }
    .content h1 { font-size: 22px; }
    .content h2 { font-size: 18px; }
    .content h3 { font-size: 16px; }
    .content ul, .content ol { margin: 0 0 16px; padding-left: 22px; }
    .content li { margin-bottom: 6px; }
    .content a { color: #6d28d9; }
    .content blockquote {
      margin: 0 0 16px;
      padding: 8px 16px;
      border-left: 3px solid #8b5cf6;
      background: #f5f3ff;
      color: #4c1d95;
    }
    .content code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      border-top: 1px solid #f1f5f9;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .footer a { color: #6d28d9; text-decoration: none; font-weight: 500; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="accent-bar"></div>
      <div class="header">
        <span class="header-tag">Official Announcement</span>
        <h1 class="event-title">${eventTitle}</h1>
        <div class="sender-info">Sent by <strong>${senderName}</strong></div>
      </div>
      <div class="content">
        ${bodyHtml}
      </div>
      <div class="footer">
        This is an official announcement for <strong>${eventTitle}</strong> sent via the MUN Platform.<br>
        Please do not reply directly to this automated email.<br>
        <span style="display: block; margin-top: 8px;">&copy; ${y} MUN Platform. All rights reserved.</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}
