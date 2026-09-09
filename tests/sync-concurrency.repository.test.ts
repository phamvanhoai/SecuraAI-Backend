import { describe, it, expect, vi, beforeEach } from 'vitest';
import { integrationsRepository } from '../src/modules/integrations/integrations.repository.js';
import { prisma } from '../src/database/prisma.js';
import { AppError } from '../src/common/errors/app-error.js';

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    sync_schedules: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sync_jobs: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    integration_logs: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    integration_api_keys: {
      findFirst: vi.fn(),
    },
  },
}));

describe('Integrations Repository - Concurrency Guard & Child Scoping', () => {
  const mockIntegrationId = '11111111-1111-1111-1111-111111111111';
  const mockJobId = '22222222-2222-2222-2222-222222222222';
  const mockScheduleId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRunningSyncJobWithConcurrencyGuard', () => {
    it('creates running job when advisory lock is acquired and no active jobs exist', async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
        sync_jobs: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({
            sync_job_id: mockJobId,
            integration_id: mockIntegrationId,
            status: 'running',
            records_processed: 0,
            records_failed: 0,
            started_at: new Date(),
          }),
        },
        integration_logs: {
          create: vi.fn(),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await integrationsRepository.createRunningSyncJobWithConcurrencyGuard({
        integrationId: mockIntegrationId,
      });

      expect(result.status).toBe('running');
      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.sync_jobs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            integration_id: mockIntegrationId,
            status: 'running',
          }),
        }),
      );
    });

    it('throws 409 Conflict if advisory lock cannot be acquired', async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ locked: false }]),
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await expect(
        integrationsRepository.createRunningSyncJobWithConcurrencyGuard({
          integrationId: mockIntegrationId,
        }),
      ).rejects.toThrow(AppError);
    });

    it('recovers stale running job (>30 mins) and creates a new running job', async () => {
      const staleStartedAt = new Date(Date.now() - 40 * 60 * 1000); // 40 mins ago
      const staleJobId = 'stale-job-id';

      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
        sync_jobs: {
          findMany: vi.fn().mockResolvedValue([
            { sync_job_id: staleJobId, started_at: staleStartedAt },
          ]),
          update: vi.fn().mockResolvedValue({ sync_job_id: staleJobId, status: 'failed' }),
          create: vi.fn().mockResolvedValue({
            sync_job_id: mockJobId,
            integration_id: mockIntegrationId,
            status: 'running',
          }),
        },
        integration_logs: {
          create: vi.fn(),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await integrationsRepository.createRunningSyncJobWithConcurrencyGuard({
        integrationId: mockIntegrationId,
      });

      // Assert: stale job was updated to failed
      expect(mockTx.sync_jobs.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sync_job_id: staleJobId },
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
      // Assert: warning log recorded
      expect(mockTx.integration_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ level: 'warn' }),
        }),
      );
      // Assert: new job created
      expect(result.status).toBe('running');
    });

    it('throws 409 Conflict if an active running job (<30 mins) already exists', async () => {
      const activeStartedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
      const activeJobId = 'active-job-id';

      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
        sync_jobs: {
          findMany: vi.fn().mockResolvedValue([
            { sync_job_id: activeJobId, started_at: activeStartedAt },
          ]),
        },
        integration_logs: {
          create: vi.fn(),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await expect(
        integrationsRepository.createRunningSyncJobWithConcurrencyGuard({
          integrationId: mockIntegrationId,
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('Child-Resource Scoping', () => {
    it('enforces integrationId scope on findSyncScheduleById', async () => {
      vi.mocked(prisma.sync_schedules.findFirst).mockResolvedValue(null);

      await integrationsRepository.findSyncScheduleById(mockIntegrationId, mockScheduleId);

      expect(prisma.sync_schedules.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sync_schedule_id: mockScheduleId,
            integration_id: mockIntegrationId,
          },
        }),
      );
    });

    it('enforces integrationId scope on findSyncJobById', async () => {
      vi.mocked(prisma.sync_jobs.findFirst).mockResolvedValue(null);

      await integrationsRepository.findSyncJobById(mockIntegrationId, mockJobId);

      expect(prisma.sync_jobs.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sync_job_id: mockJobId,
            integration_id: mockIntegrationId,
          },
        }),
      );
    });
  });

  describe('findLatestActiveApiKey', () => {
    it('queries active and non-expired keys ordered by created_at DESC', async () => {
      vi.mocked(prisma.integration_api_keys.findFirst).mockResolvedValue(null);

      await integrationsRepository.findLatestActiveApiKey(mockIntegrationId);

      expect(prisma.integration_api_keys.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            integration_id: mockIntegrationId,
            is_active: true,
          }),
          orderBy: { created_at: 'desc' },
        }),
      );
    });
  });
});
