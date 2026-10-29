/**
 * Shared HTML email base for all SecuraAI transactional emails.
 *
 * Design tokens are hard-coded as inline styles for maximum email client
 * compatibility (Gmail, Outlook, Apple Mail, Yahoo, mobile clients).
 *
 * Palette mirrors the SecuraAI design system:
 *   --background : #f6f8fc   page background
 *   --surface    : #ffffff   card surface
 *   --sidebar    : #071a36   nav / header
 *   --foreground : #101b3f   primary text
 *   --muted      : #60708f   secondary text
 *   --border     : #dfe6f2   dividers
 *   --brand      : #1769f6   accent / links
 *   --success    : #159455   success states
 *   --warning    : #c27208   warning states
 *   --danger     : #dc3545   danger states
 */

// ─── Utility ─────────────────────────────────────────────────────────────────

export function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/gu, (ch) => entities[ch] ?? ch);
}

export function nl2br(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/gu, '<br>');
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

const C = {
  pageBg: '#f6f8fc',
  surface: '#ffffff',
  header: '#071a36',
  headerText: '#ffffff',
  footerBg: '#f1f5fb',
  foreground: '#101b3f',
  body: '#334263',
  muted: '#60708f',
  border: '#dfe6f2',
  brand: '#1769f6',
  brandBg: '#eef3ff',
  brandBorder: '#cddcff',
  brandText: '#0f52cc',
  success: '#159455',
  successBg: '#edfaf3',
  successBorder: '#a3dfbe',
  warning: '#c27208',
  warningBg: '#fef9ec',
  warningBorder: '#f5d98a',
  danger: '#dc3545',
  dangerBg: '#fef2f3',
  dangerBorder: '#f5c2c6',
} as const;

// ─── Badge chip (label above heading) ────────────────────────────────────────

export type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

function badgeStyle(tone: BadgeTone): string {
  const map: Record<BadgeTone, { bg: string; color: string }> = {
    brand: { bg: C.brandBg, color: C.brand },
    success: { bg: C.successBg, color: C.success },
    warning: { bg: C.warningBg, color: C.warning },
    danger: { bg: C.dangerBg, color: C.danger },
    neutral: { bg: '#f1f5fb', color: C.muted },
  };
  const { bg, color } = map[tone];
  return `display:inline-block;padding:3px 10px;background:${bg};color:${color};font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;border-radius:20px;`;
}

// ─── Base shell ──────────────────────────────────────────────────────────────

export type BaseEmailOptions = {
  /** <title> and preview text derive from this */
  subject: string;
  /** Shown in the preview text (preheader) */
  previewText?: string;
  appName: string;
  /** Small chip label above the heading (e.g. "Account security") */
  badgeLabel: string;
  badgeTone?: BadgeTone;
  /** Main heading */
  heading: string;
  /** Everything between the heading and the footer */
  bodyHtml: string;
  /** Footer disclaimer line */
  footerNote: string;
  /** Very small tagline below the card */
  tagline?: string;
};

