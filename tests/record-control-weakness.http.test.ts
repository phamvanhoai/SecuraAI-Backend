import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock(
  '../src/modules/information-security-incident-management/control-weaknesses.service.js',
  () => ({ controlWeaknessesService: { options: vi.fn(), record: vi.fn() } }),
);
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { controlWeaknessesService } from '../src/modules/information-security-incident-management/control-weaknesses.service.js';
const userId = '11111111-1111-4111-8111-111111111111',
  incidentId = '22222222-2222-4222-8222-222222222222',
  controlId = '33333333-3333-4333-8333-333333333333';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
});
const app = createApp();
describe('control weakness routes', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires authentication', async () => {
    expect(
      (
        await request(app)
          .post(`/api/v1/incidents/${incidentId}/control-weaknesses`)
          .send({
            controlId,
            severity: 'high',
            description: 'A sufficiently detailed weakness description.',
          })
      ).status,
    ).toBe(401);
  });
  it('records a weakness with 201', async () => {
    vi.mocked(controlWeaknessesService.record).mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      findingType: 'control_weakness',
      severity: 'high',
      description: 'MFA was not enforced for the affected account.',
      source: 'incident',
      status: 'open',
      identifiedAt: new Date(),
      incident: { id: incidentId, incidentCode: 'INC-1', title: 'Login' },
      control: {
        id: controlId,
        controlCode: 'CTRL-1',
        name: 'MFA',
        implementationStatus: 'implemented',
      },
    });
    const response = await request(app)
      .post(`/api/v1/incidents/${incidentId}/control-weaknesses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        controlId,
        severity: 'high',
        description: 'MFA was not enforced for the affected account.',
      });
    expect(response.status).toBe(201);
    expect(response.body.data.findingType).toBe('control_weakness');
  });
});
