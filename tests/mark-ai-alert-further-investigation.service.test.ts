import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { markFurtherInvestigation: vi.fn() },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const alertId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const reviewedAt = new Date('2026-10-01T00:00:00Z');

describe('mark AI alert further investigation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
  });

  it('returns the further-investigation state', async () => {
    vi.mocked(aiAlertsRepository.markFurtherInvestigation).mockResolvedValue({
      outcome: 'changed',
      alert: {
        id: alertId,
        status: 'IN_TRIAGE',
        assigned_to: userId,
        anomaly_detections: { model_version_id: userId },
        alert_triage_records: [],
      },
      triage: { analyst_user_id: userId, completed_at: reviewedAt, created_at: reviewedAt },
    });
    await expect(
      aiAlertsService.markFurtherInvestigation(userId, alertId, {
        reason: 'Correlate with endpoint telemetry',
      }),
    ).resolves.toMatchObject({ status: 'needs_investigation', changed: true });
  });

  it.each([
    ['invalid_status', 'AI_ALERT_TRIAGE_REQUIRED'],
    ['not_owner', 'AI_ALERT_TRIAGE_OWNERSHIP_CONFLICT'],
    ['conflict', 'AI_ALERT_STATUS_CONFLICT'],
  ] as const)('maps %s to %s', async (outcome, code) => {
    vi.mocked(aiAlertsRepository.markFurtherInvestigation).mockResolvedValue({ outcome });
    await expect(
      aiAlertsService.markFurtherInvestigation(userId, alertId, {
        reason: 'Correlate with endpoint telemetry',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code });
  });
});
