import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/modules/risk-assessment/risk-register.service.js', () => ({ riskRegisterService: { completeReview: vi.fn() } }));
import { riskRegisterRouter } from '../src/modules/risk-assessment/risk-register.routes.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';
const id = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, { subject: id, algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', expiresIn: '5m' });
const body = { conclusion: 'Reviewed controls and residual risk.', nextReviewDate: '2027-01-27', assessmentId: id, expectedOpenedAt: '2026-10-25T00:00:00Z', expectedUpdatedAt: '2026-10-25T00:00:00Z' };
const app = express(); app.use(express.json()); app.use('/risks', riskRegisterRouter); app.use(errorHandler);
beforeEach(() => vi.clearAllMocks());
it('requires authentication', async () => {
  expect((await request(app).post(`/risks/${id}/review/complete`).send(body)).status).toBe(401);
});
it('validates fields and blocks forged actor', async () => {
  expect((await request(app).post(`/risks/${id}/review/complete`).auth(token, { type: 'bearer' }).send({ ...body, actorId: id })).status).toBe(422);
  expect(riskRegisterService.completeReview).not.toHaveBeenCalled();
});
it('passes the authenticated actor', async () => {
  vi.mocked(riskRegisterService.completeReview).mockResolvedValue({ riskId: id, nextReviewDate: body.nextReviewDate, completedAt: new Date() });
  expect((await request(app).post(`/risks/${id}/review/complete`).auth(token, { type: 'bearer' }).send(body)).status).toBe(200);
  expect(riskRegisterService.completeReview).toHaveBeenCalledWith(id, id, body);
});
it('preserves stale/duplicate conflict', async () => {
  vi.mocked(riskRegisterService.completeReview).mockRejectedValue(new AppError(409, 'RISK_REVIEW_CHANGED', 'Refresh Risk'));
  expect((await request(app).post(`/risks/${id}/review/complete`).auth(token, { type: 'bearer' }).send(body)).status).toBe(409);
});
