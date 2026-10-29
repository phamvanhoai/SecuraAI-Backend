import { user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: {
    findActor: vi.fn(),
    findDeployedModel: vi.fn(),
    findPendingEvents: vi.fn(),
    findEventContext: vi.fn(),
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
    vi.mocked(anomalyDetectionRepository.findEventContext).mockResolvedValue({
      events: [],
      truncated: false,
    });
    vi.mocked(anomalyDetectionRepository.hasPendingEvents).mockResolvedValue(false);
    vi.mocked(generateStoredAlertExplanation).mockResolvedValue(
      'The anomaly score exceeded the model threshold.',
    );
  });
  it.each([
    [1, false],
    [0.649, false],
    [0.6, false],
    [0.7, true],
    [0.649, true],
    [0.6, true],
  ] as const)(
    'requires matched-rule score to reach threshold %s (asset override: %s)',
    async (threshold, override) => {
      vi.mocked(anomalyDetectionRepository.findDeployedModel).mockResolvedValue({
        id: 'model',
        model_name: 'detector',
        version: '3',
        parameters: override
          ? { threshold: 0.5, assetThresholds: { 'asset-1': { threshold, enabled: true } } }
          : { threshold },
      });
      const event = {
        id: 'target',
        event_source_id: 'source',
        event_family: 'AUTHENTICATION' as const,
        event_type: 'LOGIN_FAILURE',
        severity: 'LOW',
        occurred_at: new Date('2026-10-29T12:00:00Z'),
        account_identifier: 'alice',
        source_ip: '192.0.2.1',
        device_identifier: null,
        normalized_payload: {},
        event_entity_mappings: override ? [{ asset_id: 'asset-1' }] : [],
      };
      vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValue({
        events: [event],
      });
      vi.mocked(anomalyDetectionRepository.findEventContext).mockResolvedValue({
        events: Array.from({ length: 4 }, (_, i) => ({
          ...event,
          id: `old-${i}`,
          occurred_at: new Date(event.occurred_at.getTime() - 60_000 - i * 1000),
        })),
        truncated: false,
      });
      vi.mocked(anomalyDetectionRepository.persistRun).mockResolvedValue({
        detectionsCreated: 1,
        alertsCreated: threshold <= 0.649 ? 1 : 0,
        alertsGrouped: 0,
      });
      const result = await anomalyDetectionService.runAutomated({ maxEvents: 100 });
      expect(result).toMatchObject({
        anomaliesDetected: threshold <= 0.649 ? 1 : 0,
        alertsCreated: threshold <= 0.649 ? 1 : 0,
      });
      if (threshold > 0.649) expect(generateStoredAlertExplanation).not.toHaveBeenCalled();
      expect(anomalyDetectionRepository.persistRun).toHaveBeenCalledWith(
        expect.objectContaining({
          detections: [
            expect.objectContaining({
              score: 0.649,
              thresholdSource: override ? 'ASSET_OVERRIDE' : 'MODEL_DEFAULT',
              threshold,
              isAnomaly: threshold <= 0.649,
              features: expect.arrayContaining([
                expect.objectContaining({
                  featureName: 'matched_rules',
                  featureValue: '["AUTH_FAILURE_BURST"]',
                }),
              ]),
            }),
          ],
        }),
      );
    },
  );

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
        threshold: 0.5,
        assetThresholds: { 'asset-1': { threshold: 0.5, enabled: true } },
      },
    });
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValueOnce({
      events: [
        {
          id: 'event',
          event_source_id: 'source',
          event_family: 'AUTHENTICATION' as const,
          account_identifier: 'user',
          source_ip: '192.0.2.1',
          device_identifier: null,
          normalized_payload: {},
          event_type: 'login_failure',
          severity: 'CRITICAL',
          occurred_at: new Date('2026-09-25T18:00:00Z'),
          event_entity_mappings: [{ asset_id: 'asset-1' }],
        },
      ],
    });
    vi.mocked(anomalyDetectionRepository.persistRun).mockResolvedValue({
      alertsGrouped: 0,
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
      alertsGrouped: 0,
      detectionsCreated: 1,
      alertsCreated: 1,
      threshold: 0.5,
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
          event_source_id: 'source',
          event_family: 'APPLICATION_ACCESS' as const,
          account_identifier: 'user',
          source_ip: '192.0.2.1',
          device_identifier: null,
          normalized_payload: {},
          event_type: 'privilege_use',
          severity: '13',
          occurred_at: new Date('2026-09-25T18:00:00Z'),
          event_entity_mappings: [],
        },
      ],
    });
    vi.mocked(anomalyDetectionRepository.persistRun).mockResolvedValue({
      alertsGrouped: 0,
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
      event_source_id: 'source',
      event_family: 'AUTHENTICATION' as const,
      account_identifier: 'user',
      source_ip: '192.0.2.1',
      device_identifier: null,
      normalized_payload: {},
      event_type: 'login_failure',
      severity: 'LOW',
      occurred_at: new Date('2026-09-25T12:00:00Z'),
      event_entity_mappings: [],
    });
    vi.mocked(anomalyDetectionRepository.findPendingEvents).mockResolvedValueOnce({
      events: Array.from({ length: 100 }, (_, index) => makeEvent(`event-${index}`)),
    });
    vi.mocked(anomalyDetectionRepository.persistRun).mockResolvedValueOnce({
      alertsGrouped: 0,
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
      alertsGrouped: 0,
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
    });

    const result = await anomalyDetectionService.runAutomated({
      maxEvents: 100,
    });

    expect(result).toMatchObject({ eventsEvaluated: 0, detectionsCreated: 0, alertsCreated: 0 });
    expect(anomalyDetectionRepository.persistRun).not.toHaveBeenCalled();
  });
});
