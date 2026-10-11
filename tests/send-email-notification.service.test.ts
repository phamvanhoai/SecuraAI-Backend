import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    findActor: vi.fn(),
    findEmailRecipients: vi.fn(),
    prepareEmail: vi.fn(),
    markEmailSent: vi.fn(),
    markEmailFailed: vi.fn(),
  },
  email: { ensureConfigured: vi.fn(), send: vi.fn() },
}));
vi.mock('../src/modules/notification-system-logs/notifications.repository.js', () => ({
  notificationsRepository: mocks.repository,
}));
vi.mock('../src/modules/notification-system-logs/notification-email.service.js', () => ({
  notificationEmailService: mocks.email,
}));
import { notificationsService } from '../src/modules/notification-system-logs/notifications.service.js';

const actorId = '00000000-0000-4000-8000-000000000001';
const firstUserId = '11111111-1111-4111-8111-111111111111';
const secondUserId = '22222222-2222-4222-8222-222222222222';
const input = {
  subject: 'Review required',
  message: 'Review the latest finding.',
  userIds: [firstUserId, secondUserId],
};

describe('send email notification service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.repository.findActor.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' });
    mocks.repository.findEmailRecipients.mockResolvedValue([
      { id: firstUserId, email: 'first@example.test' },
      { id: secondUserId, email: 'second@example.test' },
    ]);
    mocks.repository.prepareEmail.mockResolvedValue({
      kind: 'prepared',
      notification: { id: firstUserId, created_at: new Date('2026-10-08T06:00:00.000Z') },
      deliveries: [
        { id: firstUserId, destination: 'first@example.test' },
        { id: secondUserId, destination: 'second@example.test' },
      ],
    });
    mocks.email.send.mockResolvedValue('<provider-id>');
  });

  it('records a successful SMTP result for each recipient', async () => {
    await expect(notificationsService.sendEmail(actorId, input)).resolves.toEqual({
      id: firstUserId,
      recipientCount: 2,
      sentCount: 2,
      failedCount: 0,
      queuedAt: '2026-10-08T06:00:00.000Z',
    });
    expect(mocks.email.send).toHaveBeenCalledTimes(2);
    expect(mocks.repository.markEmailSent).toHaveBeenCalledTimes(2);
    expect(mocks.repository.markEmailFailed).not.toHaveBeenCalled();
  });

  it('records a sanitized failure and continues remaining recipients', async () => {
    mocks.email.send.mockRejectedValueOnce(new Error('SMTP secret response'));
    await expect(notificationsService.sendEmail(actorId, input)).resolves.toMatchObject({
      sentCount: 1,
      failedCount: 1,
    });
    expect(mocks.repository.markEmailFailed).toHaveBeenCalledWith(
      firstUserId,
      'SMTP_DELIVERY_FAILED',
      'The email provider did not accept this message.',
    );
    expect(mocks.email.send).toHaveBeenCalledTimes(2);
  });

  it('retries one transient SMTP failure', async () => {
    mocks.email.send
      .mockRejectedValueOnce(Object.assign(new Error('socket details'), { code: 'ETIMEDOUT' }))
      .mockResolvedValue('<provider-id>');

    await expect(notificationsService.sendEmail(actorId, input)).resolves.toMatchObject({
      sentCount: 2,
      failedCount: 0,
    });
    expect(mocks.email.send).toHaveBeenCalledTimes(3);
    expect(mocks.repository.markEmailFailed).not.toHaveBeenCalled();
  });

  it('records a rejected recipient without retrying', async () => {
    mocks.email.send.mockRejectedValueOnce(
      Object.assign(new Error('provider response'), { code: 'EENVELOPE', responseCode: 550 }),
    );

    await expect(notificationsService.sendEmail(actorId, input)).resolves.toMatchObject({
      sentCount: 1,
      failedCount: 1,
    });
    expect(mocks.repository.markEmailFailed).toHaveBeenCalledWith(
      firstUserId,
      'SMTP_RECIPIENT_REJECTED',
      'The email provider rejected the recipient address.',
    );
    expect(mocks.email.send).toHaveBeenCalledTimes(2);
  });

  it('rejects inactive recipients before creating delivery records', async () => {
    mocks.repository.findEmailRecipients.mockResolvedValue([]);
    await expect(notificationsService.sendEmail(actorId, input)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_EMAIL_RECIPIENTS',
    });
    expect(mocks.repository.prepareEmail).not.toHaveBeenCalled();
  });
});
