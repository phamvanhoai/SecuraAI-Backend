import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { markFalsePositive: vi.fn() },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const alertId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const reviewedAt = new Date('2026-09-26T00:00:00Z');

describe('mark AI alert false positive service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
  });

  it('returns the dismissed alert state', async () => {
    vi.mocked(aiAlertsRepository.markFalsePositive).mockResolvedValue({
      outcome: 'changed',
      alert: {
        id: alertId,
        status: 'NEW',
        security_findings: null,
        anomaly_detections: { model_version_id: userId },
        alert_triage_records: [],
      },
      triage: { analyst_user_id: userId, completed_at: reviewedAt, created_at: reviewedAt },
    });
    await expect(
      aiAlertsService.markFalsePositive(userId, alertId, { comment: 'Expected scanner' }),
    ).resolves.toMatchObject({ status: 'false_positive', changed: true });
  });

  it('rejects an alert already confirmed as an incident', async () => {
    vi.mocked(aiAlertsRepository.markFalsePositive).mockResolvedValue({ outcome: 'confirmed' });
    await expect(aiAlertsService.markFalsePositive(userId, alertId, {})).rejects.toMatchObject({
      statusCode: 409,
      code: 'AI_ALERT_ALREADY_CONFIRMED',
    });
  });
});
