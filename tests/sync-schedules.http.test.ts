import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import { signAccessToken } from '@/common/utils/tokens.js';
import { integrationsRepository } from '@/modules/integrations/integrations.repository.js';
import * as ssrfValidator from '@/common/utils/ssrf-validator.js';

describe('Sync Schedules & Execution HTTP API (UC 13.2)', () => {
  const app = createApp();

  const mockIntegrationId = randomUUID();
  const mockScheduleId = randomUUID();
  const mockJobId = randomUUID();
  const mockUserId = randomUUID();

  const validAdminToken = signAccessToken({
    userId: mockUserId,
    roles: ['ADMIN'],
    permissions: [
      'integrations.create',
      'integrations.read',
      'integrations.update',
      'integrations.connect',
    ],
  });

  const readOnlyToken = signAccessToken({
    userId: randomUUID(),
    roles: ['SECURITY_OFFICER'],
    permissions: ['integrations.read'],
  });

  const unauthorizedToken = signAccessToken({
    userId: randomUUID(),
    roles: ['EMPLOYEE'],
    permissions: ['some.unrelated.permission'],
  });

  const mockIntegration = {
    integration_id: mockIntegrationId,
    name: 'Wazuh SIEM',
    integration_type: 'siem',
    base_url: 'https://siem.test.com',
    configuration: null,
    status: 'active',
    last_connected_at: new Date('2026-09-01T00:00:00Z'),
    created_by_user_id: mockUserId,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
  };

  const mockSchedule = {
    sync_schedule_id: mockScheduleId,
    integration_id: mockIntegrationId,
    schedule_expression: '*/15 * * * *',
    is_active: true,
    last_run_at: new Date('2026-09-01T00:00:00Z'),
    next_run_at: new Date('2026-09-01T00:15:00Z'),
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
  };

  const mockSyncJob = {
    sync_job_id: mockJobId,
    integration_id: mockIntegrationId,
    sync_schedule_id: mockScheduleId,
    status: 'completed',
    records_processed: 50,
    records_failed: 0,
    started_at: new Date('2026-09-01T00:00:00Z'),
    completed_at: new Date('2026-09-01T00:00:05Z'),
    error_message: null,
    created_at: new Date('2026-09-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/integrations/:id/schedules', () => {
    it('returns 401 when no token provided', async () => {
      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/schedules`)
        .send({ scheduleExpression: '*/15 * * * *' });
      expect(res.status).toBe(401);
    });

    it('returns 403 when lacking integrations.update permission', async () => {
      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/schedules`)
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ scheduleExpression: '*/15 * * * *' });
      expect(res.status).toBe(403);
    });

    it('returns 422 on invalid cron expression', async () => {
      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/schedules`)
        .set('Authorization', `Bearer ${validAdminToken}`)
        .send({ scheduleExpression: 'invalid-cron' });
      expect(res.status).toBe(422);
    });

    it('returns 201 and creates schedule on valid payload', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'createSyncSchedule').mockResolvedValue(mockSchedule);
      vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: randomUUID(),
        integration_id: mockIntegrationId,
        level: 'info',
        message: 'created',
        created_at: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/schedules`)
        .set('Authorization', `Bearer ${validAdminToken}`)
        .send({ scheduleExpression: '*/15 * * * *', isActive: true });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scheduleExpression).toBe('*/15 * * * *');
    });
  });

  describe('GET /api/v1/integrations/:id/schedules', () => {
    it('returns 200 with list of schedules', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findSyncSchedulesByIntegrationId').mockResolvedValue([
        mockSchedule,
      ]);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/schedules`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/v1/integrations/:id/schedules/:scheduleId', () => {
    it('returns 200 with schedule details', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findSyncScheduleById').mockResolvedValue(mockSchedule);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/schedules/${mockScheduleId}`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mockScheduleId);
    });

    it('returns 404 when schedule not found for the given integration', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findSyncScheduleById').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/schedules/${mockScheduleId}`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/integrations/:id/schedules/:scheduleId', () => {
    it('returns 200 when schedule updated', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findSyncScheduleById').mockResolvedValue(mockSchedule);
      vi.spyOn(integrationsRepository, 'updateSyncSchedule').mockResolvedValue({
        ...mockSchedule,
        schedule_expression: '0 * * * *',
      });
      vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: randomUUID(),
        integration_id: mockIntegrationId,
        level: 'info',
        message: 'updated',
        created_at: new Date(),
      });

      const res = await request(app)
        .patch(`/api/v1/integrations/${mockIntegrationId}/schedules/${mockScheduleId}`)
        .set('Authorization', `Bearer ${validAdminToken}`)
        .send({ scheduleExpression: '0 * * * *' });

      expect(res.status).toBe(200);
      expect(res.body.data.scheduleExpression).toBe('0 * * * *');
    });
  });

  describe('DELETE /api/v1/integrations/:id/schedules/:scheduleId', () => {
    it('returns 204 when schedule deleted', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'deleteSyncSchedule').mockResolvedValue(true);
      vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: randomUUID(),
        integration_id: mockIntegrationId,
        level: 'info',
        message: 'deleted',
        created_at: new Date(),
      });

      const res = await request(app)
        .delete(`/api/v1/integrations/${mockIntegrationId}/schedules/${mockScheduleId}`)
        .set('Authorization', `Bearer ${validAdminToken}`);

      expect(res.status).toBe(204);
    });
  });

  describe('POST /api/v1/integrations/:id/sync (Manual Trigger)', () => {
    it('returns 403 when lacking integrations.connect permission', async () => {
      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/sync`)
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('returns 200 and executes sync job successfully', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(
        integrationsRepository,
        'createRunningSyncJobWithConcurrencyGuard',
      ).mockResolvedValue({
        sync_job_id: mockJobId,
        integration_id: mockIntegrationId,
        sync_schedule_id: null,
        status: 'running',
        records_processed: 0,
        records_failed: 0,
        started_at: new Date(),
        completed_at: null,
        error_message: null,
        created_at: new Date(),
      });
      vi.spyOn(integrationsRepository, 'findLatestActiveApiKey').mockResolvedValue(null);
      vi.spyOn(ssrfValidator, 'executeSafeHttpRequest').mockResolvedValue({
        ok: true,
        statusCode: 200,
        statusText: 'OK',
        latencyMs: 80,
        body: null,
      });
      vi.spyOn(integrationsRepository, 'updateSyncJob').mockResolvedValue(mockSyncJob);
      vi.spyOn(integrationsRepository, 'update').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: randomUUID(),
        integration_id: mockIntegrationId,
        level: 'info',
        message: 'sync completed',
        created_at: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/sync`)
        .set('Authorization', `Bearer ${validAdminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
    });
  });

  describe('GET /api/v1/integrations/:id/sync-jobs', () => {
    it('returns 200 with paginated sync jobs list', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findSyncJobs').mockResolvedValue([mockSyncJob]);
      vi.spyOn(integrationsRepository, 'countSyncJobs').mockResolvedValue(1);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/sync-jobs?page=1&limit=10`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination.total).toBe(1);
    });
  });

  describe('GET /api/v1/integrations/:id/sync-jobs/:jobId', () => {
    it('returns 200 with job details', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findSyncJobById').mockResolvedValue(mockSyncJob);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/sync-jobs/${mockJobId}`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mockJobId);
    });
  });

  describe('GET /api/v1/integrations/:id/logs', () => {
    it('returns 200 with integration log entries', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findIntegrationLogs').mockResolvedValue([
        {
          integration_log_id: randomUUID(),
          integration_id: mockIntegrationId,
          sync_job_id: mockJobId,
          level: 'info',
          message: 'SYNC_COMPLETED',
          details: { durationMs: 120 },
          created_at: new Date(),
        },
      ]);
      vi.spyOn(integrationsRepository, 'countIntegrationLogs').mockResolvedValue(1);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/logs?level=info`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
    });
  });
});
