import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/audit-security-reporting/audit-logs.service.js', () => ({
  auditLogsService: {
    listAuditLogs: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { auditLogsService } from '../src/modules/audit-security-reporting/audit-logs.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('Audit Logs HTTP endpoints', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /api/v1/audit-logs', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/audit-logs');
      expect(res.status).toBe(401);
    });

    it('returns paginated audit logs for authenticated request', async () => {
      vi.mocked(auditLogsService.listAuditLogs).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 1 },
      });

      const res = await request(app)
        .get('/api/v1/audit-logs?page=1&limit=20')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 1,
      });
      expect(auditLogsService.listAuditLogs).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          page: 1,
          limit: 20,
        }),
      );
    });

    it('passes search, actor, action, resourceType and date range parameters to service', async () => {
      vi.mocked(auditLogsService.listAuditLogs).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 1 },
      });

      const res = await request(app)
        .get(
          '/api/v1/audit-logs?search=test&actor=admin&actorType=USER&action=LOGIN&resourceType=users&correlationId=c-123&startDate=2026-10-01T00:00:00.000Z&endDate=2026-10-09T00:00:00.000Z',
        )
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(auditLogsService.listAuditLogs).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          search: 'test',
          actor: 'admin',
          actorType: 'USER',
          action: 'LOGIN',
          resourceType: 'users',
          correlationId: 'c-123',
          startDate: '2026-10-01T00:00:00.000Z',
          endDate: '2026-10-09T00:00:00.000Z',
        }),
      );
    });

    it('rejects invalid limit parameter with 422', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs?limit=500')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
      expect(auditLogsService.listAuditLogs).not.toHaveBeenCalled();
    });
  });
});
