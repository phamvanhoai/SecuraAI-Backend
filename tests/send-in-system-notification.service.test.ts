import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findActor: vi.fn(),
  findRecipients: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../src/modules/notification-system-logs/notifications.repository.js', () => ({
  notificationsRepository: mocks,
}));
import { notificationsService } from '../src/modules/notification-system-logs/notifications.service.js';

const actorId = '00000000-0000-4000-8000-000000000001';
const recipientId = '11111111-1111-4111-8111-111111111111';
const input = {
  title: 'Review required',
  message: 'Review the latest finding.',
  priority: 'IMPORTANT' as const,
  audience: { type: 'users' as const, userIds: [recipientId] },
};

describe('send in-system notification service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findActor.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' });
    mocks.findRecipients.mockResolvedValue([{ id: recipientId }]);
    mocks.create.mockResolvedValue({
      kind: 'created',
      notification: { id: recipientId, created_at: new Date('2026-10-08T06:00:00.000Z') },
      recipientCount: 1,
    });
  });

  it('sends to the resolved active recipient snapshot', async () => {
    await expect(notificationsService.send(actorId, input)).resolves.toEqual({
      id: recipientId,
      recipientCount: 1,
      sentAt: '2026-10-08T06:00:00.000Z',
    });
    expect(mocks.create).toHaveBeenCalledWith(actorId, input, [recipientId]);
  });

  it.each([
    [{ role: 'EMPLOYEE', status: 'ACTIVE' }, 403],
    [{ role: 'ADMIN', status: 'INACTIVE' }, 401],
    [null, 401],
  ])('rejects an unauthorized actor', async (actor, statusCode) => {
    mocks.findActor.mockResolvedValue(actor);
    await expect(notificationsService.send(actorId, input)).rejects.toMatchObject({ statusCode });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects explicit recipients that are missing or inactive', async () => {
    mocks.findRecipients.mockResolvedValue([]);
    await expect(notificationsService.send(actorId, input)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_NOTIFICATION_RECIPIENTS',
    });
  });

  it('rejects a role group with no active users', async () => {
    mocks.findRecipients.mockResolvedValue([]);
    await expect(
      notificationsService.send(actorId, {
        ...input,
        audience: { type: 'roles', roles: ['EXECUTIVE'] },
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'NO_NOTIFICATION_RECIPIENTS' });
  });
});
