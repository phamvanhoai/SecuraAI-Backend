import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: { listOwnDrafts: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('GET /api/v1/compliance/policies/drafts/mine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/compliance/policies/drafts/mine')).status).toBe(401);
  });

  it('returns the bounded draft list', async () => {
    vi.mocked(policyComplianceService.listOwnDrafts).mockResolvedValue({
      items: [],
      pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get('/api/v1/compliance/policies/drafts/mine?page=2&limit=10&q=TEST&sortOrder=asc')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
    expect(policyComplianceService.listOwnDrafts).toHaveBeenCalledWith(userId, {
      page: 2,
      limit: 10,
      q: 'TEST',
      sortOrder: 'asc',
    });
  });

  it('rejects invalid query parameters before the service', async () => {
    const response = await request(app)
      .get('/api/v1/compliance/policies/drafts/mine?limit=101')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(policyComplianceService.listOwnDrafts).not.toHaveBeenCalled();
  });
});
