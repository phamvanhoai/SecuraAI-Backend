import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: {
    findForFeedback: vi.fn(),
    createFeedback: vi.fn(),
    listFeedback: vi.fn(),
  },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const alertId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const modelVersionId = '0c168382-c5a6-45cc-b386-f028cd700c81';

describe('AI alert feedback service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
    vi.mocked(aiAlertsRepository.findForFeedback).mockResolvedValue({
      id: alertId,
      anomaly_detections: { model_version_id: modelVersionId },
    });
  });

  it('persists feedback against the alert model version', async () => {
    vi.mocked(aiAlertsRepository.createFeedback).mockResolvedValue({
      id: 'c4a44eb3-133e-45b8-a6c7-922ca1fa44f5',
      alert_id: alertId,
      analyst_user_id: userId,
      decision: 'FALSE_POSITIVE',
      reason: 'Scheduled maintenance',
      created_at: new Date('2026-09-25T00:00:00Z'),
    });
    const result = await aiAlertsService.createFeedback(userId, alertId, {
      feedbackLabel: 'false_positive',
      comment: 'Scheduled maintenance',
    });
    expect(aiAlertsRepository.createFeedback).toHaveBeenCalledWith({
      alertId,
      analystUserId: userId,
      decision: 'FALSE_POSITIVE',
      reason: 'Scheduled maintenance',
      modelVersionId,
    });
    expect(result.feedbackLabel).toBe('false_positive');
  });

  it('rejects non-security-officer actors', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'EMPLOYEE',
    });
    await expect(
      aiAlertsService.createFeedback(userId, alertId, { feedbackLabel: 'needs_review' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns not found without writing feedback', async () => {
    vi.mocked(aiAlertsRepository.findForFeedback).mockResolvedValue(null);
    await expect(
      aiAlertsService.createFeedback(userId, alertId, { feedbackLabel: 'needs_review' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(aiAlertsRepository.createFeedback).not.toHaveBeenCalled();
  });
});
