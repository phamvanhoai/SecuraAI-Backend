import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { classificationHistory: vi.fn() } }));
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
const id = '11111111-1111-4111-8111-111111111111';
const snapshot = {
  confidentialityImpact: 1, integrityImpact: 2, availabilityImpact: 5, businessImpact: 3,
  criticality: 'critical', dataClassification: 'public', rationale: 'Availability affects essential service.',
  dataClassificationBasis: 'Only public approved information is handled.', methodVersion: 'SECURAAI-ASSET-IMPACT-v1',
  dataClassificationMethodVersion: 'SECURAAI-DATA-CLASSIFICATION-v1', assessedBy: id, assessedAt: '2026-10-26T12:00:00.000Z',
};
beforeEach(() => vi.resetAllMocks());
describe('classification history projection', () => {
  it('returns validated snapshots and no unrelated audit metadata', async () => {
    vi.mocked(assetsRepository.classificationHistory).mockResolvedValue({ total: 1, items: [{
      id, occurred_at: new Date(), users: { id, full_name: 'Officer' },
      before_data: null, after_data: { ...snapshot, internal: 'do not expose' },
    }] });
    const result = await assetsService.classificationHistory(id, id, { page: 1, limit: 10 });
    expect(result.items[0]).toMatchObject({ before: null, after: snapshot, actor: { id, fullName: 'Officer' } });
    expect(result.items[0]?.after).not.toHaveProperty('internal');
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });
  it('keeps unknown legacy fields null instead of inventing scores or rationales', async () => {
    const legacy = { ...snapshot, confidentialityImpact: null, rationale: null, assessedAt: null, assessedBy: null };
    vi.mocked(assetsRepository.classificationHistory).mockResolvedValue({ total: 1, items: [{ id, occurred_at: new Date(), users: null, before_data: legacy, after_data: snapshot }] });
    expect((await assetsService.classificationHistory(id, id, { page: 1, limit: 10 })).items[0]).toMatchObject({ actor: null, before: legacy });
  });
  it('does not expose malformed payloads', async () => {
    vi.mocked(assetsRepository.classificationHistory).mockResolvedValue({ total: 1, items: [{ id, occurred_at: new Date(), users: null, before_data: { sensitive: 'hidden' }, after_data: null }] });
    expect((await assetsService.classificationHistory(id, id, { page: 1, limit: 10 })).items[0]).toMatchObject({ before: null, after: null });
  });
});
