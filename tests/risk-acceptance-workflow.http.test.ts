import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/risk-assessment/risk-register.service.js', () => ({
  riskRegisterService: { openAcceptanceReview: vi.fn() },
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';
const id = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: id,
  expiresIn: '15m',
});
const app = createApp();
const body = {
  reason: 'Review expired acceptance and remaining exposure.',
  expectedUpdatedAt: '2026-10-14T00:00:00Z',
};
beforeEach(() => vi.clearAllMocks());
it('requires authentication for review', async () => {
  expect((await request(app).post(`/api/v1/risks/${id}/review`).send(body)).status).toBe(401);
});
it('validates revision and reason before calling service', async () => {
  expect(
    (
      await request(app)
        .post(`/api/v1/risks/${id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'short' })
    ).status,
  ).toBe(422);
  expect(riskRegisterService.openAcceptanceReview).not.toHaveBeenCalled();
});
it('passes authenticated actor and valid review input', async () => {
  vi.mocked(riskRegisterService.openAcceptanceReview).mockResolvedValue({
    riskId: id,
    status: 'open',
    updatedAt: new Date('2026-10-14'),
  });
  const response = await request(app)
    .post(`/api/v1/risks/${id}/review`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  expect(response.status).toBe(200);
  expect(riskRegisterService.openAcceptanceReview).toHaveBeenCalledWith(id, id, body);
});
it('returns ownership denial through the normal error envelope', async () => {
  vi.mocked(riskRegisterService.openAcceptanceReview).mockRejectedValue(
    new AppError(403, 'RISK_OWNER_REQUIRED', 'Assigned Owner required'),
  );
  const response = await request(app)
    .post(`/api/v1/risks/${id}/review`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  expect(response.status).toBe(403);
  expect(response.body).toMatchObject({ success: false, error: { code: 'RISK_OWNER_REQUIRED' } });
});
