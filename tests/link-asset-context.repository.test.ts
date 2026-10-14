import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const tx = {
    users: { findUnique: vi.fn() },
    assets: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    business_services: { findFirst: vi.fn() },
    event_sources: { count: vi.fn() },
    asset_dependencies: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return { tx, transaction: vi.fn() };
});
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
const input = { businessServiceId: 'service', dependencyIds: ['B'], eventSourceIds: ['source'] };
describe('atomic asset context update', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    mocks.tx.assets.findUnique.mockResolvedValue({ status: 'ACTIVE', business_service_id: 'service', asset_dependencies_asset_dependencies_asset_idToassets: [{ depends_on_asset_id: 'B' }], asset_event_sources: [{ event_source_id: 'source' }] });
    mocks.tx.assets.count.mockResolvedValue(0);
    mocks.tx.event_sources.count.mockResolvedValue(0);
    mocks.tx.asset_dependencies.findMany.mockResolvedValue([]);
    mocks.tx.$queryRaw.mockResolvedValue([{ has_cycle: false }]);
    mocks.tx.assets.update.mockResolvedValue({ id: 'A', updated_at: new Date() });
  });
  it('retains old links including inactive records without recreating metadata', async () => {
    expect(await assetsRepository.linkContext('A', input, 'officer')).toMatchObject({ kind: 'updated' });
    expect(mocks.tx.business_services.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.assets.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ asset_dependencies_asset_dependencies_asset_idToassets: { deleteMany: { depends_on_asset_id: { notIn: ['B'] } }, create: [] }, asset_event_sources: { deleteMany: { event_source_id: { notIn: ['source'] } }, create: [] } }) }));
    expect(mocks.tx.assets.count).not.toHaveBeenCalled();
    expect(mocks.tx.event_sources.count).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
  });
  it('rejects a multi-hop cycle before writing', async () => {
    mocks.tx.$queryRaw.mockResolvedValue([{ has_cycle: true }]);
    expect(await assetsRepository.linkContext('A', input, 'officer')).toEqual({ kind: 'cycle' });
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
  });
  it('rejects newly linked inactive dependencies', async () => {
    expect(await assetsRepository.linkContext('A', { ...input, dependencyIds: ['inactive-new'] }, 'officer')).toEqual({ kind: 'invalid_dependency' });
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
  });
  it('allows explicit removal of all relations', async () => {
    expect(await assetsRepository.linkContext('A', { businessServiceId: null, dependencyIds: [], eventSourceIds: [] }, 'officer')).toMatchObject({ kind: 'updated' });
    expect(mocks.tx.assets.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ business_service_id: null, asset_dependencies_asset_dependencies_asset_idToassets: { deleteMany: { depends_on_asset_id: { notIn: [] } }, create: [] } }) }));
  });
  it('rechecks archived state in the transaction', async () => {
    mocks.tx.assets.findUnique.mockResolvedValue({ status: 'ARCHIVED' });
    expect(await assetsRepository.linkContext('A', input, 'officer')).toEqual({ kind: 'archived' });
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
  });
});
