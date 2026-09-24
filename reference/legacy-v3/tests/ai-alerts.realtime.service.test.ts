import { beforeEach, describe, expect, it, vi } from 'vitest';

const { countMock, createAlertMock, findModelsMock } = vi.hoisted(() => ({
  countMock: vi.fn(),
  createAlertMock: vi.fn(),
  findModelsMock: vi.fn(),
}));

vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: {
    countMatchingEvents: countMock,
    createAlertIfMissing: createAlertMock,
    findActiveDetectionModels: findModelsMock,
  },
}));

import { aiAlertsService } from '../src/modules/ai-alerts/ai-alerts.service.js';

const event = {
  id: 'event-1',
  logSourceId: 'source-1',
  assetId: null,
  eventType: 'authentication.failed',
  eventTime: new Date('2026-09-08T00:00:00Z'),
  sourceIp: '192.0.2.1',
};

describe('real-time AI alert detection service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findModelsMock.mockResolvedValue([
      {
        ai_model_version_id: 'model-1',
        model_name: 'security-anomaly',
        version: '1.0.0',
        parameters: {
          ollamaModel: 'qwen3:4b',
          rules: [
            {
              id: 'failed-login',
              name: 'More than three failed logins',
              eventType: 'authentication.failed',
              threshold: 4,
              windowSeconds: 300,
              groupBy: 'sourceIp',
              severity: 'high',
              enabled: true,
            },
          ],
        },
      },
    ]);
    countMock.mockResolvedValue(4);
    createAlertMock.mockResolvedValue({ ai_alert_id: 'alert-1' });
  });

  it('creates an alert immediately when an active rule reaches its threshold', async () => {
    await expect(
      aiAlertsService.detectAlertsForEvents([event], {
        actorUserId: 'user-1',
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toEqual({ alertsCreated: 1 });
    expect(countMock).toHaveBeenCalledWith(event, 300, 'sourceIp');
    expect(createAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        securityEventId: 'event-1',
        modelVersionId: 'model-1',
        ruleId: 'failed-login',
        anomalyScore: 1,
      }),
      expect.objectContaining({ actorUserId: 'user-1' }),
    );
  });

  it('does not alert below threshold or for invalid active configurations', async () => {
    countMock.mockResolvedValueOnce(3);
    await expect(
      aiAlertsService.detectAlertsForEvents([event], {
        actorUserId: 'user-1',
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toEqual({ alertsCreated: 0 });
    findModelsMock.mockResolvedValueOnce([{ ai_model_version_id: 'bad', parameters: {} }]);
    await expect(
      aiAlertsService.detectAlertsForEvents([event], {
        actorUserId: 'user-1',
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toEqual({ alertsCreated: 0 });
    expect(createAlertMock).not.toHaveBeenCalled();
  });

  it('does no database work for an empty event batch', async () => {
    await expect(
      aiAlertsService.detectAlertsForEvents([], {
        actorUserId: 'user-1',
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toEqual({ alertsCreated: 0 });
    expect(findModelsMock).not.toHaveBeenCalled();
  });
});
