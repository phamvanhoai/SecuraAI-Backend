import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), risks: { findUnique: vi.fn() }, risk_threats: { create: vi.fn() } }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: (work: (tx: typeof db) => Promise<unknown>) => work(db) } }));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
beforeEach(() => vi.clearAllMocks());
const input = { name: 'Privileged account misuse', description: 'Demo threat description', vulnerabilityIds: [] };
it.each(['ACCEPTED', 'CLOSED', 'ARCHIVED'])('blocks new threats on %s under the Risk lock', async (status) => {
  db.risks.findUnique.mockResolvedValue({ id: 'risk', status, risk_acceptances: [], risk_threats: [], risk_vulnerabilities: [] });
  expect(await riskRegisterRepository.identifyThreat('risk', 'officer', input)).toMatchObject({ kind: 'context_locked' });
  expect(db.$queryRaw).toHaveBeenCalledOnce();
  expect(db.risk_threats.create).not.toHaveBeenCalled();
});
it('blocks pending acceptance before any threat write', async () => {
  db.risks.findUnique.mockResolvedValue({ id: 'risk', status: 'OPEN', risk_acceptances: [{ id: 'pending' }], risk_threats: [], risk_vulnerabilities: [] });
  expect(await riskRegisterRepository.identifyThreat('risk', 'officer', input)).toMatchObject({ kind: 'context_locked' });
  expect(db.risk_threats.create).not.toHaveBeenCalled();
});
it('reaches normal validation after an Accepted Risk is reopened', async () => {
  db.risks.findUnique.mockResolvedValue({ id: 'risk', status: 'OPEN', risk_acceptances: [], risk_threats: [{ id: 'existing' }], risk_vulnerabilities: [] });
  expect(await riskRegisterRepository.identifyThreat('risk', 'officer', input)).toEqual({ kind: 'duplicate' });
});
