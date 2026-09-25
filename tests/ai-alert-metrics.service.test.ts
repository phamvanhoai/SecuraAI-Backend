import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { metrics: vi.fn() },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';

describe('AI alert metrics service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId, status: 'ACTIVE', role: 'SECURITY_OFFICER',
    });
  });

  it('aggregates all dashboard counters from grouped statuses', async () => {
    vi.mocked(aiAlertsRepository.metrics).mockResolvedValue([
      { status: 'NEW', _count: { _all: 3 } },
      { status: 'IN_TRIAGE', _count: { _all: 2 } },
      { status: 'NEED_INVESTIGATION', _count: { _all: 1 } },
      { status: 'CONFIRMED', _count: { _all: 4 } },
      { status: 'DISMISSED', _count: { _all: 5 } },
    ]);
    await expect(aiAlertsService.metrics(userId)).resolves.toEqual({
      total: 15, newAlerts: 3, reviewing: 3, confirmed: 4,
    });
  });
});
