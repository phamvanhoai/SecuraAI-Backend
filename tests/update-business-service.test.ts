import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    users: { findUnique: vi.fn(), findFirst: vi.fn() },
    business_services: { findUnique: vi.fn(), update: vi.fn() },
    audit_logs: { create: vi.fn() },
  },
  transaction: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));
import { businessServicesRepository as repository } from '../src/modules/it-asset-management/business-services.repository.js';
import { updateBusinessServiceSchema as schema } from '../src/modules/it-asset-management/dto/update-business-service.dto.js';
const id = '00000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-10-07T00:00:00.000Z';
const current = {
  id,
  name: 'Support',
  description: 'Purpose',
  status: 'ACTIVE',
  owner_user_id: id,
  users: { id, full_name: 'Former owner', status: 'INACTIVE' },
  updated_at: new Date(expectedUpdatedAt),
  created_at: new Date(expectedUpdatedAt),
  _count: { assets: 3 },
};
describe('Edit service validation', () => {
  it('accepts patch and explicit clear', () => {
    expect(schema.parse({ expectedUpdatedAt, name: ' Support  Updated ' })).toMatchObject({
      name: 'Support Updated',
    });
    expect(
      schema.safeParse({ expectedUpdatedAt, ownerUserId: null, description: null }).success,
    ).toBe(true);
  });
  it.each([
    { expectedUpdatedAt },
    { name: 'Support' },
    { expectedUpdatedAt, name: ' ' },
    { expectedUpdatedAt, status: 'ACTIVE' },
    { expectedUpdatedAt, id },
    { expectedUpdatedAt, assets: [] },
    { expectedUpdatedAt, createdAt: expectedUpdatedAt },
  ])('rejects missing version and noneditable fields %j', (value) =>
    expect(schema.safeParse(value).success).toBe(false),
  );
});
describe('Atomic metadata Edit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (cb: (tx: typeof mocks.tx) => Promise<unknown>) =>
      cb(mocks.tx),
    );
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    mocks.tx.users.findFirst.mockResolvedValue({ id });
    mocks.tx.business_services.findUnique.mockResolvedValue(current);
    mocks.tx.business_services.update.mockResolvedValue(current);
  });
  it('changes only allowed fields and audits old/new values', async () => {
    await repository.update(id, id, { expectedUpdatedAt, name: 'Support Updated' });
    expect(mocks.tx.business_services.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Support Updated', description: 'Purpose', owner_user_id: id },
      }),
    );
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'BUSINESS_SERVICE_UPDATED',
          actor_user_id: id,
          before_data: { name: 'Support', description: 'Purpose', ownerUserId: id },
          after_data: { name: 'Support Updated', description: 'Purpose', ownerUserId: id },
        }),
      }),
    );
    expect(mocks.tx.users.findFirst).not.toHaveBeenCalled();
  });
  it('no-op retains timestamp and has no audit', async () => {
    await repository.update(id, id, { expectedUpdatedAt, name: 'Support', ownerUserId: id });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('explicit null clears fields; omitted fields remain', async () => {
    await repository.update(id, id, { expectedUpdatedAt, ownerUserId: null, description: null });
    expect(mocks.tx.business_services.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Support', owner_user_id: null, description: null },
      }),
    );
  });
  it('rejects stale version without any writes', async () => {
    await expect(
      repository.update(id, id, { expectedUpdatedAt: '2026-10-06T00:00:00Z', name: 'New' }),
    ).rejects.toMatchObject({ code: 'BUSINESS_SERVICE_STALE' });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
  });
  it('rejects inactive service and not found', async () => {
    mocks.tx.business_services.findUnique.mockResolvedValue({ ...current, status: 'INACTIVE' });
    await expect(
      repository.update(id, id, { expectedUpdatedAt, name: 'New' }),
    ).rejects.toMatchObject({ code: 'BUSINESS_SERVICE_INACTIVE' });
    mocks.tx.business_services.findUnique.mockResolvedValue(null);
    await expect(
      repository.update(id, id, { expectedUpdatedAt, name: 'New' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
  });
  it('rejects another service normalized duplicate', async () => {
    mocks.tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id }]);
    await expect(
      repository.update(id, id, { expectedUpdatedAt, name: 'Other' }),
    ).rejects.toMatchObject({ code: 'BUSINESS_SERVICE_NAME_EXISTS' });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
  });
  it('validates newly assigned owner', async () => {
    mocks.tx.users.findFirst.mockResolvedValue(null);
    await expect(
      repository.update(id, id, {
        expectedUpdatedAt,
        ownerUserId: '00000000-0000-4000-8000-000000000002',
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
  });
  it.each([
    { role: 'EMPLOYEE', status: 'ACTIVE', code: 403 },
    { role: 'SECURITY_OFFICER', status: 'INACTIVE', code: 401 },
  ])('rechecks actor %j', async (actor) => {
    mocks.tx.users.findUnique.mockResolvedValue(actor);
    await expect(
      repository.update(id, id, { expectedUpdatedAt, name: 'New' }),
    ).rejects.toMatchObject({ statusCode: actor.code });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
  });
  it('propagates audit failure to rollback', async () => {
    mocks.tx.audit_logs.create.mockRejectedValue(new Error('Audit failed'));
    await expect(repository.update(id, id, { expectedUpdatedAt, name: 'New' })).rejects.toThrow(
      'Audit failed',
    );
  });
});
