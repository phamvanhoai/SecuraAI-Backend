import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { listModelVersions: vi.fn() },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';

describe('model version service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
  });

  it('maps the latest evaluation metrics', async () => {
    vi.mocked(aiAlertsRepository.listModelVersions).mockResolvedValue([
      1,
      [
        {
          id: 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8',
          model_name: 'Detector',
          model_type: 'isolation_forest',
          version: '2.0',
          status: 'DEPLOYED',
          feature_definition: null,
          parameters: null,
          deployed_at: new Date('2026-09-25T00:00:00Z'),
          retired_at: null,
          created_at: new Date('2026-09-24T00:00:00Z'),
          ai_datasets: {
            id: '4ea005c1-15b0-49fa-af3a-079fb47a88cc',
            name: 'Events',
            version: '1.0',
          },
          ai_model_evaluations: [
            {
              id: '34106f1c-55c6-4d7d-a8b5-e113d87585f7',
              precision: new Prisma.Decimal('0.91'),
              recall: new Prisma.Decimal('0.87'),
              f1_score: new Prisma.Decimal('0.89'),
              pr_auc: new Prisma.Decimal('0.93'),
              false_positive_rate: new Prisma.Decimal('0.04'),
              alerts_per_day: new Prisma.Decimal('12.50'),
              detection_latency_ms: new Prisma.Decimal('35.20'),
              evaluation_notes: 'Validated',
              evaluated_at: new Date('2026-09-25T01:00:00Z'),
            },
          ],
        },
      ],
    ]);
    const result = await aiAlertsService.listModelVersions(userId, { page: 1, limit: 20 });
    expect(result.items[0]).toMatchObject({
      modelName: 'Detector',
      status: 'deployed',
      latestEvaluation: { precision: 0.91, f1Score: 0.89, falsePositiveRate: 0.04 },
    });
  });

  it('rejects non-security-officer accounts', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'EXECUTIVE',
    });
    await expect(
      aiAlertsService.listModelVersions(userId, { page: 1, limit: 20 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
