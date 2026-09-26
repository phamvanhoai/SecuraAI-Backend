import { user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: {
    findActor: vi.fn(),
    findDeployedModel: vi.fn(),
    findPendingEvents: vi.fn(),
    persistRun: vi.fn(),
  },
}));

import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';
import { anomalyDetectionService } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.service.js';

describe('run anomaly detection service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows only an active Security Officer', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.ADMIN,
      status: user_status.ACTIVE,
    });
    await expect(
      anomalyDetectionService.run('u', { lookbackHours: 24, maxEvents: 100 }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('scores events, persists detections, and creates alerts above the deployed threshold', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.SECURITY_OFFICER,
      status: user_status.ACTIVE,
    });
    vi.mocked(anomalyDetectionRepository.findDeployedModel).mockResolvedValue({
      id: 'model',
      model_name: 'detector',
      version: '2',
      parameters: {
        threshold: 0.7,
        assetThresholds: { 'asset-1': { threshold: 0.6, enabled: true } },
      },
    });
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValue({
      events: [
        {
          id: 'event',
          event_type: 'login_failure',
          severity: 'CRITICAL',
          occurred_at: new Date('2026-09-25T02:00:00Z'),
          event_entity_mappings: [{ asset_id: 'asset-1' }],
        },
      ],
      frequencies: new Map([['login_failure', 1]]),
      populationSize: 10,
    });
    vi.mocked(anomalyDetectionRepository.persistRun).mockResolvedValue({
      detectionsCreated: 1,
      alertsCreated: 1,
    });

    const result = await anomalyDetectionService.run(
      'u',
      { lookbackHours: 24, maxEvents: 100 },
      'request-id',
    );

    expect(result).toMatchObject({
      eventsEvaluated: 1,
      anomaliesDetected: 1,
      detectionsCreated: 1,
      alertsCreated: 1,
      threshold: 0.7,
    });
    expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'u',
        modelVersionId: 'model',
        correlationId: 'request-id',
        detections: [expect.objectContaining({ eventId: 'event', isAnomaly: true })],
      }),
    );
  });
});
