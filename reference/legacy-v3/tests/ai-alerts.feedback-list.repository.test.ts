import { beforeEach, describe, expect, it, vi } from 'vitest';

const { alertFindMock, countMock, findManyMock, transactionMock } = vi.hoisted(() => ({
  alertFindMock: vi.fn(),
  countMock: vi.fn(),
  findManyMock: vi.fn(),
  transactionMock: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    ai_alerts: { findUnique: alertFindMock },
    ai_feedback: { count: countMock, findMany: findManyMock },
    $transaction: transactionMock,
  },
}));

import { aiAlertsRepository } from '../src/modules/ai-alerts/ai-alerts.repository.js';

describe('AI alert feedback history repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockResolvedValue([2, [{ ai_feedback_id: 'feedback-1' }]]);
  });

  it('returns not found without querying feedback', async () => {
    alertFindMock.mockResolvedValue(null);
    await expect(
      aiAlertsRepository.listAlertFeedback('missing', { page: 1, limit: 20, sortOrder: 'desc' }),
    ).resolves.toEqual({ exists: false, items: [], total: 0 });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('uses bounded pagination and deterministic ordering', async () => {
    alertFindMock.mockResolvedValue({ ai_alert_id: 'alert-1' });
    await expect(
      aiAlertsRepository.listAlertFeedback('alert-1', { page: 2, limit: 10, sortOrder: 'asc' }),
    ).resolves.toMatchObject({ exists: true, total: 2 });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ created_at: 'asc' }, { ai_feedback_id: 'asc' }],
      }),
    );
  });
});
