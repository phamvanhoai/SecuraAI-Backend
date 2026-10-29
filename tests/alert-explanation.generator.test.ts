import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/ollama.client.js', () => ({
  ollamaClient: { generateAlertExplanation: vi.fn() },
}));
vi.mock('../src/config/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import { logger } from '../src/config/logger.js';
import { generateStoredAlertExplanation } from '../src/modules/ai-anomaly-detection-alerts/alert-explanation.generator.js';
import { ollamaClient } from '../src/modules/ai-anomaly-detection-alerts/ollama.client.js';

const input = {
  anomalyScore: 0.92,
  threshold: 0.8,
  suggestedRiskLevel: 'high',
  detectedAt: new Date('2026-10-21T22:00:00Z'),
  featureContributions: [],
  eventId: 'event-1',
};

describe('stored AI alert explanation generator', () => {
  beforeEach(() => vi.clearAllMocks());
  it('explains a rule match without claiming it exceeded the threshold', async () => {
    vi.mocked(ollamaClient.generateAlertExplanation).mockResolvedValue(null);
    const result = await generateStoredAlertExplanation({
      ...input,
      threshold: 1,
      featureContributions: [
        {
          featureName: 'matched_rules',
          featureValue: '["AUTH_FAILURE_BURST"]',
          contributionScore: 0.9,
          rank: 1,
        },
      ],
    });
    expect(result).toContain('AUTH_FAILURE_BURST');
    expect(result).not.toContain('exceeded');
  });

  it('formats a successful Ollama response for storage', async () => {
    vi.mocked(ollamaClient.generateAlertExplanation).mockResolvedValue({
      summary: 'Unusual privileged activity was detected.',
      observations: ['The anomaly score exceeded the configured threshold.'],
      recommendedActions: ['Review the related security event.'],
    });

    await expect(generateStoredAlertExplanation(input)).resolves.toBe(
      'Unusual privileged activity was detected.\nObservations: The anomaly score exceeded the configured threshold.\nRecommended actions: Review the related security event.',
    );
  });

  it('stores a deterministic fallback when Ollama is unavailable', async () => {
    vi.mocked(ollamaClient.generateAlertExplanation).mockRejectedValue(new Error('offline'));

    await expect(generateStoredAlertExplanation(input)).resolves.toContain(
      'The anomaly score 0.9200 met the model threshold 0.8000.',
    );
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
