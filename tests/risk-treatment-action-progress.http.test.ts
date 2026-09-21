import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/common/utils/tokens.js';
import { riskManagementRepository } from '../src/modules/risk-management/risk-management.repository.js';

const app = createApp();
const planId = randomUUID();
const actionId = randomUUID();
const url = `/api/v1/risks/treatment-plans/${planId}/actions/${actionId}/progress`;
const body = { expectedUpdatedAt: '2026-09-21T12:00:00.000Z', progressPercent: 50 };
const token = (permissions: string[]) => signAccessToken({ userId: randomUUID(), roles: ['SECURITY_OFFICER'], permissions });
const authorized = () => request(app).patch(url).set('Authorization', `Bearer ${token(['risk-treatment-actions.update-progress'])}`);
afterEach(() => vi.restoreAllMocks());

describe('PATCH action progress', () => {
  it('requires authentication and the dedicated permission', async () => {
    expect((await request(app).patch(url).send(body)).status).toBe(401);
    expect((await request(app).patch(url).set('Authorization', `Bearer ${token(['risk-treatment-plans.update'])}`).send(body)).status).toBe(403);
  });
  it.each([-1, 101, 1.5, '50', null])('rejects invalid progress %s', async (progressPercent) => {
    const repository = vi.spyOn(riskManagementRepository, 'updateTreatmentActionProgress');
    expect((await authorized().send({ ...body, progressPercent })).status).toBe(422);
    expect(repository).not.toHaveBeenCalled();
  });
  it('parses the request through middleware and controller and returns conflicts', async () => {
    vi.spyOn(riskManagementRepository, 'updateTreatmentActionProgress').mockResolvedValue({ failure: 'ACTION_CHANGED', result: null });
    const response = await authorized().send(body);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, error: { code: 'TREATMENT_ACTION_CHANGED' } });
  });
});
