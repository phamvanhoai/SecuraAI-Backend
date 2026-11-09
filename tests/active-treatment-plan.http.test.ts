import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({ riskRegisterRepository: { findActor: vi.fn(), updateTreatmentPlan: vi.fn() } }));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
const id = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', subject: id, expiresIn: '15m' });
const app = createApp();
const input = { title: 'Demo treatment plan', strategy: 'transfer', ownerUserId: id, targetDate: '2099-12-31', status: 'active', expectedUpdatedAt: '2026-11-09T00:00:00Z', changeReason: 'Revised treatment work after operational review.', controlIds: [], actions: [{ title: 'Review arrangements', assignedToUserId: id, dueDate: '2099-12-31', status: 'pending' }] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({ id, role: 'SECURITY_OFFICER', status: 'ACTIVE', user_access_scopes_user_access_scopes_user_idTousers: [] });
});
it.each([
  ['active_strategy_locked', 409, 'ACTIVE_PLAN_STRATEGY_LOCKED'],
  ['change_reason_required', 422, 'PLAN_CHANGE_REASON_REQUIRED'],
] as const)('maps %s through the real route/service', async (kind, status, code) => {
  vi.mocked(riskRegisterRepository.updateTreatmentPlan).mockResolvedValue({ kind });
  const response = await request(app).patch(`/api/v1/risks/treatment-plans/${id}`).set('Authorization', `Bearer ${token}`).send(input);
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({ success: false, error: { code } });
});
it('rejects cancellation without a reason before the repository', async () => {
  const response = await request(app).patch(`/api/v1/risks/treatment-plans/${id}`).set('Authorization', `Bearer ${token}`).send({ ...input, status: 'cancelled', changeReason: ' ' });
  expect(response.status).toBe(422);
  expect(riskRegisterRepository.updateTreatmentPlan).not.toHaveBeenCalled();
});
