import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    users: { findUnique: vi.fn(), findFirst: vi.fn() },
    business_services: { create: vi.fn() },
    audit_logs: { create: vi.fn() },
  },
  transaction: vi.fn(),
  users: { findMany: vi.fn(), findUnique: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: mocks.transaction, users: mocks.users },
}));
import { businessServicesRepository as repository } from '../src/modules/it-asset-management/business-services.repository.js';
import { createBusinessServiceSchema as schema } from '../src/modules/it-asset-management/dto/create-business-service.dto.js';
const id = '00000000-0000-4000-8000-000000000001';
describe('Create business service validation', () => {
  it('normalizes names and accepts optional unassigned owner', () => {
    expect(schema.parse({ name: ' Support  Service ' })).toEqual({ name: 'Support Service' });
    expect(schema.parse({ name: 'Support', ownerUserId: null, description: null })).toMatchObject({
      ownerUserId: null,
    });
  });
  it.each([
    { name: ' ' },
    { name: 'a'.repeat(256) },
    { name: 'Service', ownerUserId: 'not-id' },
    { name: 'Service', status: 'INACTIVE' },
    { name: 'Service', assets: [] },
    { name: 'Service', description: 'a'.repeat(5001) },
    { name: 'Service\u0000' },
  ])('rejects invalid body %j', (body) => expect(schema.safeParse(body).success).toBe(false));
});
describe('Atomic Business Service creation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    mocks.tx.users.findFirst.mockResolvedValue({ id });
    mocks.tx.business_services.create.mockResolvedValue({ id, name: 'Support', status: 'ACTIVE' });
  });
  it('creates Active with zero links and audit in the same transaction', async () => {
    await repository.create(id, { name: 'Support', ownerUserId: id, description: 'Purpose' });
    expect(mocks.tx.business_services.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Support', description: 'Purpose', owner_user_id: id, status: 'ACTIVE' },
      }),
    );
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor_user_id: id,
          action: 'BUSINESS_SERVICE_CREATED',
          resource_id: id,
          record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 15000,
    });
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it('stores empty description and unassigned owner as null', async () => {
    await repository.create(id, { name: 'Support', description: '' });
    expect(mocks.tx.business_services.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: null, owner_user_id: null }),
      }),
    );
    expect(mocks.tx.users.findFirst).not.toHaveBeenCalled();
  });
  it('rejects an inactive or missing owner before creation', async () => {
    mocks.tx.users.findFirst.mockResolvedValue(null);
    await expect(repository.create(id, { name: 'Support', ownerUserId: id })).rejects.toMatchObject(
      { statusCode: 422 },
    );
    expect(mocks.tx.business_services.create).not.toHaveBeenCalled();
  });
  it('rejects duplicate including inactive before writing', async () => {
    mocks.tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id }]);
    await expect(repository.create(id, { name: 'Support' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mocks.tx.business_services.create).not.toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it.each([
    { role: 'EMPLOYEE', status: 'ACTIVE', statusCode: 403 },
    { role: 'SECURITY_OFFICER', status: 'INACTIVE', statusCode: 401 },
  ])('rechecks actor at write time %j', async (actor) => {
    mocks.tx.users.findUnique.mockResolvedValue(actor);
    await expect(repository.create(id, { name: 'Support' })).rejects.toMatchObject({
      statusCode: actor.statusCode,
    });
    expect(mocks.tx.business_services.create).not.toHaveBeenCalled();
  });
  it('propagates audit failure so the database transaction rolls back', async () => {
    mocks.tx.audit_logs.create.mockRejectedValue(new Error('audit failed'));
    await expect(repository.create(id, { name: 'Support' })).rejects.toThrow('audit failed');
  });
  it('returns bounded active owner options', async () => {
    await repository.ownerOptions('Support');
    expect(mocks.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', full_name: { contains: 'Support', mode: 'insensitive' } },
        take: 10,
        select: { id: true, full_name: true, role: true },
      }),
    );
  });
});
