import { PNG } from 'pngjs';
import { expect, it, vi } from 'vitest';
const sendMail = vi.hoisted(() => vi.fn(async () => ({ messageId: 'mock-message-id' })));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));
vi.mock('../src/config/env.js', () => ({
  env: {
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'sender@example.test',
    SMTP_PASS: 'test-fixture',
    APP_NAME: 'SecuraAI',
  },
}));
import { notificationEmailService } from '../src/modules/notification-system-logs/notification-email.service.js';
it('sends validated binary PNG attachments linked to inline CID images', async () => {
  const png = new PNG({ width: 1, height: 1 });
  const dataUrl = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
  await notificationEmailService.send('recipient@example.test', 'Review', 'See image', [
    { name: 'test.png', dataUrl },
  ]);
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'recipient@example.test',
      text: 'See image',
      html: expect.stringContaining('src="cid:securaai-image-0@notification"'),
      attachments: [
        expect.objectContaining({
          filename: 'test.png',
          content: expect.any(Buffer),
          cid: 'securaai-image-0@notification',
          contentType: 'image/png',
          contentDisposition: 'inline',
        }),
      ],
    }),
  );
});
