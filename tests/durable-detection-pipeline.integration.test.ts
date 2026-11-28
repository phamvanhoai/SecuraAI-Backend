import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as MlClient from '../src/modules/ai-anomaly-detection-alerts/ml-classifier.client.js';

const db = vi.hoisted(() => ({
  normalized_events: { findMany: vi.fn() },
}));

vi.mock('../src/database/prisma.js', () => ({ prisma: db }));
vi.mock('../src/modules/ai-anomaly-detection-alerts/alert-explanation.generator.js', () => ({
  generateStoredAlertExplanation: vi.fn().mockResolvedValue('Stored Foundation-Sec explanation.'),
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/llm-classifier.client.js', () => ({
  requestLlmClassification: vi.fn(),
}));
vi.mock(
  '../src/modules/ai-anomaly-detection-alerts/ml-classifier.client.js',
  async (importOriginal) => {
    const actual = await importOriginal<typeof MlClient>();
    return { ...actual, requestMlPrediction: vi.fn() };
  },
);

import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';
import { anomalyDetectionService } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.service.js';
import { detectionJobsRepository } from '../src/modules/ai-anomaly-detection-alerts/detection-jobs.repository.js';
import { requestLlmClassification } from '../src/modules/ai-anomaly-detection-alerts/llm-classifier.client.js';
import { requestMlPrediction } from '../src/modules/ai-anomaly-detection-alerts/ml-classifier.client.js';

const event = {
  id: 'event-1',
  event_source_id: 'source-1',
  event_family: 'AUTHENTICATION' as const,
  event_type: 'LOGIN_FAILURE',
  occurred_at: new Date('2026-11-28T01:00:00.000Z'),
  account_identifier: 'alice',
  source_ip: '10.0.0.10',
  device_identifier: 'host-1',
  severity: '8',
  normalized_payload: {},
  event_entity_mappings: [],
};

describe('durable anomaly-detection pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    db.normalized_events.findMany.mockReset();
    db.normalized_events.findMany.mockResolvedValue([event]);

    vi.spyOn(detectionJobsRepository, 'discover').mockResolvedValue(undefined);
    vi.spyOn(detectionJobsRepository, 'claim').mockResolvedValue({
      token: '11111111-1111-4111-8111-111111111111',
      jobs: [{ id: 'job-1', event_id: event.id, alert_id: null }],
    });
    vi.spyOn(detectionJobsRepository, 'fail').mockResolvedValue(undefined);
    vi.spyOn(anomalyDetectionRepository, 'findDeployedModel').mockResolvedValue({
      id: 'model-1',
      model_name: 'self-trained-temporal-detector',
      version: '1.0.0',
      parameters: { threshold: 0.8 },
    });
    vi.spyOn(anomalyDetectionRepository, 'findMlTemporalContext').mockResolvedValue([]);
    vi.spyOn(anomalyDetectionRepository, 'persistRun').mockResolvedValue({
      detectionsCreated: 1,
      alertsCreated: 1,
      alertsGrouped: 0,
    });
  });

  it('discovers and claims durable jobs before running ML and Foundation-Sec', async () => {
    vi.mocked(requestMlPrediction).mockResolvedValue({
      status: 'PREDICTED',
      prediction: {
        label: 'MALICIOUS_APT',
        malicious: true,
        score: 0.91,
        threshold: 0.5,
        escalationThreshold: 0.8,
        scoreSemantics: 'temporal anomaly score',
        modelVersion: '1.0.0',
      },
    });
    vi.mocked(requestLlmClassification).mockResolvedValue({
      status: 'PREDICTED',
      prediction: {
        verdict: 'MALICIOUS',
        score: 0.94,
        malicious: true,
        category: 'AUTHENTICATION',
        reason: 'Repeated failures are malicious.',
      },
    });

    const result = await anomalyDetectionService.runAutomated({ maxEvents: 100 });

    expect(detectionJobsRepository.discover).toHaveBeenCalledWith('model-1', 'WAZUH_REALTIME');
    expect(detectionJobsRepository.claim).toHaveBeenCalledWith(
      'model-1',
      100,
      'DETECTION',
      'WAZUH_REALTIME',
    );
    expect(db.normalized_events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [event.id] } } }),
    );
    expect(requestMlPrediction).toHaveBeenCalledOnce();
    expect(requestLlmClassification).toHaveBeenCalledOnce();
    expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        leaseToken: '11111111-1111-4111-8111-111111111111',
        detections: [
          expect.objectContaining({
            eventId: event.id,
            score: 0.94,
            outcome: 'MALICIOUS',
            isAnomaly: true,
          }),
        ],
        failures: [],
      }),
    );
    expect(detectionJobsRepository.fail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ eventsEvaluated: 1, anomaliesDetected: 1, alertsCreated: 1 });
  });

  it('persists an ML timeout against the claimed lease for retry', async () => {
    vi.mocked(requestMlPrediction).mockResolvedValue({ status: 'UNAVAILABLE', reason: 'TIMEOUT' });

    const result = await anomalyDetectionService.runAutomated({ maxEvents: 1 });

    expect(requestLlmClassification).not.toHaveBeenCalled();
    expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        leaseToken: '11111111-1111-4111-8111-111111111111',
        detections: [],
        failures: [
          expect.objectContaining({
            eventId: event.id,
            stage: 'ML_MODEL',
            code: 'ML_MODEL_TIMEOUT',
          }),
        ],
      }),
    );
    expect(result).toMatchObject({ eventsEvaluated: 1, processingFailures: 1 });
  });

  it('releases the claimed lease when an unexpected batch error occurs', async () => {
    vi.mocked(requestMlPrediction).mockResolvedValue({ status: 'UNAVAILABLE', reason: 'NETWORK' });
    vi.mocked(anomalyDetectionRepository.persistRun).mockRejectedValue(
      new Error('database temporarily unavailable'),
    );

    await expect(anomalyDetectionService.runAutomated({ maxEvents: 1 })).rejects.toThrow(
      'database temporarily unavailable',
    );
    expect(detectionJobsRepository.fail).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
  });
});
