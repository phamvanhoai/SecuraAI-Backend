import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const mocks = vi.hoisted(() => ({
  tx: { users: { findUnique: vi.fn() }, assets: { findUnique: vi.fn(), update: vi.fn() }, audit_logs: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() } },
  transaction: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
const input = {
  confidentialityImpact: 1,
  integrityImpact: 1,
  availabilityImpact: 5,
  businessImpact: 2,
  dataClassification: 'public' as const,
    dataClassificationBasis: 'Only approved public information is handled; no sensitive records are stored.',
  rationale: 'An outage stops the essential service despite its public information.',
};
const at = new Date('2026-10-26T10:00:00Z');
const current = {
  id: 'asset', status: 'ACTIVE', owner_user_id: 'owner', criticality: 'low', data_classification: 'public',
  classification_confidentiality_impact: 1, classification_integrity_impact: 1,
  classification_availability_impact: 1, classification_business_impact: 1,
  classification_rationale: 'Previous assessment basis.', data_classification_basis: input.dataClassificationBasis,
  classification_method_version: 'SECURAAI-ASSET-IMPACT-v1', data_classification_method_version: 'SECURAAI-DATA-CLASSIFICATION-v1',
  classified_at: at, classified_by: 'previous-officer',
};
describe('atomic asset classification', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    mocks.tx.assets.findUnique.mockResolvedValue(current);
    mocks.tx.assets.update.mockResolvedValue({ id: 'asset', classified_at: new Date() });
  });
  it('stores the complete assessment and identity together with the result', async () => {
    expect(
      await assetsRepository.classify(
        'asset',
        'critical',
        input,
        'officer',
        'SECURAAI-ASSET-IMPACT-v1',
      ),
    ).toMatchObject({ kind: 'updated' });
    expect(mocks.tx.assets.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          criticality: 'critical',
          data_classification: 'public',
          classification_confidentiality_impact: 1,
          classification_integrity_impact: 1,
          classification_availability_impact: 5,
          classification_business_impact: 2,
          classification_rationale: input.rationale,
          classification_method_version: 'SECURAAI-ASSET-IMPACT-v1',
          classified_by: 'officer',
          classified_at: expect.any(Date),
        }),
      }),
    );
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 15000,
    });
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'ASSET_CLASSIFICATION_UPDATED', actor_user_id: 'officer', resource_id: 'asset',
      before_data: expect.objectContaining({ criticality: 'low', availabilityImpact: 1, assessedBy: 'previous-officer', assessedAt: at.toISOString() }),
      after_data: expect.objectContaining({ criticality: 'critical', availabilityImpact: 5, rationale: input.rationale, assessedBy: 'officer' }),
    }) });
  });
  it('does not update timestamps or audit when the entire basis is unchanged', async () => {
    const unchanged = { ...input, availabilityImpact: 1, businessImpact: 1, rationale: current.classification_rationale };
    await assetsRepository.classify('asset', 'low', unchanged, 'officer', 'SECURAAI-ASSET-IMPACT-v1');
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('audits rationale changes even if both classification levels remain the same', async () => {
    await assetsRepository.classify('asset', 'low', { ...input, availabilityImpact: 1, businessImpact: 1 }, 'officer', 'SECURAAI-ASSET-IMPACT-v1');
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      before_data: expect.objectContaining({ criticality: 'low', rationale: current.classification_rationale }),
      after_data: expect.objectContaining({ criticality: 'low', rationale: input.rationale }),
    }) });
  });
  it('records missing legacy assessor time on the next save instead of returning a null classifiedAt', async () => {
    mocks.tx.assets.findUnique.mockResolvedValue({ ...current, classified_at: null, classified_by: null });
    const unchanged = { ...input, availabilityImpact: 1, businessImpact: 1, rationale: current.classification_rationale };
    await assetsRepository.classify('asset', 'low', unchanged, 'officer', 'SECURAAI-ASSET-IMPACT-v1');
    expect(mocks.tx.assets.update).toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      before_data: expect.objectContaining({ criticality: 'low', assessedAt: null, assessedBy: null }),
      after_data: expect.objectContaining({ assessedAt: expect.any(String), assessedBy: 'officer' }),
    }) });
  });
  it('records a first classification without inventing prior assessment values', async () => {
    mocks.tx.assets.findUnique.mockResolvedValue({ ...current, criticality: null, data_classification: null, classified_at: null });
    await assetsRepository.classify('asset', 'critical', input, 'officer', 'SECURAAI-ASSET-IMPACT-v1');
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      before_data: Prisma.JsonNull, after_data: expect.objectContaining({ confidentialityImpact: 1, dataClassification: 'public' }),
    }) });
  });
  it('does not report success if audit fails within the transaction', async () => {
    mocks.tx.audit_logs.create.mockRejectedValue(new Error('audit failure'));
    await expect(assetsRepository.classify('asset', 'critical', input, 'officer', 'SECURAAI-ASSET-IMPACT-v1')).rejects.toThrow('audit failure');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it('rechecks archived state before writing', async () => {
    mocks.tx.assets.findUnique.mockResolvedValue({ status: 'ARCHIVED' });
    expect(
      await assetsRepository.classify(
        'asset',
        'critical',
        input,
        'officer',
        'SECURAAI-ASSET-IMPACT-v1',
      ),
    ).toEqual({ kind: 'archived' });
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
  });
  it('rechecks actor activity before writing', async () => {
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
    expect(
      await assetsRepository.classify(
        'asset',
        'critical',
        input,
        'officer',
        'SECURAAI-ASSET-IMPACT-v1',
      ),
    ).toEqual({ kind: 'forbidden' });
    expect(mocks.tx.assets.update).not.toHaveBeenCalled();
  });
  it('rejects non-officer writers', async () => {
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    expect(await assetsRepository.classify('asset', 'critical', input, 'owner', 'SECURAAI-ASSET-IMPACT-v1')).toEqual({ kind: 'forbidden' });
    expect(mocks.tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('scopes and paginates classification history separately from context history', async () => {
    mocks.tx.audit_logs.count.mockResolvedValue(12);
    mocks.tx.audit_logs.findMany.mockResolvedValue([]);
    await assetsRepository.classificationHistory('asset', 'officer', { page: 2, limit: 10 });
    expect(mocks.tx.audit_logs.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { resource_type: 'ASSET', resource_id: 'asset', action: 'ASSET_CLASSIFICATION_UPDATED' },
      skip: 10, take: 10, orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    }));
  });
  it('allows the current owner to read archived history but not another user', async () => {
    mocks.tx.assets.findUnique.mockResolvedValue({ ...current, status: 'ARCHIVED' });
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    mocks.tx.audit_logs.count.mockResolvedValue(0); mocks.tx.audit_logs.findMany.mockResolvedValue([]);
    await expect(assetsRepository.classificationHistory('asset', 'owner', { page: 1, limit: 10 })).resolves.toMatchObject({ total: 0 });
    await expect(assetsRepository.classificationHistory('asset', 'former-owner', { page: 1, limit: 10 })).rejects.toMatchObject({ statusCode: 403 });
  });
  it('rejects history reads by inactive actors or for missing assets', async () => {
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
    await expect(assetsRepository.classificationHistory('asset', 'officer', { page: 1, limit: 10 })).rejects.toMatchObject({ statusCode: 401 });
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    mocks.tx.assets.findUnique.mockResolvedValue(null);
    await expect(assetsRepository.classificationHistory('missing', 'officer', { page: 1, limit: 10 })).rejects.toMatchObject({ statusCode: 404 });
  });
});
