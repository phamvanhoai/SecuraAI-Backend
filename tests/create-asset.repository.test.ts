import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { assets: { create: mocks.create } } }));
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
describe('create asset without classification', () => {
  beforeEach(() => vi.resetAllMocks());
  it('persists null classification and service, never an implicit level', async () => {
    await assetsRepository.create('officer', { assetCode: 'AST-NEW', name: 'New server', assetType: 'SERVER', dependencies: [], eventSourceIds: [] });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      criticality: null, data_classification: null, business_service_id: null, created_by: 'officer',
    }) }));
  });
});
