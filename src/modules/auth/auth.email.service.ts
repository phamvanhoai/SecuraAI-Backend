import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';

type PasswordResetEmail = {
  to: string;
  token: string;
};

type InitializedAccountEmail = {
  to: string;
  email: string;
  temporaryPassword: string;
};

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new AppError(503, 'EMAIL_SERVICE_UNAVAILABLE', 'SMTP email service is not configured');
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
};

export const authEmailService = {
  async sendInitializedAccountEmail(input: InitializedAccountEmail): Promise<void> {
    await getTransporter().sendMail({
      from: env.SMTP_USER,
      to: input.to,
      subject: `${env.APP_NAME} account created`,
      text: `Your ${env.APP_NAME} account has been created.\n\nEmail: ${input.email}\nTemporary password: ${input.temporaryPassword}\n\nPlease log in and change this temporary password immediately.`,
      html: `<p>Your ${env.APP_NAME} account has been created.</p><p><strong>Email:</strong> ${input.email}<br><strong>Temporary password:</strong> ${input.temporaryPassword}</p><p>Please log in and change this temporary password immediately.</p>`,
    });
  },

  async sendPasswordResetEmail(input: PasswordResetEmail): Promise<void> {
    await getTransporter().sendMail({
      from: env.SMTP_USER,
      to: input.to,
      subject: `Reset your ${env.APP_NAME} password`,
      text: `Your ${env.APP_NAME} password reset code is: ${input.token}\n\nThis code expires in 60 minutes and can only be used once.`,
      html: `<p>Your ${env.APP_NAME} password reset code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${input.token}</p><p>This code expires in 60 minutes and can only be used once.</p>`,
    });
  },
} as const;