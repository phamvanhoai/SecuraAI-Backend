import { describe, it, expect, vi, beforeEach } from 'vitest';
import { integrationsService } from '@/modules/integrations/integrations.service.js';
import { integrationsRepository } from '@/modules/integrations/integrations.repository.js';
import * as ssrfValidator from '@/common/utils/ssrf-validator.js';
import { AppError } from '@/common/errors/app-error.js';

vi.mock('@/modules/integrations/integrations.repository.js', () => ({
  integrationsRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    createLog: vi.fn(),
    createSyncSchedule: vi.fn(),
    findSyncScheduleById: vi.fn(),
    findSyncSchedulesByIntegrationId: vi.fn(),
    updateSyncSchedule: vi.fn(),
    deleteSyncSchedule: vi.fn(),
    findDueSyncSchedules: vi.fn(),
    createRunningSyncJobWithConcurrencyGuard: vi.fn(),
    findSyncJobById: vi.fn(),
    findSyncJobs: vi.fn(),
    countSyncJobs: vi.fn(),
    updateSyncJob: vi.fn(),
    findLatestActiveApiKey: vi.fn(),
    findIntegrationLogs: vi.fn(),
    countIntegrationLogs: vi.fn(),
  },
}));

vi.mock('@/common/utils/ssrf-validator.js', () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(true),
  executeSafeHttpRequest: vi.fn(),
}));

