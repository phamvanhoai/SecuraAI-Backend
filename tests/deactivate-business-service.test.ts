import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    users: { findUnique: vi.fn() },
    business_services: { findUnique: vi.fn(), update: vi.fn() },
    assets: { count: vi.fn() },
    risks: { count: vi.fn() },
    audit_logs: { create: vi.fn() },
  },
  transaction: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));
import { businessServicesRepository as repository } from '../src/modules/it-asset-management/business-services.repository.js';
import { deactivateBusinessServiceSchema as schema } from '../src/modules/it-asset-management/dto/deactivate-business-service.dto.js';
const id = '00000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-10-07T00:00:00.000Z';
const input = {
  expectedUpdatedAt,
  confirmationName: 'Support',
  reason: 'Service retired after migration.',
};
const service = {
  id,
  name: 'Support',
  status: 'ACTIVE',
  description: 'Purpose retained',
  users: null,
  _count: { assets: 2 },
  created_at: new Date(expectedUpdatedAt),
  updated_at: new Date(expectedUpdatedAt),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (cb: (tx: typeof mocks.tx) => Promise<unknown>) =>
    cb(mocks.tx),
  );
  mocks.tx.$queryRaw.mockResolvedValue([]);
  mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  mocks.tx.business_services.findUnique.mockResolvedValue(service);
  mocks.tx.business_services.update.mockResolvedValue({ ...service, status: 'INACTIVE' });
  mocks.tx.assets.count.mockResolvedValue(0);
  mocks.tx.risks.count.mockResolvedValue(0);
});
describe('Deactivate input', () => {
  it('normalizes name whitespace and trims reason', () =>
    expect(
      schema.parse({ ...input, confirmationName: ' Support  Service ', reason: ' Reason ' }),
    ).toMatchObject({ confirmationName: 'Support Service', reason: 'Reason' }));
  it.each([
    { ...input, reason: '' },
    { ...input, reason: '  ' },
    { ...input, reason: 'a'.repeat(2001) },
    { ...input, confirmationName: '' },
    { ...input, confirmationName: 'a'.repeat(256) },
    { ...input, expectedUpdatedAt: 'yesterday' },
    { confirmationName: 'Support', reason: 'Reason' },
    { ...input, status: 'INACTIVE' },
    { ...input, ownerUserId: id },
    { ...input, assetIds: [] },
  ])('rejects invalid or noneditable body %j', (value) =>
    expect(schema.safeParse(value).success).toBe(false),
  );
});
describe('Atomic service retirement', () => {
  it('changes status only; preserves historical links and appends reason/actor audit', async () => {
    const result = await repository.deactivate(id, id, input);
    expect(result._count.assets).toBe(2);
    expect(mocks.tx.business_services.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'INACTIVE' } }),
    );
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor_user_id: id,
          resource_id: id,
          action: 'BUSINESS_SERVICE_DEACTIVATED',
          before_data: { status: 'ACTIVE' },
          after_data: { status: 'INACTIVE', reason: input.reason },
        }),
      }),
    );
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 15000,
    });
    expect(mocks.tx.risks.count).toHaveBeenCalledWith({
      where: { business_service_id: id, status: { notIn: ['CLOSED', 'ARCHIVED'] } },
    });
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it.each([
    [1, 0],
    [0, 1],
    [2, 3],
  ])('blocks active usage %i assets %i unresolved risks without writes', async (assets, risks) => {
    mocks.tx.assets.count.mockResolvedValue(assets);
    mocks.tx.risks.count.mockResolvedValue(risks);
    await expect(repository.deactivate(id, id, input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'BUSINESS_SERVICE_IN_USE',
      details: { activeAssetsCount: assets, unresolvedRisksCount: risks },
    });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('rejects stale confirmation version before usage writes', async () => {
    await expect(
      repository.deactivate(id, id, { ...input, expectedUpdatedAt: '2026-10-06T00:00:00Z' }),
    ).rejects.toMatchObject({ code: 'BUSINESS_SERVICE_STALE' });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
  });
  it('requires case-sensitive current name', async () => {
    await expect(
      repository.deactivate(id, id, { ...input, confirmationName: 'support' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'BUSINESS_SERVICE_CONFIRMATION_MISMATCH' });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
  });
  it('rejects missing service and repeated inactive action without audit', async () => {
    mocks.tx.business_services.findUnique.mockResolvedValue(null);
    await expect(repository.deactivate(id, id, input)).rejects.toMatchObject({ statusCode: 404 });
    mocks.tx.business_services.findUnique.mockResolvedValue({ ...service, status: 'INACTIVE' });
    await expect(repository.deactivate(id, id, input)).rejects.toMatchObject({
      code: 'BUSINESS_SERVICE_INACTIVE',
    });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it.each(['ADMIN', 'EXECUTIVE', 'EMPLOYEE'])(
    'denies nonofficer %s even if owner',
    async (role) => {
      mocks.tx.users.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
      await expect(repository.deactivate(id, id, input)).rejects.toMatchObject({ statusCode: 403 });
      expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
    },
  );
  it('rechecks active actor inside transaction', async () => {
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
    await expect(repository.deactivate(id, id, input)).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
  });
  it('rejects audit failure to roll back service change', async () => {
    mocks.tx.audit_logs.create.mockRejectedValue(new Error('Audit unavailable'));
    await expect(repository.deactivate(id, id, input)).rejects.toThrow('Audit unavailable');
  });
  it('maps serialization failure to stale409 without retry', async () => {
    mocks.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Concurrent conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    await expect(repository.deactivate(id, id, input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'BUSINESS_SERVICE_STALE',
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it('returns consistent advisory check without mutation or audit', async () => {
    mocks.tx.assets.count.mockResolvedValue(3);
    mocks.tx.risks.count.mockResolvedValue(2);
    expect(await repository.deactivationCheck(id)).toEqual({
      service,
      activeAssetsCount: 3,
      unresolvedRisksCount: 2,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(mocks.tx.business_services.update).not.toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
});
