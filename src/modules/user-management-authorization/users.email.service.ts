import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';

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
    await mailTransporter().sendMail({
      from: env.SMTP_USER,
      to: input.email,
      subject: `${env.APP_NAME} account created`,
      text: `Hello ${input.fullName},\n\nYour ${env.APP_NAME} account has been created.\nEmail: ${input.email}\nTemporary password: ${input.temporaryPassword}\n\nSign in and change this password immediately.`,
    });
  },
};
