import { user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: {
    listActiveAssetOptions: vi.fn(),
    listAlertThresholds: vi.fn(),
    setAlertThreshold: vi.fn(),
  },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

const userId = '00000000-0000-4000-8000-000000000001';
const assetId = '00000000-0000-4000-8000-000000000002';
const record = {
  asset: { id: assetId, asset_code: 'AST-001', name: 'Gateway' },
  configuration: {
    threshold: 0.72,
    riskLevelMin: 'high' as const,
    enabled: true,
    updatedByUserId: userId,
    updatedAt: '2026-09-26T00:00:00.000Z',
  },
};

describe('asset alert threshold service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      role: user_role.SECURITY_OFFICER,
      status: user_status.ACTIVE,
    });
  });

  it('lists configured thresholds for a Security Officer', async () => {
    vi.mocked(aiAlertsRepository.listAlertThresholds).mockResolvedValue([1, [record]]);
    await expect(
      aiAlertsService.listAlertThresholds(userId, { page: 1, limit: 20 }),
    ).resolves.toMatchObject({
      items: [{ asset: { id: assetId }, threshold: 0.72 }],
      pagination: { total: 1, totalPages: 1 },
    });
  });

  it('lists active assets for threshold selection', async () => {
    vi.mocked(aiAlertsRepository.listActiveAssetOptions).mockResolvedValue([
      { id: assetId, asset_code: 'AST-001', name: 'Gateway' },
    ]);

    await expect(aiAlertsService.listActiveAssetOptions(userId)).resolves.toEqual([
      { id: assetId, assetCode: 'AST-001', name: 'Gateway' },
    ]);
  });

  it('upserts a custom threshold for an active asset', async () => {
    vi.mocked(aiAlertsRepository.setAlertThreshold).mockResolvedValue({
      outcome: 'saved',
      ...record,
    });
    await expect(
      aiAlertsService.setAlertThreshold(userId, assetId, {
        threshold: 0.72,
        riskLevelMin: 'high',
        enabled: true,
      }),
    ).resolves.toMatchObject({ id: assetId, threshold: 0.72 });
  });

  it('rejects non-Security Officer accounts', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      role: user_role.EXECUTIVE,
      status: user_status.ACTIVE,
    });
    await expect(
      aiAlertsService.listAlertThresholds(userId, { page: 1, limit: 20 }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});
