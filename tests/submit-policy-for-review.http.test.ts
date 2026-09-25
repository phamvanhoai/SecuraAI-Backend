import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: { submitForReview: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'f249f96c-7a87-47e2-a6fd-2bebc29294c5';
const versionId = 'ec178d52-2959-47fd-93db-aa693158668c';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('POST /api/v1/compliance/policies/:policyId/versions/:versionId/submit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app).post(
      `/api/v1/compliance/policies/${policyId}/versions/${versionId}/submit`,
    );
    expect(response.status).toBe(401);
  });

  it('submits the draft and returns its review status', async () => {
    vi.mocked(policyComplianceService.submitForReview).mockResolvedValue({
      policyId,
      policyCode: 'TEST',
      title: 'Test policy',
      policyStatus: 'DRAFT',
      ownerUserId: userId,
      version: {
        id: versionId,
        versionNumber: '1.0',
        status: 'IN_REVIEW',
        createdByUserId: userId,
        createdAt: new Date('2026-09-25T01:00:00Z'),
      },
      submittedAt: new Date('2026-09-25T02:00:00Z'),
    });
    const response = await request(app)
      .post(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/submit`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      policyId,
      version: { id: versionId, status: 'IN_REVIEW' },
    });
  });

  it('rejects malformed identifiers before the service', async () => {
    const response = await request(app)
      .post('/api/v1/compliance/policies/not-a-uuid/versions/not-a-uuid/submit')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(policyComplianceService.submitForReview).not.toHaveBeenCalled();
  });
});
