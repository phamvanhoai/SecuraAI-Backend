import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const tx = {
    users: { findUnique: vi.fn() },
    assets: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    business_services: { findFirst: vi.fn() },
    event_sources: { count: vi.fn() },
    asset_dependencies: { findMany: vi.fn() },
    audit_logs: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
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
    mocks.tx.assets.findUnique.mockResolvedValue({ id: 'A', updated_at: new Date(), owner_user_id: 'owner', status: 'ACTIVE', business_service_id: 'service', business_services: { id: 'service', name: 'Payments' }, asset_dependencies_asset_dependencies_asset_idToassets: [{ depends_on_asset_id: 'B', assets_asset_dependencies_depends_on_asset_idToassets: { id: 'B', asset_code: 'AST-B', name: 'Database' } }], asset_event_sources: [{ event_source_id: 'source', event_sources: { id: 'source', name: 'Server logs' } }] });
    mocks.tx.assets.count.mockResolvedValue(0);
    mocks.tx.event_sources.count.mockResolvedValue(0);
    mocks.tx.asset_dependencies.findMany.mockResolvedValue([]);
    mocks.tx.$queryRaw.mockResolvedValue([{ has_cycle: false }]);
    mocks.tx.assets.update.mockResolvedValue({ id: 'A', updated_at: new Date(), business_services: null, asset_dependencies_asset_dependencies_asset_idToassets: [], asset_event_sources: [] });
  });
  it('retains old links including inactive records without recreating metadata', async () => {
    expect(await assetsRepository.linkContext('A', input, 'officer')).toMatchObject({ kind: 'updated' });
    expect(mocks.tx.business_services.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
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
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'ASSET_CONTEXT_UPDATED', actor_user_id: 'officer', resource_id: 'A', resource_type: 'ASSET',
      before_data: { businessService: { id: 'service', name: 'Payments' }, dependencies: [{ id: 'B', assetCode: 'AST-B', name: 'Database' }], eventSources: [{ id: 'source', name: 'Server logs' }] },
      after_data: { businessService: null, dependencies: [], eventSources: [] },
    }) });
  });
  it('propagates audit failure from the same transaction rather than reporting success', async () => {
    mocks.tx.audit_logs.create.mockRejectedValue(new Error('audit failed'));
    await expect(assetsRepository.linkContext('A', { businessServiceId: null, dependencyIds: [], eventSourceIds: [] }, 'officer')).rejects.toThrow('audit failed');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it('ignores array order when comparing link sets', async () => {
    const current = await mocks.tx.assets.findUnique();
    mocks.tx.assets.findUnique.mockResolvedValue({ ...current, asset_event_sources: [
      { event_source_id: 'second', event_sources: { id: 'second', name: 'Second source' } },
      { event_source_id: 'source', event_sources: { id: 'source', name: 'Server logs' } },
    ] });
    await assetsRepository.linkContext('A', { ...input, eventSourceIds: ['source', 'second'] }, 'officer');
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('does not write on concurrent transaction conflicts', async () => {
    mocks.transaction.mockRejectedValue({ code: 'P2034' });
    await expect(assetsRepository.linkContext('A', input, 'officer')).rejects.toMatchObject({ code: 'P2034' });
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('rechecks archived state in the transaction', async () => {
    mocks.tx.assets.findUnique.mockResolvedValue({ status: 'ARCHIVED' });
    expect(await assetsRepository.linkContext('A', input, 'officer')).toEqual({ kind: 'archived' });
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
  });
  it.each(['EMPLOYEE', 'ADMIN', 'EXECUTIVE'])('rejects a non-officer writer (%s)', async (role) => {
    mocks.tx.users.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
    expect(await assetsRepository.linkContext('A', input, 'owner')).toEqual({ kind: 'forbidden' });
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
});

describe('asset context history access', () => {
  const query = { page: 2, limit: 10 };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    mocks.tx.assets.findUnique.mockResolvedValue({ owner_user_id: 'owner', status: 'ARCHIVED' });
    mocks.tx.audit_logs.count.mockResolvedValue(12);
    mocks.tx.audit_logs.findMany.mockResolvedValue([]);
  });
  it('allows current owner to read archived asset history, scoped and bounded', async () => {
    expect(await assetsRepository.contextHistory('A', 'owner', query)).toEqual({ total: 12, items: [] });
    expect(mocks.tx.audit_logs.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { resource_type: 'ASSET', resource_id: 'A', action: 'ASSET_CONTEXT_UPDATED' },
      skip: 10, take: 10, orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    }));
  });
  it('allows Security Officers without ownership', async () => {
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    await expect(assetsRepository.contextHistory('A', 'officer', query)).resolves.toMatchObject({ total: 12 });
  });
  it('rejects another user after reassignment', async () => {
    await expect(assetsRepository.contextHistory('A', 'former-owner', query)).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.tx.audit_logs.findMany).not.toHaveBeenCalled();
  });
  it('rejects inactive actors', async () => {
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
    await expect(assetsRepository.contextHistory('A', 'officer', query)).rejects.toMatchObject({ statusCode: 401 });
  });
  it('returns not found for a missing asset', async () => {
    mocks.tx.assets.findUnique.mockResolvedValue(null);
    await expect(assetsRepository.contextHistory('missing', 'owner', query)).rejects.toMatchObject({ statusCode: 404 });
  });
});
