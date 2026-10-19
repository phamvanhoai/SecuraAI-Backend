import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/risk-assessment/risk-register.service.js', () => ({ riskRegisterService: { createTreatmentPlan: vi.fn(), updateTreatmentPlan: vi.fn() } }));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';
const id = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', subject: id, expiresIn: '15m' });
const app = createApp();
const cost = { costToFix: '100000000', expectedLoss: '5000000', currency: 'VND', periodMonths: 12, basis: 'Synthetic twelve-month comparison for mentor demonstration.' };
const input = { riskId: id, title: 'Accept demo exposure', strategy: 'accept', ownerUserId: id, targetDate: '2027-12-31', targetRisk: 'low', controlIds: [], actions: [] };
beforeEach(() => vi.clearAllMocks());
it('rejects missing costs at the authenticated API boundary before the service', async () => {
  expect((await request(app).post('/api/v1/risks/treatment-plans').set('Authorization', `Bearer ${token}`).send(input)).status).toBe(422);
  expect(riskRegisterService.createTreatmentPlan).not.toHaveBeenCalled();
});
it('passes exact cost strings and authenticated actor to create', async () => {
  vi.mocked(riskRegisterService.createTreatmentPlan).mockResolvedValue({ id, title: input.title, riskCode: 'TEST-RSK', strategy: 'accept', status: 'draft', targetRisk: 'low', targetDate: new Date('2027-12-31'), actionCount: 0, controlCount: 0, createdAt: new Date('2026-10-19') });
  expect((await request(app).post('/api/v1/risks/treatment-plans').set('Authorization', `Bearer ${token}`).send({ ...input, acceptanceCost: cost })).status).toBe(201);
  expect(riskRegisterService.createTreatmentPlan).toHaveBeenCalledWith(id, expect.objectContaining({ acceptanceCost: cost, actions: [] }));
});
it('rejects missing update costs and arbitrary submitted financial fields', async () => {
  const update = { title: input.title, strategy: 'accept', ownerUserId: id, targetDate: input.targetDate, status: 'active', controlIds: [], actions: [], expectedUpdatedAt: '2026-10-19T00:00:00Z' };
  expect((await request(app).patch(`/api/v1/risks/treatment-plans/${id}`).set('Authorization', `Bearer ${token}`).send(update)).status).toBe(422);
  expect((await request(app).patch(`/api/v1/risks/treatment-plans/${id}`).set('Authorization', `Bearer ${token}`).send({ ...update, acceptanceCost: { ...cost, approved: true } })).status).toBe(422);
  expect(riskRegisterService.updateTreatmentPlan).not.toHaveBeenCalled();
});