describe('Integrations Service - Sync Schedules & Execution', () => {
  const mockIntegrationId = '11111111-1111-1111-1111-111111111111';
  const mockScheduleId = '22222222-2222-2222-2222-222222222222';
  const mockJobId = '33333333-3333-3333-3333-333333333333';

  const sampleIntegration = {
    integration_id: mockIntegrationId,
    name: 'Splunk SIEM',
    integration_type: 'siem',
    base_url: 'https://siem.enterprise.local/api/logs',
    configuration: { authType: 'bearer' },
    status: 'active',
    last_connected_at: new Date('2026-09-09T10:00:00Z'),
    created_by_user_id: null,
    created_at: new Date('2026-09-09T09:00:00Z'),
    updated_at: new Date('2026-09-09T09:00:00Z'),
  };

  const sampleSchedule = {
    sync_schedule_id: mockScheduleId,
    integration_id: mockIntegrationId,
    schedule_expression: '*/15 * * * *',
    is_active: true,
    last_run_at: new Date('2026-09-09T10:00:00Z'),
    next_run_at: new Date('2026-09-09T10:15:00Z'),
    created_at: new Date('2026-09-09T09:00:00Z'),
    updated_at: new Date('2026-09-09T09:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSyncSchedule', () => {
    it('creates a sync schedule and calculates next_run_at in UTC', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(sampleIntegration);
      vi.mocked(integrationsRepository.createSyncSchedule).mockResolvedValue(sampleSchedule);

      const result = await integrationsService.createSyncSchedule(mockIntegrationId, {
        scheduleExpression: '*/15 * * * *',
        isActive: true,
      });

      expect(integrationsRepository.findById).toHaveBeenCalledWith(mockIntegrationId);
      expect(integrationsRepository.createSyncSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          integration_id: mockIntegrationId,
          schedule_expression: '*/15 * * * *',
          is_active: true,
        }),
      );
      expect(result.id).toBe(mockScheduleId);
      expect(result.scheduleExpression).toBe('*/15 * * * *');
    });

    it('throws 404 if integration does not exist', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(null);

      await expect(
        integrationsService.createSyncSchedule(mockIntegrationId, {
          scheduleExpression: '0 * * * *',
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('updateSyncSchedule', () => {
    it('recalculates next_run_at when schedule expression is updated', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(sampleIntegration);
      vi.mocked(integrationsRepository.findSyncScheduleById).mockResolvedValue(sampleSchedule);
      vi.mocked(integrationsRepository.updateSyncSchedule).mockResolvedValue({
        ...sampleSchedule,
        schedule_expression: '0 * * * *',
      });

      const result = await integrationsService.updateSyncSchedule(
        mockIntegrationId,
        mockScheduleId,
        { scheduleExpression: '0 * * * *' },
      );

      expect(integrationsRepository.updateSyncSchedule).toHaveBeenCalledWith(
        mockIntegrationId,
        mockScheduleId,
        expect.objectContaining({
          schedule_expression: '0 * * * *',
          next_run_at: expect.any(Date),
        }),
      );
      expect(result.scheduleExpression).toBe('0 * * * *');
    });
  });

  describe('deleteSyncSchedule', () => {
    it('deletes schedule with child resource scoping', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(sampleIntegration);
      vi.mocked(integrationsRepository.deleteSyncSchedule).mockResolvedValue(true);

      await integrationsService.deleteSyncSchedule(mockIntegrationId, mockScheduleId);

      expect(integrationsRepository.deleteSyncSchedule).toHaveBeenCalledWith(
        mockIntegrationId,
        mockScheduleId,
      );
    });

    it('throws 404 if schedule not found on the integration', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(sampleIntegration);
      vi.mocked(integrationsRepository.deleteSyncSchedule).mockResolvedValue(false);

      await expect(
        integrationsService.deleteSyncSchedule(mockIntegrationId, mockScheduleId),
      ).rejects.toThrow(AppError);
    });
  });

  describe('triggerSyncJob (Manual vs Scheduled)', () => {
    it('executes manual sync successfully without changing schedule cadence', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(sampleIntegration);
      vi.mocked(integrationsRepository.createRunningSyncJobWithConcurrencyGuard).mockResolvedValue({
        sync_job_id: mockJobId,
        integration_id: mockIntegrationId,
        sync_schedule_id: mockScheduleId,
        status: 'running',
        records_processed: 0,
        records_failed: 0,
        started_at: new Date(),
        completed_at: null,
        error_message: null,
        created_at: new Date(),
      });

      vi.mocked(ssrfValidator.executeSafeHttpRequest).mockResolvedValue({
        ok: true,
        statusCode: 200,
        statusText: 'OK',
        latencyMs: 120,
        body: null,
      });

      vi.mocked(integrationsRepository.updateSyncJob).mockResolvedValue({
        sync_job_id: mockJobId,
        integration_id: mockIntegrationId,
        sync_schedule_id: mockScheduleId,
        status: 'completed',
        records_processed: 1,
        records_failed: 0,
        started_at: new Date(),
        completed_at: new Date(),
        error_message: null,
        created_at: new Date(),
      });

      const result = await integrationsService.triggerSyncJob(mockIntegrationId, {
        syncScheduleId: mockScheduleId,
        isScheduledTrigger: false, // Manual sync
      });

      expect(result.status).toBe('completed');
      expect(result.recordsProcessed).toBe(1);
      // Assert: manual sync does NOT update sync_schedule timestamps
      expect(integrationsRepository.updateSyncSchedule).not.toHaveBeenCalled();
    });

    it('handles scheduled trigger by updating schedule last_run_at and next_run_at', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(sampleIntegration);
      vi.mocked(integrationsRepository.findSyncScheduleById).mockResolvedValue(sampleSchedule);
      vi.mocked(integrationsRepository.createRunningSyncJobWithConcurrencyGuard).mockResolvedValue({
        sync_job_id: mockJobId,
        integration_id: mockIntegrationId,
        sync_schedule_id: mockScheduleId,
        status: 'running',
        records_processed: 0,
        records_failed: 0,
        started_at: new Date(),
        completed_at: null,
        error_message: null,
        created_at: new Date(),
      });

      vi.mocked(ssrfValidator.executeSafeHttpRequest).mockResolvedValue({
        ok: true,
        statusCode: 200,
        statusText: 'OK',
        latencyMs: 100,
        body: null,
      });

      vi.mocked(integrationsRepository.updateSyncJob).mockResolvedValue({
        sync_job_id: mockJobId,
        integration_id: mockIntegrationId,
        sync_schedule_id: mockScheduleId,
        status: 'completed',
        records_processed: 1,
        records_failed: 0,
        started_at: new Date(),
        completed_at: new Date(),
        error_message: null,
        created_at: new Date(),
      });

      await integrationsService.triggerSyncJob(mockIntegrationId, {
        syncScheduleId: mockScheduleId,
        isScheduledTrigger: true, // Scheduled trigger
      });

      expect(integrationsRepository.updateSyncSchedule).toHaveBeenCalledWith(
        mockIntegrationId,
        mockScheduleId,
        expect.objectContaining({
          last_run_at: expect.any(Date),
          next_run_at: expect.any(Date),
        }),
      );
    });

    it('records failed sync job when external SIEM returns 500', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(sampleIntegration);
      vi.mocked(integrationsRepository.createRunningSyncJobWithConcurrencyGuard).mockResolvedValue({
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

      vi.mocked(ssrfValidator.executeSafeHttpRequest).mockResolvedValue({
        ok: false,
        statusCode: 500,
        statusText: 'Internal Server Error',
        latencyMs: 50,
        body: null,
      });

      vi.mocked(integrationsRepository.updateSyncJob).mockResolvedValue({
        sync_job_id: mockJobId,
        integration_id: mockIntegrationId,
        sync_schedule_id: null,
        status: 'failed',
        records_processed: 0,
        records_failed: 0,
        started_at: new Date(),
        completed_at: new Date(),
        error_message: 'External SIEM returned HTTP 500: Internal Server Error',
        created_at: new Date(),
      });

      const result = await integrationsService.triggerSyncJob(mockIntegrationId);

      expect(result.status).toBe('failed');
      expect(integrationsRepository.update).toHaveBeenCalledWith(mockIntegrationId, {
        status: 'error',
      });
    });
  });

  describe('processDueSyncSchedules (Scheduler Runner & 409 Handling)', () => {
    it('advances next_run_at and keeps last_run_at unchanged when encountering 409 Conflict', async () => {
      vi.mocked(integrationsRepository.findDueSyncSchedules).mockResolvedValue([sampleSchedule]);
      vi.mocked(integrationsRepository.findById).mockResolvedValue(sampleIntegration);

      // Simulate Concurrency Guard throwing 409 Conflict
      vi.mocked(integrationsRepository.createRunningSyncJobWithConcurrencyGuard).mockRejectedValue(
        new AppError(409, 'ANOTHER_SYNC_IN_PROGRESS', 'A synchronization job is already running'),
      );

      await integrationsService.processDueSyncSchedules();

      // Assert rule: next_run_at must advance, last_run_at must NOT be updated
      expect(integrationsRepository.updateSyncSchedule).toHaveBeenCalledWith(
        mockIntegrationId,
        mockScheduleId,
        expect.objectContaining({
          next_run_at: expect.any(Date),
        }),
      );
      expect(integrationsRepository.updateSyncSchedule).not.toHaveBeenCalledWith(
        mockIntegrationId,
        mockScheduleId,
        expect.objectContaining({
          last_run_at: expect.anything(),
        }),
      );
    });
  });
});
