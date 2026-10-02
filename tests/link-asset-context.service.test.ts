import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';

vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { findActor: vi.fn(), findById: vi.fn(), validateCreateReferences: vi.fn(), linkContext: vi.fn() } }));
const userId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const relatedId = '33333333-3333-4333-8333-333333333333';
const input = { businessServiceId: relatedId, dependencyIds: [relatedId], eventSourceIds: [relatedId] };

describe('assetsService.linkContext', () => {
  beforeEach(() => vi.clearAllMocks());
  it('validates and replaces the asset context links', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE' } as never);
    vi.mocked(assetsRepository.validateCreateReferences).mockResolvedValue({ ownerValid: true, serviceValid: true, dependenciesValid: true, eventSourcesValid: true });
    vi.mocked(assetsRepository.linkContext).mockResolvedValue({ kind: 'updated', asset: { id: assetId, updated_at: new Date('2026-09-30T07:00:00Z') } });
    await expect(assetsService.linkContext(userId, assetId, input)).resolves.toMatchObject({ assetId, ...input });
  });
  it('rejects self-dependencies', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE' } as never);
    await expect(assetsService.linkContext(userId, assetId, { ...input, dependencyIds: [assetId] })).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_ASSET_DEPENDENCY' });
  });
  it('rejects a circular dependency without updating', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE' } as never);
    vi.mocked(assetsRepository.linkContext).mockResolvedValue({ kind: 'cycle' });
    await expect(assetsService.linkContext(userId, assetId, input)).rejects.toMatchObject({ statusCode: 422, code: 'ASSET_DEPENDENCY_CYCLE' });
  });
  it('reports concurrent context writes as a retryable conflict', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE' } as never);
    vi.mocked(assetsRepository.linkContext).mockRejectedValue({ code: 'P2034' });
    await expect(assetsService.linkContext(userId, assetId, input)).rejects.toMatchObject({ statusCode: 409, code: 'ASSET_CONTEXT_CONFLICT' });
  });
  it('reports expired transactions as temporary unavailability', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE' } as never);
    vi.mocked(assetsRepository.linkContext).mockRejectedValue({ code: 'P2028' });
    await expect(assetsService.linkContext(userId, assetId, input)).rejects.toMatchObject({ statusCode: 503, code: 'ASSET_CONTEXT_TRANSACTION_UNAVAILABLE' });
  });
});
