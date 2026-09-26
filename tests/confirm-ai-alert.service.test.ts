import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { confirmAsIncident: vi.fn() },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const alertId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';

describe('confirm AI alert service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
  });

  it('returns the linked incident and changed state', async () => {
    vi.mocked(aiAlertsRepository.confirmAsIncident).mockResolvedValue({
      alert: {
        id: alertId,
        severity: 'HIGH',
        status: 'NEW',
        security_findings: null,
        anomaly_detections: {
          model_version_id: userId,
          detected_at: new Date('2026-09-25T00:00:00Z'),
          normalized_events: { event_type: 'LOGIN_FAILURE' },
        },
      },
      incident: {
        id: userId,
        incident_code: 'INC-C82662FF8CB74E97',
        status: 'OPEN',
        confirmed_at: new Date('2026-09-25T00:05:00Z'),
      },
      changed: true,
    });
    const result = await aiAlertsService.confirmAsIncident(userId, alertId, {
      comment: 'Verified attack',
    });
    expect(result).toMatchObject({ status: 'confirmed', changed: true });
    expect(result.incident).toMatchObject({ code: 'INC-C82662FF8CB74E97', created: true });
  });

  it('rejects a missing alert', async () => {
    vi.mocked(aiAlertsRepository.confirmAsIncident).mockResolvedValue(null);
    await expect(aiAlertsService.confirmAsIncident(userId, alertId, {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
