import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: {
    findExplanationForRegeneration: vi.fn(),
    replaceExplanation: vi.fn(),
  },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/alert-explanation.generator.js', () => ({
  generateStoredAlertExplanation: vi.fn(),
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';
import { generateStoredAlertExplanation } from '../src/modules/ai-anomaly-detection-alerts/alert-explanation.generator.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const alertId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';

describe('regenerate AI alert explanation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
  });

  it('replaces the explanation and records the prior value through the repository', async () => {
    const previousGeneratedAt = new Date('2026-10-27T10:00:00Z');
    vi.mocked(aiAlertsRepository.findExplanationForRegeneration).mockResolvedValue({
      id: alertId,
      severity: 'HIGH',
      explanation_text: 'Previous explanation.',
      explanation_generated_at: previousGeneratedAt,
      anomaly_detections: {
        id: '4ea005c1-15b0-49fa-af3a-079fb47a88cc',
        anomaly_score: new Prisma.Decimal('0.82'),
        threshold: new Prisma.Decimal('0.7'),
        detected_at: new Date('2026-10-27T09:00:00Z'),
        model_version_id: '0d9be14d-4fcb-411c-a377-a9122ab6b3b0',
        normalized_events: { id: '54ae7543-c754-4879-ad7d-c5ea95ca42e1' },
        anomaly_feature_contributions: [],
      },
    });
    vi.mocked(generateStoredAlertExplanation).mockResolvedValue('Updated explanation.');
    vi.mocked(aiAlertsRepository.replaceExplanation).mockResolvedValue(true);

    const result = await aiAlertsService.regenerateExplanation(
      userId,
      alertId,
      { reason: 'Review explanation accuracy' },
      { sourceIp: '127.0.0.1' },
    );

    expect(result.explanationText).toBe('Updated explanation.');
    expect(aiAlertsRepository.replaceExplanation).toHaveBeenCalledWith(
      expect.objectContaining({
        alertId,
        actorUserId: userId,
        reason: 'Review explanation accuracy',
        previousText: 'Previous explanation.',
        previousGeneratedAt,
        explanationText: 'Updated explanation.',
      }),
    );
  });

  it('rejects a stale concurrent replacement', async () => {
    vi.mocked(aiAlertsRepository.findExplanationForRegeneration).mockResolvedValue({
      id: alertId,
      severity: 'HIGH',
      explanation_text: 'Previous explanation.',
      explanation_generated_at: new Date('2026-10-27T10:00:00Z'),
      anomaly_detections: {
        id: '4ea005c1-15b0-49fa-af3a-079fb47a88cc',
        anomaly_score: new Prisma.Decimal('0.82'),
        threshold: new Prisma.Decimal('0.7'),
        detected_at: new Date('2026-10-27T09:00:00Z'),
        model_version_id: '0d9be14d-4fcb-411c-a377-a9122ab6b3b0',
        normalized_events: { id: '54ae7543-c754-4879-ad7d-c5ea95ca42e1' },
        anomaly_feature_contributions: [],
      },
    });
    vi.mocked(generateStoredAlertExplanation).mockResolvedValue('Updated explanation.');
    vi.mocked(aiAlertsRepository.replaceExplanation).mockResolvedValue(false);

    await expect(
      aiAlertsService.regenerateExplanation(userId, alertId, {
        reason: 'Review explanation accuracy',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'EXPLANATION_CHANGED' });
  });
});
