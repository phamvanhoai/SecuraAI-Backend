import { user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: {
    findActor: vi.fn(),
    findDeployedModel: vi.fn(),
    findPendingEvents: vi.fn(),
    hasPendingEvents: vi.fn(),
    persistRun: vi.fn(),
  },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/alert-explanation.generator.js', () => ({
  generateStoredAlertExplanation: vi.fn(),
}));

import { generateStoredAlertExplanation } from '../src/modules/ai-anomaly-detection-alerts/alert-explanation.generator.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';
import { anomalyDetectionService } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.service.js';

describe('run anomaly detection service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.hasPendingEvents).mockResolvedValue(false);
    vi.mocked(generateStoredAlertExplanation).mockResolvedValue(
      'The anomaly score exceeded the model threshold.',
    );
  });

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
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValueOnce({
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
      scope: 'ALL_PENDING',
      hasMore: false,
    });
    expect(anomalyDetectionRepository.findPendingEvents).toHaveBeenNthCalledWith(
      1,
      'model',
      null,
      100,
      'ALL',
    );
    expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'USER', userId: 'u' },
        modelVersionId: 'model',
        correlationId: 'request-id',
        detections: [
          expect.objectContaining({
            eventId: 'event',
            isAnomaly: true,
            explanationText: expect.stringContaining('exceeded the model threshold'),
            explanationGeneratedAt: expect.any(Date),
          }),
        ],
      }),
    );
  });

  it('runs pending-event detection as a system actor without a user session', async () => {
    vi.mocked(anomalyDetectionRepository.findDeployedModel).mockResolvedValue({
      id: 'model',
      model_name: 'detector',
      version: '2',
      parameters: { threshold: 0.5 },
    });
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValue({
      events: [
        {
          id: 'wazuh-event',
          event_type: 'privilege_use',
          severity: '13',
          occurred_at: new Date('2026-09-25T02:00:00Z'),
          event_entity_mappings: [],
        },
      ],
      frequencies: new Map([['privilege_use', 1]]),
      populationSize: 100,
    });
    vi.mocked(anomalyDetectionRepository.persistRun).mockResolvedValue({
      detectionsCreated: 1,
      alertsCreated: 1,
    });

    const result = await anomalyDetectionService.runAutomated({
      maxEvents: 100,
    });

    expect(result).toMatchObject({
      eventsEvaluated: 1,
      alertsCreated: 1,
      scope: 'WAZUH_REALTIME',
    });
    expect(anomalyDetectionRepository.findPendingEvents).toHaveBeenCalledWith(
      'model',
      null,
      100,
      'WAZUH_REALTIME',
    );
    expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'SYSTEM' },
        detections: [expect.objectContaining({ eventId: 'wazuh-event', isAnomaly: true })],
      }),
    );
  });

  it('processes one bounded manual batch and reports that more events may remain', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.SECURITY_OFFICER,
      status: user_status.ACTIVE,
    });
    vi.mocked(anomalyDetectionRepository.findDeployedModel).mockResolvedValue({
      id: 'model',
      model_name: 'detector',
      version: '2',
      parameters: { threshold: 0.8 },
    });
    const makeEvent = (id: string) => ({
      id,
      event_type: 'login_failure',
      severity: 'LOW',
      occurred_at: new Date('2026-09-25T12:00:00Z'),
      event_entity_mappings: [],
    });
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValueOnce({
      events: Array.from({ length: 100 }, (_, index) => makeEvent(`event-${index}`)),
      frequencies: new Map([['login_failure', 100]]),
      populationSize: 100,
    });
    vi.mocked(anomalyDetectionRepository.persistRun).mockResolvedValueOnce({
      detectionsCreated: 100,
      alertsCreated: 0,
    });
    vi.mocked(anomalyDetectionRepository.hasPendingEvents).mockResolvedValueOnce(true);

    const result = await anomalyDetectionService.run('u', {
      lookbackHours: 24,
      maxEvents: 100,
    });

    expect(result).toMatchObject({
      eventsEvaluated: 100,
      detectionsCreated: 100,
      alertsCreated: 0,
      scope: 'ALL_PENDING',
      hasMore: true,
    });
    expect(anomalyDetectionRepository.findPendingEvents).toHaveBeenCalledTimes(1);
    expect(anomalyDetectionRepository.findPendingEvents).toHaveBeenNthCalledWith(
      1,
      'model',
      null,
      100,
      'ALL',
    );
  });

  it('does not create an audit run when there are no pending events', async () => {
    vi.mocked(anomalyDetectionRepository.findDeployedModel).mockResolvedValue({
      id: 'model',
      model_name: 'detector',
      version: '2',
      parameters: { threshold: 0.7 },
    });
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValue({
      events: [],
      frequencies: new Map(),
      populationSize: 0,
    });

    const result = await anomalyDetectionService.runAutomated({
      maxEvents: 100,
    });

    expect(result).toMatchObject({ eventsEvaluated: 0, detectionsCreated: 0, alertsCreated: 0 });
    expect(anomalyDetectionRepository.persistRun).not.toHaveBeenCalled();
  });
});
