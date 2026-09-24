import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/common/utils/tokens.js';
import { riskManagementRepository } from '../src/modules/risk-management/risk-management.repository.js';

describe('POST /api/v1/risks/treatment-plans/:id/cancel', () => {
  const app = createApp();
  const planId = randomUUID();
  const token = signAccessToken({
    userId: randomUUID(),
    roles: ['SECURITY_OFFICER'],
    permissions: ['risk-treatment-plans.cancel'],
  });

  beforeEach(() => vi.restoreAllMocks());

  it('requires authentication', async () => {
    const response = await request(app)
      .post(`/api/v1/risks/treatment-plans/${planId}/cancel`)
      .send({ expectedUpdatedAt: '2026-09-21T01:00:00.000Z', reason: 'Created by mistake.' });
    expect(response.status).toBe(401);
  });

  it('validates the cancellation reason before repository access', async () => {
    const repository = vi.spyOn(riskManagementRepository, 'cancelTreatmentPlan');
    const response = await request(app)
      .post(`/api/v1/risks/treatment-plans/${planId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedUpdatedAt: '2026-09-21T01:00:00.000Z', reason: 'short' });
    expect(response.status).toBe(422);
    expect(repository).not.toHaveBeenCalled();
  });

  it('returns conflict when a concurrent mutation wins', async () => {
    vi.spyOn(riskManagementRepository, 'cancelTreatmentPlan').mockResolvedValue({
      failure: 'PLAN_CHANGED',
      plan: null,
    });
    const response = await request(app)
      .post(`/api/v1/risks/treatment-plans/${planId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedUpdatedAt: '2026-09-21T01:00:00.000Z',
        reason: 'Created for the wrong assessment.',
      });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'TREATMENT_PLAN_CHANGED' },
    });
  });
});
