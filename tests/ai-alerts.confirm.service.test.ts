import { beforeEach, describe, expect, it, vi } from 'vitest';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { confirmAlertAsIncident: confirmMock },
}));
import { aiAlertsService } from '../src/modules/ai-alerts/ai-alerts.service.js';

const actor = { userId: 'user-1', permissions: ['ai-alerts.confirm'] };
const context = { ipAddress: null, userAgent: null };
const alert = {
  ai_alert_id: 'alert-1', alert_code: 'AI-1', status: 'confirmed',
  reviewed_by_user_id: 'user-1', reviewed_at: new Date('2026-09-09T00:00:00Z'),
};

describe('confirm AI alert service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps a confirmation and treats a repeated request as idempotent', async () => {
    confirmMock.mockResolvedValueOnce({ kind: 'confirmed', alert });
    await expect(aiAlertsService.confirmAlertAsIncident('alert-1', {}, actor, context))
      .resolves.toMatchObject({ id: 'alert-1', status: 'confirmed', changed: true });
    confirmMock.mockResolvedValueOnce({ kind: 'already_confirmed', alert });
    await expect(aiAlertsService.confirmAlertAsIncident('alert-1', {}, actor, context))
      .resolves.toMatchObject({ changed: false });
  });

  it('enforces permission, existence and lifecycle transitions', async () => {
    await expect(aiAlertsService.confirmAlertAsIncident(
      'alert-1', {}, { userId: 'user-1', permissions: [] }, context,
    )).rejects.toMatchObject({ statusCode: 403 });
    confirmMock.mockResolvedValueOnce({ kind: 'not_found' });
    await expect(aiAlertsService.confirmAlertAsIncident('missing', {}, actor, context))
      .rejects.toMatchObject({ statusCode: 404 });
    confirmMock.mockResolvedValueOnce({ kind: 'invalid_status', status: 'false_positive' });
    await expect(aiAlertsService.confirmAlertAsIncident('alert-1', {}, actor, context))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
