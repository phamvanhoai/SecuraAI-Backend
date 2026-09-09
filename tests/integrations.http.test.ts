import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import { signAccessToken } from '@/common/utils/tokens.js';
import { integrationsRepository } from '@/modules/integrations/integrations.repository.js';
import * as ssrfValidator from '@/common/utils/ssrf-validator.js';

describe('Integrations HTTP API (UC 13.1 - Connect SIEM/Firewall)', () => {
  const app = createApp();

  const mockIntegrationId = randomUUID();
  const mockUserId = randomUUID();

  const validToken = signAccessToken({
    userId: mockUserId,
    roles: ['ADMIN'],
    permissions: ['integrations.create', 'integrations.read', 'integrations.update', 'integrations.connect'],
  });

  const unauthorizedToken = signAccessToken({
    userId: randomUUID(),
    roles: ['EMPLOYEE'],
    permissions: ['some.other.permission'],
  });

  const mockIntegration = {
    integration_id: mockIntegrationId,
    name: 'Wazuh SIEM',
    integration_type: 'siem',
    base_url: 'https://siem.test.com',
    configuration: null,
    status: 'inactive',
    last_connected_at: null,
    created_by_user_id: mockUserId,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/integrations', () => {
    it('returns 401 when no token provided', async () => {
      const res = await request(app).post('/api/v1/integrations').send({
        name: 'Test',
        integrationType: 'siem',
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 when lacking integrations.create permission', async () => {
      const res = await request(app)
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({
          name: 'Test',
          integrationType: 'siem',
        });
      expect(res.status).toBe(403);
    });

    it('returns 201 when authorized with valid payload', async () => {
      vi.spyOn(ssrfValidator, 'validateExternalUrl').mockResolvedValue(new URL('https://siem.test.com'));
      vi.spyOn(integrationsRepository, 'create').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: 'log-1',
        integration_id: mockIntegration.integration_id,
        level: 'info',
        message: 'created',
        created_at: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'Wazuh SIEM',
          integrationType: 'siem',
          baseUrl: 'https://siem.test.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mockIntegration.integration_id);
      expect(res.body.data.name).toBe('Wazuh SIEM');
    });

    it('returns 422 when payload is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: '',
          integrationType: 'invalid_type',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/integrations', () => {
    it('returns 200 with list and pagination metadata', async () => {
      vi.spyOn(integrationsRepository, 'findMany').mockResolvedValue([mockIntegration]);
      vi.spyOn(integrationsRepository, 'count').mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/integrations?page=1&limit=10')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination.total).toBe(1);
    });
  });

  describe('GET /api/v1/integrations/:id', () => {
    it('returns 404 when not found', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/integrations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INTEGRATION_NOT_FOUND');
    });

    it('returns 200 when found', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegration.integration_id}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mockIntegration.integration_id);
    });
  });

  describe('PATCH /api/v1/integrations/:id', () => {
    it('returns 422 when attempting to update status to error', async () => {
      const res = await request(app)
        .patch(`/api/v1/integrations/${mockIntegration.integration_id}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'error' });

      expect(res.status).toBe(422);
    });

    it('returns 200 on valid update', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'update').mockResolvedValue({
        ...mockIntegration,
        name: 'Renamed SIEM',
        status: 'active',
      });
      vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: 'log-upd',
        integration_id: mockIntegration.integration_id,
        level: 'info',
        message: 'updated',
        created_at: new Date(),
      });

      const res = await request(app)
        .patch(`/api/v1/integrations/${mockIntegration.integration_id}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ name: 'Renamed SIEM', status: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Renamed SIEM');
      expect(res.body.data.status).toBe('active');
    });
  });

  describe('POST /api/v1/integrations/:id/test-connection', () => {
    it('returns 200 with test connection result', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(ssrfValidator, 'executeSafeHttpRequest').mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        latencyMs: 88,
        ok: true,
        body: null,
      });
      vi.spyOn(integrationsRepository, 'update').mockResolvedValue({
        ...mockIntegration,
        status: 'active',
        last_connected_at: new Date(),
      });
      vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: 'log-conn',
        integration_id: mockIntegration.integration_id,
        level: 'info',
        message: 'connected',
        created_at: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegration.integration_id}/test-connection`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ timeoutMs: 5000 });

      expect(res.status).toBe(200);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.statusCode).toBe(200);
      expect(res.body.data.latencyMs).toBe(88);
    });
  });
});
