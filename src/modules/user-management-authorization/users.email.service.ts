import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { renderAccountCreatedEmail } from './account-created-email.template.js';

let transporter: Transporter | undefined;

function mailTransporter(): Transporter {
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

export const usersEmailService = {
  async sendAccountCreated(input: {
    email: string;
    fullName: string;
    temporaryPassword: string;
  }): Promise<void> {
    const subject = `Your ${env.APP_NAME} account is ready`;
    await mailTransporter().sendMail({
      from: env.SMTP_USER,
      to: input.email,
      subject,
      text:
        `Hello ${input.fullName},\n\n` +
        `Your ${env.APP_NAME} account has been created.\n` +
        `Email: ${input.email}\n` +
        `Temporary password: ${input.temporaryPassword}\n\n` +
        `Sign in and change this password immediately.\n\n` +
        `Do not share this email or your temporary password with anyone.`,
      html: renderAccountCreatedEmail({
        appName: env.APP_NAME,
        fullName: input.fullName,
        email: input.email,
        temporaryPassword: input.temporaryPassword,
      }),
    });
  },
};
