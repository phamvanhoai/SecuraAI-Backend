import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { findActor: vi.fn(), findById: vi.fn(), archive: vi.fn() } }));
const userId = '11111111-1111-4111-8111-111111111111'; const assetId = '22222222-2222-4222-8222-222222222222';
describe('assetsService.archive', () => {
  beforeEach(() => vi.clearAllMocks());
  it('allows only Security Officers', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' }); await expect(assetsService.archive(userId, assetId)).rejects.toMatchObject({ statusCode: 403 }); });
  it('rejects an already archived asset', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' }); vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ARCHIVED' } as never); await expect(assetsService.archive(userId, assetId)).rejects.toMatchObject({ statusCode: 409, code: 'ASSET_ALREADY_ARCHIVED' }); expect(assetsRepository.archive).not.toHaveBeenCalled(); });
});
