/**
 * Password-reset OTP email template.
 *
 * Sent when a user requests a password reset on the SecuraAI login page.
 * The email contains a short-lived one-time code the user enters on the
 * "Verify reset code" step of the recovery flow.
 */
import {
  calloutBox,
  divider,
  infoRow,
  infoTable,
  nl2br,
  otpBlock,
  para,
  renderBaseEmail,
} from '../../common/email/email-base.template.js';

export type PasswordResetEmailInput = {
  appName: string;
  resetCode: string;
  expiresInMinutes: number;
  /** Optional — shown as context in the info strip */
  recipientEmail?: string;
};

export function renderPasswordResetEmail(input: PasswordResetEmailInput): string {
  const bodyHtml = [
    para(
      'Enter the verification code below on the <strong>reset password</strong> screen to continue:',
    ),
    otpBlock(input.resetCode),
    infoTable(
      [
        infoRow('Expires in', `${input.expiresInMinutes} minutes`),
        infoRow('Single-use', 'Yes — valid for one verification attempt only'),
        ...(input.recipientEmail ? [infoRow('Account email', input.recipientEmail)] : []),
      ].join(''),
    ),
    calloutBox(
      'If you did not request a password reset, you can safely ignore this email. Your password will not change.',
      'warning',
    ),
    divider(),
    para(
      `<span style="color:#60708f;font-size:13px;">Never share this code with anyone, including ${nl2br(input.appName)} support staff. Requests for this code are a sign of a social engineering attempt.</span>`,
    ),
  ].join('');

  return renderBaseEmail({
    appName: input.appName,
    subject: `Reset your ${input.appName} password`,
    previewText: `Your password reset code is: ${input.resetCode}. Expires in ${input.expiresInMinutes} minutes.`,
    badgeLabel: 'Account security',
    badgeTone: 'brand',
    heading: 'Reset your password',
    bodyHtml,
    footerNote:
      'This is an automated security email from the authentication system. ' +
      'Do not reply — your reply will not be delivered.',
    tagline: `Automated security message from ${input.appName}`,
  });
}
