import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/audit-security-reporting/audit-logs.service.js', () => ({
  auditLogsService: {
    listAuditLogs: vi.fn(),
    getAuditLogDetail: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';
import { auditLogsService } from '../src/modules/audit-security-reporting/audit-logs.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const sampleLogId = '550e8400-e29b-41d4-a716-446655440000';
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

  describe('GET /api/v1/audit-logs/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).get(`/api/v1/audit-logs/${sampleLogId}`);
      expect(res.status).toBe(401);
    });

    it('returns audit log detail for valid request', async () => {
      vi.mocked(auditLogsService.getAuditLogDetail).mockResolvedValue({
        id: sampleLogId,
        actorType: 'USER',
        actorUserId: userId,
        actorApiKeyId: null,
        actor: {
          id: userId,
          type: 'USER',
          name: 'Admin User',
          email: 'admin@securaai.internal',
          role: 'ADMIN',
          keyPrefix: null,
        },
        action: 'UPDATE_USER_ROLE',
        resourceType: 'users',
        resourceId: '550e8400-e29b-41d4-a716-446655440002',
        occurredAt: '2026-10-08T12:00:00.000Z',
        beforeData: { role: 'EMPLOYEE' },
        afterData: { role: 'SECURITY_OFFICER' },
        correlationId: 'corr-123',
        source: 'web-ui',
        sourceIp: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        previousHash: 'prev-hash-1',
        recordHash: 'rec-hash-2',
        createdAt: '2026-10-08T12:00:00.000Z',
      });

      const res = await request(app)
        .get(`/api/v1/audit-logs/${sampleLogId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sampleLogId);
      expect(res.body.data.action).toBe('UPDATE_USER_ROLE');
    });

    it('returns 404 when audit log not found', async () => {
      vi.mocked(auditLogsService.getAuditLogDetail).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Audit log record not found'),
      );

      const res = await request(app)
        .get(`/api/v1/audit-logs/${sampleLogId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('rejects invalid uuid id with 422', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs/invalid-not-a-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
    });
  });
});
