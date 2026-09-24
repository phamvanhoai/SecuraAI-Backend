import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/common/utils/tokens.js';
import { riskManagementRepository } from '../src/modules/risk-management/risk-management.repository.js';

const app = createApp();
const riskAssessmentId = randomUUID();
const url = `/api/v1/risks/${riskAssessmentId}/residual-assessment`;
const body = {
  residualLikelihood: 2,
  residualImpact: 3,
  assessmentNote: 'Controls were tested and reduced exposure.',
  expectedUpdatedAt: '2026-09-22T08:00:00.000Z',
};
const token = (permissions: string[]) =>
  signAccessToken({ userId: randomUUID(), roles: ['SECURITY_OFFICER'], permissions });
const authorized = () =>
  request(app)
    .patch(url)
    .set('Authorization', `Bearer ${token(['risk-assessments.assess-residual'])}`);

afterEach(() => vi.restoreAllMocks());

describe('PATCH residual risk assessment', () => {
  it('requires authentication and the dedicated permission', async () => {
    expect((await request(app).patch(url).send(body)).status).toBe(401);
    expect(
      (
        await request(app)
          .patch(url)
          .set('Authorization', `Bearer ${token(['risks.update'])}`)
          .send(body)
      ).status,
    ).toBe(403);
  });

  it.each([0, 6, 1.5])('rejects invalid residual likelihood %s', async (value) => {
    const repository = vi.spyOn(riskManagementRepository, 'performResidualRiskAssessment');
    expect((await authorized().send({ ...body, residualLikelihood: value })).status).toBe(422);
    expect(repository).not.toHaveBeenCalled();
  });

  it('returns a workflow conflict through the central error shape', async () => {
    vi.spyOn(riskManagementRepository, 'performResidualRiskAssessment').mockResolvedValue({
      failure: 'ACTIONS_INCOMPLETE',
      result: null,
    });
    const response = await authorized().send(body);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'TREATMENT_ACTIONS_INCOMPLETE' },
    });
  });
});
