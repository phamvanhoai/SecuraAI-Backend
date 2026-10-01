import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock(
  '../src/modules/information-security-incident-management/incident-risks.service.js',
  () => ({ incidentRisksService: { options: vi.fn(), link: vi.fn(), unlink: vi.fn() } }),
);
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { incidentRisksService } from '../src/modules/information-security-incident-management/incident-risks.service.js';
const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const riskId = '33333333-3333-4333-8333-333333333333';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
});
const app = createApp();
describe('incident risk routes', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires authentication', async () => {
    expect(
      (await request(app).post(`/api/v1/incidents/${incidentId}/risks`).send({ riskId })).status,
    ).toBe(401);
  });
  it('links a risk and returns 201', async () => {
    vi.mocked(incidentRisksService.link).mockResolvedValue({
      incident: { id: incidentId, incidentCode: 'INC-001', title: 'Login' },
      risk: {
        id: riskId,
        riskCode: 'RSK-001',
        title: 'Credential compromise',
        status: 'open',
        reviewDate: null,
      },
      linkedAt: new Date(),
    });
    const response = await request(app)
      .post(`/api/v1/incidents/${incidentId}/risks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ riskId });
    expect(response.status).toBe(201);
    expect(response.body.data.risk.riskCode).toBe('RSK-001');
  });
  it('rejects invalid risk ID', async () => {
    const response = await request(app)
      .post(`/api/v1/incidents/${incidentId}/risks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ riskId: 'invalid' });
    expect(response.status).toBe(422);
  });
  it('unlinks a risk and returns 204', async () => {
    vi.mocked(incidentRisksService.unlink).mockResolvedValue(undefined);
    const response = await request(app)
      .delete(`/api/v1/incidents/${incidentId}/risks/${riskId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(204);
    expect(incidentRisksService.unlink).toHaveBeenCalledWith(userId, incidentId, riskId);
  });
});
