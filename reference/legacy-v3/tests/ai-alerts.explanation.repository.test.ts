import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUniqueMock } = vi.hoisted(() => ({ findUniqueMock: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { ai_alerts: { findUnique: findUniqueMock } },
}));

import { aiAlertsRepository } from '../src/modules/ai-alerts/ai-alerts.repository.js';

describe('AI alert explanation repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects only the latest explanation with deterministic ordering', async () => {
    const explanation = { ai_alert_explanation_id: 'explanation-1' };
    findUniqueMock.mockResolvedValue({
      ai_alert_id: 'alert-1',
      ai_alert_explanations: [explanation],
    });
    await expect(aiAlertsRepository.findLatestExplanation('alert-1')).resolves.toEqual({
      exists: true,
      explanation,
    });
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { ai_alert_id: 'alert-1' },
      select: {
        ai_alert_id: true,
        ai_alert_explanations: {
          select: {
            ai_alert_explanation_id: true,
            ai_alert_id: true,
            explanation_text: true,
            feature_contributions: true,
            baseline_data: true,
            created_at: true,
          },
          orderBy: [{ created_at: 'desc' }, { ai_alert_explanation_id: 'desc' }],
          take: 1,
        },
      },
    });
  });

  it('distinguishes an existing alert without an explanation from a missing alert', async () => {
    findUniqueMock.mockResolvedValueOnce({ ai_alert_id: 'alert-1', ai_alert_explanations: [] });
    await expect(aiAlertsRepository.findLatestExplanation('alert-1')).resolves.toEqual({
      exists: true,
      explanation: null,
    });
    findUniqueMock.mockResolvedValueOnce(null);
    await expect(aiAlertsRepository.findLatestExplanation('missing')).resolves.toEqual({
      exists: false,
      explanation: null,
    });
  });
});
