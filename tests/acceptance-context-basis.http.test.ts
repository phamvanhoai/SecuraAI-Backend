import jwt from 'jsonwebtoken';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({ riskRegisterRepository: {
  findActor: vi.fn(), decideAcceptance: vi.fn(), submitAcceptance: vi.fn(),
} }));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
const id = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', subject: id, expiresIn: '15m' });
it.each(['submit', 'approve'] as const)('returns RISK_REVIEW_OVERDUE for %s through the real service', async (action) => {
  vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({ id, status: 'ACTIVE', role: 'SECURITY_OFFICER', user_access_scopes_user_access_scopes_user_idTousers: [] });
  vi.mocked(riskRegisterRepository.submitAcceptance).mockResolvedValue({ kind: 'review_overdue' });
  vi.mocked(riskRegisterRepository.decideAcceptance).mockResolvedValue({ kind: 'review_overdue' });
  const app = createApp();
  const response = action === 'submit'
    ? await request(app).post(`/api/v1/risks/${id}/acceptance`).set('Authorization', `Bearer ${token}`).send({ residualLikelihood: 2, residualImpact: 3, assessmentReason: 'Current assessment basis', treatmentPlanId: id, validUntil: '2099-01-01', acceptanceReason: 'Demo acceptance justification' })
    : await request(app).patch(`/api/v1/risks/acceptances/${id}/decision`).set('Authorization', `Bearer ${token}`).send({ decision: 'approved', reason: 'Independent review of submission.' });
  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({ success: false, error: { code: 'RISK_REVIEW_OVERDUE' } });
});
it('returns an actionable 409 through the real approval route and service for changed Asset/Evidence basis', async () => {
  const blockedReason = 'Asset classification or context changed after submission. Reject this request, reassess the Risk, and submit a new acceptance request.';
  vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({ id, status: 'ACTIVE', role: 'SECURITY_OFFICER', user_access_scopes_user_access_scopes_user_idTousers: [] });
  vi.mocked(riskRegisterRepository.decideAcceptance).mockResolvedValue({ kind: 'acceptance_basis_changed', blockedReason });
  const response = await request(createApp()).patch(`/api/v1/risks/acceptances/${id}/decision`).set('Authorization', `Bearer ${token}`).send({ decision: 'approved', reason: 'Independent approval review.' });
  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({ success: false, error: { code: 'ACCEPTANCE_BASIS_CHANGED', message: blockedReason } });
});
