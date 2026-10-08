import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { renderNotificationEmail } from './notification-email.template.js';

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS)
    throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured');
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

export const notificationEmailService = {
  ensureConfigured(): void {
    getTransporter();
  },

  async send(destination: string, subject: string, message: string): Promise<string | null> {
    const result = await getTransporter().sendMail({
      from: env.SMTP_USER,
      to: destination,
      subject,
      text: message,
      html: renderNotificationEmail({ appName: env.APP_NAME, subject, message }),
    });
    return typeof result.messageId === 'string' && result.messageId ? result.messageId : null;
  },
};
