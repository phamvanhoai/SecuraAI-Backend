import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ users: { findFirst: vi.fn() }, business_services: { findFirst: vi.fn() }, assets: { findMany: vi.fn() }, risks: { create: vi.fn() }, transaction: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: state.transaction } }));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
const input = { title: 'Service risk', description: 'Customer service risk scope', ownerUserId: 'owner', reviewDate: '2027-01-15', scope: { type: 'business_service' as const, businessServiceId: 'service' } };
beforeEach(() => {
  vi.clearAllMocks(); state.transaction.mockImplementation((fn: (db: typeof state) => Promise<unknown>) => fn(state));
  state.users.findFirst.mockResolvedValue({ id: 'owner' }); state.business_services.findFirst.mockResolvedValue({ id: 'service' }); state.assets.findMany.mockResolvedValue([{ id: 'asset' }]); state.risks.create.mockResolvedValue({ id: 'risk' });
});
describe('persisted Risk scope', () => {
  it('atomically stores the service and the explicit asset snapshot', async () => {
    await riskRegisterRepository.create('officer', input, ['asset'], 'RSK-1');
    expect(state.risks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scope_type: 'BUSINESS_SERVICE', business_service_id: 'service', risk_assets: { create: [{ asset_id: 'asset' }] } }) }));
    expect(state.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('stores Asset scope without a service reference', async () => {
    await riskRegisterRepository.create('officer', { ...input, scope: { type: 'asset', assetId: 'asset' } }, ['asset'], 'RSK-1');
    expect(state.business_services.findFirst).not.toHaveBeenCalled();
    expect(state.risks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scope_type: 'ASSET', business_service_id: null }) }));
  });
  it('rejects an inactive or deleted service before writing', async () => {
    state.business_services.findFirst.mockResolvedValue(null);
    await expect(riskRegisterRepository.create('officer', input, ['asset'], 'RSK-1')).rejects.toMatchObject({ statusCode: 422 });
    expect(state.risks.create).not.toHaveBeenCalled();
  });
  it('rejects reassignment/archive of a selected asset rather than silently changing scope', async () => {
    state.assets.findMany.mockResolvedValue([]);
    await expect(riskRegisterRepository.create('officer', input, ['asset'], 'RSK-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(state.risks.create).not.toHaveBeenCalled();
  });
  it('rechecks Employee eligibility within the transaction', async () => {
    state.users.findFirst.mockResolvedValue(null);
    await expect(riskRegisterRepository.create('officer', input, ['asset'], 'RSK-1')).rejects.toMatchObject({ code: 'INVALID_RISK_OWNER' });
    expect(state.risks.create).not.toHaveBeenCalled();
  });
});
