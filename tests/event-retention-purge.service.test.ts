import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTx = {} as Prisma.TransactionClient;

vi.mock('../src/modules/event-ingestion/event-governance.repository.js', () => ({
  eventGovernanceRepository: {
    findActorUser: vi.fn(),
  },
}));

vi.mock('../src/modules/event-ingestion/event-retention-purge.repository.js', () => ({
  eventRetentionPurgeRepository: {
    withPurgeLock: vi.fn(),
    findActiveGovernancePolicies: vi.fn(),
    countEligibleNormalizedEvents: vi.fn(),
    countProtectedNormalizedEvents: vi.fn(),
    countEligibleInvalidEvents: vi.fn(),
    purgeNormalizedEventsBatch: vi.fn(),
    purgeInvalidEventsBatch: vi.fn(),
    findRecentPurgeAuditLogs: vi.fn(),
  },
}));

vi.mock('../src/modules/audit-security-reporting/audit-writer.js', () => ({
  auditWriter: {
    record: vi.fn(),
  },
}));

import { auditWriter } from '../src/modules/audit-security-reporting/audit-writer.js';
import { eventGovernanceRepository } from '../src/modules/event-ingestion/event-governance.repository.js';
import { eventRetentionPurgeRepository } from '../src/modules/event-ingestion/event-retention-purge.repository.js';
import {
  eventRetentionPurgeService,
  resolveEffectiveRetentionPolicies,
} from '../src/modules/event-ingestion/event-retention-purge.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const officerId = '11111111-1111-4111-8111-111111111111';

describe('resolveEffectiveRetentionPolicies', () => {
  const now = new Date('2026-11-26T00:00:00.000Z');

  it('marks families as NO_ACTIVE_POLICY when no active policies match', () => {
    const result = resolveEffectiveRetentionPolicies([], now);
    expect(result).toHaveLength(3);
    expect(result.every((item) => !item.eligible && item.reason === 'NO_ACTIVE_POLICY')).toBe(true);
  });

  it('lets family-specific policies override global policies and picks longest retention', () => {
    const result = resolveEffectiveRetentionPolicies(
      [
        {
          id: 'p-global',
          name: 'Global 30d',
          event_family: null,
          retention_days: 30,
          archive_after_days: null,
          deletion_enabled: true,
          status: 'ACTIVE',
        },
        {
          id: 'p-auth-1',
          name: 'Auth 90d',
          event_family: 'AUTHENTICATION',
          retention_days: 90,
          archive_after_days: 30,
          deletion_enabled: true,
          status: 'ACTIVE',
        },
        {
          id: 'p-auth-2',
          name: 'Auth 180d',
          event_family: 'AUTHENTICATION',
          retention_days: 180,
          archive_after_days: null,
          deletion_enabled: true,
          status: 'ACTIVE',
        },
        {
          id: 'p-vpn-disabled',
          name: 'VPN Hold',
          event_family: 'VPN_SSO',
          retention_days: 60,
          archive_after_days: null,
          deletion_enabled: false,
          status: 'ACTIVE',
        },
      ],
      now,
    );

    const auth = result.find((item) => item.eventFamily === 'AUTHENTICATION');
    const vpn = result.find((item) => item.eventFamily === 'VPN_SSO');
    const app = result.find((item) => item.eventFamily === 'APPLICATION_ACCESS');

    expect(auth).toMatchObject({
      eligible: true,
      reason: 'ACTIVE_POLICY',
      retentionDays: 180,
      policyIds: ['p-auth-1', 'p-auth-2'],
    });
    expect(vpn).toMatchObject({
      eligible: false,
      reason: 'DELETION_DISABLED',
      retentionDays: 60,
      policyIds: ['p-vpn-disabled'],
    });
    expect(app).toMatchObject({
      eligible: true,
      reason: 'ACTIVE_POLICY',
      retentionDays: 30,
      policyIds: ['p-global'],
    });
  });
});

