import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  tx: { $queryRaw: vi.fn(), users: { findUnique: vi.fn() }, assets: { findUnique: vi.fn(), update: vi.fn() }, asset_dependencies: { count: vi.fn(), findMany: vi.fn() }, audit_logs: { create: vi.fn() } },
  transaction: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
describe('atomic archive', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    mocks.tx.assets.findUnique.mockResolvedValue({ status: 'ACTIVE', archived_at: null });
    mocks.tx.asset_dependencies.count.mockResolvedValue(0);
    mocks.tx.$queryRaw.mockResolvedValue([{ at: new Date('2026-10-02T00:00:00Z') }]);
  });
  const archive = () => assetsRepository.archive('asset', 'officer', 'Retired', 'request');
  it('writes metadata and audit together in a serializable transaction', async () => {
    expect(await archive()).toEqual({ kind: 'updated' });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    expect(mocks.tx.assets.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ARCHIVED', archived_by: 'officer', archive_reason: 'Retired', archived_at: expect.any(Date) }) }));
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actor_user_id: 'officer', action: 'ASSET_ARCHIVED', resource_id: 'asset', correlation_id: 'request', record_hash: expect.stringMatching(/^[a-f0-9]{64}$/), after_data: expect.objectContaining({ archiveReason: 'Retired' }) }) }));
  });
  it('checks incoming active dependencies and preserves links', async () => {
    mocks.tx.asset_dependencies.count.mockResolvedValue(1);
    mocks.tx.asset_dependencies.findMany.mockResolvedValue([]);
    expect(await archive()).toMatchObject({ kind: 'dependencies', count: 1 });
    expect(mocks.tx.asset_dependencies.count).toHaveBeenCalledWith({ where: { depends_on_asset_id: 'asset', assets_asset_dependencies_asset_idToassets: { status: 'ACTIVE' } } });
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('rechecks asset status', async () => {
    mocks.tx.assets.findUnique.mockResolvedValue({ status: 'ARCHIVED', archived_at: new Date() });
    expect(await archive()).toEqual({ kind: 'archived' });
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
  });
  it('rechecks actor status', async () => {
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
    expect(await archive()).toEqual({ kind: 'forbidden' });
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
  });
  it('propagates audit failure so the transaction cannot commit', async () => {
    mocks.tx.audit_logs.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(archive()).rejects.toThrow('audit unavailable');
  });
});
