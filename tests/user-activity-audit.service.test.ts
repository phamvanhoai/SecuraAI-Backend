import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ findActor: vi.fn(), list: vi.fn() }));
vi.mock('../src/modules/audit-security-reporting/user-activity-audit.repository.js', () => ({
  userActivityAuditRepository: repository,
}));
import { userActivityAuditService } from '../src/modules/audit-security-reporting/user-activity-audit.service.js';

const actorId = '00000000-0000-4000-8000-000000000001';
const query = { page: 1, limit: 20 };

describe('user activity audit service', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns a bounded safe audit view for an active Admin', async () => {
    repository.findActor.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' });
    repository.list.mockResolvedValue({
      total: 1,
      items: [
        {
          id: actorId,
          action: 'USER_UPDATED',
          resource_type: 'USER',
          resource_id: actorId,
          occurred_at: new Date('2026-10-08T08:00:00.000Z'),
          outcome: 'SUCCESS',
          source: 'API',
          source_ip: '192.0.2.1',
          error_code: null,
          users: { id: actorId, full_name: 'Admin User', email: 'admin@example.test' },
        },
      ],
    });
    await expect(userActivityAuditService.list(actorId, query)).resolves.toEqual({
      items: [
        {
          id: actorId,
          actor: { id: actorId, name: 'Admin User', email: 'admin@example.test' },
          action: 'USER_UPDATED',
          resource: { type: 'USER', id: actorId },
          occurredAt: '2026-10-08T08:00:00.000Z',
          outcome: 'SUCCESS',
          source: 'API',
          sourceIp: '192.0.2.1',
          errorCode: null,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, pageCount: 1 },
    });
  });

  it('rejects a non-Admin account', async () => {
    repository.findActor.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    await expect(userActivityAuditService.list(actorId, query)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(repository.list).not.toHaveBeenCalled();
  });
});
