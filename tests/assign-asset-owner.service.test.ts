import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { findActor: vi.fn(), findById: vi.fn(), validateCreateReferences: vi.fn(), assignOwner: vi.fn() } }));
const userId = '11111111-1111-4111-8111-111111111111'; const assetId = '22222222-2222-4222-8222-222222222222'; const ownerId = '33333333-3333-4333-8333-333333333333';
describe('assetsService.assignOwner', () => {
  beforeEach(() => vi.clearAllMocks());
  it('allows only Security Officers', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' }); await expect(assetsService.assignOwner(userId, assetId, { ownerUserId: ownerId, reason: 'Accountability' })).rejects.toMatchObject({ statusCode: 403 }); });
  it('rejects inactive or unknown owners', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' }); vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE', owner_user_id: null, users_assets_owner_user_idTousers: null } as never); vi.mocked(assetsRepository.validateCreateReferences).mockResolvedValue({ ownerValid: false, serviceValid: true, dependenciesValid: true, eventSourcesValid: true }); await expect(assetsService.assignOwner(userId, assetId, { ownerUserId: ownerId, reason: 'Accountability' })).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_ASSET_OWNER' }); });
});