export function renderBaseEmail(opts: BaseEmailOptions): string {
  const subject = escapeHtml(opts.subject);
  const appName = escapeHtml(opts.appName);
  const badge = escapeHtml(opts.badgeLabel);
  const heading = escapeHtml(opts.heading);
  const tone = opts.badgeTone ?? 'brand';
  const preview = escapeHtml(opts.previewText ?? opts.subject);
  const footerNote = escapeHtml(opts.footerNote);
  const tagline = escapeHtml(
    opts.tagline ?? `Automated message from ${opts.appName} · Do not reply`,
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="x-apple-disable-message-reformatting">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:${C.pageBg};color:${C.foreground};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

    <!-- Preheader (hidden preview text) -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${preview}</div>

    <!-- Page wrapper -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${C.pageBg};border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:36px 16px 40px;">

          <!-- Card -->
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.surface};border:1px solid ${C.border};border-collapse:separate;border-spacing:0;border-radius:14px;overflow:hidden;">

            <!-- ── Header bar ── -->
            <tr>
              <td style="padding:0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <!-- Brand name -->
                    <td style="padding:18px 24px;background:${C.header};color:${C.headerText};font-size:17px;font-weight:700;line-height:1;letter-spacing:0.02em;">
                      ${appName}
                    </td>
                    <!-- Accent strip -->
                    <td style="width:6px;background:#1769f6;"></td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- ── Heading section ── -->
            <tr>
              <td style="padding:32px 28px 16px;">
                <p style="margin:0 0 10px;${badgeStyle(tone)}">${badge}</p>
                <h1 style="margin:0;color:${C.foreground};font-size:24px;font-weight:700;line-height:1.3;">${heading}</h1>
              </td>
            </tr>

            <!-- ── Body ── -->
            <tr>
              <td style="padding:4px 28px 36px;">
                ${opts.bodyHtml}
              </td>
            </tr>

            <!-- ── Footer ── -->
            <tr>
              <td style="padding:18px 28px;background:${C.footerBg};border-top:1px solid ${C.border};">
                <p style="margin:0;color:${C.muted};font-size:12px;line-height:1.65;">${footerNote}</p>
              </td>
            </tr>

          </table><!-- /Card -->

          <!-- Below-card tagline -->
          <p style="margin:14px 0 0;color:${C.muted};font-size:11px;line-height:1.5;text-align:center;">${tagline}</p>

        </td>
      </tr>
    </table><!-- /Page wrapper -->

  </body>
</html>`;
}

// ─── Reusable body fragments ──────────────────────────────────────────────────

/** Standard body paragraph */
export function para(text: string, large = false): string {
  const size = large ? '17px' : '15px';
  return `<p style="margin:0 0 16px;color:${C.body};font-size:${size};line-height:1.7;">${text}</p>`;
}

/** Highlighted code/OTP block */
export function otpBlock(code: string): string {
  return `<div style="margin:20px 0;padding:20px 24px;background:${C.brandBg};border:1px solid ${C.brandBorder};border-radius:10px;text-align:center;">
  <span style="color:${C.brandText};font-size:32px;font-weight:700;line-height:1.2;letter-spacing:0.22em;font-family:'Courier New',Courier,monospace;">${escapeHtml(code)}</span>
</div>`;
}

/** Primary CTA button */
export function ctaButton(label: string, url: string): string {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:${C.brand};border-radius:8px;">
      <a href="${escapeHtml(safeUrl)}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Key-value info strip (muted label + bold value) */
export function infoRow(label: string, value: string): string {
  return `<tr>
  <td style="padding:9px 14px 9px 0;color:${C.muted};font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
  <td style="padding:9px 0;color:${C.foreground};font-size:13px;font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
</tr>`;
}

/** Wrap multiple infoRows in a bordered table */
export function infoTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${C.border};border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;margin:16px 0 20px;">
  <tr><td style="padding:4px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr>
</table>`;
}

/** Credential / password highlight box */
export function credentialBox(label: string, value: string): string {
  return `<div style="margin:20px 0;padding:16px 20px;background:${C.footerBg};border:1px solid ${C.border};border-left:4px solid ${C.brand};border-radius:8px;">
  <p style="margin:0 0 4px;color:${C.muted};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(label)}</p>
  <code style="display:block;color:${C.foreground};font-size:17px;font-weight:700;font-family:'Courier New',Courier,monospace;word-break:break-all;">${escapeHtml(value)}</code>
</div>`;
}

/** Inline callout alert box */
export function calloutBox(message: string, tone: BadgeTone = 'warning'): string {
  const map: Record<BadgeTone, { bg: string; border: string; color: string }> = {
    brand: { bg: C.brandBg, border: C.brand, color: C.brandText },
    success: { bg: C.successBg, border: C.success, color: C.success },
    warning: { bg: C.warningBg, border: C.warning, color: C.warning },
    danger: { bg: C.dangerBg, border: C.danger, color: C.danger },
    neutral: { bg: C.footerBg, border: C.border, color: C.muted },
  };
  const { bg, border, color } = map[tone];
  return `<div style="margin:16px 0 20px;padding:14px 18px;background:${bg};border:1px solid ${border};border-radius:8px;color:${color};font-size:13px;line-height:1.6;">${escapeHtml(message)}</div>`;
}

/** Horizontal divider */
export function divider(): string {
  return `<div style="margin:20px 0;border-top:1px solid ${C.border};"></div>`;
}
