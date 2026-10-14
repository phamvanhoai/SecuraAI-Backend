import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  users: { findUnique: vi.fn() },
  risk_acceptances: { findUnique: vi.fn(), update: vi.fn() },
  risks: { update: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (operation: (database: typeof db) => Promise<unknown>) => operation(db),
  },
}));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
const now = new Date('2026-10-14T09:00:00Z');
const acceptance = {
  id: 'request',
  risk_id: 'risk',
  requested_by: 'owner',
  decision: 'PENDING',
  requested_at: new Date('2026-10-01'),
  valid_until: new Date('2026-10-02'),
  risks: { id: 'risk', risk_code: 'RSK', status: 'UNDER_TREATMENT', risk_vulnerabilities: [] },
};
describe('expired acceptance decision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER' });
    db.$queryRaw.mockResolvedValue([{ time: now }]);
    db.risk_acceptances.findUnique.mockResolvedValue(acceptance);
    db.risk_acceptances.update.mockResolvedValue({
      ...acceptance,
      decision: 'REJECTED',
      decided_at: now,
    });
  });
  it('rejects an expired request without changing its proposed validity date or Risk status', async () => {
    await expect(
      riskRegisterRepository.decideAcceptance('request', 'approver', {
        decision: 'rejected',
        reason: 'The proposed validity has expired.',
      }),
    ).resolves.toMatchObject({ kind: 'decided' });
    const data = db.risk_acceptances.update.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ decision: 'REJECTED', decided_at: now });
    expect(data).not.toHaveProperty('valid_until');
    expect(db.risks.update).not.toHaveBeenCalled();
  });
  it('blocks approval after the proposed validity has expired', async () => {
    await expect(
      riskRegisterRepository.decideAcceptance('request', 'approver', {
        decision: 'approved',
        reason: 'Approve request.',
      }),
    ).resolves.toEqual({ kind: 'expired' });
    expect(db.risk_acceptances.update).not.toHaveBeenCalled();
  });
  it('allows approval on the final validity day', async () => {
    db.risk_acceptances.findUnique.mockResolvedValue({
      ...acceptance,
      valid_until: new Date('2026-10-14'),
    });
    await expect(
      riskRegisterRepository.decideAcceptance('request', 'approver', {
        decision: 'approved',
        reason: 'Valid for today.',
      }),
    ).resolves.toMatchObject({ kind: 'decided' });
    expect(db.risks.update).toHaveBeenCalled();
  });
});