describe('eventRetentionPurgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventRetentionPurgeService.resetRuntimeStateForTests();
    vi.mocked(eventGovernanceRepository.findActorUser).mockResolvedValue({
      id: adminId,
      full_name: 'System Admin',
      email: 'admin@securaai.internal',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(eventRetentionPurgeRepository.withPurgeLock).mockImplementation(async (work) => {
      const value = await work(mockTx);
      return { acquired: true, value };
    });
    vi.mocked(eventRetentionPurgeRepository.findActiveGovernancePolicies).mockResolvedValue([
      {
        id: 'pol-auth',
        name: 'Auth 90d',
        event_family: 'AUTHENTICATION',
        retention_days: 90,
        archive_after_days: 30,
        deletion_enabled: true,
        status: 'ACTIVE',
      },
    ]);
    vi.mocked(eventRetentionPurgeRepository.countEligibleNormalizedEvents).mockResolvedValue(0);
    vi.mocked(eventRetentionPurgeRepository.countProtectedNormalizedEvents).mockResolvedValue(0);
    vi.mocked(eventRetentionPurgeRepository.countEligibleInvalidEvents).mockResolvedValue(0);
    vi.mocked(eventRetentionPurgeRepository.purgeNormalizedEventsBatch).mockResolvedValue({
      deletedEvents: 0,
      deletedDetections: 0,
      deletedFeatureContributions: 0,
      deletedMappings: 0,
      deletedDetectionJobs: 0,
    });
    vi.mocked(eventRetentionPurgeRepository.purgeInvalidEventsBatch).mockResolvedValue(0);
    vi.mocked(eventRetentionPurgeRepository.findRecentPurgeAuditLogs).mockResolvedValue([]);
  });

  describe('RBAC enforcement', () => {
    it('rejects inactive or unknown actors with 401', async () => {
      vi.mocked(eventGovernanceRepository.findActorUser).mockResolvedValue(null);

      await expect(eventRetentionPurgeService.getStatus(adminId, false)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('rejects non-ADMIN roles with 403', async () => {
      vi.mocked(eventGovernanceRepository.findActorUser).mockResolvedValue({
        id: officerId,
        full_name: 'Officer',
        email: 'officer@securaai.internal',
        role: 'SECURITY_OFFICER',
        status: 'ACTIVE',
      });

      await expect(
        eventRetentionPurgeService.runManual(officerId, { dryRun: true }),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('getStatus', () => {
    it('returns effective policies, worker configuration, and recent audit logs', async () => {
      vi.mocked(eventRetentionPurgeRepository.findRecentPurgeAuditLogs).mockResolvedValue([
        {
          id: 'audit-1',
          occurred_at: new Date('2026-11-25T10:00:00.000Z'),
          actor_type: 'SYSTEM',
          actor_user_id: null,
          source: 'WORKER',
          outcome: 'SUCCESS',
          after_data: { totalDeletedNormalizedEvents: 15 },
        },
      ]);

      const status = await eventRetentionPurgeService.getStatus(adminId, true);

      expect(status.workerActive).toBe(true);
      expect(status.running).toBe(false);
      expect(status.effectivePolicies).toHaveLength(3);
      expect(status.recentRuns).toHaveLength(1);
      expect(status.recentRuns[0]?.summary).toEqual({ totalDeletedNormalizedEvents: 15 });
    });
  });

  describe('runManual', () => {
    it('supports dryRun without deleting records or creating audit logs', async () => {
      vi.mocked(eventRetentionPurgeRepository.countEligibleNormalizedEvents).mockResolvedValue(42);
      vi.mocked(eventRetentionPurgeRepository.countProtectedNormalizedEvents).mockResolvedValue(5);
      vi.mocked(eventRetentionPurgeRepository.countEligibleInvalidEvents).mockResolvedValue(8);

      const result = await eventRetentionPurgeService.runManual(adminId, {
        dryRun: true,
        eventFamily: 'AUTHENTICATION',
      });

      expect(result.status).toBe('DRY_RUN');
      expect(result.dryRun).toBe(true);
      expect(result.totalDeletedNormalizedEvents).toBe(42);
      expect(result.totalDeletedInvalidEvents).toBe(8);
      expect(result.totalProtectedEvents).toBe(5);
      expect(eventRetentionPurgeRepository.purgeNormalizedEventsBatch).not.toHaveBeenCalled();
      expect(eventRetentionPurgeRepository.purgeInvalidEventsBatch).not.toHaveBeenCalled();
      expect(auditWriter.record).not.toHaveBeenCalled();
      expect(eventRetentionPurgeRepository.withPurgeLock).toHaveBeenCalledTimes(1);
    });

    it('drains batches up to maxBatches, sets hasMore when capped, and records audit log', async () => {
      vi.mocked(eventRetentionPurgeRepository.purgeNormalizedEventsBatch)
        .mockResolvedValueOnce({
          deletedEvents: 10,
          deletedDetections: 2,
          deletedFeatureContributions: 6,
          deletedMappings: 5,
          deletedDetectionJobs: 1,
        })
        .mockResolvedValueOnce({
          deletedEvents: 10,
          deletedDetections: 1,
          deletedFeatureContributions: 3,
          deletedMappings: 4,
          deletedDetectionJobs: 1,
        });
      vi.mocked(eventRetentionPurgeRepository.purgeInvalidEventsBatch).mockResolvedValueOnce(4);
      vi.mocked(eventRetentionPurgeRepository.countProtectedNormalizedEvents).mockResolvedValue(3);

      const result = await eventRetentionPurgeService.runManual(adminId, {
        dryRun: false,
        eventFamily: 'AUTHENTICATION',
        batchSize: 10,
        maxBatches: 2,
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.totalDeletedNormalizedEvents).toBe(20);
      expect(result.totalDeletedInvalidEvents).toBe(4);
      expect(result.totalProtectedEvents).toBe(3);
      expect(result.families[0]).toMatchObject({
        eventFamily: 'AUTHENTICATION',
        batchesExecuted: 3,
        deletedNormalizedEvents: 20,
        deletedDetections: 3,
        deletedFeatureContributions: 9,
        deletedMappings: 9,
        deletedDetectionJobs: 2,
        deletedInvalidEvents: 4,
        protectedByAlertOrIncident: 3,
        hasMore: true,
      });
      expect(auditWriter.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: 'USER',
          actorUserId: adminId,
          action: 'EVENT_RETENTION_PURGE_EXECUTED',
          resourceType: 'EVENT_DATA_GOVERNANCE_POLICY',
          source: 'API',
        }),
      );
      expect(eventRetentionPurgeRepository.withPurgeLock).toHaveBeenCalledTimes(1);
    });

    it('throws 409 PURGE_ALREADY_RUNNING when advisory lock cannot be acquired', async () => {
      vi.mocked(eventRetentionPurgeRepository.withPurgeLock).mockResolvedValue({ acquired: false });

      await expect(
        eventRetentionPurgeService.runManual(adminId, { dryRun: false }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'PURGE_ALREADY_RUNNING',
      });
    });

    it('resets running state when a batch fails mid-run', async () => {
      vi.mocked(eventRetentionPurgeRepository.purgeNormalizedEventsBatch).mockRejectedValue(
        new Error('DB transient error'),
      );

      await expect(
        eventRetentionPurgeService.runManual(adminId, {
          dryRun: false,
          eventFamily: 'AUTHENTICATION',
        }),
      ).rejects.toThrow('DB transient error');
      expect(auditWriter.record).not.toHaveBeenCalled();
      expect(eventRetentionPurgeService.isRunning()).toBe(false);
    });
  });

  describe('runAutomated', () => {
    it('returns SKIPPED_LOCKED when another worker holds the advisory lock', async () => {
      vi.mocked(eventRetentionPurgeRepository.withPurgeLock).mockResolvedValue({ acquired: false });

      const result = await eventRetentionPurgeService.runAutomated();
      expect(result.status).toBe('SKIPPED_LOCKED');
      expect(auditWriter.record).not.toHaveBeenCalled();
    });

    it('skips audit log when no expired records were purged on a scheduled run', async () => {
      const result = await eventRetentionPurgeService.runAutomated();
      expect(result.status).toBe('COMPLETED');
      expect(result.totalDeletedNormalizedEvents).toBe(0);
      expect(result.totalDeletedInvalidEvents).toBe(0);
      expect(auditWriter.record).not.toHaveBeenCalled();
    });

    it('writes a SYSTEM WORKER audit log when scheduled run deletes records', async () => {
      vi.mocked(eventRetentionPurgeRepository.purgeNormalizedEventsBatch).mockResolvedValueOnce({
        deletedEvents: 7,
        deletedDetections: 0,
        deletedFeatureContributions: 0,
        deletedMappings: 2,
        deletedDetectionJobs: 0,
      });

      const result = await eventRetentionPurgeService.runAutomated();
      expect(result.totalDeletedNormalizedEvents).toBe(7);
      expect(auditWriter.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: 'SYSTEM',
          actorUserId: null,
          action: 'EVENT_RETENTION_PURGE_EXECUTED',
          source: 'WORKER',
        }),
      );
    });
  });
});
