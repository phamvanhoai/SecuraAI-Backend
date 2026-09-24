import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  alertCreateMock,
  alertFindFirstMock,
  auditCreateMock,
  eventCountMock,
  findModelsMock,
  transactionMock,
} = vi.hoisted(() => ({
  alertCreateMock: vi.fn(),
  alertFindFirstMock: vi.fn(),
  auditCreateMock: vi.fn(),
  eventCountMock: vi.fn(),
  findModelsMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    ai_alerts: { count: vi.fn(), findMany: vi.fn() },
    ai_model_versions: { count: vi.fn(), findMany: findModelsMock },
    security_events: { count: eventCountMock },
    $transaction: transactionMock,
  },
}));

import { aiAlertsRepository } from '../src/modules/ai-alerts/ai-alerts.repository.js';

const event = {
  id: 'event-1',
  logSourceId: 'source-1',
  assetId: null,
  eventType: 'authentication.failed',
  eventTime: new Date('2026-09-08T00:05:00Z'),
  sourceIp: '192.0.2.1',
};

describe('real-time AI alert repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bounds active model lookup and counts within the rule window and source group', async () => {
    findModelsMock.mockResolvedValue([]);
    eventCountMock.mockResolvedValue(4);
    await aiAlertsRepository.findActiveDetectionModels();
    await aiAlertsRepository.countMatchingEvents(event, 300, 'sourceIp');
    expect(findModelsMock).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    expect(eventCountMock).toHaveBeenCalledWith({
      where: {
        event_type: 'authentication.failed',
        event_time: {
          gte: new Date('2026-09-08T00:00:00Z'),
          lte: new Date('2026-09-08T00:05:00Z'),
        },
        source_ip: '192.0.2.1',
      },
    });
  });

  it('creates and audits a new alert atomically, but skips a processed rule', async () => {
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        ai_alerts: { findFirst: alertFindFirstMock, create: alertCreateMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
    const candidate = {
      alertCode: 'AI-code',
      securityEventId: 'event-1',
      logSourceId: 'source-1',
      assetId: null,
      modelVersionId: 'model-1',
      ruleId: 'failed-login',
      title: 'Failed login threshold',
      description: '[rule:failed-login] Detected 4 events.',
      anomalyScore: 1,
    };
    alertFindFirstMock.mockResolvedValueOnce({ ai_alert_id: 'existing' });
    await expect(
      aiAlertsRepository.createAlertIfMissing(candidate, {
        actorUserId: 'user-1',
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toBeNull();
    expect(alertCreateMock).not.toHaveBeenCalled();

    alertFindFirstMock.mockResolvedValueOnce(null);
    alertCreateMock.mockResolvedValue({ ai_alert_id: 'alert-1', alert_code: 'AI-code' });
    await aiAlertsRepository.createAlertIfMissing(candidate, {
      actorUserId: 'user-1',
      ipAddress: null,
      userAgent: null,
    });
    const createArgument: unknown = alertCreateMock.mock.calls[0]?.[0];
    expect(createArgument).toMatchObject({
      data: {
        security_event_id: 'event-1',
        ai_model_version_id: 'model-1',
        status: 'new',
      },
    });
    const auditArgument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(auditArgument).toMatchObject({ data: { action: 'ai_alert.created' } });
  });
});
