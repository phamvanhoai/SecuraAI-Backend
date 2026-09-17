import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listAlertThresholds: vi.fn(), setAlertThreshold: vi.fn() }));
vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({ aiAlertsRepository: mocks }));

import { aiAlertsService } from '../src/modules/ai-alerts/ai-alerts.service.js';

const actor = { userId: 'user-1', permissions: ['ai-alerts.thresholds.manage'] };
const context = { ipAddress: null, userAgent: null };

describe('AI alert threshold service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the threshold management permission', async () => {
    await expect(
      aiAlertsService.listAlertThresholds({ page: 1, limit: 20 }, { userId: 'user-2', permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 404 when the selected asset does not exist', async () => {
    mocks.setAlertThreshold.mockResolvedValue(null);
    await expect(
      aiAlertsService.setAlertThreshold(
        '00000000-0000-4000-8000-000000000001',
        { threshold: 0.8, riskLevelMin: 'high', enabled: true },
        actor,
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });
  });
});
