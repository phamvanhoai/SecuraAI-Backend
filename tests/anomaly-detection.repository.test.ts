import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());
const discover = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    normalized_events: { findMany },
  },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/detection-jobs.repository.js', () => ({
  pipelineEngine: 'ml-llm-pipeline-v1',
  detectionJobsRepository: { discover, claim },
}));

import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

describe('anomaly detection pending-event scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    discover.mockResolvedValue(undefined);
    claim.mockResolvedValue({ token: 'lease-token', jobs: [] });
  });
  it('builds ML temporal history across the same account or source IP', async () => {
    const occurredAt = new Date('2026-01-01T12:00:00Z');
    await anomalyDetectionRepository.findMlTemporalContext({
      id: 'current',
      event_source_id: 'source',
      event_family: 'AUTHENTICATION',
      event_type: 'LOGIN_FAILURE',
      occurred_at: occurredAt,
      account_identifier: 'alice',
      source_ip: '192.0.2.1',
      device_identifier: null,
      normalized_payload: {},
      severity: null,
      event_entity_mappings: [],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          event_source_id: 'source',
          event_family: 'AUTHENTICATION',
          OR: [{ account_identifier: 'alice' }, { source_ip: '192.0.2.1' }],
          occurred_at: { gte: new Date('2026-01-01T11:00:00Z'), lte: occurredAt },
        }),
        orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
        take: 5001,
      }),
    );
  });

  it('limits automated detection to direct Wazuh API events', async () => {
    await anomalyDetectionRepository.findPendingEvents('model-1', 100, 'WAZUH_REALTIME');

    expect(discover).toHaveBeenCalledWith('model-1', 'WAZUH_REALTIME');
    expect(claim).toHaveBeenCalledWith('model-1', 100, 'DETECTION', 'WAZUH_REALTIME');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [] } },
      }),
    );
  });

  it('keeps file imports eligible for manual detection', async () => {
    await anomalyDetectionRepository.findPendingEvents('model-1', 100, 'ALL');

    expect(discover).toHaveBeenCalledWith('model-1', 'ALL');
    expect(claim).toHaveBeenCalledWith('model-1', 100, 'DETECTION', 'ALL');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [] } },
      }),
    );
  });
});
