import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());
const groupBy = vi.hoisted(() => vi.fn());

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    normalized_events: { findMany, groupBy },
  },
}));

import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

describe('anomaly detection pending-event scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    groupBy.mockResolvedValue([]);
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

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ingestion_batch_id: null,
          event_sources: { source_type: 'WAZUH', ingestion_method: 'API' },
          anomaly_detections: {
            none: { model_version_id: 'model-1', engine_version: 'ml-llm-pipeline-v1' },
          },
        },
        take: 100,
      }),
    );
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('keeps file imports eligible for manual detection', async () => {
    await anomalyDetectionRepository.findPendingEvents('model-1', 100, 'ALL');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          anomaly_detections: {
            none: { model_version_id: 'model-1', engine_version: 'ml-llm-pipeline-v1' },
          },
        },
        take: 100,
      }),
    );
    expect(groupBy).not.toHaveBeenCalled();
  });
});
