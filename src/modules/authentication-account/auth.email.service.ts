import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { renderPasswordResetEmail } from './password-reset-email.template.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new AppError(503, 'EMAIL_SERVICE_UNAVAILABLE', 'Email service is not configured');
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

export const authEmailService = {
  async sendPasswordResetEmail(input: { to: string; token: string }): Promise<void> {
    const subject = `Reset your ${env.APP_NAME} password`;
    await getTransporter().sendMail({
      from: env.SMTP_USER,
      to: input.to,
      subject,
      text:
        `Your ${env.APP_NAME} password reset code is: ${input.token}\n\n` +
        `This code expires in 60 minutes and can only be used once.\n\n` +
        `If you did not request a password reset, ignore this email.`,
      html: renderPasswordResetEmail({
        appName: env.APP_NAME,
        resetCode: input.token,
        expiresInMinutes: 60,
        recipientEmail: input.to,
      }),
    });
  },
};
