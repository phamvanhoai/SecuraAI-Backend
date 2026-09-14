import { beforeEach, describe, expect, it, vi } from 'vitest';

const { alertFindMock, alertUpdateManyMock, auditCreateMock, feedbackCreateMock,
  incidentUpsertMock, incidentLinkUpsertMock, transactionMock } =
  vi.hoisted(() => ({
    alertFindMock: vi.fn(),
    alertUpdateManyMock: vi.fn(),
    auditCreateMock: vi.fn(),
    feedbackCreateMock: vi.fn(),
    incidentUpsertMock: vi.fn(),
    incidentLinkUpsertMock: vi.fn(),
    transactionMock: vi.fn(),
  }));

vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: transactionMock } }));
import { aiAlertsRepository } from '../src/modules/ai-alerts/ai-alerts.repository.js';

const context = { actorUserId: 'user-1', ipAddress: null, userAgent: null };
const newAlert = {
  ai_alert_id: 'alert-1', alert_code: 'AI-1', status: 'new',
  title: 'Unusual sign-ins', description: 'Repeated failed sign-ins',
  risk_level: 'high', detected_at: new Date('2026-09-14T00:00:00Z'),
  reviewed_by_user_id: null, reviewed_at: null,
  incident_alert_links: [],
};

describe('confirm AI alert repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        ai_alerts: { findUnique: alertFindMock, updateMany: alertUpdateManyMock },
        ai_feedback: { create: feedbackCreateMock },
        incidents: { upsert: incidentUpsertMock },
        incident_alert_links: { upsert: incidentLinkUpsertMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
    incidentUpsertMock.mockResolvedValue({
      incident_id: 'incident-1', incident_code: 'INC-alert-1', status: 'draft',
    });
  });

  it('updates the lifecycle, feedback and audit atomically', async () => {
    alertFindMock.mockResolvedValue(newAlert);
    alertUpdateManyMock.mockResolvedValue({ count: 1 });
    await expect(aiAlertsRepository.confirmAlertAsIncident(
      'alert-1', { comment: 'Verified' }, context,
    )).resolves.toMatchObject({
      kind: 'confirmed', alert: { status: 'confirmed' },
      incident: { incident_code: 'INC-alert-1', status: 'draft' }, incidentCreated: true,
    });
    const updateArgument: unknown = alertUpdateManyMock.mock.calls[0]?.[0];
    expect(updateArgument).toMatchObject({
      where: { ai_alert_id: 'alert-1', status: { in: ['new', 'reviewing'] } },
      data: { status: 'confirmed', reviewed_by_user_id: 'user-1' },
    });
    const feedbackArgument: unknown = feedbackCreateMock.mock.calls[0]?.[0];
    expect(feedbackArgument).toMatchObject({
      data: { feedback_label: 'confirmed_incident', comment: 'Verified' },
    });
    expect(incidentUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { incident_code: 'INC-alert-1' },
      create: expect.objectContaining({
        title: 'Unusual sign-ins', severity: 'high', status: 'draft',
        reported_by_user_id: 'user-1',
      }),
    }));
    expect(incidentLinkUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        incident_id: 'incident-1', ai_alert_id: 'alert-1', created_by_user_id: 'user-1',
      }),
    }));
    expect(auditCreateMock).toHaveBeenCalledOnce();
  });

  it('returns the linked draft without duplicating data for an already confirmed alert', async () => {
    alertFindMock.mockResolvedValue({
      ...newAlert,
      status: 'confirmed',
      incident_alert_links: [{
        incidents: { incident_id: 'incident-1', incident_code: 'INC-alert-1', status: 'draft' },
      }],
    });
    await expect(aiAlertsRepository.confirmAlertAsIncident('alert-1', {}, context))
      .resolves.toMatchObject({ kind: 'already_confirmed', incidentCreated: false });
    expect(alertUpdateManyMock).not.toHaveBeenCalled();
    expect(feedbackCreateMock).not.toHaveBeenCalled();
    expect(incidentUpsertMock).not.toHaveBeenCalled();
  });

  it('backfills a draft for a legacy confirmed alert without a link', async () => {
    alertFindMock.mockResolvedValue({ ...newAlert, status: 'confirmed' });
    await expect(aiAlertsRepository.confirmAlertAsIncident('alert-1', {}, context))
      .resolves.toMatchObject({ kind: 'already_confirmed', incidentCreated: true });
    expect(incidentUpsertMock).toHaveBeenCalledOnce();
    expect(incidentLinkUpsertMock).toHaveBeenCalledOnce();
    expect(feedbackCreateMock).not.toHaveBeenCalled();
  });

  it('rejects terminal or contradictory statuses without writing', async () => {
    alertFindMock.mockResolvedValue({ ...newAlert, status: 'false_positive' });
    await expect(aiAlertsRepository.confirmAlertAsIncident('alert-1', {}, context))
      .resolves.toEqual({ kind: 'invalid_status', status: 'false_positive' });
    expect(alertUpdateManyMock).not.toHaveBeenCalled();
  });
});
