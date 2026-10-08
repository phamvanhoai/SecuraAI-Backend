import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: {} }));
vi.mock('../src/modules/access-control/access-control.service.js', () => ({
  accessControlService: { hasPermission: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../src/modules/audit-security-reporting/user-activity-audit.service.js', () => ({
  userActivityAuditService: { list: vi.fn() },
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { userActivityAuditService } from '../src/modules/audit-security-reporting/user-activity-audit.service.js';

const actorId = '00000000-0000-4000-8000-000000000001';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: actorId,
});
const app = createApp();

describe('GET /api/v1/audit/user-activities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/audit/user-activities')).status).toBe(401);
  });

  it('validates filters and returns the service response', async () => {
    vi.mocked(userActivityAuditService.list).mockResolvedValue({
      items: [],
      pagination: { page: 2, limit: 20, total: 0, pageCount: 1 },
    });
    const response = await request(app)
      .get('/api/v1/audit/user-activities?page=2&outcome=SUCCESS')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(userActivityAuditService.list).toHaveBeenCalledWith(actorId, {
      page: 2,
      limit: 20,
      outcome: 'SUCCESS',
    });
  });

  it('rejects invalid pagination before the service', async () => {
    const response = await request(app)
      .get('/api/v1/audit/user-activities?limit=101')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(userActivityAuditService.list).not.toHaveBeenCalled();
  });
});
