import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { renderNotificationEmail } from './notification-email.template.js';
import { notificationImagesSchema, type NotificationImage } from './notification-images.js';

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

  async send(
    destination: string,
    subject: string,
    message: string,
    images?: NotificationImage[],
  ): Promise<string | null> {
    const attachments = (notificationImagesSchema.parse(images) ?? []).map((image, index) => ({
      filename: image.name,
      content: Buffer.from(image.dataUrl.slice('data:image/png;base64,'.length), 'base64'),
      contentType: 'image/png',
      cid: `securaai-image-${index}@notification`,
      contentDisposition: 'inline' as const,
    }));
    const result = await getTransporter().sendMail({
      from: env.SMTP_USER,
      to: destination,
      subject,
      text: message,
      html: renderNotificationEmail({
        appName: env.APP_NAME,
        subject,
        message,
        ...(attachments.length
          ? { inlineImages: attachments.map((image) => ({ name: image.filename, cid: image.cid })) }
          : {}),
      }),
      ...(attachments.length ? { attachments } : {}),
    });
    return typeof result.messageId === 'string' && result.messageId ? result.messageId : null;
  },
};
