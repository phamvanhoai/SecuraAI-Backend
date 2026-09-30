import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';

vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { findActor: vi.fn(), findById: vi.fn(), classify: vi.fn() } }));
const userId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const input = { confidentialityImpact: 5, integrityImpact: 4, availabilityImpact: 5, businessImpact: 4, dataClassification: 'restricted' as const };

describe('assetsService.classify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows only Security Officers', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await expect(assetsService.classify(userId, assetId, input)).rejects.toMatchObject({ statusCode: 403 });
    expect(assetsRepository.findById).not.toHaveBeenCalled();
  });

  it('calculates criticality and updates data classification', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE', criticality: 'medium', data_classification: 'internal' } as never);
    vi.mocked(assetsRepository.classify).mockResolvedValue({ id: assetId, criticality: 'critical', data_classification: 'restricted', updated_at: new Date('2026-09-30T06:00:00Z') });
    await expect(assetsService.classify(userId, assetId, input)).resolves.toMatchObject({ criticality: 'critical', dataClassification: 'restricted', score: 4.55, changed: true });
    expect(assetsRepository.classify).toHaveBeenCalledWith(assetId, 'critical', input);
  });

  it('rejects archived assets', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ARCHIVED' } as never);
    await expect(assetsService.classify(userId, assetId, input)).rejects.toMatchObject({ statusCode: 409, code: 'ASSET_ARCHIVED' });
  });
});
