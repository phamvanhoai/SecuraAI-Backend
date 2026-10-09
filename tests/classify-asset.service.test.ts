import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';

vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({
  assetsRepository: { findActor: vi.fn(), findById: vi.fn(), classify: vi.fn() },
}));
const userId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const input = {
  confidentialityImpact: 5,
  integrityImpact: 4,
  availabilityImpact: 5,
  businessImpact: 4,
  dataClassification: 'restricted' as const,
    dataClassificationBasis: 'Only approved public information is handled; no sensitive records are stored.',
  rationale: 'Disclosure of customer records would cause severe business harm.',
};

describe('assetsService.classify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows only Security Officers', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await expect(assetsService.classify(userId, assetId, input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(assetsRepository.findById).not.toHaveBeenCalled();
  });

  it('calculates criticality and updates data classification', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(assetsRepository.findById).mockResolvedValue({
      status: 'ACTIVE',
      criticality: 'medium',
      data_classification: 'internal',
    } as never);
    vi.mocked(assetsRepository.classify).mockResolvedValue({
      kind: 'updated',
      asset: {
        id: assetId,
        criticality: 'critical',
        data_classification: 'restricted',
        classified_at: new Date('2026-09-30T06:00:00Z'),
      },
      previous: { status: 'ACTIVE', criticality: 'MEDIUM', data_classification: 'INTERNAL' },
    });
    await expect(assetsService.classify(userId, assetId, input)).resolves.toMatchObject({
      criticality: 'critical',
      dataClassification: 'restricted',
      score: 5,
      changed: true,
      previousCriticality: 'medium',
      methodVersion: 'SECURAAI-ASSET-IMPACT-v1',
    });
    expect(assetsRepository.classify).toHaveBeenCalledWith(
      assetId,
      'critical',
      input,
      userId,
      'SECURAAI-ASSET-IMPACT-v1',
    );
  });

  it('rejects archived assets', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ARCHIVED' } as never);
    await expect(assetsService.classify(userId, assetId, input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ASSET_ARCHIVED',
    });
  });
  it.each(['forbidden', 'archived', 'not_found'] as const)(
    'handles transactional state %s',
    async (kind) => {
      vi.mocked(assetsRepository.findActor).mockResolvedValue({
        role: 'SECURITY_OFFICER',
        status: 'ACTIVE',
      });
      vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE' } as never);
      vi.mocked(assetsRepository.classify).mockResolvedValue({ kind });
      await expect(assetsService.classify(userId, assetId, input)).rejects.toMatchObject({
        statusCode: kind === 'forbidden' ? 403 : kind === 'archived' ? 409 : 404,
      });
    },
  );
  it.each([
    ['P2034', 409],
    ['P2028', 503],
  ])('normalizes transaction errors %s', async (code, statusCode) => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE' } as never);
    vi.mocked(assetsRepository.classify).mockRejectedValue({ code });
    await expect(assetsService.classify(userId, assetId, input)).rejects.toMatchObject({
      statusCode,
    });
  });
});
