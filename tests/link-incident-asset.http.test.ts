import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock(
  '../src/modules/information-security-incident-management/incident-assets.service.js',
  () => ({
    incidentAssetsService: { options: vi.fn(), link: vi.fn() },
  }),
);

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { incidentAssetsService } from '../src/modules/information-security-incident-management/incident-assets.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});
const app = createApp();

describe('incident asset routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app)
      .post(`/api/v1/incidents/${incidentId}/assets`)
      .send({ assetId });
    expect(response.status).toBe(401);
  });

  it('links an asset and returns 201', async () => {
    vi.mocked(incidentAssetsService.link).mockResolvedValue({
      incident: { id: incidentId, incidentCode: 'INC-001', title: 'Suspicious login' },
      asset: { id: assetId, assetCode: 'AST-001', name: 'VPN Gateway', criticality: 'critical' },
      linkedAt: new Date('2026-09-29T10:00:00Z'),
    });
    const response = await request(app)
      .post(`/api/v1/incidents/${incidentId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assetId });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: { asset: { assetCode: 'AST-001' } },
    });
    expect(incidentAssetsService.link).toHaveBeenCalledWith(userId, incidentId, { assetId });
  });

  it('rejects an invalid asset ID', async () => {
    const response = await request(app)
      .post(`/api/v1/incidents/${incidentId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assetId: 'invalid' });
    expect(response.status).toBe(422);
    expect(incidentAssetsService.link).not.toHaveBeenCalled();
  });
});
