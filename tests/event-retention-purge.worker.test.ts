import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  RETENTION_PURGE_ENABLED: true,
  RETENTION_PURGE_INTERVAL_MS: 60_000,
  RETENTION_PURGE_BATCH_SIZE: 200,
  RETENTION_PURGE_MAX_BATCHES_PER_RUN: 50,
  RETENTION_PURGE_RUN_ON_STARTUP: false,
}));

vi.mock('../src/config/env.js', () => ({
  env: mockEnv,
}));

vi.mock('../src/modules/event-ingestion/event-retention-purge.service.js', () => ({
  eventRetentionPurgeService: {
    runAutomated: vi.fn(),
  },
}));

import { eventRetentionPurgeService } from '../src/modules/event-ingestion/event-retention-purge.service.js';
import {
  isAutomatedRetentionPurgeWorkerActive,
  runRetentionPurgeCycle,
  startAutomatedRetentionPurgeWorker,
  stopAutomatedRetentionPurgeWorker,
} from '../src/modules/event-ingestion/event-retention-purge.worker.js';

describe('automated retention purge worker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockEnv.RETENTION_PURGE_ENABLED = true;
    mockEnv.RETENTION_PURGE_INTERVAL_MS = 60_000;
    mockEnv.RETENTION_PURGE_RUN_ON_STARTUP = false;
    stopAutomatedRetentionPurgeWorker();
  });

  afterEach(() => {
    stopAutomatedRetentionPurgeWorker();
    vi.useRealTimers();
  });

  it('does not start when RETENTION_PURGE_ENABLED is false', () => {
    mockEnv.RETENTION_PURGE_ENABLED = false;

    startAutomatedRetentionPurgeWorker();

    expect(isAutomatedRetentionPurgeWorkerActive()).toBe(false);
    expect(eventRetentionPurgeService.runAutomated).not.toHaveBeenCalled();
  });

  it('triggers scheduled cycles on interval and stops cleanly', async () => {
    vi.mocked(eventRetentionPurgeService.runAutomated).mockResolvedValue({
      status: 'COMPLETED',
      trigger: 'SCHEDULED',
      dryRun: false,
      startedAt: '2026-11-26T00:00:00.000Z',
      completedAt: '2026-11-26T00:00:00.100Z',
      durationMs: 100,
      totalDeletedNormalizedEvents: 0,
      totalDeletedInvalidEvents: 0,
      totalProtectedEvents: 0,
      families: [],
    });

    startAutomatedRetentionPurgeWorker();
    expect(isAutomatedRetentionPurgeWorkerActive()).toBe(true);
    expect(eventRetentionPurgeService.runAutomated).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(eventRetentionPurgeService.runAutomated).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(eventRetentionPurgeService.runAutomated).toHaveBeenCalledTimes(2);

    stopAutomatedRetentionPurgeWorker();
    expect(isAutomatedRetentionPurgeWorkerActive()).toBe(false);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(eventRetentionPurgeService.runAutomated).toHaveBeenCalledTimes(2);
  });

  it('triggers an immediate cycle when RETENTION_PURGE_RUN_ON_STARTUP is true', async () => {
    mockEnv.RETENTION_PURGE_RUN_ON_STARTUP = true;
    vi.mocked(eventRetentionPurgeService.runAutomated).mockResolvedValue({
      status: 'COMPLETED',
      trigger: 'SCHEDULED',
      dryRun: false,
      startedAt: '2026-11-26T00:00:00.000Z',
      completedAt: '2026-11-26T00:00:00.050Z',
      durationMs: 50,
      totalDeletedNormalizedEvents: 0,
      totalDeletedInvalidEvents: 0,
      totalProtectedEvents: 0,
      families: [],
    });

    startAutomatedRetentionPurgeWorker();
    await Promise.resolve();

    expect(eventRetentionPurgeService.runAutomated).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping runs and continues running after transient errors', async () => {
    let resolvePending: (() => void) | undefined;
    vi.mocked(eventRetentionPurgeService.runAutomated).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePending = () =>
            resolve({
              status: 'COMPLETED',
              trigger: 'SCHEDULED',
              dryRun: false,
              startedAt: '2026-11-26T00:00:00.000Z',
              completedAt: '2026-11-26T00:00:01.000Z',
              durationMs: 1000,
              totalDeletedNormalizedEvents: 0,
              totalDeletedInvalidEvents: 0,
              totalProtectedEvents: 0,
              families: [],
            });
        }),
    );

    const first = runRetentionPurgeCycle();
    const overlapping = runRetentionPurgeCycle();
    expect(eventRetentionPurgeService.runAutomated).toHaveBeenCalledTimes(1);

    resolvePending?.();
    await Promise.all([first, overlapping]);

    vi.mocked(eventRetentionPurgeService.runAutomated).mockRejectedValueOnce(new Error('DB down'));
    await runRetentionPurgeCycle();
    expect(eventRetentionPurgeService.runAutomated).toHaveBeenCalledTimes(2);

    vi.mocked(eventRetentionPurgeService.runAutomated).mockResolvedValueOnce({
      status: 'COMPLETED',
      trigger: 'SCHEDULED',
      dryRun: false,
      startedAt: '2026-11-26T00:02:00.000Z',
      completedAt: '2026-11-26T00:02:00.100Z',
      durationMs: 100,
      totalDeletedNormalizedEvents: 1,
      totalDeletedInvalidEvents: 0,
      totalProtectedEvents: 0,
      families: [],
    });
    await runRetentionPurgeCycle();
    expect(eventRetentionPurgeService.runAutomated).toHaveBeenCalledTimes(3);
  });
});
