import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: {
    listReviewableDrafts: vi.fn(),
    getReviewableDraft: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: adminId,
  expiresIn: '15m',
});
const app = createApp();

describe('Admin submitted policy draft HTTP routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/compliance/policies/drafts/reviewable')).status).toBe(
      401,
    );
  });

  it('returns the bounded reviewable draft list', async () => {
    vi.mocked(policyComplianceService.listReviewableDrafts).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get('/api/v1/compliance/policies/drafts/reviewable')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('returns a submitted policy draft detail', async () => {
    vi.mocked(policyComplianceService.getReviewableDraft).mockResolvedValue({
      policyId,
      policyCode: 'ISP-001',
      title: 'Security policy',
      description: null,
      ownerUserId: adminId,
      policyStatus: 'draft',
      updatedAt: new Date(),
      version: {
        id: versionId,
        versionNumber: '1.0',
        content: 'Required controls',
        changeSummary: null,
        status: 'in_review',
        effectiveDate: null,
        createdByUserId: adminId,
        createdAt: new Date(),
      },
    });
    const response = await request(app)
      .get(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/review`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.version).toMatchObject({
      id: versionId,
      content: 'Required controls',
    });
  });

  it('rejects malformed identifiers before the service', async () => {
    const response = await request(app)
      .get('/api/v1/compliance/policies/not-a-uuid/versions/not-a-uuid/review')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(policyComplianceService.getReviewableDraft).not.toHaveBeenCalled();
  });
});
