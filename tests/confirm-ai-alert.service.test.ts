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

  it('returns the linked finding and changed state', async () => {
    vi.mocked(aiAlertsRepository.confirmAsIncident).mockResolvedValue({
      outcome: 'confirmed',
      alert: {
        id: alertId,
        severity: 'HIGH',
        status: 'IN_TRIAGE',
        assigned_to: userId,
        security_findings: null,
        anomaly_detections: {
          model_version_id: userId,
          detected_at: new Date('2026-09-25T00:00:00Z'),
          normalized_events: { event_type: 'LOGIN_FAILURE' },
        },
      },
      finding: {
        id: userId,
        title: 'Login failure',
        status: 'OPEN',
        identified_at: new Date('2026-09-25T00:05:00Z'),
      },
      changed: true,
    });
    const result = await aiAlertsService.confirmAsIncident(userId, alertId, {
      comment: 'Verified attack',
    });
    expect(result).toMatchObject({ status: 'confirmed', changed: true });
    expect(result.finding).toMatchObject({ title: 'Login failure', created: true });
  });

  it('rejects a missing alert', async () => {
    vi.mocked(aiAlertsRepository.confirmAsIncident).mockResolvedValue({ outcome: 'not_found' });
    await expect(aiAlertsService.confirmAsIncident(userId, alertId, {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('requires analyst triage before confirmation', async () => {
    vi.mocked(aiAlertsRepository.confirmAsIncident).mockResolvedValue({
      outcome: 'invalid_status',
    });
    await expect(aiAlertsService.confirmAsIncident(userId, alertId, {})).rejects.toMatchObject({
      statusCode: 409,
      code: 'AI_ALERT_TRIAGE_REQUIRED',
    });
  });

  it('allows only the assigned analyst to confirm the alert', async () => {
    vi.mocked(aiAlertsRepository.confirmAsIncident).mockResolvedValue({ outcome: 'not_owner' });
    await expect(aiAlertsService.confirmAsIncident(userId, alertId, {})).rejects.toMatchObject({
      statusCode: 409,
      code: 'AI_ALERT_TRIAGE_OWNERSHIP_CONFLICT',
    });
  });
});
