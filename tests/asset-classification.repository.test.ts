import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  tx: { users: { findUnique: vi.fn() }, assets: { findUnique: vi.fn(), update: vi.fn() } },
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
describe('atomic asset classification', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    mocks.tx.assets.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      criticality: 'low',
      data_classification: 'public',
    });
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
});
