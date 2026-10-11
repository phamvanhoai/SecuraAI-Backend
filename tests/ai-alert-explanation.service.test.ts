import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { findExplanation: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ollama.client.js', () => ({
  ollamaClient: { generateAlertExplanation: vi.fn() },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';
import { ollamaClient } from '../src/modules/ai-anomaly-detection-alerts/ollama.client.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const alertId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const detectionId = '4ea005c1-15b0-49fa-af3a-079fb47a88cc';

describe('AI alert explanation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
    vi.mocked(ollamaClient.generateAlertExplanation).mockResolvedValue(null);
  });

  it('uses a validated Ollama explanation when generation succeeds', async () => {
    vi.mocked(aiAlertsRepository.findExplanation).mockResolvedValue({
      id: alertId,
      severity: 'HIGH',
      created_at: new Date('2026-09-26T00:00:00Z'),
      anomaly_detections: {
        id: detectionId,
        anomaly_score: new Prisma.Decimal('0.825'),
        threshold: new Prisma.Decimal('0.7'),
        detected_at: new Date('2026-09-26T00:00:00Z'),
        anomaly_feature_contributions: [],
      },
    });
    vi.mocked(ollamaClient.generateAlertExplanation).mockResolvedValue({
      summary: 'The behavior differs from the recorded baseline.',
      observations: ['The anomaly score is above its threshold.'],
      recommendedActions: ['Review related authentication events.'],
    });

    const result = await aiAlertsService.getExplanation(userId, alertId);

    expect(result.explanationText).toContain('The behavior differs from the recorded baseline.');
    expect(result.explanationText).toContain('Review related authentication events.');
  });

  it('uses the deterministic explanation when Ollama fails', async () => {
    vi.mocked(aiAlertsRepository.findExplanation).mockResolvedValue({
      id: alertId,
      severity: 'HIGH',
      created_at: new Date('2026-09-26T00:00:00Z'),
      anomaly_detections: {
        id: detectionId,
        anomaly_score: new Prisma.Decimal('0.825'),
        threshold: new Prisma.Decimal('0.7'),
        detected_at: new Date('2026-09-26T00:00:00Z'),
        anomaly_feature_contributions: [],
      },
    });
    vi.mocked(ollamaClient.generateAlertExplanation).mockRejectedValue(new Error('offline'));

    const result = await aiAlertsService.getExplanation(userId, alertId);

    expect(result.explanationText).toContain('exceeded the model threshold');
  });

  it('maps the risk level, threshold and ranked feature contributions', async () => {
    vi.mocked(aiAlertsRepository.findExplanation).mockResolvedValue({
      id: alertId,
      severity: 'HIGH',
      created_at: new Date('2026-09-26T00:00:00Z'),
      anomaly_detections: {
        id: detectionId,
        anomaly_score: new Prisma.Decimal('0.825'),
        threshold: new Prisma.Decimal('0.7'),
        detected_at: new Date('2026-09-26T00:00:00Z'),
        anomaly_feature_contributions: [
          {
            feature_name: 'offHours',
            feature_value: 'true',
            contribution_score: new Prisma.Decimal('0.4'),
            rank: 1,
          },
        ],
      },
    });
    const result = await aiAlertsService.getExplanation(userId, alertId);
    expect(result).toMatchObject({
      id: detectionId,
      alertId,
      baselineData: { anomalyScore: 0.825, threshold: 0.7, suggestedRiskLevel: 'high' },
      featureContributions: [{ featureName: 'offHours', contributionScore: 0.4, rank: 1 }],
    });
    expect(result.explanationText).toContain('suggested risk level is high');
  });

  it('rejects a missing alert', async () => {
    vi.mocked(aiAlertsRepository.findExplanation).mockResolvedValue(null);
    await expect(aiAlertsService.getExplanation(userId, alertId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
