import { beforeEach, describe, expect, it, vi } from 'vitest';

const { alertFindMock, alertUpdateManyMock, auditCreateMock, feedbackCreateMock, transactionMock } =
  vi.hoisted(() => ({
    alertFindMock: vi.fn(),
    alertUpdateManyMock: vi.fn(),
    auditCreateMock: vi.fn(),
    feedbackCreateMock: vi.fn(),
    transactionMock: vi.fn(),
  }));

vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: transactionMock } }));
import { aiAlertsRepository } from '../src/modules/ai-alerts/ai-alerts.repository.js';

const context = { actorUserId: 'user-1', ipAddress: null, userAgent: null };
const newAlert = {
  ai_alert_id: 'alert-1', alert_code: 'AI-1', status: 'new',
  reviewed_by_user_id: null, reviewed_at: null,
};

describe('confirm AI alert repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        ai_alerts: { findUnique: alertFindMock, updateMany: alertUpdateManyMock },
        ai_feedback: { create: feedbackCreateMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
  });

  it('updates the lifecycle, feedback and audit atomically', async () => {
    alertFindMock.mockResolvedValue(newAlert);
    alertUpdateManyMock.mockResolvedValue({ count: 1 });
    await expect(aiAlertsRepository.confirmAlertAsIncident(
      'alert-1', { comment: 'Verified' }, context,
    )).resolves.toMatchObject({ kind: 'confirmed', alert: { status: 'confirmed' } });
    const updateArgument: unknown = alertUpdateManyMock.mock.calls[0]?.[0];
    expect(updateArgument).toMatchObject({
      where: { ai_alert_id: 'alert-1', status: { in: ['new', 'reviewing'] } },
      data: { status: 'confirmed', reviewed_by_user_id: 'user-1' },
    });
    const feedbackArgument: unknown = feedbackCreateMock.mock.calls[0]?.[0];
    expect(feedbackArgument).toMatchObject({
      data: { feedback_label: 'confirmed_incident', comment: 'Verified' },
    });
    expect(auditCreateMock).toHaveBeenCalledOnce();
  });

  it('does not duplicate feedback for an already confirmed alert', async () => {
    alertFindMock.mockResolvedValue({ ...newAlert, status: 'confirmed' });
    await expect(aiAlertsRepository.confirmAlertAsIncident('alert-1', {}, context))
      .resolves.toMatchObject({ kind: 'already_confirmed' });
    expect(alertUpdateManyMock).not.toHaveBeenCalled();
    expect(feedbackCreateMock).not.toHaveBeenCalled();
  });

  it('rejects terminal or contradictory statuses without writing', async () => {
    alertFindMock.mockResolvedValue({ ...newAlert, status: 'false_positive' });
    await expect(aiAlertsRepository.confirmAlertAsIncident('alert-1', {}, context))
      .resolves.toEqual({ kind: 'invalid_status', status: 'false_positive' });
    expect(alertUpdateManyMock).not.toHaveBeenCalled();
  });
});
