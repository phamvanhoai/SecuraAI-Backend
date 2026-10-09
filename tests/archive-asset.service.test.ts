import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { findActor: vi.fn(), findById: vi.fn(), archive: vi.fn() } }));
const userId = '11111111-1111-4111-8111-111111111111'; const assetId = '22222222-2222-4222-8222-222222222222';
describe('assetsService.archive', () => {
  beforeEach(() => vi.clearAllMocks());
  it('allows only Security Officers', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' }); await expect(assetsService.archive(userId, assetId, { reason: 'Retired' })).rejects.toMatchObject({ statusCode: 403 }); });
  it('rejects an already archived asset', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' }); vi.mocked(assetsRepository.archive).mockResolvedValue({ kind: 'archived' }); await expect(assetsService.archive(userId, assetId, { reason: 'Retired' })).rejects.toMatchObject({ statusCode: 409, code: 'ASSET_ALREADY_ARCHIVED' }); });
  it.each([['P2034', 409], ['P2028', 503]] as const)('maps transaction error %s', async (code, statusCode) => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.archive).mockRejectedValue({ code });
    await expect(assetsService.archive(userId, assetId, { reason: 'Retired' })).rejects.toMatchObject({ statusCode });
  });
  it('explains which active asset blocks archival', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.archive).mockResolvedValue({ kind: 'dependencies', count: 1, dependencies: [{ assets_asset_dependencies_asset_idToassets: { asset_code: 'AST-A', name: 'Application' } }] });
    await expect(assetsService.archive(userId, assetId, { reason: 'Retired' })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('AST-A') });
  });
});
