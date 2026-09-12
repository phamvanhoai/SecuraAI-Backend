import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));
vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { listAlertFeedback: listMock },
}));

import { aiAlertsService } from '../src/modules/ai-alerts/ai-alerts.service.js';

const query = { page: 1, limit: 20, sortOrder: 'desc' as const };
const actor = { userId: 'user-1', permissions: ['ai-alerts.feedback'] };

describe('list AI alert feedback service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps feedback and pagination', async () => {
    listMock.mockResolvedValue({
      exists: true,
      items: [
        {
          ai_feedback_id: 'feedback-1',
          ai_alert_id: 'alert-1',
          reviewed_by_user_id: 'user-1',
          feedback_label: 'needs_review',
          comment: null,
          created_at: new Date('2026-09-13T00:00:00Z'),
        },
      ],
      total: 21,
    });
    await expect(aiAlertsService.listAlertFeedback('alert-1', query, actor)).resolves.toMatchObject(
      {
        items: [{ id: 'feedback-1', feedbackLabel: 'needs_review' }],
        pagination: { page: 1, limit: 20, total: 21, totalPages: 2 },
      },
    );
  });

  it('enforces permission and reports a missing alert', async () => {
    await expect(
      aiAlertsService.listAlertFeedback('alert-1', query, { userId: 'user-1', permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403 });
    listMock.mockResolvedValue({ exists: false, items: [], total: 0 });
    await expect(aiAlertsService.listAlertFeedback('missing', query, actor)).rejects.toMatchObject({
      statusCode: 404,
      code: 'AI_ALERT_NOT_FOUND',
    });
  });
});
