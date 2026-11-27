import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTx = {
  $queryRaw: vi.fn(),
  normalized_events: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  anomaly_detections: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  anomaly_feature_contributions: {
    deleteMany: vi.fn(),
  },
  event_entity_mappings: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  detection_jobs: {
    deleteMany: vi.fn(),
  },
  invalid_events: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(
      async (cb: (tx: typeof mockTx) => Promise<unknown>, _options?: unknown) => cb(mockTx),
    ),
    event_data_governance_policies: {
      findMany: vi.fn(),
    },
    normalized_events: {
      count: vi.fn(),
    },
    invalid_events: {
      count: vi.fn(),
    },
    audit_logs: {
      findMany: vi.fn(),
    },
  },
}));

import type { Prisma } from '@prisma/client';
import { prisma } from '../src/database/prisma.js';
import {
  eventRetentionPurgeRepository,
  PURGE_TRANSACTION_MAX_WAIT_MS,
  PURGE_TRANSACTION_TIMEOUT_MS,
} from '../src/modules/event-ingestion/event-retention-purge.repository.js';

describe('event retention purge repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acquires a transaction-scoped advisory lock and runs work inside the same transaction', async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([{ locked: true }]);
    const work = vi.fn(async (tx: Prisma.TransactionClient) => {
      expect(tx).toBe(mockTx);
      return 'done';
    });

    const result = await eventRetentionPurgeRepository.withPurgeLock(work);

    expect(result).toEqual({ acquired: true, value: 'done' });
    expect(work).toHaveBeenCalledTimes(1);
    expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: PURGE_TRANSACTION_MAX_WAIT_MS,
      timeout: PURGE_TRANSACTION_TIMEOUT_MS,
    });
  });

  it('skips work and returns acquired=false when advisory lock is held by another session', async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([{ locked: false }]);
    const work = vi.fn();

    const result = await eventRetentionPurgeRepository.withPurgeLock(work);

    expect(result).toEqual({ acquired: false });
    expect(work).not.toHaveBeenCalled();
  });

  it('short-circuits batch purge when no eligible expired events exist', async () => {
    mockTx.normalized_events.findMany.mockResolvedValue([]);

    const cutoff = new Date('2026-08-01T00:00:00.000Z');
    const result = await eventRetentionPurgeRepository.purgeNormalizedEventsBatch(
      'AUTHENTICATION',
      cutoff,
      100,
    );

    expect(result).toEqual({
      deletedEvents: 0,
      deletedDetections: 0,
      deletedFeatureContributions: 0,
      deletedMappings: 0,
      deletedDetectionJobs: 0,
    });
    expect(mockTx.normalized_events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          event_family: 'AUTHENTICATION',
          occurred_at: { lt: cutoff },
          incident_evidence: { none: {} },
          anomaly_detections: {
            none: {
              anomaly_alerts: { isNot: null },
            },
          },
        },
        take: 100,
      }),
    );
    expect(mockTx.normalized_events.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes dependent records in FK-safe order before deleting normalized_events', async () => {
    const callOrder: string[] = [];
    mockTx.normalized_events.findMany.mockResolvedValue([{ id: 'evt-1' }, { id: 'evt-2' }]);
    mockTx.anomaly_detections.findMany.mockResolvedValue([{ id: 'det-1' }]);
    mockTx.anomaly_feature_contributions.deleteMany.mockImplementation(async () => {
      callOrder.push('features.deleteMany');
      return { count: 4 };
    });
    mockTx.anomaly_detections.deleteMany.mockImplementation(async () => {
      callOrder.push('detections.deleteMany');
      return { count: 1 };
    });
    mockTx.event_entity_mappings.findMany.mockImplementation(async () => {
      callOrder.push('mappings.findMany');
      return [{ id: 'map-1' }, { id: 'map-2' }, { id: 'map-3' }];
    });
    mockTx.event_entity_mappings.updateMany.mockImplementation(async () => {
      callOrder.push('mappings.breakSelfFk');
      return { count: 1 };
    });
    mockTx.event_entity_mappings.deleteMany.mockImplementation(async () => {
      callOrder.push('mappings.deleteMany');
      return { count: 3 };
    });
    mockTx.detection_jobs.deleteMany.mockImplementation(async () => {
      callOrder.push('jobs.deleteMany');
      return { count: 2 };
    });
    mockTx.normalized_events.deleteMany.mockImplementation(async () => {
      callOrder.push('events.deleteMany');
      return { count: 2 };
    });

    const cutoff = new Date('2026-08-01T00:00:00.000Z');
    const result = await eventRetentionPurgeRepository.purgeNormalizedEventsBatch(
      'VPN_SSO',
      cutoff,
      50,
    );

    expect(result).toEqual({
      deletedEvents: 2,
      deletedDetections: 1,
      deletedFeatureContributions: 4,
      deletedMappings: 3,
      deletedDetectionJobs: 2,
    });
    expect(callOrder).toEqual([
      'features.deleteMany',
      'detections.deleteMany',
      'mappings.findMany',
      'mappings.breakSelfFk',
      'mappings.deleteMany',
      'jobs.deleteMany',
      'events.deleteMany',
    ]);
    expect(mockTx.event_entity_mappings.updateMany).toHaveBeenCalledWith({
      where: { supersedes_mapping_id: { in: ['map-1', 'map-2', 'map-3'] } },
      data: { supersedes_mapping_id: null },
    });
    expect(mockTx.event_entity_mappings.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['map-1', 'map-2', 'map-3'] } },
    });
  });

  it('skips mapping update/delete when expired events have no entity mappings', async () => {
    mockTx.normalized_events.findMany.mockResolvedValue([{ id: 'evt-1' }]);
    mockTx.anomaly_detections.findMany.mockResolvedValue([]);
    mockTx.event_entity_mappings.findMany.mockResolvedValue([]);
    mockTx.detection_jobs.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.normalized_events.deleteMany.mockResolvedValue({ count: 1 });

    const cutoff = new Date('2026-08-01T00:00:00.000Z');
    const result = await eventRetentionPurgeRepository.purgeNormalizedEventsBatch(
      'AUTHENTICATION',
      cutoff,
      50,
    );

    expect(result.deletedMappings).toBe(0);
    expect(mockTx.event_entity_mappings.updateMany).not.toHaveBeenCalled();
    expect(mockTx.event_entity_mappings.deleteMany).not.toHaveBeenCalled();
  });

  it('uses an existing transaction client directly when provided to purgeNormalizedEventsBatch', async () => {
    mockTx.normalized_events.findMany.mockResolvedValue([{ id: 'evt-1' }]);
    mockTx.anomaly_detections.findMany.mockResolvedValue([]);
    mockTx.event_entity_mappings.findMany.mockResolvedValue([]);
    mockTx.detection_jobs.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.normalized_events.deleteMany.mockResolvedValue({ count: 1 });

    const cutoff = new Date('2026-08-01T00:00:00.000Z');
    const result = await eventRetentionPurgeRepository.purgeNormalizedEventsBatch(
      'AUTHENTICATION',
      cutoff,
      50,
      mockTx as unknown as Prisma.TransactionClient,
    );

    expect(result.deletedEvents).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('counts events protected by alert or incident evidence linkage', async () => {
    vi.mocked(prisma.normalized_events.count).mockResolvedValue(7);
    const cutoff = new Date('2026-08-01T00:00:00.000Z');

    const count = await eventRetentionPurgeRepository.countProtectedNormalizedEvents(
      'APPLICATION_ACCESS',
      cutoff,
    );

    expect(count).toBe(7);
    expect(prisma.normalized_events.count).toHaveBeenCalledWith({
      where: {
        event_family: 'APPLICATION_ACCESS',
        occurred_at: { lt: cutoff },
        OR: [
          { incident_evidence: { some: {} } },
          {
            anomaly_detections: {
              some: {
                anomaly_alerts: { isNot: null },
              },
            },
          },
        ],
      },
    });
  });

  it('deletes expired invalid_events in bounded batches', async () => {
    mockTx.invalid_events.findMany.mockResolvedValue([{ id: 'inv-1' }, { id: 'inv-2' }]);
    mockTx.invalid_events.deleteMany.mockResolvedValue({ count: 2 });

    const cutoff = new Date('2026-08-01T00:00:00.000Z');
    const deleted = await eventRetentionPurgeRepository.purgeInvalidEventsBatch(
      'AUTHENTICATION',
      cutoff,
      25,
    );

    expect(deleted).toBe(2);
    expect(mockTx.invalid_events.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['inv-1', 'inv-2'] } },
    });
  });
});
