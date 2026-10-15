import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/risk-assessment/risk-register.service.js', () => ({
  riskRegisterService: { list: vi.fn(), get: vi.fn() },
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';

const userId = '00000000-0000-4000-8000-000000000001';
const token = jwt.sign({ type: 'access', role: 'SECURITY_OFFICER' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});
const app = createApp();

describe('risk register HTTP API', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/risks')).status).toBe(401);
  });
  it('returns a validated register page', async () => {
    vi.mocked(riskRegisterService.list).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get('/api/v1/risks?status=open')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.pagination.total).toBe(0);
    expect(riskRegisterService.list).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ status: 'open', page: 1 }),
    );
  });
  it('validates list and detail boundaries', async () => {
    expect(
      (await request(app).get('/api/v1/risks?limit=101').set('Authorization', `Bearer ${token}`))
        .status,
    ).toBe(422);
    expect(
      (await request(app).get('/api/v1/risks/not-a-uuid').set('Authorization', `Bearer ${token}`))
        .status,
    ).toBe(422);
  });

  it('returns the detailed risk contract', async () => {
    const riskId = '00000000-0000-4000-8000-000000000002';
    vi.mocked(riskRegisterService.get).mockResolvedValue({ id: riskId } as never);
    const response = await request(app)
      .get(`/api/v1/risks/${riskId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(riskId);
    expect(riskRegisterService.get).toHaveBeenCalledWith(userId, riskId);
  });
});
