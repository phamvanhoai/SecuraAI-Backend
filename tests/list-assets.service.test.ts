import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { findActor: vi.fn(), list: vi.fn(), findById: vi.fn() } }));
const userId = '11111111-1111-4111-8111-111111111111';
const query = { page: 1, limit: 10, sortBy: 'assetCode' as const, sortOrder: 'asc' as const };
describe('assetsService.list', () => {
  beforeEach(() => vi.clearAllMocks());
  it('scopes a non-officer list to assets they own', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' }); vi.mocked(assetsRepository.list).mockResolvedValue([0, []]); await assetsService.list(userId, query); expect(assetsRepository.list).toHaveBeenCalledWith({ ...query, ownerUserId: userId }); });
  it('maps a paginated asset directory for a Security Officer', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' }); vi.mocked(assetsRepository.list).mockResolvedValue([1, [{ id: userId, asset_code: 'AST-001', name: 'Core Server', asset_type: 'server', criticality: 'HIGH', data_classification: 'CONFIDENTIAL', description: null, status: 'ACTIVE', owner_user_id: null, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-02T00:00:00Z'), users_assets_owner_user_idTousers: null, business_services: null }]]); const result = await assetsService.list(userId, query); expect(assetsRepository.list).toHaveBeenCalledWith(query); expect(result.items[0]).toMatchObject({ assetCode: 'AST-001', status: 'active', criticality: 'high', dataClassification: 'confidential' }); expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 }); });
  it('returns not found for an unknown asset', async () => { vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' }); vi.mocked(assetsRepository.findById).mockResolvedValue(null); await expect(assetsService.get(userId, userId)).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' }); });
});
