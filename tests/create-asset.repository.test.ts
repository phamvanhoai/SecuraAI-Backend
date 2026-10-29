import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), owner: vi.fn(), lock: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: {
  $transaction: (callback: (tx: unknown) => unknown) => callback({ assets: { create: mocks.create }, users: { findFirst: mocks.owner }, $queryRaw: mocks.lock }),
} }));
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
describe('create asset without classification', () => {
  beforeEach(() => vi.resetAllMocks());
  it('persists null classification and service, never an implicit level', async () => {
    await assetsRepository.create('officer', 'AST-12AB34CD', { name: 'New server', assetType: 'SERVER', dependencies: [], eventSourceIds: [] });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      asset_code: 'AST-12AB34CD', criticality: null, data_classification: null, business_service_id: null, created_by: 'officer',
    }) }));
  });
  it('rejects an Employee without Asset Owner eligibility before persisting', async () => {
    mocks.owner.mockResolvedValue(null);
    await expect(assetsRepository.create('officer', 'AST-12AB34CD', {
      name: 'New server', assetType: 'SERVER', dependencies: [], eventSourceIds: [], ownerUserId: 'employee',
    })).rejects.toMatchObject({ code: 'INVALID_ASSET_OWNER' });
    expect(mocks.lock).toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
