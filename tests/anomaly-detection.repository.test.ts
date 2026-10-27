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

  it('limits automated detection to direct Wazuh API events', async () => {
    await anomalyDetectionRepository.findPendingEvents('model-1', null, 100, 'WAZUH_REALTIME');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ingestion_batch_id: null,
          event_sources: { source_type: 'WAZUH', ingestion_method: 'API' },
          anomaly_detections: { none: { model_version_id: 'model-1' } },
        },
        take: 100,
      }),
    );
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ingestion_batch_id: null,
          event_sources: { source_type: 'WAZUH', ingestion_method: 'API' },
        },
      }),
    );
  });

  it('keeps file imports eligible for manual detection', async () => {
    await anomalyDetectionRepository.findPendingEvents('model-1', null, 100, 'ALL');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { anomaly_detections: { none: { model_version_id: 'model-1' } } },
        take: 100,
      }),
    );
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});
