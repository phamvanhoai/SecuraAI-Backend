import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: { listRejectedPolicies: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client',
  subject: adminId, expiresIn: '15m',
});
const app = createApp();

describe('GET rejected policies', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes bounded filters to the service', async () => {
    vi.mocked(policyComplianceService.listRejectedPolicies).mockResolvedValue({
      items: [], pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get('/api/v1/compliance/policies/rejected?page=2&limit=10&q=access&sortOrder=asc')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(policyComplianceService.listRejectedPolicies).toHaveBeenCalledWith(adminId, {
      page: 2, limit: 10, q: 'access', sortOrder: 'asc',
    });
  });

  it('rejects invalid pagination before the service', async () => {
    const response = await request(app)
      .get('/api/v1/compliance/policies/rejected?page=0')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(policyComplianceService.listRejectedPolicies).not.toHaveBeenCalled();
  });
});
