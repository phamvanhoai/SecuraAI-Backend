import { user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as MlClient from '../src/modules/ai-anomaly-detection-alerts/ml-classifier.client.js';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: {
    findActor: vi.fn(),
    findDeployedModel: vi.fn(),
    findPendingEvents: vi.fn(),
    findMlTemporalContext: vi.fn(),
    hasPendingEvents: vi.fn(),
    persistRun: vi.fn(),
  },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/alert-explanation.generator.js', () => ({
  generateStoredAlertExplanation: vi.fn().mockResolvedValue('ML and LLM evidence.'),
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
import { requestLlmClassification } from '../src/modules/ai-anomaly-detection-alerts/llm-classifier.client.js';
import { requestMlPrediction } from '../src/modules/ai-anomaly-detection-alerts/ml-classifier.client.js';

const event = {
  id: 'event-1',
  event_source_id: 'source',
  event_family: 'AUTHENTICATION' as const,
  event_type: 'LOGIN_FAILURE',
  occurred_at: new Date('2026-11-05T01:00:00Z'),
  account_identifier: 'alice',
  source_ip: '10.0.0.10',
  device_identifier: 'host-1',
  severity: '8',
  normalized_payload: {},
  event_entity_mappings: [],
};

describe('run anomaly detection service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findDeployedModel).mockResolvedValue({
      id: 'model',
      model_name: 'detector',
      version: '8',
      parameters: { threshold: 0.8 },
    });
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValue({ events: [event] });
    vi.mocked(anomalyDetectionRepository.findMlTemporalContext).mockResolvedValue([]);
    vi.mocked(anomalyDetectionRepository.hasPendingEvents).mockResolvedValue(false);
    vi.mocked(anomalyDetectionRepository.persistRun).mockResolvedValue({
      alertsGrouped: 0,
      detectionsCreated: 1,
      alertsCreated: 0,
    });
  });

  it('allows only an active Security Officer to run a manual batch', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.ADMIN,
      status: user_status.ACTIVE,
    });
    await expect(anomalyDetectionService.run('u', { maxEvents: 100 })).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('stops at ML triage for a low-risk event', async () => {
    vi.mocked(requestMlPrediction).mockResolvedValue({
      status: 'PREDICTED',
      prediction: {
        label: 'BENIGN',
        malicious: false,
        score: 0.2,
        threshold: 0.5,
        escalationThreshold: 0.7,
        scoreSemantics: 'test',
        modelVersion: 'v8',
      },
    });
    await anomalyDetectionService.runAutomated({ maxEvents: 1 });
    expect(requestLlmClassification).not.toHaveBeenCalled();
    expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        detections: [
          expect.objectContaining({
            score: 0.2,
            threshold: 0.8,
            thresholdSource: 'MODEL_DEFAULT',
            isAnomaly: false,
          }),
        ],
      }),
    );
  });

  it.each([
    ['MALICIOUS', 0.95, true],
    ['SUSPICIOUS', 0.7, false],
    ['BENIGN', 0.1, false],
  ] as const)(
    'uses the escalated LLM %s verdict as the final decision',
    async (verdict, score, isAnomaly) => {
      vi.mocked(requestMlPrediction).mockResolvedValue({
        status: 'PREDICTED',
        prediction: {
          label: 'MALICIOUS_APT',
          malicious: true,
          score: 0.9,
          threshold: 0.5,
          escalationThreshold: 0.7,
          scoreSemantics: 'test',
          modelVersion: 'v8',
        },
      });
      vi.mocked(requestLlmClassification).mockResolvedValue({
        status: 'PREDICTED',
        prediction: {
          verdict,
          score,
          malicious: isAnomaly,
          category: 'AUTHENTICATION',
          reason: 'Evidence.',
        },
      });
      await anomalyDetectionService.runAutomated({ maxEvents: 1 });
      expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
        expect.objectContaining({
          detections: [
            expect.objectContaining({
              threshold: 0.8,
              thresholdSource: 'MODEL_DEFAULT',
              isAnomaly,
            }),
          ],
        }),
      );
    },
  );

  it('uses an enabled Asset threshold instead of the common model threshold', async () => {
    vi.mocked(anomalyDetectionRepository.findDeployedModel).mockResolvedValue({
      id: 'model',
      model_name: 'detector',
      version: '8',
      parameters: {
        threshold: 0.8,
        assetThresholds: { 'asset-1': { threshold: 0.6, enabled: true } },
      },
    });
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValue({
      events: [{ ...event, event_entity_mappings: [{ asset_id: 'asset-1' }] }],
    });
    vi.mocked(requestMlPrediction).mockResolvedValue({
      status: 'PREDICTED',
      prediction: {
        label: 'MALICIOUS_APT',
        malicious: true,
        score: 0.7,
        threshold: 0.5,
        escalationThreshold: 0.9,
        scoreSemantics: 'test',
        modelVersion: 'v8',
      },
    });
    vi.mocked(requestLlmClassification).mockResolvedValue({
      status: 'PREDICTED',
      prediction: {
        verdict: 'MALICIOUS',
        score: 0.95,
        malicious: true,
        category: 'AUTHENTICATION',
        reason: 'Evidence.',
      },
    });

    const result = await anomalyDetectionService.runAutomated({ maxEvents: 1 });

    expect(requestLlmClassification).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ customThresholdsApplied: 1, anomaliesDetected: 1 });
    expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        detections: [
          expect.objectContaining({
            threshold: 0.6,
            thresholdSource: 'ASSET_OVERRIDE',
            isAnomaly: true,
          }),
        ],
      }),
    );
  });

  it('falls back to the common threshold when the Asset override is disabled', async () => {
    vi.mocked(anomalyDetectionRepository.findDeployedModel).mockResolvedValue({
      id: 'model',
      model_name: 'detector',
      version: '8',
      parameters: {
        threshold: 0.8,
        assetThresholds: { 'asset-1': { threshold: 0.6, enabled: false } },
      },
    });
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValue({
      events: [{ ...event, event_entity_mappings: [{ asset_id: 'asset-1' }] }],
    });
    vi.mocked(requestMlPrediction).mockResolvedValue({
      status: 'PREDICTED',
      prediction: {
        label: 'MALICIOUS_APT',
        malicious: true,
        score: 0.7,
        threshold: 0.5,
        escalationThreshold: 0.5,
        scoreSemantics: 'test',
        modelVersion: 'v8',
      },
    });

    const result = await anomalyDetectionService.runAutomated({ maxEvents: 1 });

    expect(requestLlmClassification).not.toHaveBeenCalled();
    expect(result).toMatchObject({ customThresholdsApplied: 0, anomaliesDetected: 0 });
    expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        detections: [
          expect.objectContaining({
            threshold: 0.8,
            thresholdSource: 'MODEL_DEFAULT',
            isAnomaly: false,
          }),
        ],
      }),
    );
  });

  it('records an ML failure instead of falling back to legacy scoring', async () => {
    vi.mocked(requestMlPrediction).mockResolvedValue({
      status: 'UNAVAILABLE',
      reason: 'NETWORK',
    });
    await anomalyDetectionService.runAutomated({ maxEvents: 1 });
    expect(requestLlmClassification).not.toHaveBeenCalled();
    expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        detections: [],
        failures: [expect.objectContaining({ eventId: event.id, code: 'ML_MODEL_UNAVAILABLE' })],
      }),
    );
  });
});
