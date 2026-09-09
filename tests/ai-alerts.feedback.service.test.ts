import { beforeEach, describe, expect, it, vi } from 'vitest';

const { evaluateMock } = vi.hoisted(() => ({ evaluateMock: vi.fn() }));
vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { evaluateAlertReliability: evaluateMock },
}));

import { aiAlertsService } from '../src/modules/ai-alerts/ai-alerts.service.js';

const actor = { userId: 'user-1', permissions: ['ai-alerts.feedback'] };
const context = { ipAddress: '192.0.2.1', userAgent: 'test' };

describe('evaluate AI alert reliability service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records and maps analyst feedback', async () => {
    evaluateMock.mockResolvedValue({
      ai_feedback_id: 'feedback-1', ai_alert_id: 'alert-1', reviewed_by_user_id: 'user-1',
      feedback_label: 'needs_review', comment: 'Check source', created_at: new Date('2026-09-09T00:00:00Z'),
    });
    await expect(aiAlertsService.evaluateAlertReliability(
      'alert-1', { feedbackLabel: 'needs_review', comment: 'Check source' }, actor, context,
    )).resolves.toMatchObject({ id: 'feedback-1', alertId: 'alert-1', feedbackLabel: 'needs_review' });
    expect(evaluateMock).toHaveBeenCalledWith('alert-1', expect.any(Object), {
      actorUserId: 'user-1', ...context,
    });
  });

  it('enforces permission and reports a missing alert', async () => {
    await expect(aiAlertsService.evaluateAlertReliability(
      'alert-1', { feedbackLabel: 'needs_review' }, { userId: 'user-1', permissions: [] }, context,
    )).rejects.toMatchObject({ statusCode: 403 });
    evaluateMock.mockResolvedValue(null);
    await expect(aiAlertsService.evaluateAlertReliability(
      'missing', { feedbackLabel: 'needs_review' }, actor, context,
    )).rejects.toMatchObject({ statusCode: 404, code: 'AI_ALERT_NOT_FOUND' });
  });
});
