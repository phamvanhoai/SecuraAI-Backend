import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { contextHistory: vi.fn() } }));
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => vi.resetAllMocks());
describe('context history response projection', () => {
  it('returns only validated snapshots and minimal actor fields', async () => {
    const snapshot = { businessService: null, dependencies: [], eventSources: [] };
    vi.mocked(assetsRepository.contextHistory).mockResolvedValue({ total: 1, items: [{
      id, occurred_at: new Date(), users: { id, full_name: 'Officer' },
      before_data: { ...snapshot, internal: 'do not expose' }, after_data: snapshot,
    }] });
    const result = await assetsService.contextHistory(id, id, { page: 1, limit: 10 });
    expect(result.items[0]).toMatchObject({ actor: { id, fullName: 'Officer' }, before: snapshot, after: snapshot });
    expect(result.items[0]?.before).not.toHaveProperty('internal');
    expect(result.pagination.totalPages).toBe(1);
  });
  it('does not expose malformed legacy payloads or invent actors', async () => {
    vi.mocked(assetsRepository.contextHistory).mockResolvedValue({ total: 1, items: [{ id, occurred_at: new Date(), users: null, before_data: { secret: 'hidden' }, after_data: null }] });
    expect((await assetsService.contextHistory(id, id, { page: 1, limit: 10 })).items[0]).toMatchObject({ actor: null, before: null, after: null });
  });
});
