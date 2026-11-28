import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/ollama.client.js', () => ({
  ollamaClient: { generateAlertExplanation: vi.fn() },
}));
vi.mock('../src/config/logger.js', () => ({ logger: { warn: vi.fn() } }));

import { logger } from '../src/config/logger.js';
import { generateStoredAlertExplanation } from '../src/modules/ai-anomaly-detection-alerts/alert-explanation.generator.js';
import { ollamaClient } from '../src/modules/ai-anomaly-detection-alerts/ollama.client.js';

const input = {
  anomalyScore: 0.92,
  threshold: 0.8,
  suggestedRiskLevel: 'high',
  detectedAt: new Date('2026-10-21T22:00:00Z'),
  evidence: [],
  eventId: 'event-1',
};

describe('stored AI alert explanation generator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores the ML/LLM fallback immediately when the prose budget is exhausted', async () => {
    const result = await generateStoredAlertExplanation(input, { timeoutMs: 0 });
    expect(result).toContain('ML/LLM detection pipeline');
    expect(result).toContain('92% (high)');
    expect(result).toContain('LLM MALICIOUS verdict');
    expect(ollamaClient.generateAlertExplanation).not.toHaveBeenCalled();
  });

  it('passes the remaining batch budget to the model request', async () => {
    vi.mocked(ollamaClient.generateAlertExplanation).mockResolvedValue(null);
    await generateStoredAlertExplanation(input, { timeoutMs: 250 });
    expect(ollamaClient.generateAlertExplanation).toHaveBeenCalledWith(input, { timeoutMs: 250 });
  });

  it('formats a successful Ollama response for storage', async () => {
    vi.mocked(ollamaClient.generateAlertExplanation).mockResolvedValue({
      summary: 'Malicious activity was detected.',
      observations: ['The LLM classified the escalated event as malicious.'],
      recommendedActions: ['Review the related security event.'],
    });
    await expect(generateStoredAlertExplanation(input)).resolves.toBe(
      'Malicious activity was detected.\nObservations: The LLM classified the escalated event as malicious.\nRecommended actions: Review the related security event.',
    );
  });

  it('stores a deterministic ML/LLM fallback when Ollama is unavailable', async () => {
    vi.mocked(ollamaClient.generateAlertExplanation).mockRejectedValue(new Error('offline'));
    await expect(generateStoredAlertExplanation(input)).resolves.toContain(
      'final alert decision came from the LLM MALICIOUS verdict',
    );
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
