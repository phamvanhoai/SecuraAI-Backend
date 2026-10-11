import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { startTriage: vi.fn() },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const otherUserId = '64f059e7-f976-4d9c-8d1d-357e463784bf';
const alertId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const startedAt = new Date('2026-10-01T00:00:00Z');

describe('start AI alert triage service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
  });

  it('assigns a new alert to the authenticated analyst', async () => {
    vi.mocked(aiAlertsRepository.startTriage).mockResolvedValue({
      outcome: 'started',
      alert: {
        id: alertId,
        status: 'IN_TRIAGE',
        assigned_to: userId,
        updated_at: startedAt,
        anomaly_detections: { model_version_id: alertId },
      },
      startedAt,
    });

    await expect(aiAlertsService.startTriage(userId, alertId)).resolves.toEqual({
      id: alertId,
      alertCode: 'ALT-C82662FF',
      status: 'reviewing',
      assignedToUserId: userId,
      triageStartedAt: startedAt,
      changed: true,
    });
  });

  it('rejects a competing analyst claim', async () => {
    vi.mocked(aiAlertsRepository.startTriage).mockResolvedValue({
      outcome: 'conflict',
      alert: {
        id: alertId,
        status: 'IN_TRIAGE',
        assigned_to: otherUserId,
        updated_at: startedAt,
        anomaly_detections: { model_version_id: alertId },
      },
    });

    await expect(aiAlertsService.startTriage(userId, alertId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'AI_ALERT_TRIAGE_CONFLICT',
    });
  });
});
