type NotificationEmailTemplateInput = {
  appName: string;
  subject: string;
  message: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function renderMessage(message: string): string {
  return escapeHtml(message).replace(/\r\n|\r|\n/gu, '<br>');
}

export function renderNotificationEmail(input: NotificationEmailTemplateInput): string {
  const appName = escapeHtml(input.appName);
  const subject = escapeHtml(input.subject);
  const message = renderMessage(input.message);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f8fc;color:#101b3f;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${subject}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f6f8fc;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe6f2;border-collapse:separate;border-spacing:0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:#071a36;color:#ffffff;font-size:18px;font-weight:700;line-height:1.4;">
                ${appName}
              </td>
            </tr>
            <tr>
              <td style="padding:32px 24px 16px;">
                <p style="margin:0 0 12px;color:#1769f6;font-size:12px;font-weight:700;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;">Security notification</p>
                <h1 style="margin:0;color:#101b3f;font-size:24px;font-weight:700;line-height:1.35;overflow-wrap:anywhere;">${subject}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 32px;">
                <div style="color:#334263;font-size:16px;line-height:1.65;overflow-wrap:anywhere;">${message}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #dfe6f2;color:#60708f;font-size:12px;line-height:1.6;">
                This notification was sent by an authorized ${appName} administrator. Do not reply with passwords, access tokens, or other sensitive information.
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:#60708f;font-size:12px;line-height:1.5;">Automated notification from ${appName}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
