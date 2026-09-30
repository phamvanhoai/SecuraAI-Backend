import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: {
    listPolicyVersionHistory: vi.fn(),
    getPolicyVersionHistory: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});
const app = createApp();

describe('policy version history HTTP routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes bounded filters to the history service', async () => {
    vi.mocked(policyComplianceService.listPolicyVersionHistory).mockResolvedValue({
      canViewDrafts: false,
      items: [],
      pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get('/api/v1/compliance/policies/version-history?page=2&limit=10&q=access&status=archived')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(policyComplianceService.listPolicyVersionHistory).toHaveBeenCalledWith(userId, {
      page: 2,
      limit: 10,
      q: 'access',
      status: 'archived',
    });
  });

  it('loads one historical published version', async () => {
    vi.mocked(policyComplianceService.getPolicyVersionHistory).mockResolvedValue({} as never);
    const response = await request(app)
      .get(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/history`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(policyComplianceService.getPolicyVersionHistory).toHaveBeenCalledWith(
      userId,
      policyId,
      versionId,
    );
  });

  it('rejects the obsolete draft history filter', async () => {
    const response = await request(app)
      .get('/api/v1/compliance/policies/version-history?status=draft')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(policyComplianceService.listPolicyVersionHistory).not.toHaveBeenCalled();
  });
});
