import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/common/utils/tokens.js';
import { integrationsRepository } from '../src/modules/integrations/integrations.repository.js';
import * as ssrfValidator from '../src/common/utils/ssrf-validator.js';

vi.mock('../src/modules/integrations/integrations.repository.js');
vi.mock('../src/common/utils/ssrf-validator.js');

describe('Integrations Monitoring HTTP API (UC 13.3 - Monitor Connection Status)', () => {
  const app = createApp();

  const mockAdminId = randomUUID();
  const mockIntegrationId = randomUUID();

  const adminToken = signAccessToken({
    userId: mockAdminId,
    roles: ['ADMIN'],
    permissions: ['integrations.read', 'integrations.update', 'integrations.create'],
  });

  const readOnlyToken = signAccessToken({
    userId: randomUUID(),
    roles: ['ADMIN'],
    permissions: ['integrations.read'],
  });

  const unauthorizedToken = signAccessToken({
    userId: randomUUID(),
    roles: ['EMPLOYEE'],
    permissions: ['some.unrelated.permission'],
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/integrations/monitoring/connection-status', () => {
    it('returns 401 when no token provided', async () => {
      const res = await request(app).get('/api/v1/integrations/monitoring/connection-status');
      expect(res.status).toBe(401);
    });

    it('returns 403 when user lacks integrations.read permission', async () => {
      const res = await request(app)
        .get('/api/v1/integrations/monitoring/connection-status')
        .set('Authorization', `Bearer ${unauthorizedToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 200 with connection status summary for authorized user', async () => {
      vi.mocked(integrationsRepository.findConnectionMonitoringData).mockResolvedValue([
        [
          {
            integration_id: mockIntegrationId,
            name: 'Wazuh Cluster',
            integration_type: 'siem',
            base_url: 'https://wazuh.local',
            configuration: null,
            status: 'active',
            last_connected_at: new Date('2026-09-15T12:00:00Z'),
            created_by_user_id: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ] as never,
        [
          {
            integration_log_id: randomUUID(),
            integration_id: mockIntegrationId,
            level: 'info',
            message: 'Connection check succeeded with status 200 (35ms)',
            details: {
              action: 'CONNECTION_CHECK',
              latencyMs: 35,
              httpStatus: 200,
              success: true,
              errorCode: null,
            },
            created_at: new Date(),
            integrations: { name: 'Wazuh Cluster' },
          },
        ] as never,
      ]);

      const res = await request(app)
        .get('/api/v1/integrations/monitoring/connection-status?timeWindow=24h')
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalIntegrations).toBe(1);
      expect(res.body.data.activeCount).toBe(1);
      expect(res.body.data.checks24h).toBe(1);
      expect(res.body.data.availability24h).toBe(100.0);
      expect(res.body.data.averageLatency24h).toBe(35);
    });
  });

  describe('POST /api/v1/integrations/monitoring/check-all', () => {
    it('returns 403 when user only has integrations.read without update permission', async () => {
      const res = await request(app)
        .post('/api/v1/integrations/monitoring/check-all')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('returns 200 and performs batch check with valid admin permissions', async () => {
      vi.mocked(integrationsRepository.findConfiguredIntegrationsForProbe).mockResolvedValue([
        {
          integration_id: mockIntegrationId,
          name: 'FortiGate',
          integration_type: 'firewall',
          base_url: 'https://fw.local',
          status: 'active',
          last_connected_at: new Date(),
        },
      ] as never);

      vi.mocked(ssrfValidator.executeSafeHttpRequest).mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        latencyMs: 44,
        ok: true,
        body: { ok: true },
      });

      vi.mocked(integrationsRepository.update).mockResolvedValue({} as never);
      vi.mocked(integrationsRepository.createLog).mockResolvedValue({} as never);

      const res = await request(app)
        .post('/api/v1/integrations/monitoring/check-all')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ timeoutMs: 4000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalTested).toBe(1);
      expect(res.body.data.successful).toBe(1);
      expect(res.body.data.failed).toBe(0);
      expect(res.body.data.results[0]?.connected).toBe(true);
    });
  });

  describe('GET /api/v1/integrations/:id/connection-status', () => {
    it('returns 404 when integration does not exist', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/integrations/${randomUUID()}/connection-status`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTEGRATION_NOT_FOUND');
    });

    it('returns 200 with integration telemetry', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue({
        integration_id: mockIntegrationId,
        name: 'Palo Alto',
        integration_type: 'firewall',
        base_url: 'https://paloalto.local',
        status: 'active',
        last_connected_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      } as never);

      vi.mocked(integrationsRepository.findRecentConnectionLogs).mockResolvedValue([
        {
          integration_log_id: randomUUID(),
          integration_id: mockIntegrationId,
          level: 'info',
          message: 'Connection check succeeded (50ms)',
          details: {
            action: 'CONNECTION_CHECK',
            latencyMs: 50,
            httpStatus: 200,
            success: true,
            errorCode: null,
          },
          created_at: new Date(),
        },
      ] as never);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/connection-status`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Palo Alto');
      expect(res.body.data.checks24h).toBe(1);
      expect(res.body.data.availability24h).toBe(100.0);
    });
  });
});
