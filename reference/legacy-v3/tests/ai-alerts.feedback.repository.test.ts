import { beforeEach, describe, expect, it, vi } from 'vitest';

const { alertFindMock, auditCreateMock, feedbackCreateMock, transactionMock } = vi.hoisted(() => ({
  alertFindMock: vi.fn(),
  auditCreateMock: vi.fn(),
  feedbackCreateMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: transactionMock },
}));

import { aiAlertsRepository } from '../src/modules/ai-alerts/ai-alerts.repository.js';

describe('AI alert reliability repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        ai_alerts: { findUnique: alertFindMock },
        ai_feedback: { create: feedbackCreateMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
  });

  it('returns null without writing when the alert does not exist', async () => {
    alertFindMock.mockResolvedValue(null);
    await expect(aiAlertsRepository.evaluateAlertReliability(
      'missing', { feedbackLabel: 'needs_review' },
      { actorUserId: 'user-1', ipAddress: null, userAgent: null },
    )).resolves.toBeNull();
    expect(feedbackCreateMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('creates feedback and its audit record in one transaction', async () => {
    alertFindMock.mockResolvedValue({ ai_alert_id: 'alert-1' });
    feedbackCreateMock.mockResolvedValue({
      ai_feedback_id: 'feedback-1', ai_alert_id: 'alert-1', reviewed_by_user_id: 'user-1',
      feedback_label: 'confirmed_incident', comment: 'Reliable alert', created_at: new Date(),
    });
    await aiAlertsRepository.evaluateAlertReliability(
      'alert-1', { feedbackLabel: 'confirmed_incident', comment: 'Reliable alert' },
      { actorUserId: 'user-1', ipAddress: '192.0.2.1', userAgent: 'test-agent' },
    );
    const feedbackArgument: unknown = feedbackCreateMock.mock.calls[0]?.[0];
    expect(feedbackArgument).toMatchObject({
      data: {
        ai_alert_id: 'alert-1', reviewed_by_user_id: 'user-1',
        feedback_label: 'confirmed_incident', comment: 'Reliable alert',
      },
    });
    const auditArgument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(auditArgument).toMatchObject({
      data: { action: 'ai_alert.reliability_evaluated', entity_id: 'alert-1' },
    });
  });
});
