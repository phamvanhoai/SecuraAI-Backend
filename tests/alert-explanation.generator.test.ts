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
  it('explains SSO evidence in prose without JSON or irrelevant zero failures', async () => {
    const features = {
      matched_rules: ['VPN_SSO_NEW_CONTEXT_OFF_HOURS'],
      baseline_context: { ready: true, newIp: true, successfulEvents: 20 },
      failure_count_in_window: { count: 0, windowMinutes: 5 },
      working_hours: { offHours: true, localHour: 1, timeZone: 'Asia/Ho_Chi_Minh' },
    };
    const result = await generateStoredAlertExplanation({ ...input, anomalyScore: 0.67, threshold: 0.7, suggestedRiskLevel: 'medium', featureContributions: Object.entries(features).map(([featureName, value]) => ({ featureName, featureValue: JSON.stringify(value), contributionScore: 0, rank: 1 })) }, { timeoutMs: 0 });
    expect(result).toContain('20 previous successful events');
    expect(result).toContain('67% (medium)');
    expect(result).toContain('01:00');
    expect(result).not.toContain('0 failed attempts');
    expect(result).not.toContain('VPN_SSO_NEW_CONTEXT_OFF_HOURS');
    expect(result).not.toContain('{');
  });
  beforeEach(() => vi.clearAllMocks());
  it('stores fallback immediately when the batch prose budget is exhausted', async () => {
    const result = await generateStoredAlertExplanation(input, { timeoutMs: 0 });
    expect(result).toContain('92%');
    expect(ollamaClient.generateAlertExplanation).not.toHaveBeenCalled();
  });
  it('passes the remaining batch budget to the model request', async () => {
    vi.mocked(ollamaClient.generateAlertExplanation).mockResolvedValue(null);
    await generateStoredAlertExplanation(input, { timeoutMs: 250 });
    expect(ollamaClient.generateAlertExplanation).toHaveBeenCalledWith(input, { timeoutMs: 250 });
  });
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
    expect(result).toContain('Repeated failed sign-ins');
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
      'The detection score met the configured threshold.',
    );
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
