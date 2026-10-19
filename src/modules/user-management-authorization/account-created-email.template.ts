/**
 * New account welcome email template.
 *
 * Sent immediately after an administrator provisions a new user account.
 * Contains the recipient's email address and the system-generated
 * temporary password. The user must sign in and change the password
 * on first login.
 */
import {
  calloutBox,
  credentialBox,
  ctaButton,
  divider,
  escapeHtml,
  infoRow,
  infoTable,
  para,
  renderBaseEmail,
} from '../../common/email/email-base.template.js';

export type AccountCreatedEmailInput = {
  appName: string;
  /** Recipient's display name */
  fullName: string;
  /** Login email address */
  email: string;
  /** System-generated temporary password (shown in plain text) */
  temporaryPassword: string;
  /** Optional login URL shown as a CTA link */
  loginUrl?: string;
};

export function renderAccountCreatedEmail(input: AccountCreatedEmailInput): string {
  const appName = escapeHtml(input.appName);
  const fullName = escapeHtml(input.fullName);
  const loginAction = input.loginUrl
    ? ctaButton(`Sign in to ${input.appName}`, input.loginUrl)
    : para(`Open the ${appName} login page and follow the prompt to set a permanent password.`);

  const bodyHtml = [
    para(`Hello <strong>${fullName}</strong>,`),
    para(
      `Your <strong>${appName}</strong> account has been created by your administrator. ` +
        `Use the credentials below to sign in for the first time.`,
    ),
    infoTable([infoRow('Login email', input.email), infoRow('Platform', input.appName)].join('')),
    credentialBox('Temporary password', input.temporaryPassword),
    calloutBox(
      'You will be required to change this password immediately after your first sign-in. ' +
        'Do not share this email or your temporary password with anyone.',
      'warning',
    ),
    loginAction,
    divider(),
    para(
      `<span style="color:#60708f;font-size:13px;">` +
        `If you believe this account was created in error, contact your administrator immediately. ` +
        `Do not sign in with these credentials.` +
        `</span>`,
    ),
  ].join('');

  return renderBaseEmail({
    appName: input.appName,
    subject: `Your ${input.appName} account is ready`,
    previewText: `Welcome to ${input.appName}, ${input.fullName}. Your temporary credentials are inside.`,
    badgeLabel: 'Account provisioned',
    badgeTone: 'success',
    heading: 'Your account is ready',
    bodyHtml,
    footerNote:
      `This email was sent by an ${input.appName} administrator. ` +
      'Do not reply — replies are not monitored.',
    tagline: `Automated onboarding message from ${input.appName}`,
  });
}
