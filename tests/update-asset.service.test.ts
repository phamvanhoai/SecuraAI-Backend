import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { findActor: vi.fn(), findById: vi.fn(), update: vi.fn() } }));
const userId = '11111111-1111-4111-8111-111111111111'; const assetId = '22222222-2222-4222-8222-222222222222';
const input = { name: 'Server', assetType: 'server', description: null };
describe('assetsService.update', () => {
  beforeEach(() => vi.clearAllMocks());
  it('allows only Security Officers', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' }); await expect(assetsService.update(userId, assetId, input)).rejects.toMatchObject({ statusCode: 403 }); });
  it('rejects archived assets', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' }); vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ARCHIVED' } as never); await expect(assetsService.update(userId, assetId, input)).rejects.toMatchObject({ statusCode: 409, code: 'ASSET_ARCHIVED' }); });
});
