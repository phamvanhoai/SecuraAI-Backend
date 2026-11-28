import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), query: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { assets: { findMany: mocks.findMany }, $queryRaw: mocks.query } }));
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetDependencyOptionsQuerySchema } from '../src/modules/it-asset-management/dto/link-asset-context.dto.js';

describe('dependency option eligibility', () => {
  beforeEach(() => vi.resetAllMocks());
  it('marks a candidate reaching the edited asset as blocked and keeps safe candidates selectable', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'blocked', asset_code: 'AST-B', name: 'Blocked', status: 'ACTIVE' },
      { id: 'safe', asset_code: 'AST-C', name: 'Safe', status: 'ACTIVE' },
    ]);
    mocks.query.mockResolvedValue([{ candidate_id: 'blocked', path: ['A', 'B', 'D', 'A'] }]);
    const result = await assetsRepository.dependencyOptions('edited', 'Server');
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { not: 'edited' }, status: 'ACTIVE', OR: [
        { asset_code: { contains: 'Server', mode: 'insensitive' } },
        { name: { contains: 'Server', mode: 'insensitive' } },
      ] }, take: 10, orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    }));
    expect(result[0]).toMatchObject({ canSelect: false, cyclePath: ['A', 'B', 'D', 'A'], blockedReason: expect.any(String) });
    expect(result[1]).toMatchObject({ canSelect: true, cyclePath: [], blockedReason: null });
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it('does not query the graph for an empty result', async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await assetsRepository.dependencyOptions('edited', '')).toEqual([]);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('bounds search and rejects unsupported query fields', () => {
    expect(assetDependencyOptionsQuerySchema.parse({})).toEqual({ q: '' });
    expect(assetDependencyOptionsQuerySchema.parse({ q: ' name ' })).toEqual({ q: 'name' });
    expect(assetDependencyOptionsQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
    expect(assetDependencyOptionsQuerySchema.safeParse({ page: 2 }).success).toBe(false);
  });
});
