import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  fail: vi.fn(),
  model: vi.fn(),
  alert: vi.fn(),
  generate: vi.fn(),
  write: vi.fn(),
}));
vi.mock('../src/config/env.js', () => ({ env: { OLLAMA_ENABLED: true } }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $executeRaw: mocks.write } }));
vi.mock('../src/modules/ai-anomaly-detection-alerts/detection-jobs.repository.js', () => ({
  pipelineEngine: 'history-pipeline-v1',
  detectionJobsRepository: { claim: mocks.claim, fail: mocks.fail },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findDeployedModel: mocks.model },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { findExplanationForRegeneration: mocks.alert },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ollama.client.js', () => ({
  ollamaClient: { generateAlertExplanation: mocks.generate },
}));
import { runExplanationJobs } from '../src/modules/ai-anomaly-detection-alerts/explanation-jobs.service.js';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.model.mockResolvedValue({ id: 'model' });
  mocks.claim.mockResolvedValue({ token: 'lease', jobs: [{ id: 'job', alert_id: 'alert' }] });
  mocks.alert.mockResolvedValue({
    id: 'alert',
    severity: 'HIGH',
    explanation_text: 'fallback',
    explanation_generated_at: new Date(),
    anomaly_detections: {
      anomaly_score: { toNumber: () => 0.9 },
      threshold: { toNumber: () => 0.7 },
      detected_at: new Date(),
      anomaly_feature_contributions: [],
    },
  });
});
describe('independent explanation jobs', () => {
  it('retains stored fallback when Ollama fails and only retries the explanation lease', async () => {
    mocks.generate.mockRejectedValue(new Error('offline'));
    await runExplanationJobs();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith('lease');
  });
  it('protects manual regeneration and expired leases when storing enrichment', async () => {
    mocks.generate.mockResolvedValue({
      summary: 'Summary',
      observations: [],
      recommendedActions: [],
    });
    await runExplanationJobs();
    expect(mocks.fail).not.toHaveBeenCalled();
    const sql = (mocks.write.mock.calls[0]?.[0] as readonly string[]).join('?');
    expect(sql).toContain('a.explanation_text=');
    expect(sql).toContain('lease_until>now()');
    expect(mocks.write).toHaveBeenCalledTimes(2);
  });
});
